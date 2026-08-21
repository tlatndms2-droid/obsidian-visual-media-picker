import { App } from "obsidian";
import type { MediaItem } from "./types";

interface CachedThumbnail {
  key: string;
  dataUrl: string;
}

const DATABASE_NAME = "visual-media-picker";
const STORE_NAME = "thumbnails";

export class ThumbnailCache {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly app: App) {}

  async get(item: MediaItem): Promise<string> {
    if (item.kind === "image" && item.extension !== "gif") {
      return this.app.vault.getResourcePath(item.file);
    }

    const key = `${item.path}:${item.mtime}`;
    const cached = await this.read(key);
    if (cached) return cached;

    const resourcePath = this.app.vault.getResourcePath(item.file);
    const dataUrl = item.kind === "video"
      ? await this.captureVideoFrame(resourcePath)
      : await this.captureImageFrame(resourcePath);
    await this.write({ key, dataUrl });
    return dataUrl;
  }

  async clear(): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear thumbnail cache."));
    });
  }

  private async captureVideoFrame(source: string): Promise<string> {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = source;
    try {
      await this.waitFor(video, "loadedmetadata");
      video.currentTime = Math.min(Math.max(video.duration * 0.1, 0.1), 3);
      await this.waitFor(video, "seeked");
      return this.drawFrame(video, video.videoWidth, video.videoHeight);
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  }

  private async captureImageFrame(source: string): Promise<string> {
    const image = new Image();
    image.src = source;
    await this.waitFor(image, "load");
    return this.drawFrame(image, image.naturalWidth, image.naturalHeight);
  }

  private drawFrame(source: CanvasImageSource, width: number, height: number): string {
    const maximum = 480;
    const scale = Math.min(maximum / Math.max(width, height), 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  private waitFor(target: EventTarget, eventName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}.`)), 12_000);
      const cleanup = (): void => window.clearTimeout(timeout);
      target.addEventListener(eventName, () => { cleanup(); resolve(); }, { once: true });
      target.addEventListener("error", () => { cleanup(); reject(new Error("Media preview could not be loaded.")); }, { once: true });
    });
  }

  private async read(key: string): Promise<string | null> {
    try {
      const database = await this.openDatabase();
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve((request.result as CachedThumbnail | undefined)?.dataUrl ?? null);
        request.onerror = () => reject(request.error ?? new Error("Could not read thumbnail cache."));
      });
    } catch {
      return null;
    }
  }

  private async write(value: CachedThumbnail): Promise<void> {
    try {
      const database = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(value);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not write thumbnail cache."));
      });
    } catch {
      // Cache failures must never prevent media insertion.
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open thumbnail cache."));
    });
    return this.databasePromise;
  }
}
