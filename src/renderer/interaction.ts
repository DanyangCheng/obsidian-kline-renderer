import { MarkdownRenderChild } from "obsidian";
import { KlineData, KlineSettings, BlockOpts, ViewportState } from "../types";
import { renderKlineSVG } from "./svg";

export class KlineChartController extends MarkdownRenderChild {
  private viewport: ViewportState;
  
  // ─── Drag state ────────────────────────────────────────────────────────────
  private isDragging = false;
  private dragStartX = 0;
  private initialStart = 0;
  private initialEnd = 0;

  // ─── RAF de-duplication ─────────────────────────────────
  private pendingRender = false;
  private pendingDragFrame = false;

  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseUp: () => void;

  constructor(
    containerEl: HTMLElement,
    private data: KlineData[],
    private settings: KlineSettings,
    private opts: Partial<BlockOpts>
  ) {
    super(containerEl);
    this.containerEl.addClass("kline-container");
    
    this.viewport = { start: 0, end: data.length };

    this.boundOnMouseMove = this.onGlobalMouseMove.bind(this);
    this.boundOnMouseUp = this.onGlobalMouseUp.bind(this);
  }

  onload() {
    this.registerDomEvent(this.containerEl, "wheel", this.onWheel.bind(this), { passive: false });
    this.registerDomEvent(this.containerEl, "mousedown", this.onMouseDown.bind(this));
    this.registerDomEvent(this.containerEl, "dblclick", this.onDoubleClick.bind(this));
    this.registerDomEvent(this.containerEl, "mousemove", this.onLocalMouseMove.bind(this));
    this.registerDomEvent(this.containerEl, "mouseleave", this.onMouseLeave.bind(this));
  }

  onunload() {
    window.removeEventListener("mousemove", this.boundOnMouseMove);
    window.removeEventListener("mouseup", this.boundOnMouseUp);
  }

  public render() {
    if (this.pendingRender) return;
    this.pendingRender = true;
    
    requestAnimationFrame(() => {
      this.pendingRender = false;
      this.containerEl.innerHTML = renderKlineSVG(
        this.data,
        this.settings,
        this.opts,
        this.viewport
      );
    });
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();

    const svg = this.containerEl.querySelector("svg");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padL = 60;
    const chartW = Math.max(1, svg.clientWidth - padL - 20);
    let ratio = (mouseX - padL) / chartW;
    ratio = isNaN(ratio) ? 0.5 : Math.max(0, Math.min(1, ratio));

    const range = this.viewport.end - this.viewport.start;
    const delta = Math.max(2, Math.round(range * 0.15));

    let newStart = this.viewport.start;
    let newEnd = this.viewport.end;

    if (e.deltaY < 0) { 
      newStart += Math.round(delta * ratio);
      newEnd -= Math.round(delta * (1 - ratio));
    } else {
      newStart -= Math.round(delta * ratio);
      newEnd += Math.round(delta * (1 - ratio));
    }

    if (newEnd - newStart < 5) return;
    newStart = Math.max(0, newStart);
    newEnd = Math.min(this.data.length, newEnd);

    if (newStart !== this.viewport.start || newEnd !== this.viewport.end) {
      this.viewport.start = newStart;
      this.viewport.end = newEnd;
      this.render();
    }
  }

  private onMouseDown(e: MouseEvent) {
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.initialStart = this.viewport.start;
    this.initialEnd = this.viewport.end;

    const svg = this.containerEl.querySelector("svg");
    if (svg) svg.style.cursor = "grabbing";

    window.addEventListener("mousemove", this.boundOnMouseMove);
    window.addEventListener("mouseup", this.boundOnMouseUp);
  }

  private onGlobalMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;

    if (this.pendingDragFrame) return;
    this.pendingDragFrame = true;

