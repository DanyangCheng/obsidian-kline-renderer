// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Supported formats (one candle per line):
 *
 *   # Simple OHLC  (space / comma / tab separated)
 *   2024-01-01  100  110  95  105
 *   2024-01-02, 105, 115, 100, 112, 5000
 *
 *   # CSV with optional header
 *   date,open,high,low,close[,volume]
 *   2024-01-01,100,110,95,105,3000
 *
 *   # JSON array
 *   [{"label":"2024-01-01","open":100,"high":110,"low":95,"close":105}]
 *
 * Options block (must be first, lines starting with "# "):
 *   # width: 900
 *   # height: 450
 *   # title: My Stock
 *   # bull: #00ff00
 *   # bear: #ff0000
 *   # volume: false
 *   # ma: 5,10,20
 */
import { KlineData, KlineSettings, BlockOpts } from "./types";
export function parseKlineBlock(
  source: string,
  globalSettings: KlineSettings
): { data: KlineData[]; opts: Partial<BlockOpts> } {
  const lines = source.split("\n").map((l) => l.trim()).filter(Boolean);

  const opts: Partial<BlockOpts> = {};
  const dataLines: string[] = [];
  let headerSkipped = false;

  for (const line of lines) {
    // Option comments: # key: value
    if (line.startsWith("#")) {
      const m = line.match(/^#\s*(\w+)\s*[:\s]\s*(.+)$/);
      if (m) {
        const key = m[1].toLowerCase();
        const val = m[2].trim();
        switch (key) {
          case "width":    opts.width   = parseInt(val); break;
          case "height":   opts.height  = parseInt(val); break;
          case "title":    opts.title   = val;           break;
          case "bull":     opts.bull    = val;           break;
          case "bear":     opts.bear    = val;           break;
          case "volume":   opts.volume  = val !== "false" && val !== "0"; break;
          case "grid":     opts.grid    = val !== "false" && val !== "0"; break;
          case "ma":       opts.ma      = val;           break;
          case "macolors": opts.maColors = val;          break;
        }
      }
      continue;
    }

    // JSON array
    if (line.startsWith("[")) {
      try {
        const arr = JSON.parse(line);
        return { data: arr.map(normalizeJsonItem), opts };
      } catch (_) {/* fall through */}
    }

    // CSV header detection
    if (!headerSkipped && /^(date|label|time|open)/i.test(line)) {
      headerSkipped = true;
      continue;
    }

    dataLines.push(line);
  }

  const data: KlineData[] = [];
  for (const line of dataLines) {
    const parts = line.split(/[\s,;\t]+/).filter(Boolean);
    if (parts.length < 4) continue;

    let label: string | undefined;
    let startIdx = 0;

    // Detect if first part is a non-numeric label
    if (isNaN(Number(parts[0])) || /\d{4}-\d{2}/.test(parts[0])) {
      label = parts[0];
      startIdx = 1;
    }

    const nums = parts.slice(startIdx).map(Number);
    if (nums.length < 4 || nums.some(isNaN)) continue;

    data.push({
      label,
      open:   nums[0],
      high:   nums[1],
      low:    nums[2],
      close:  nums[3],
      volume: nums[4],
    });
  }

  return { data, opts };
}

function normalizeJsonItem(item: Record<string, unknown>): KlineData {
  return {
    label:  (item.label ?? item.date ?? item.time ?? item.name) as string | undefined,
    open:   Number(item.open  ?? item.o),
    high:   Number(item.high  ?? item.h),
    low:    Number(item.low   ?? item.l),
    close:  Number(item.close ?? item.c),
    volume: item.volume !== undefined ? Number(item.volume ?? item.v) : undefined,
  };
}