import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetFetchGuard, guardedFetch } from "../lib/fetch-guard";

function jsonResponse(payload: unknown) {
  const make = () => ({ ok: true, status: 200, json: async () => payload, clone: () => make() });
  return make();
}

describe("guardedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetFetchGuard();
  });

  it("caps concurrent fetches and drains the queue", async () => {
    let active = 0;
    let maxActive = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active -= 1;
        return jsonResponse({});
      })
    );
    await Promise.all(Array.from({ length: 12 }, (_, i) => guardedFetch(`https://example.com/${i}`)));
    expect(maxActive).toBeLessThanOrEqual(6);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("times out slow fetches and frees the slot", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await expect(guardedFetch("https://example.com/slow", undefined, { timeoutMs: 30 })).rejects.toMatchObject({
      name: "AbortError",
    });
    // The slot was released: a fast fetch still goes through.
    vi.unstubAllGlobals();
    const spy = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", spy);
    const res = await guardedFetch("https://example.com/fast");
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fails fast on a pre-aborted signal without fetching", async () => {
    const spy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", spy);
    const controller = new AbortController();
    controller.abort();
    await expect(guardedFetch("https://example.com/x", undefined, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("propagates an outer abort mid-flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: any, init: any) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      }))
    );
    const controller = new AbortController();
    const pending = guardedFetch("https://example.com/x", undefined, { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("dedupes identical in-flight GETs, each readable", async () => {
    const spy = vi.fn(async () => jsonResponse({ x: 1 }));
    vi.stubGlobal("fetch", spy);
    const [a, b] = await Promise.all([
      guardedFetch("https://example.com/same"),
      guardedFetch("https://example.com/same"),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(a.json()).resolves.toEqual({ x: 1 });
    await expect(b.json()).resolves.toEqual({ x: 1 });
  });

  it("never dedupes POSTs", async () => {
    const spy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", spy);
    await Promise.all([
      guardedFetch("https://example.com/p", { method: "POST", body: "{}" }),
      guardedFetch("https://example.com/p", { method: "POST", body: "{}" }),
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("resolves error statuses without interpreting them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, clone: () => ({ ok: false, status: 503 }) })));
    const res = await guardedFetch("https://example.com/down");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });
});
