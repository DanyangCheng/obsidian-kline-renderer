import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownPostProcessorContext,
} from "obsidian";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ViewportState {
  start: number;
  end: number;
  priceMin?: number;
  priceMax?: number;
}

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


// ─── SVG Renderer ────────────────────────────────────────────────────────────

function renderKlineSVG(
  data: KlineData[],
  settings: KlineSettings,
  opts: Partial<BlockOpts>,
  viewport?: ViewportState
): string {
  const start = viewport?.start ?? 0;
  const end = viewport?.end ?? data.length;

  const visibleData = data.slice(start, end);
  const num = visibleData.length;

  if (num == 0) {
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
  const allHighs = visibleData.map(d => d.high);
  const allLows = visibleData.map(d => d.low);
  const priceMin = viewport?.priceMin ?? Math.min(...allLows);
  const priceMax = viewport?.priceMax ?? Math.max(...allHighs);
  const priceRng  = priceMax - priceMin || 1;
  const priceTop  = titleH + padT;
  const priceBotY = titleH + chartH - padB;
  const priceAreaH = priceBotY - priceTop;

  const py = (v: number) =>
    priceTop + priceAreaH * (1 - (v - priceMin) / priceRng);

  // ── Volume range ─────────────────────────────────────────────────────────
  const maxVol   = showVol ? Math.max(...visibleData.map((d) => d.volume ?? 0), 1) : 1;
  const volTop   = titleH + chartH + labelH;
  const volBotY  = fullH;
  const volAreaH = volBotY - volTop;

  const vy = (v: number) =>
    volTop + volAreaH * (1 - v / maxVol);

  // ── Candle layout ────────────────────────────────────────────────────────
  const n         = visibleData.length;
  const step      = chartW / n;
  const gap       = 2;
  const candleW   = Math.max(1, step - gap);
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

  visibleData.forEach((d, i) => {
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
    const absoluteIdx = start + i;
        tooltips.push(
          `<rect class="kline-hover-trigger"
                data-idx="${absoluteIdx}"
                x="${(x - step / 2).toFixed(1)}" y="${priceTop}"
                width="${step.toFixed(1)}" height="${priceAreaH}"
                fill="transparent" style="cursor: crosshair;">
          </rect>`
        );
  });

  // ── X-axis labels (adaptive thinning) ────────────────────────────────────
  const xLabels: string[] = [];
  const maxLabels = Math.floor(chartW / 60);
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));

  visibleData.forEach((d, i) => {
    const absoluteIdx = start + i;
    
    if (absoluteIdx % labelStep !== 0) return; 
    
    const label = d.label ?? String(absoluteIdx + 1);
    xLabels.push(
      `<text x="${cx(i).toFixed(1)}" y="${(titleH + chartH + 14).toFixed(1)}"
        text-anchor="middle" font-size="10" fill="${settings.textColor}">${label}</text>`
    );
  });

  // ── Volume bars ──────────────────────────────────────────────────────────
  const volBars: string[] = [];
  if (showVol) {
    visibleData.forEach((d, i) => {
      if (d.volume === undefined) return;
      
      const isBull = d.close >= d.open;
      const color  = isBull ? settings.bullColor : settings.bearColor;
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
  <svg class="kline-chart kline-interactive"
     xmlns="http://www.w3.org/2000/svg"
     width="100%"
     viewBox="0 0 ${W} ${fullH}"
     data-viewbox="0 0 ${W} ${fullH}"
     style="max-width:${W}px;background:${settings.bgColor};
            display:block;user-select:none;cursor:grab;">

  ${gridLines.join("\n  ")}
  ${gridLabels.join("\n  ")}
  ${volGridLine}

  ${titleEl}

  <text class="kline-hud" 
        x="${padL + 5}" 
        y="${priceTop + 14}" 
        font-size="12" 
        fill="${settings.textColor}" 
        pointer-events="none"></text>

  ${candles.join("\n  ")}

  ${volBars.join("\n  ")}
  ${volLabel}

  ${xLabels.join("\n  ")}

  ${tooltips.join("\n  ")}
</svg>`;
}


function enableKlineInteractions(
  container: HTMLElement,
  data: KlineData[],
  settings: KlineSettings,
  opts: Partial<BlockOpts>
) {
  let viewport: ViewportState = {
    start: 0,
    end: data.length,
  };

  let isDragging = false;
  let dragStartX = 0;
  let initialStart = 0;
  let initialEnd = 0;

  const render = () => {
    container.innerHTML = renderKlineSVG(
      data,
      settings,
      opts,
      viewport
    );
  };

  container.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const svg = container.querySelector("svg");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padL = 60; 
    const chartW = Math.max(1, svg.clientWidth - padL - 20); 
    let mouseRatio = (mouseX - padL) / chartW;

    mouseRatio = isNaN(mouseRatio) ? 0.5 : Math.max(0, Math.min(1, mouseRatio));

    const zoomFactor = 0.15;
    const range = viewport.end - viewport.start;
    const totalDelta = Math.max(2, Math.round(range * zoomFactor));

    let newStart = viewport.start;
    let newEnd = viewport.end;

    if (e.deltaY < 0) {
      newStart += Math.round(totalDelta * mouseRatio);
      newEnd -= Math.round(totalDelta * (1 - mouseRatio));
    } else {
      newStart -= Math.round(totalDelta * mouseRatio);
      newEnd += Math.round(totalDelta * (1 - mouseRatio));
    }

    if (newEnd - newStart < 5) return;

    if (newStart < 0) newStart = 0;
    if (newEnd > data.length) newEnd = data.length;

    if (newStart !== viewport.start || newEnd !== viewport.end) {
      viewport.start = newStart;
      viewport.end = newEnd;
      render();
    }
  }, { passive: false });

  container.addEventListener("mousedown", (e: MouseEvent) => {
    isDragging = true;
    dragStartX = e.clientX;
    initialStart = viewport.start;
    initialEnd = viewport.end;
    
    const svg = container.querySelector("svg");
    if (svg) svg.style.cursor = "grabbing";

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!isDragging) return;
      
      const currentSvg = container.querySelector("svg");
      const chartW = currentSvg ? Math.max(1, currentSvg.clientWidth - 80) : 800;
      
      const dx = moveEvt.clientX - dragStartX;
      const range = initialEnd - initialStart;
      const shift = -Math.round((dx / chartW) * range);

      let newStart = initialStart + shift;
      let newEnd = initialEnd + shift;

      if (newStart < 0) {
        newStart = 0;
        newEnd = range;
      }
      if (newEnd > data.length) {
        newEnd = data.length;
        newStart = Math.max(0, data.length - range);
      }

      if (newStart !== viewport.start || newEnd !== viewport.end) {
        viewport.start = newStart;
        viewport.end = newEnd;
        render();
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      const currentSvg = container.querySelector("svg");
      if (currentSvg) currentSvg.style.cursor = "grab";

      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  container.addEventListener("dblclick", () => {
    viewport = { start: 0, end: data.length };
    render();
  });

  container.addEventListener("mousemove", (e: MouseEvent) => {
    if (isDragging) return;
    
    const target = e.target as SVGElement;
    const idxStr = target.getAttribute ? target.getAttribute("data-idx") : null;
    
    const svg = container.querySelector("svg");
    if (!svg) return;
    const hud = svg.querySelector(".kline-hud");
    
    if (idxStr !== null && hud) {
      const idx = parseInt(idxStr, 10);
      const d = data[idx];
      if (d) {
        const isBull = d.close >= d.open;
        const color = isBull ? settings.bullColor : settings.bearColor;
        const volStr = d.volume !== undefined ? `  量: ${d.volume}` : "";
        const labelStr = d.label ? `${d.label} | ` : "";

        hud.innerHTML = `<tspan font-weight="bold">${labelStr}</tspan>开: ${d.open}  高: ${d.high}  低: ${d.low}  收: <tspan fill="${color}" font-weight="bold">${d.close}</tspan>${volStr}`;
      }
    }
  });

  container.addEventListener("mouseleave", () => {
    const svg = container.querySelector("svg");
    const hud = svg?.querySelector(".kline-hud");
    if (hud) hud.innerHTML = "";
  });
}
// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class KlineRendererPlugin extends Plugin {
  settings!: KlineSettings;

  async onload() {
    await this.loadSettings();

    // Register the ```kline code block processor
  this.registerMarkdownCodeBlockProcessor(
    "kline",
    (source, el) => {
      el.empty();
      try {
        const { data, opts } = parseKlineBlock(source, this.settings);
        el.innerHTML = renderKlineSVG(data, this.settings, opts);
        el.addClass("kline-container");

        enableKlineInteractions(el, data, this.settings, opts);
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
  }
}