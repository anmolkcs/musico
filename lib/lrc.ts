/** Parses an LRC timestamp line: `[mm:ss.xx] text` (multiple stamps per line allowed). */
export type LyricLine = { time: number; text: string };

const LRC_LINE = /\[(\d{1,2}):(\d{1,2})(?:[.:,](\d{1,3}))?\]/g;

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    LRC_LINE.lastIndex = 0;
    const stamps: { time: number; matchStart: number; matchEnd: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = LRC_LINE.exec(raw)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const fracRaw = match[3] ?? "0";
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      stamps.push({
        time: min * 60 + sec + frac,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
      });
    }
    // Text belongs to the segment after its stamp, up to the next stamp.
    for (let i = 0; i < stamps.length; i++) {
      const textEnd = i + 1 < stamps.length ? stamps[i + 1].matchStart : raw.length;
      const text = raw.slice(stamps[i].matchEnd, textEnd).trim();
      lines.push({ time: stamps[i].time, text });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** Serializes lyric lines back to LRC format (used for the SQLite cache). */
export function serializeLrc(lines: LyricLine[]): string {
  return lines
    .map((l) => `[${Math.floor(l.time / 60)}:${(l.time % 60).toFixed(2).padStart(5, "0")}]${l.text}`)
    .join("\n");
}

/** Index of the line that should be highlighted at `position` seconds. -1 = none yet. */
export function activeLineIndex(lines: LyricLine[], position: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position + 0.35) idx = i;
    else break;
  }
  return idx;
}
