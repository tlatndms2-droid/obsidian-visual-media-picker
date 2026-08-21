import { App, Modal, Notice, TFile, debounce, setIcon } from "obsidian";
import type { MediaFilter, MediaItem, MediaSort, PickerContext, ThumbnailSize, VisualMediaPickerSettings } from "./types";
import type { MediaIndex } from "./media-index";
import type { ThumbnailCache } from "./thumbnail-cache";

interface PickerDependencies {
  app: App;
  index: MediaIndex;
  cache: ThumbnailCache;
  settings: VisualMediaPickerSettings;
  context: PickerContext;
  onInsert: (files: TFile[]) => void;
  onThumbnailSizeChange: (size: ThumbnailSize) => Promise<void>;
}

const OVERSCAN_ROWS = 2;

export class MediaPickerModal extends Modal {
  private readonly index: MediaIndex;
  private readonly cache: ThumbnailCache;
  private readonly settings: VisualMediaPickerSettings;
  private readonly context: PickerContext;
  private readonly onInsert: (files: TFile[]) => void;
  private readonly onThumbnailSizeChange: (size: ThumbnailSize) => Promise<void>;
  private query = "";
  private filter: MediaFilter = "all";
  private sort: MediaSort;
  private folder = "";
  private includeSubfolders: boolean;
  private visibleItems: MediaItem[] = [];
  private selectedPaths = new Set<string>();
  private selectionAnchor = -1;
  private grid!: VirtualMediaGrid;
  private resultLabel!: HTMLElement;
  private selectionBar!: HTMLElement;
  private insertButton!: HTMLButtonElement;
  private thumbnailUrls = new Map<string, string>();
  private videoDurations = new Map<string, Promise<string | null>>();

  constructor(dependencies: PickerDependencies) {
    super(dependencies.app);
    this.index = dependencies.index;
    this.cache = dependencies.cache;
    this.settings = dependencies.settings;
    this.context = dependencies.context;
    this.onInsert = dependencies.onInsert;
    this.onThumbnailSizeChange = dependencies.onThumbnailSizeChange;
    this.sort = dependencies.settings.defaultSort;
    this.includeSubfolders = dependencies.settings.includeSubfolders;
    if (dependencies.settings.defaultScope === "current-folder") {
      this.folder = this.getContextFolder();
    }
  }

  onOpen(): void {
    this.modalEl.addClass("vmp-modal");
    this.contentEl.addClass("vmp-content");
    this.titleEl.setText("Visual Media Picker");
    this.renderToolbar();
    this.renderScopeBar();

    const gridHost = this.contentEl.createDiv({ cls: "vmp-grid-host" });
    this.grid = new VirtualMediaGrid(gridHost, this.settings.thumbnailSize, (item, index) => this.createCard(item, index));

    this.selectionBar = this.contentEl.createDiv({ cls: "vmp-selection-bar is-hidden" });
    this.selectionBar.createSpan({ cls: "vmp-selection-count" });
    const clearButton = this.selectionBar.createEl("button", { text: "Clear", cls: "vmp-button" });
    clearButton.addEventListener("click", () => {
      this.selectedPaths.clear();
      this.selectionAnchor = -1;
      this.updateSelectionUi();
      this.grid.refresh();
    });
    this.insertButton = this.selectionBar.createEl("button", { text: "Insert", cls: "mod-cta vmp-button" });
    this.insertButton.addEventListener("click", () => this.insertSelection());

    this.applyFilters();
    window.setTimeout(() => this.contentEl.querySelector<HTMLInputElement>(".vmp-search")?.focus(), 0);
  }

  onClose(): void {
    this.grid?.destroy();
    this.contentEl.empty();
  }