    requestAnimationFrame(() => {
      this.pendingDragFrame = false;

      const currentSvg = this.containerEl.querySelector("svg");
      const chartW = currentSvg ? Math.max(1, currentSvg.clientWidth - 80) : 800;
      
      const dx = e.clientX - this.dragStartX;
      const range = this.initialEnd - this.initialStart;
      const shift = -Math.round((dx / chartW) * range);

      let newStart = this.initialStart + shift;
      let newEnd = this.initialEnd + shift;

      if (newStart < 0) {
        newStart = 0;
        newEnd = range;
      }
      if (newEnd > this.data.length) {
        newEnd = this.data.length;
        newStart = Math.max(0, this.data.length - range);
      }

      if (newStart !== this.viewport.start || newEnd !== this.viewport.end) {
        this.viewport.start = newStart;
        this.viewport.end = newEnd;
        this.render();
      }
    });
  }

  private onGlobalMouseUp() {
    this.isDragging = false;
    const svg = this.containerEl.querySelector("svg");
    if (svg) svg.style.cursor = "grab";

    window.removeEventListener("mousemove", this.boundOnMouseMove);
    window.removeEventListener("mouseup", this.boundOnMouseUp);
  }

  private onDoubleClick() {
    this.viewport = { start: 0, end: this.data.length };
    this.render();
  }

  private onLocalMouseMove(e: MouseEvent) {
    if (this.isDragging) return;
    
    const target = e.target as SVGElement;
    // Get the absolute index of the current candlestick from the data-idx attribute of the trigger layer
    const idxStr = target.getAttribute?.("data-idx");
    const svg = this.containerEl.querySelector("svg");
    if (!svg) return;
    const hud = svg.querySelector(".kline-hud");
    
    if (idxStr != null && hud) {
      const idx = parseInt(idxStr, 10);
      const d = this.data[idx];
      
      if (d) {
        // 1. Update HUD market data (O/H/L/C/V)
        const isBull = d.close >= d.open;
        const color = isBull ? this.settings.bullColor : this.settings.bearColor;
        const volStr = d.volume !== undefined ? `  volume: ${d.volume}` : "";
        const labelStr = d.label ? `${d.label} | ` : "";
        
        hud.innerHTML = 
          `<tspan font-weight="bold">${labelStr}</tspan>` +
          `O: ${d.open}  H: ${d.high}  L: ${d.low}  C: <tspan fill="${color}" font-weight="bold">${d.close}</tspan>${volStr}`;

        // 2. ✨ New: Adapt MA legend updates
        // Pass the current mouse-over index to the update function
        this.updateMALegends(idx);
      }
    }
  }

  private onMouseLeave() {
    const svg = this.containerEl.querySelector("svg");
    const hud = svg?.querySelector(".kline-hud");
    if (hud) hud.innerHTML = "";
    if (this.viewport.end > 0) {
      const lastVisibleIdx = Math.min(this.viewport.end - 1, this.data.length - 1);
      this.updateMALegends(lastVisibleIdx);
    }
  }

  private updateMALegends(targetIdx: number) {
    const svg = this.containerEl.querySelector("svg");
    if (!svg) return;

    const isShowMA = this.opts.ma !== undefined ? true : this.settings.showMA;
    if (!isShowMA) return;

    const maPeriodsStr = this.opts.ma ?? this.settings.maPeriods;
    const periods = maPeriodsStr.split(",").map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);

    // Iterate through all moving average periods that need to be displayed
    periods.forEach((period) => {
      // Find the corresponding DOM node using the markers set in svg.ts
      const legendEl = svg.querySelector(`.ma-legend-text[data-period="${period}"]`);
      if (!legendEl) return;

      if (targetIdx >= period - 1) {
        // Dynamically calculate the moving average value at the cursor position
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += this.data[targetIdx - j].close;
        }
        const avg = sum / period;
        legendEl.innerHTML = `MA(${period}): ${avg.toFixed(2)}`;
      } else {
        // Display a dash when historical data is insufficient
        legendEl.innerHTML = `MA(${period}): -`;
      }
    });
  }
}