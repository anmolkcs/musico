/**
 * Shared guardrails for every metadata fetch in the app.
 *
 * One global FIFO pool caps concurrent network calls (default 6) so no
 * screen or list can spawn a request storm — bulk loops in this codebase
 * are sequential, so the cap only binds pathological parallelism. Every
 * call also gets a timeout and a fail-fast pre-check for already-aborted
 * signals. Identical in-flight GETs share a single network call (each
 * waiter gets a cloned Response) instead of hammering the same URL.
 *
 * This covers metadata reads (JSON/HTML). It is deliberately NOT for media
 * downloads: those stream large bodies with progress and must never sit in
 * a metadata pool or be killed by a metadata timeout (see downloads.*).
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CONCURRENT = 6;

export type GuardedFetchOptions = {
  /** Per-call timeout. Defaults to 15s; 0 disables the timeout. */
  timeoutMs?: number;
  /** Outer abort signal. A pre-aborted signal fails fast, no fetch issued. */
  signal?: AbortSignal;
  /**
   * Share one network call between identical in-flight GET/HEAD requests.
   * Defaults to true for bodyless GET/HEAD; anything else never dedupes.
   */
  dedupe?: boolean;
};

let activeCount = 0;
const waiters: Array<() => void> = [];
const inflight = new Map<string, Promise<Response>>();

/** Test-only reset for the in-flight dedup map. */
export function _resetFetchGuard() {
  inflight.clear();
}

function acquire(): Promise<void> {
  if (activeCount < DEFAULT_MAX_CONCURRENT) {
    activeCount += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      activeCount += 1;
      resolve();
    });
  });
}

function release() {
  activeCount = Math.max(0, activeCount - 1);
  waiters.shift()?.();
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function cloneOrSelf(res: Response): Response {
  // Tolerate minimal fetch mocks (tests) that lack clone().
  return typeof res.clone === "function" ? res.clone() : res;
}

function dedupeKey(url: string | URL | Request, method: string): string {
  const urlString = typeof url === "string" ? url : url instanceof Request ? url.url : String(url);
  return `${method} ${urlString}`;
}

async function runGuarded(
  url: string | URL | Request,
  init: RequestInit | undefined,
  signals: (AbortSignal | null | undefined)[],
  timeoutMs: number
): Promise<Response> {
  for (const s of signals) {
    if (s?.aborted) throw abortError();
  }
  await acquire();
  try {
    const controller = new AbortController();
    // Race, don't just abort: a fetch implementation that ignores the
    // abort signal must still lose to the timeout (and free its slot).
    // Both losers are AbortError-named; callers tell timeout apart from
    // cancellation via `signal?.aborted`.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutError = () => {
      const error = new Error("Timeout");
      error.name = "AbortError";
      return error;
    };
    const timeoutRace =
      timeoutMs > 0
        ? new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(timeoutError());
            }, timeoutMs);
          })
        : null;
    const onAbort = () => controller.abort();
    for (const s of signals) s?.addEventListener("abort", onAbort, { once: true });
    try {
      const task = fetch(url, { ...init, signal: controller.signal });
      return timeoutRace ? await Promise.race([task, timeoutRace]) : await task;
    } finally {
      if (timer) clearTimeout(timer);
      for (const s of signals) s?.removeEventListener("abort", onAbort);
    }
  } finally {
    release();
  }
}

/**
 * fetch() with a concurrency slot, a timeout, and optional GET dedup.
 * Never interprets HTTP status — !ok responses resolve normally. Timeout
 * and outer-abort both surface as AbortError; tell them apart with
 * `signal?.aborted` (aborted => caller cancelled, otherwise it timed out).
 */
export async function guardedFetch(
  url: string | URL | Request,
  init?: RequestInit,
  opts?: GuardedFetchOptions
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signals = [opts?.signal, init?.signal];
  for (const s of signals) {
    if (s?.aborted) throw abortError();
  }

  const method = (init?.method ?? "GET").toUpperCase();
  const canDedupe = (opts?.dedupe ?? true) && (method === "GET" || method === "HEAD") && init?.body == null;

  const run = () => runGuarded(url, init, signals, timeoutMs);

  if (!canDedupe) return run();
  const key = dedupeKey(url, method);
  const existing = inflight.get(key);
  if (existing) return existing.then(cloneOrSelf);
  const promise = run();
  inflight.set(key, promise);
  try {
    const res = await promise;
    return cloneOrSelf(res);
  } finally {
    inflight.delete(key);
  }
}
