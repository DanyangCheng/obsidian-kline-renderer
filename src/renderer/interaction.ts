import { MarkdownRenderChild } from "obsidian";
import { KlineData, KlineSettings, BlockOpts, ViewportState } from "../types";
import { renderKlineSVG } from "./svg";

export class KlineChartController extends MarkdownRenderChild {
  private viewport: ViewportState;
  private isDragging = false;
  private dragStartX = 0;
  private initialStart = 0;
  private initialEnd = 0;

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
    this.containerEl.innerHTML = renderKlineSVG(
      this.data,
      this.settings,
      this.opts,
      this.viewport
    );
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────────

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();

    const svg = this.containerEl.querySelector("svg");
    if (!svg) return;

    // 1. Calculate the ratio of mouse hover position to implement "center-on-mouse" zoom
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padL = 60; // Must match padL in svg.ts
    const chartW = Math.max(1, svg.clientWidth - padL - 20); 
    let mouseRatio = (mouseX - padL) / chartW;
    mouseRatio = isNaN(mouseRatio) ? 0.5 : Math.max(0, Math.min(1, mouseRatio));

    // 2. Calculate the zoom delta
    const zoomFactor = 0.15;
    const range = this.viewport.end - this.viewport.start;
    const totalDelta = Math.max(2, Math.round(range * zoomFactor));

    let newStart = this.viewport.start;
    let newEnd = this.viewport.end;

    // 3. Apply zoom
    if (e.deltaY < 0) { // Scroll up -> zoom in (reduce range)
      newStart += Math.round(totalDelta * mouseRatio);
      newEnd -= Math.round(totalDelta * (1 - mouseRatio));
    } else { // Scroll down -> zoom out (expand range)
      newStart -= Math.round(totalDelta * mouseRatio);
      newEnd += Math.round(totalDelta * (1 - mouseRatio));
    }

    // 4. Boundary constraints (show at least 5 candlesticks)
    if (newEnd - newStart < 5) return;
    if (newStart < 0) newStart = 0;
    if (newEnd > this.data.length) newEnd = this.data.length;

    // 5. Trigger render
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
    
    const currentSvg = this.containerEl.querySelector("svg");
    const chartW = currentSvg ? Math.max(1, currentSvg.clientWidth - 80) : 800;
    
    // 1. Calculate mouse offset
    const dx = e.clientX - this.dragStartX;
    const range = this.initialEnd - this.initialStart;
    
    // 2. Convert pixel offset to candlestick data index offset (reverse: dragging right moves chart left)
    const shift = -Math.round((dx / chartW) * range);

    let newStart = this.initialStart + shift;
    let newEnd = this.initialEnd + shift;

    // 3. Boundary collision detection and correction
    if (newStart < 0) {
      newStart = 0;
      newEnd = range;
    }
    if (newEnd > this.data.length) {
      newEnd = this.data.length;
      newStart = Math.max(0, this.data.length - range);
    }

    // 4. Trigger render
    if (newStart !== this.viewport.start || newEnd !== this.viewport.end) {
      this.viewport.start = newStart;
      this.viewport.end = newEnd;
      this.render();
    }
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
    if (this.isDragging) return; // Disable tooltip while dragging
    
    const target = e.target as SVGElement;
    const idxStr = target.getAttribute ? target.getAttribute("data-idx") : null;
    
    const svg = this.containerEl.querySelector("svg");
    if (!svg) return;
    const hud = svg.querySelector(".kline-hud");
    
    // 1. Get the corresponding candlestick data and render HUD
    if (idxStr !== null && hud) {
      const idx = parseInt(idxStr, 10);
      const d = this.data[idx];
      if (d) {
        const isBull = d.close >= d.open;
        const color = isBull ? this.settings.bullColor : this.settings.bearColor;
        const volStr = d.volume !== undefined ? `  Vol: ${d.volume}` : "";
        const labelStr = d.label ? `${d.label} | ` : "";

        hud.innerHTML = `<tspan font-weight="bold">${labelStr}</tspan>Open: ${d.open}  High: ${d.high}  Low: ${d.low}  Close: <tspan fill="${color}" font-weight="bold">${d.close}</tspan>${volStr}`;
      }
    }
  }

  private onMouseLeave() {
    // Clear tooltip when mouse leaves chart area
    const svg = this.containerEl.querySelector("svg");
    const hud = svg?.querySelector(".kline-hud");
    if (hud) hud.innerHTML = "";
  }
}