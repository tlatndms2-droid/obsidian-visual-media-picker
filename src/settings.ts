import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type VisualMediaPickerPlugin from "./main";
import type { DefaultScope, MediaGroup, MediaSort, SortDirection, ThumbnailSize, VisualMediaPickerSettings } from "./types";

export const DEFAULT_SETTINGS: VisualMediaPickerSettings = {
  thumbnailSize: "medium",
  defaultSort: "modified",
  defaultSortDirection: "descending",
  defaultGroup: "modified",
  videoHoverPreview: true,
  gifHoverPreview: true,
  defaultScope: "vault",
  includeSubfolders: true,
  supportedExtensions: ["png", "jpg", "jpeg", "webp", "svg", "gif", "mp4", "webm"]
};

export class VisualMediaPickerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: VisualMediaPickerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Visual Media Picker" });

    new Setting(containerEl).setName("Thumbnail size").addDropdown((dropdown) => dropdown
      .addOptions({ small: "Small", medium: "Medium", large: "Large" })
      .setValue(this.plugin.settings.thumbnailSize)
      .onChange(async (value) => this.updateSettings({ thumbnailSize: value as ThumbnailSize })));

    new Setting(containerEl).setName("Default sort by").addDropdown((dropdown) => dropdown
      .addOptions({ name: "Name", modified: "Date modified", type: "Type", size: "Size", created: "Date created" })
      .setValue(this.plugin.settings.defaultSort)
      .onChange(async (value) => this.updateSettings({ defaultSort: value as MediaSort })));

    new Setting(containerEl).setName("Default sort direction").addDropdown((dropdown) => dropdown
      .addOptions({ ascending: "Ascending", descending: "Descending" })
      .setValue(this.plugin.settings.defaultSortDirection)
      .onChange(async (value) => this.updateSettings({ defaultSortDirection: value as SortDirection })));

    new Setting(containerEl).setName("Default group by").addDropdown((dropdown) => dropdown
      .addOptions({ none: "None", name: "Name", modified: "Date modified", type: "Type", size: "Size", created: "Date created" })
      .setValue(this.plugin.settings.defaultGroup)
      .onChange(async (value) => this.updateSettings({ defaultGroup: value as MediaGroup })));

    new Setting(containerEl).setName("Video hover preview").addToggle((toggle) => toggle
      .setValue(this.plugin.settings.videoHoverPreview)
      .onChange(async (value) => this.updateSettings({ videoHoverPreview: value })));

    new Setting(containerEl).setName("GIF hover preview").addToggle((toggle) => toggle
      .setValue(this.plugin.settings.gifHoverPreview)
      .onChange(async (value) => this.updateSettings({ gifHoverPreview: value })));

    new Setting(containerEl).setName("Default scope").addDropdown((dropdown) => dropdown
      .addOptions({ vault: "Entire vault", "current-folder": "Current file or Canvas folder" })
      .setValue(this.plugin.settings.defaultScope)
      .onChange(async (value) => this.updateSettings({ defaultScope: value as DefaultScope })));

    new Setting(containerEl).setName("Include subfolders").addToggle((toggle) => toggle
      .setValue(this.plugin.settings.includeSubfolders)
      .onChange(async (value) => this.updateSettings({ includeSubfolders: value })));

    new Setting(containerEl)
      .setName("Supported extensions")
      .setDesc("Comma-separated. Unsupported formats are ignored.")
      .addText((text) => text
        .setPlaceholder("png, jpg, jpeg, webp, svg, gif, mp4, webm")
        .setValue(this.plugin.settings.supportedExtensions.join(", "))
        .onChange(async (value) => {
          const extensions = value.split(",").map((item) => item.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
          await this.updateSettings({ supportedExtensions: Array.from(new Set(extensions)) });
          this.plugin.rebuildIndex();
        }));

    new Setting(containerEl).setName("Thumbnail cache").setDesc("Rebuild GIF and video thumbnails on next use.")
      .addButton((button) => button.setButtonText("Clear cache").onClick(async () => {
        await this.plugin.thumbnailCache.clear();
        new Notice("Visual Media Picker thumbnail cache cleared.");
      }));
  }

  private async updateSettings(change: Partial<VisualMediaPickerSettings>): Promise<void> {
    this.plugin.settings = { ...this.plugin.settings, ...change };
    await this.plugin.saveData(this.plugin.settings);
  }
}