  private renderToolbar(): void {
    const toolbar = this.contentEl.createDiv({ cls: "vmp-toolbar" });
    const searchWrap = toolbar.createDiv({ cls: "vmp-search-wrap" });
    const searchIcon = searchWrap.createSpan({ cls: "vmp-search-icon" });
    setIcon(searchIcon, "search");
    const search = searchWrap.createEl("input", { cls: "vmp-search", attr: { type: "search", placeholder: "Search media...", "aria-label": "Search media" } });
    const updateSearch = debounce((value: string) => { this.query = value.trim().toLocaleLowerCase(); this.applyFilters(); }, 80, true);
    search.addEventListener("input", () => updateSearch(search.value));

    const filter = toolbar.createEl("select", { cls: "dropdown vmp-select", attr: { "aria-label": "Media type" } });
    this.addOptions(filter, { all: "All media", image: "Images", gif: "GIFs", video: "Videos" });
    filter.value = this.filter;
    filter.addEventListener("change", () => { this.filter = filter.value as MediaFilter; this.applyFilters(); });

    const sort = toolbar.createEl("select", { cls: "dropdown vmp-select", attr: { "aria-label": "Sort media" } });
    this.addOptions(sort, { modified: "Recently modified", created: "Recently created", name: "Name", type: "File type" });
    sort.value = this.sort;
    sort.addEventListener("change", () => { this.sort = sort.value as MediaSort; this.applyFilters(); });

    const size = toolbar.createEl("select", { cls: "dropdown vmp-select vmp-size-select", attr: { "aria-label": "Thumbnail size" } });
    this.addOptions(size, { small: "Small", medium: "Medium", large: "Large" });
    size.value = this.settings.thumbnailSize;
    size.addEventListener("change", () => {
      const value = size.value as ThumbnailSize;
      this.grid.setSize(value);
      void this.onThumbnailSizeChange(value);
    });
  }

  private renderScopeBar(): void {
    const scopeBar = this.contentEl.createDiv({ cls: "vmp-scope-bar" });
    const folderSelect = scopeBar.createEl("select", { cls: "dropdown vmp-folder-select", attr: { "aria-label": "Folder scope" } });
    folderSelect.createEl("option", { text: "Entire vault", value: "" });
    const contextFolder = this.getContextFolder();
    if (contextFolder) folderSelect.createEl("option", { text: `Current folder — ${contextFolder}`, value: contextFolder });
    for (const folder of this.getMediaFolders()) {
      if (folder !== contextFolder) folderSelect.createEl("option", { text: folder, value: folder });
    }
    folderSelect.value = this.folder;
    folderSelect.addEventListener("change", () => { this.folder = folderSelect.value; this.applyFilters(); });

    const includeLabel = scopeBar.createEl("label", { cls: "vmp-checkbox-label" });
    const include = includeLabel.createEl("input", { attr: { type: "checkbox" } });
    include.checked = this.includeSubfolders;
    includeLabel.appendText(" Include subfolders");
    include.addEventListener("change", () => { this.includeSubfolders = include.checked; this.applyFilters(); });

    this.resultLabel = scopeBar.createSpan({ cls: "vmp-result-count" });
  }

  private addOptions(select: HTMLSelectElement, options: Record<string, string>): void {
    for (const [value, label] of Object.entries(options)) select.createEl("option", { text: label, value });
  }

  private getContextFolder(): string {
    const source = this.context.sourcePath;
    const slash = source.lastIndexOf("/");
    return slash < 0 ? "" : source.slice(0, slash);
  }

