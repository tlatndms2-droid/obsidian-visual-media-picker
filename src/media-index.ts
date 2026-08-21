import { App, TFile } from "obsidian";
import type { MediaItem, MediaKind, VisualMediaPickerSettings } from "./types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

export class MediaIndex {
  private items: MediaItem[] = [];

  constructor(private readonly app: App) {}

  rebuild(settings: VisualMediaPickerSettings): void {
    const supported = new Set(settings.supportedExtensions.map((extension) => extension.toLowerCase()));
    this.items = this.app.vault.getFiles()
      .filter((file) => supported.has(file.extension.toLowerCase()))
      .map((file) => this.toItem(file))
      .filter((item): item is MediaItem => item !== null);
  }

  getItems(): readonly MediaItem[] {
    return this.items;
  }

  upsert(file: TFile, settings: VisualMediaPickerSettings): void {
    this.remove(file.path);
    if (!settings.supportedExtensions.includes(file.extension.toLowerCase())) return;
    const item = this.toItem(file);
    if (item) this.items.push(item);
  }

  remove(path: string): void {
    this.items = this.items.filter((item) => item.path !== path);
  }

  rename(file: TFile, oldPath: string, settings: VisualMediaPickerSettings): void {
    this.remove(oldPath);
    this.upsert(file, settings);
  }

  private toItem(file: TFile): MediaItem | null {
    const extension = file.extension.toLowerCase();
    const kind = this.getKind(extension);
    if (!kind) return null;
    return {
      file,
      kind,
      extension,
      name: file.name,
      path: file.path,
      parentPath: file.parent?.path ?? "",
      mtime: file.stat.mtime,
      ctime: file.stat.ctime
    };
  }

  private getKind(extension: string): MediaKind | null {
    if (extension === "gif") return "gif";
    if (extension === "mp4" || extension === "webm") return "video";
    if (IMAGE_EXTENSIONS.has(extension)) return "image";
    return null;
  }
}
