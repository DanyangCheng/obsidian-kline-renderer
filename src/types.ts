// ─── Types ───────────────────────────────────────────────────────────────────
export interface ViewportState {
  start: number;
  end: number;
  priceMin?: number;
  priceMax?: number;
}

export interface KlineData {
  label?: string;   // date / name
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface KlineSettings {
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

export interface BlockOpts {
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