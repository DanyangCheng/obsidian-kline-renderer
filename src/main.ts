import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownPostProcessorContext,
} from "obsidian";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KlineData {
  label?: string;   // date / name
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface KlineSettings {
  defaultWidth: number;
  defaultHeight: number;
  bullColor: string;
  bearColor: string;
  wickColor: string;
  bgColor: string;
  gridColor: string;
  textColor: string;
  showVolume: boolean;
  showGrid: boolean;
  showTooltip: boolean;
  showMA: boolean;
  maPeriods: string;       // comma-separated, e.g. "5,10,20"
  maColors: string;        // comma-separated
}

const DEFAULT_SETTINGS: KlineSettings = {
  defaultWidth: 800,
  defaultHeight: 400,
  bullColor: "#26a69a",
  bearColor: "#ef5350",
  wickColor: "#888888",
  bgColor: "transparent",
  gridColor: "#e0e0e020",
  textColor: "#888888",
  showVolume: true,
  showGrid: true,
  showTooltip: true,
  showMA: false,
  maPeriods: "5,10,20",
  maColors: "#ff9800,#2196f3,#9c27b0",
};

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
function parseKlineBlock(
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

interface BlockOpts {
  width:    number;
  height:   number;
  title:    string;
  bull:     string;
  bear:     string;
  volume:   boolean;
  grid:     boolean;
  ma:       string;
  maColors: string;
}

// ─── Moving Average ───────────────────────────────────────────────────────────

function calcMA(data: KlineData[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, d) => s + d.close, 0) / period;
  });
}

// ─── SVG Renderer ────────────────────────────────────────────────────────────

