import { App, PluginSettingTab, Setting } from "obsidian";
import type KlineRendererPlugin from "./main";
export interface MyPluginSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export class KlineSettingTab extends PluginSettingTab {
	plugin: KlineRendererPlugin;

	constructor(app: App, plugin: KlineRendererPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		// Clear previous rendering
		containerEl.empty();
		containerEl.createEl('h2', { text: 'K-Line Renderer Settings' });

		// ─── Dimensions ────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Dimensions' });

		new Setting(containerEl)
			.setName('Default Width (px)')
			.setDesc('If width is not specified in the code block, this value will be used')
			.addText(text => text
				.setPlaceholder('800')
				.setValue(String(this.plugin.settings.defaultWidth))
				.onChange(async (value) => {
					this.plugin.settings.defaultWidth = parseInt(value) || 800;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Height (px)')
			.setDesc('If height is not specified in the code block, this value will be used')
			.addText(text => text
				.setPlaceholder('400')
				.setValue(String(this.plugin.settings.defaultHeight))
				.onChange(async (value) => {
					this.plugin.settings.defaultHeight = parseInt(value) || 400;
					await this.plugin.saveSettings();
				}));

		// ─── Colors ────────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Colors' });

		new Setting(containerEl)
			.setName('Bull Color')
			.setDesc('Color for bullish candles (close >= open)')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.bullColor)
				.onChange(async (value) => {
					this.plugin.settings.bullColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Bear Color')
			.setDesc('Color for bearish candles (close < open)')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.bearColor)
				.onChange(async (value) => {
					this.plugin.settings.bearColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Wick Color')
			.setDesc('Color for candlestick wicks/shadows')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.wickColor)
				.onChange(async (value) => {
					this.plugin.settings.wickColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Background Color')
			.setDesc('Background color of the chart area')
			.addText(text => text
				.setPlaceholder('transparent or #ffffff')
				.setValue(this.plugin.settings.bgColor)
				.onChange(async (value) => {
					this.plugin.settings.bgColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Grid Color')
			.setDesc('Color of the background grid lines')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.gridColor)
				.onChange(async (value) => {
					this.plugin.settings.gridColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Text Color')
			.setDesc('Color for axis labels and titles')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.textColor)
				.onChange(async (value) => {
					this.plugin.settings.textColor = value;
					await this.plugin.saveSettings();
				}));

		// ─── Display Options ───────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Display Options' });

		new Setting(containerEl)
			.setName('Show Volume')
			.setDesc('If volume data is available, show volume bars at the bottom')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showVolume)
				.onChange(async (value) => {
					this.plugin.settings.showVolume = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Grid')
			.setDesc('Show background reference grid lines')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showGrid)
				.onChange(async (value) => {
					this.plugin.settings.showGrid = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Tooltip')
			.setDesc('Show detailed OHLCV data tooltip on mouse hover')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showTooltip)
				.onChange(async (value) => {
					this.plugin.settings.showTooltip = value;
					await this.plugin.saveSettings();
				}));

		// ─── Moving Averages ──────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Moving Averages' });

		new Setting(containerEl)
			.setName('Show MA')
			.setDesc('Display moving averages on the candlestick chart')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showMA)
				.onChange(async (value) => {
					this.plugin.settings.showMA = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('MA Periods')
			.setDesc('Enter numbers separated by commas. Example: 5,10,20')
			.addText(text => text
				.setPlaceholder('5,10,20')
				.setValue(this.plugin.settings.maPeriods)
				.onChange(async (value) => {
					this.plugin.settings.maPeriods = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('MA Colors')
			.setDesc('Colors corresponding to each MA period, separated by commas. Must match the number of periods')
			.addText(text => text
				.setPlaceholder('#ff9800,#2196f3,#9c27b0')
				.setValue(this.plugin.settings.maColors)
				.onChange(async (value) => {
					this.plugin.settings.maColors = value;
					await this.plugin.saveSettings();
				}));
	}
}