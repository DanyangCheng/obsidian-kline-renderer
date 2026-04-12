// src/main.ts
import { Plugin } from "obsidian";
import { KlineSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { parseKlineBlock } from "./parser";
import { KlineChartController } from "./renderer/interaction";
import { KlineSettingTab } from "./settings";

export default class KlineRendererPlugin extends Plugin {
  settings!: KlineSettings;

  async onload() {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor(
      "kline",
      (source, el, ctx) => {
        el.empty();
        try {
          const { data, opts } = parseKlineBlock(source, this.settings);
          
          const controller = new KlineChartController(el, data, this.settings, opts);
          controller.render();

          ctx.addChild(controller); 
        } catch (err) {
          el.createDiv({ cls: "kline-error", text: `⚠️ K-Line render error: ${err}` });
        }
      }
    );

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