function renderKlineSVG(
  data: KlineData[],
  settings: KlineSettings,
  opts: Partial<BlockOpts>
): string {
  if (data.length === 0) {
    return `<div class="kline-error">⚠️ No data to display</div>`;
  }

  const W         = opts.width    ?? settings.defaultWidth;
  const fullH     = opts.height   ?? settings.defaultHeight;
  const bullColor = opts.bull     ?? settings.bullColor;
  const bearColor = opts.bear     ?? settings.bearColor;
  const showVol   = (opts.volume  ?? settings.showVolume) && data.some((d) => d.volume !== undefined);
  const showGrid  = opts.grid     ?? settings.showGrid;
  const title     = opts.title;

  const titleH    = title ? 28 : 0;
  const labelH    = 20;
  const volRatio  = 0.20;
  const volH      = showVol ? (fullH - titleH - labelH) * volRatio : 0;
  const chartH    = fullH - titleH - labelH - volH;

  const padL = 60, padR = 20, padT = 10, padB = 4;
  const chartW = W - padL - padR;

  // ── Price range ─────────────────────────────────────────────────────────
  const allHighs  = data.map((d) => d.high);
  const allLows   = data.map((d) => d.low);
  const priceMin  = Math.min(...allLows);
  const priceMax  = Math.max(...allHighs);
  const priceRng  = priceMax - priceMin || 1;
  const priceTop  = titleH + padT;
  const priceBotY = titleH + chartH - padB;
  const priceAreaH = priceBotY - priceTop;

  const py = (v: number) =>
    priceTop + priceAreaH * (1 - (v - priceMin) / priceRng);

  // ── Volume range ─────────────────────────────────────────────────────────
  const maxVol   = showVol ? Math.max(...data.map((d) => d.volume ?? 0)) : 1;
  const volTop   = titleH + chartH + labelH;
  const volBotY  = fullH;
  const volAreaH = volBotY - volTop;

  const vy = (v: number) =>
    volTop + volAreaH * (1 - v / maxVol);

  // ── Candle layout ────────────────────────────────────────────────────────
  const n         = data.length;
  const candleW   = Math.max(2, Math.min(20, Math.floor(chartW / n) - 2));
  const step      = chartW / n;
  const cx        = (i: number) => padL + step * i + step / 2;

  // ── Price grid lines ─────────────────────────────────────────────────────
  const gridCount = 5;
  const gridLines: string[] = [];
  const gridLabels: string[] = [];

  if (showGrid) {
    for (let g = 0; g <= gridCount; g++) {
      const v  = priceMin + (priceRng / gridCount) * g;
      const yg = py(v);
      gridLines.push(
        `<line x1="${padL}" y1="${yg.toFixed(1)}" x2="${W - padR}" y2="${yg.toFixed(1)}"
          stroke="${settings.gridColor}" stroke-width="1"/>`
      );
      gridLabels.push(
        `<text x="${padL - 5}" y="${(yg + 4).toFixed(1)}"
          text-anchor="end" font-size="10" fill="${settings.textColor}">${v.toFixed(2)}</text>`
      );
    }
  }

  // ── Candles ──────────────────────────────────────────────────────────────
  const candles: string[] = [];
  const tooltips: string[] = [];

  data.forEach((d, i) => {
    const isBull  = d.close >= d.open;
    const color   = isBull ? bullColor : bearColor;
    const x       = cx(i);
    const top     = py(Math.max(d.open, d.close));
    const bot     = py(Math.min(d.open, d.close));
    const bodyH   = Math.max(1, bot - top);
    const hw      = candleW / 2;

    // Wick
    candles.push(
      `<line x1="${x.toFixed(1)}" y1="${py(d.high).toFixed(1)}"
             x2="${x.toFixed(1)}" y2="${py(d.low).toFixed(1)}"
             stroke="${settings.wickColor}" stroke-width="1"/>`
    );
    // Body
    candles.push(
      `<rect x="${(x - hw).toFixed(1)}" y="${top.toFixed(1)}"
             width="${candleW}" height="${bodyH.toFixed(1)}"
             fill="${color}" rx="1"/>`
    );

    // Tooltip overlay
    const tipLabel = d.label ?? `#${i + 1}`;
    const tipText  = `${tipLabel} O:${d.open} H:${d.high} L:${d.low} C:${d.close}${d.volume !== undefined ? ` V:${d.volume}` : ""}`;
    tooltips.push(
      `<rect class="kline-tooltip-trigger"
             x="${(x - step / 2).toFixed(1)}" y="${priceTop}"
             width="${step.toFixed(1)}" height="${priceAreaH}"
             fill="transparent">
        <title>${tipText}</title>
      </rect>`
    );
  });

  // ── X-axis labels (adaptive thinning) ────────────────────────────────────
  const xLabels: string[] = [];
  const maxLabels = Math.floor(chartW / 60);
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));

  data.forEach((d, i) => {
    if (i % labelStep !== 0) return;
    const label = d.label ?? String(i + 1);
    xLabels.push(
      `<text x="${cx(i).toFixed(1)}" y="${(titleH + chartH + 14).toFixed(1)}"
        text-anchor="middle" font-size="10" fill="${settings.textColor}">${label}</text>`
    );
  });

  // ── Volume bars ──────────────────────────────────────────────────────────
  const volBars: string[] = [];
  if (showVol) {
    data.forEach((d, i) => {
      if (d.volume === undefined) return;
      const isBull = d.close >= d.open;
      const color  = isBull ? bullColor : bearColor;
      const x      = cx(i);
      const hw     = candleW / 2;
      const yTop   = vy(d.volume);
      const barH   = volBotY - yTop;
      volBars.push(
        `<rect x="${(x - hw).toFixed(1)}" y="${yTop.toFixed(1)}"
               width="${candleW}" height="${barH.toFixed(1)}"
               fill="${color}" opacity="0.6" rx="1"/>`
      );
    });
  }

  // ── Moving averages ──────────────────────────────────────────────────────
  const maLines: string[] = [];
  const maPeriodsRaw  = opts.ma       ?? (settings.showMA ? settings.maPeriods : "");
  const maColorsRaw   = opts.maColors ?? settings.maColors;

  if (maPeriodsRaw) {
    const periods = maPeriodsRaw.split(",").map((s) => parseInt(s.trim())).filter((p) => !isNaN(p));
    const colors  = maColorsRaw.split(",").map((s) => s.trim());

    periods.forEach((period, idx) => {
      const maData = calcMA(data, period);
      const color  = colors[idx] ?? "#888";
      let d = "";
      maData.forEach((v, i) => {
        if (v === null) return;
        const x = cx(i);
        const y = py(v);
        d += d === "" ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
      });
      if (d) {
        maLines.push(
          `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85">
             <title>MA${period}</title>
           </path>`
        );
        // legend
        const legendX = padL + (idx * 70);
        maLines.push(
          `<line x1="${legendX}" y1="${titleH + 8}" x2="${legendX + 14}" y2="${titleH + 8}"
                 stroke="${color}" stroke-width="2"/>
           <text x="${legendX + 18}" y="${titleH + 12}" font-size="10" fill="${color}">MA${period}</text>`
        );
      }
    });
  }

  // ── Title ────────────────────────────────────────────────────────────────
  const titleEl = title
    ? `<text x="${W / 2}" y="${titleH - 6}" text-anchor="middle"
         font-size="14" font-weight="600" fill="${settings.textColor}">${title}</text>`
    : "";

  // ── Volume label ─────────────────────────────────────────────────────────
  const volLabel = showVol
    ? `<text x="${padL - 5}" y="${volTop + 12}"
         text-anchor="end" font-size="9" fill="${settings.textColor}">Vol</text>`
    : "";

  // ── Volume grid ──────────────────────────────────────────────────────────
  const volGridLine = showVol && showGrid
    ? `<line x1="${padL}" y1="${volTop}" x2="${W - padR}" y2="${volTop}"
         stroke="${settings.gridColor}" stroke-width="1" stroke-dasharray="4 2"/>`
    : "";

  return `
<svg class="kline-chart" xmlns="http://www.w3.org/2000/svg"
     width="100%" viewBox="0 0 ${W} ${fullH}"
     style="max-width:${W}px;background:${settings.bgColor};display:block;">
  <style>
    .kline-tooltip-trigger { cursor: crosshair; }
    .kline-tooltip-trigger:hover rect { opacity: 0.05; fill: white; }
  </style>

  <!-- Grid -->
  ${gridLines.join("\n  ")}
  ${gridLabels.join("\n  ")}
  ${volGridLine}

  <!-- Title -->
  ${titleEl}

  <!-- Candles -->
  ${candles.join("\n  ")}

  <!-- MA Lines -->
  ${maLines.join("\n  ")}

  <!-- Volume -->
  ${volBars.join("\n  ")}
  ${volLabel}

  <!-- X Labels -->
  ${xLabels.join("\n  ")}

  <!-- Tooltip Overlays -->
  ${tooltips.join("\n  ")}
</svg>`;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class KlineRendererPlugin extends Plugin {
  settings!: KlineSettings;

  async onload() {
    await this.loadSettings();

    // Register the ```kline code block processor
    this.registerMarkdownCodeBlockProcessor(
      "kline",
      (source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
        el.empty();
        try {
          const { data, opts } = parseKlineBlock(source, this.settings);
          const svg = renderKlineSVG(data, this.settings, opts);
          el.innerHTML = svg;
          el.addClass("kline-container");
        } catch (err) {
          el.innerHTML = `<div class="kline-error">⚠️ K-Line render error: ${err}</div>`;
        }
      }
    );

    // Settings tab
    this.addSettingTab(new KlineSettingTab(this.app, this));

    console.log("K-Line Renderer loaded.");
  }

  onunload() {
    console.log("K-Line Renderer unloaded.");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class KlineSettingTab extends PluginSettingTab {
  plugin: KlineRendererPlugin;

  constructor(app: App, plugin: KlineRendererPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "K-Line Renderer Settings" });

    // ── Dimensions ───────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Default Dimensions" });

    new Setting(containerEl)
      .setName("Default width (px)")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.defaultWidth))
          .onChange(async (v) => {
            this.plugin.settings.defaultWidth = parseInt(v) || 800;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default height (px)")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.defaultHeight))
          .onChange(async (v) => {
            this.plugin.settings.defaultHeight = parseInt(v) || 400;
            await this.plugin.saveSettings();
          })
      );

    // ── Colors ───────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Colors" });

    new Setting(containerEl)
      .setName("Bullish candle color")
      .addColorPicker((c) =>
        c.setValue(this.plugin.settings.bullColor)
          .onChange(async (v) => {
            this.plugin.settings.bullColor = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Bearish candle color")
      .addColorPicker((c) =>
        c.setValue(this.plugin.settings.bearColor)
          .onChange(async (v) => {
            this.plugin.settings.bearColor = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Wick color")
      .addColorPicker((c) =>
        c.setValue(this.plugin.settings.wickColor)
          .onChange(async (v) => {
            this.plugin.settings.wickColor = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Display options ──────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Display" });

    new Setting(containerEl)
      .setName("Show volume bars")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showVolume)
          .onChange(async (v) => {
            this.plugin.settings.showVolume = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show grid lines")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showGrid)
          .onChange(async (v) => {
            this.plugin.settings.showGrid = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show moving averages by default")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showMA)
          .onChange(async (v) => {
            this.plugin.settings.showMA = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("MA periods (comma-separated)")
      .setDesc("e.g. 5,10,20")
      .addText((t) =>
        t.setValue(this.plugin.settings.maPeriods)
          .onChange(async (v) => {
            this.plugin.settings.maPeriods = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("MA colors (comma-separated)")
      .setDesc("e.g. #ff9800,#2196f3,#9c27b0")
      .addText((t) =>
        t.setValue(this.plugin.settings.maColors)
          .onChange(async (v) => {
            this.plugin.settings.maColors = v;
            await this.plugin.saveSettings();
          })
      );
  }
}