  private getMediaFolders(): string[] {
    return Array.from(new Set(this.index.getItems().map((item) => item.parentPath).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  private applyFilters(): void {
    const folderPrefix = this.folder ? `${this.folder}/` : "";
    this.visibleItems = this.index.getItems().filter((item) => {
      if (this.filter !== "all" && item.kind !== this.filter) return false;
      if (this.query && !item.path.toLocaleLowerCase().includes(this.query)) return false;
      if (!this.folder) return true;
      return this.includeSubfolders ? item.path.startsWith(folderPrefix) : item.parentPath === this.folder;
    }).slice();

    this.visibleItems.sort((left, right) => {
      if (this.sort === "modified") return right.mtime - left.mtime;
      if (this.sort === "created") return right.ctime - left.ctime;
      if (this.sort === "type") return left.extension.localeCompare(right.extension) || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });

    this.resultLabel?.setText(`${this.visibleItems.length.toLocaleString()} items`);
    this.grid?.setItems(this.visibleItems);
  }

  private createCard(item: MediaItem, index: number): HTMLElement {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "vmp-card";
    card.dataset.path = item.path;
    card.setAttribute("aria-label", `${item.name}, ${item.kind}`);
    card.toggleClass("is-selected", this.selectedPaths.has(item.path));

    const preview = card.createDiv({ cls: "vmp-preview" });
    const image = preview.createEl("img", { cls: "vmp-thumbnail", attr: { alt: "", loading: "lazy", draggable: "false" } });
    const playBadge = item.kind === "video" ? preview.createSpan({ cls: "vmp-play-badge" }) : null;
    if (playBadge) setIcon(playBadge, "play");
    const selectionMark = preview.createSpan({ cls: "vmp-selection-mark" });
    setIcon(selectionMark, "check");
    const errorBadge = preview.createSpan({ cls: "vmp-preview-error", text: item.extension.toUpperCase() });

    const cached = this.thumbnailUrls.get(`${item.path}:${item.mtime}`);
    if (cached) image.src = cached;
    else void this.cache.get(item).then((url) => {
      this.thumbnailUrls.set(`${item.path}:${item.mtime}`, url);
      if (card.isConnected) image.src = url;
    }).catch(() => errorBadge.addClass("is-visible"));

    const details = card.createDiv({ cls: "vmp-card-details" });
    details.createDiv({ cls: "vmp-file-name", text: item.name, attr: { title: item.path } });
    details.createSpan({ cls: `vmp-kind is-${item.kind}`, text: item.kind === "gif" ? "GIF" : item.kind.toUpperCase() });
    if (item.kind === "video") {
      const duration = details.createSpan({ cls: "vmp-duration" });
      void this.getVideoDuration(item).then((value) => {
        if (value && card.isConnected) duration.setText(value);
      });
    }

    card.addEventListener("click", (event) => this.handleCardClick(event, item, index));
    if (item.kind === "video" && this.settings.videoHoverPreview) this.attachVideoPreview(card, preview, image, item);
    if (item.kind === "gif" && this.settings.gifHoverPreview) this.attachGifPreview(card, image, item);
    return card;
  }

  private handleCardClick(event: MouseEvent, item: MediaItem, index: number): void {
    if (event.ctrlKey || event.metaKey) {
      this.toggleSelection(item.path);
      this.selectionAnchor = index;
      return;
    }
    if (event.shiftKey) {
      const anchor = this.selectionAnchor < 0 ? index : this.selectionAnchor;
      const [start, end] = anchor < index ? [anchor, index] : [index, anchor];
      for (let position = start; position <= end; position += 1) this.selectedPaths.add(this.visibleItems[position].path);
      this.updateSelectionUi();
      this.grid.refresh();
      return;
    }
    if (this.selectedPaths.size > 0) {
      this.toggleSelection(item.path);
      this.selectionAnchor = index;
      return;
    }
    this.onInsert([item.file]);
    this.close();
  }

  private toggleSelection(path: string): void {
    if (this.selectedPaths.has(path)) this.selectedPaths.delete(path);
    else this.selectedPaths.add(path);
    this.updateSelectionUi();
    this.grid.refresh();
  }

  private updateSelectionUi(): void {
    const count = this.selectedPaths.size;
    this.selectionBar.toggleClass("is-hidden", count === 0);
    this.selectionBar.querySelector<HTMLElement>(".vmp-selection-count")?.setText(`${count} selected`);
    this.insertButton.disabled = count === 0;
  }

  private insertSelection(): void {
    const files = this.visibleItems.filter((item) => this.selectedPaths.has(item.path)).map((item) => item.file);
    if (files.length === 0) {
      new Notice("No visible media is selected.");
      return;
    }
    this.onInsert(files);
    this.close();
  }

  private attachVideoPreview(card: HTMLElement, preview: HTMLElement, thumbnail: HTMLImageElement, item: MediaItem): void {
    let timer = 0;
    let video: HTMLVideoElement | null = null;
    const stop = (): void => {
      window.clearTimeout(timer);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        video = null;
      }
      thumbnail.removeClass("is-hidden");
    };
    card.addEventListener("pointerenter", () => {
      timer = window.setTimeout(() => {
        if (!card.isConnected) return;
        video = preview.createEl("video", { cls: "vmp-hover-video", attr: { muted: "true", loop: "true", autoplay: "true", playsinline: "true" } });
        video.muted = true;
        video.loop = true;
        video.src = this.app.vault.getResourcePath(item.file);
        thumbnail.addClass("is-hidden");
        void video.play().catch(stop);
      }, 180);
    });
    card.addEventListener("pointerleave", stop);
  }

  private attachGifPreview(card: HTMLElement, image: HTMLImageElement, item: MediaItem): void {
    const stillSource = (): string | undefined => this.thumbnailUrls.get(`${item.path}:${item.mtime}`);
    card.addEventListener("pointerenter", () => { image.src = this.app.vault.getResourcePath(item.file); });
    card.addEventListener("pointerleave", () => { const source = stillSource(); if (source) image.src = source; });
  }

  private getVideoDuration(item: MediaItem): Promise<string | null> {
    const key = `${item.path}:${item.mtime}`;
    const existing = this.videoDurations.get(key);
    if (existing) return existing;
    const promise = new Promise<string | null>((resolve) => {
      const video = document.createElement("video");
      let settled = false;
      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        video.removeAttribute("src");
        video.load();
        resolve(value);
      };
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", () => {
        if (!Number.isFinite(video.duration)) return finish(null);
        const seconds = Math.max(0, Math.round(video.duration));
        const minutes = Math.floor(seconds / 60);
        finish(`${minutes.toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`);
      }, { once: true });
      video.addEventListener("error", () => finish(null), { once: true });
      video.src = this.app.vault.getResourcePath(item.file);
    });
    this.videoDurations.set(key, promise);
    return promise;
  }
}

