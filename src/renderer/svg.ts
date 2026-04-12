// src/renderer/svg.ts
import { KlineData, KlineSettings, BlockOpts, ViewportState } from "../types";

export function renderKlineSVG(
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