// Parses uploaded chip-reading files (DDMMYYYY,HHmmss,<chip>) and flags symbol/proximity violations.
import { PROXIMITY_SECONDS } from "./constants";

export interface ParsedReading {
  /** epoch ms, computed as UTC-naive wall clock for consistent comparison */
  ms: number;
  rawChip: string;
  chipNumber: string;
  flaggedSymbol: boolean;
  flaggedProximity: boolean;
  lineNo: number;
}

export interface ProcessResult {
  kept: ParsedReading[];
  parsedCount: number;
  discardedOutOfWindow: number;
  invalidLines: number[];
  offendingChips: string[];
  hasSymbolFlag: boolean;
  hasProximityFlag: boolean;
}

/** "DDMMYYYY" + "HHmmss" -> epoch ms (treated as UTC-naive wall clock). */
function chipDateTimeMs(dateStr: string, timeStr: string): number | null {
  const d = dateStr.replace(/\D/g, "");
  const t = timeStr.replace(/\D/g, "");
  if (d.length !== 8 || t.length !== 6) return null;
  const day = +d.slice(0, 2);
  const month = +d.slice(2, 4);
  const year = +d.slice(4, 8);
  const hh = +t.slice(0, 2);
  const mm = +t.slice(2, 4);
  const ss = +t.slice(4, 6);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return Date.UTC(year, month - 1, day, hh, mm, ss);
}

/** datetime-local string "YYYY-MM-DDTHH:mm[:ss]" -> epoch ms (UTC-naive). */
export function windowInputMs(value: string): number | null {
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

const SYMBOL_RE = /[^0-9A-Za-z]/;

/**
 * Parse the uploaded chip-reading file and apply the audit rules:
 *  - if startMs/endMs are provided, keep only readings within that window
 *  - flag a reading whose chip number contains a symbol/star
 *  - flag two readings whose times are <= PROXIMITY_SECONDS apart
 */
export function processChipFile(
  content: string,
  startMs?: number,
  endMs?: number
): ProcessResult {
  const lines = content.split(/\r?\n/);
  const all: ParsedReading[] = [];
  const invalidLines: number[] = [];
  let parsedCount = 0;

  lines.forEach((line, idx) => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length < 3) {
      invalidLines.push(idx + 1);
      return;
    }
    const ms = chipDateTimeMs(parts[0], parts[1]);
    const rawChip = parts.slice(2).join(",").trim();
    if (ms === null || !rawChip) {
      invalidLines.push(idx + 1);
      return;
    }
    parsedCount++;
    const flaggedSymbol = SYMBOL_RE.test(rawChip);
    all.push({
      ms,
      rawChip,
      chipNumber: rawChip.replace(/[^0-9A-Za-z]/g, ""),
      flaggedSymbol,
      flaggedProximity: false,
      lineNo: idx + 1
    });
  });

  const inWindow =
    startMs !== undefined && endMs !== undefined
      ? all.filter((r) => r.ms >= startMs && r.ms <= endMs)
      : all;
  const discardedOutOfWindow = all.length - inWindow.length;

  inWindow.sort((a, b) => a.ms - b.ms);
  const thresholdMs = PROXIMITY_SECONDS * 1000;
  for (let i = 1; i < inWindow.length; i++) {
    if (inWindow[i].ms - inWindow[i - 1].ms <= thresholdMs) {
      inWindow[i].flaggedProximity = true;
      inWindow[i - 1].flaggedProximity = true;
    }
  }

  const offending = new Set<string>();
  let hasSymbolFlag = false;
  let hasProximityFlag = false;
  for (const r of inWindow) {
    if (r.flaggedSymbol) {
      hasSymbolFlag = true;
      offending.add(r.rawChip);
    }
    if (r.flaggedProximity) {
      hasProximityFlag = true;
      offending.add(r.rawChip);
    }
  }

  return {
    kept: inWindow,
    parsedCount,
    discardedOutOfWindow,
    invalidLines,
    offendingChips: Array.from(offending),
    hasSymbolFlag,
    hasProximityFlag
  };
}
