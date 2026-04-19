// src/main.ts
import { Plugin, TFile, normalizePath } from "obsidian";
import { KlineSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { parseKlineBlock } from "./parser";
import { KlineChartController } from "./renderer/interaction";
import { KlineSettingTab } from "./settings";

export default class KlineRendererPlugin extends Plugin {
  settings!: KlineSettings;

async onload() {
    await this.loadSettings();

    // Note: async added here
    this.registerMarkdownCodeBlockProcessor(
      "kline",
      async (source, el, ctx) => {
        el.empty();
        try {
          let finalSource = source;

          // 1. Intercept and check if `# file: xxx.csv` syntax is present
          const fileMatch = source.match(/^#\s*file\s*[:\s]\s*(.+)$/m);
          
          if (fileMatch) {
            // Get the file path entered by user and normalize the path format using normalizePath
            const filePath = normalizePath(fileMatch[1].trim());
            
            // Find the file in the current Obsidian vault
            const file = this.app.vault.getAbstractFileByPath(filePath);

            if (file instanceof TFile) {
              // Asynchronously read the full text content of the CSV file
              const fileContent = await this.app.vault.read(file);
              
              // Key logic: Append the read CSV data to the original configuration text
              // This allows the underlying parseKlineBlock to parse it as usual
              finalSource = source + "\n" + fileContent;
            } else {
              // Throw a clear error if the file doesn't exist
              throw new Error(`Data file not found: ${filePath}. Please ensure the path is correct and the file exists in the current vault.`);
            }
          }

          // 2. Call parser to parse the combined final data (finalSource)
          const { data, opts } = parseKlineBlock(finalSource, this.settings);
          
          if (data.length === 0) {
             throw new Error("No valid K-line data was parsed");
          }
          
          // 3. Initialize Controller to take over rendering and interaction
          const controller = new KlineChartController(el, data, this.settings, opts);
          controller.render();

          // 4. Hand over Controller to Obsidian's lifecycle management
          ctx.addChild(controller); 
          
        } catch (err) {
          el.createDiv({ cls: "kline-error", text: `⚠️ Render Error: ${err instanceof Error ? err.message : err}` });
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