class VirtualMediaGrid {
  private items: MediaItem[] = [];
  private columns = 1;
  private cardWidth = 210;
  private rowHeight = 220;
  private readonly scrollEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly onScroll: () => void;

  constructor(host: HTMLElement, size: ThumbnailSize, private readonly createCard: (item: MediaItem, index: number) => HTMLElement) {
    this.scrollEl = host.createDiv({ cls: "vmp-grid-scroll" });
    this.stageEl = this.scrollEl.createDiv({ cls: "vmp-grid-stage" });
    this.onScroll = () => this.renderWindow();
    this.scrollEl.addEventListener("scroll", this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.scrollEl);
    this.setSize(size);
  }

  setItems(items: MediaItem[]): void {
    this.items = items;
    this.scrollEl.scrollTop = 0;
    this.measure();
  }

  setSize(size: ThumbnailSize): void {
    const widths: Record<ThumbnailSize, number> = { small: 150, medium: 210, large: 280 };
    this.cardWidth = widths[size];
    this.rowHeight = Math.round(this.cardWidth * 0.72) + 62;
    this.scrollEl.style.setProperty("--vmp-card-width", `${this.cardWidth}px`);
    this.measure();
  }

  refresh(): void {
    this.renderWindow();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.scrollEl.removeEventListener("scroll", this.onScroll);
  }

  private measure(): void {
    const width = this.scrollEl.clientWidth;
    this.columns = Math.max(1, Math.floor((width + 12) / (this.cardWidth + 12)));
    const rows = Math.ceil(this.items.length / this.columns);
    this.stageEl.style.height = `${rows * this.rowHeight}px`;
    this.renderWindow();
  }

  private renderWindow(): void {
    const firstRow = Math.max(0, Math.floor(this.scrollEl.scrollTop / this.rowHeight) - OVERSCAN_ROWS);
    const lastRow = Math.min(Math.ceil(this.items.length / this.columns), Math.ceil((this.scrollEl.scrollTop + this.scrollEl.clientHeight) / this.rowHeight) + OVERSCAN_ROWS);
    const start = firstRow * this.columns;
    const end = Math.min(this.items.length, lastRow * this.columns);
    this.stageEl.empty();
    for (let index = start; index < end; index += 1) {
      const card = this.createCard(this.items[index], index);
      const row = Math.floor(index / this.columns);
      const column = index % this.columns;
      card.style.width = `${this.cardWidth}px`;
      card.style.height = `${this.rowHeight - 12}px`;
      card.style.transform = `translate(${column * (this.cardWidth + 12)}px, ${row * this.rowHeight}px)`;
      this.stageEl.appendChild(card);
    }
  }
}
