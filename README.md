# 📈 Obsidian K-Line Renderer

[![English](https://img.shields.io/badge/English-blue.svg)](README.md)
[![简体中文](https://img.shields.io/badge/简体中文-red.svg)](README.zh-CN.md)

Obsidian K-Line Renderer is a locally-built candlestick chart rendering plugin designed specifically for Obsidian. It allows you to transform historical market data, quantitative backtesting results, or financial analysis data into highly interactive, fully localized professional SVG charts directly in your Markdown notes using simple code block syntax.

## ✨ Core Features

- 🖱️ **Deep Interactive Experience:**
  - **Zoom:** Use mouse wheel (or trackpad pinch) to dynamically adjust the visible timeline on the chart area.
  - **Pan:** Hold left mouse button and drag left/right to smoothly browse historical data.
  - **Smart Tooltip:** Mouse hover automatically snaps to the nearest candlestick, displaying specific OHLC and volume data.

- 🎨 **Highly Customizable:** Supports global settings panel (colors, dimensions, moving averages, etc.), as well as local overrides using `# key: value` syntax within individual code blocks.

- 📊 **Multiple Data Format Compatibility:** Supports simple space-separated format, CSV format, and JSON array format.

## 📦 Installation

*(Note: Once the plugin is listed on the Obsidian Community Plugins marketplace, it can be installed directly via the marketplace. Currently, please use manual installation.)*

### Manual Installation (Recommended for Developers)

1. Download the latest Release package from this repository.
2. Extract the folder (containing `main.js`, `manifest.json`, `styles.css`) into your Obsidian plugins directory: `Your Vault Path/.obsidian/plugins/obsidian-kline-renderer/`
3. Restart Obsidian and enable K-Line Renderer in "Third-party plugins" settings.

## 📖 Usage Guide

Create a `kline` code block in your Obsidian note and input your data to render the chart.

### Basic Syntax: Simple Text Mode

You can directly input space, comma, or tab-separated data (format: `date/label, open, high, low, close, [volume]`).
```kline
2024-01-01 100 110 95 105
2024-01-02 105 115 100 112 5000
2024-01-03 110 120 108 118 6200
2024-01-04 115 116 105 108 4100
```

### Advanced Syntax: Local Configuration with CSV Headers



You can use # key: value comment syntax to set chart-specific styles that override the plugin's global settings.

```
# title: Apple Inc. (AAPL) Historical Trend
# width: 900
# height: 450
# volume: true
# bull: #26a69a
# bear: #ef5350

date, open, high, low, close, volume
2024-01-01, 150.2, 155.0, 149.5, 154.1, 100000
2024-01-02, 154.5, 156.2, 152.0, 153.8, 85000
2024-01-03, 153.0, 158.5, 152.5, 158.0, 120000
```
Supported Local Configuration Options:

- title: Chart top title

- width / height: Chart dimensions (pixels)

- bull / bear: Bullish and bearish candlestick colors (hexadecimal)

- volume: true or false, whether to show bottom volume bars

- grid: true or false, whether to show background grid

### JSON Data Stream

If you write quantitative scripts in Python or Node.js, you can directly paste the exported JSON array, and the plugin will parse it automatically.

```kline
# title: JSON Data Source Test
[
  {"label":"24-01", "open":10, "high":12, "low":9, "close":11, "volume": 100},
  {"label":"24-02", "open":11, "high":15, "low":10, "close":14, "volume": 150}
]
```

## ⚙️ Plugin Settings

In Obsidian's plugin settings page, you can configure global rendering preferences:

- Dimensions: Default rendering width and height for code blocks.

- Colors: Full customization of bullish/bearish colors (Bull/Bear Color), background color, axis text, and grid colors.

- Display Controls: Global control over whether to show volume bars, grid lines, and interactive tooltips by default.

## 🛠️ Developer Guide

```text
src/
 ├── types.ts            # Core interfaces and type definitions
 ├── constants.ts        # Global default configurations
 ├── parser.ts           # Pure function data parser (Text/JSON -> KlineData)
 ├── renderer/
 │    ├── svg.ts         # Stateless SVG rendering engine
 │    └── interaction.ts # Viewport state control and DOM event handling (memory leak prevention)
 ├── settings.ts         # Obsidian settings panel UI
 └── main.ts             # Plugin lifecycle and code block processor registration
 ```

 ## TODO
 Integrate with market data APIs to automatically fetch historical data.