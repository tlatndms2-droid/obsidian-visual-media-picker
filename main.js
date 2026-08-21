/* Visual Media Picker */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VisualMediaPickerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/media-index.ts
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "webp", "svg"]);
var MediaIndex = class {
  constructor(app) {
    this.app = app;
    this.items = [];
  }
  rebuild(settings) {
    const supported = new Set(settings.supportedExtensions.map((extension) => extension.toLowerCase()));
    this.items = this.app.vault.getFiles().filter((file) => supported.has(file.extension.toLowerCase())).map((file) => this.toItem(file)).filter((item) => item !== null);
  }
  getItems() {
    return this.items;
  }
  upsert(file, settings) {
    this.remove(file.path);
    if (!settings.supportedExtensions.includes(file.extension.toLowerCase())) return;
    const item = this.toItem(file);
    if (item) this.items.push(item);
  }
  remove(path) {
    this.items = this.items.filter((item) => item.path !== path);
  }
  rename(file, oldPath, settings) {
    this.remove(oldPath);
    this.upsert(file, settings);
  }
  toItem(file) {
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
      ctime: file.stat.ctime,
      size: file.stat.size
    };
  }
  getKind(extension) {
    if (extension === "gif") return "gif";
    if (extension === "mp4" || extension === "webm") return "video";
    if (IMAGE_EXTENSIONS.has(extension)) return "image";
    return null;
  }
};

// src/media-picker-modal.ts
var import_obsidian = require("obsidian");
var OVERSCAN_ROWS = 2;
var GROUP_HEADER_HEIGHT = 42;
var MediaPickerModal = class extends import_obsidian.Modal {
  constructor(dependencies) {
    super(dependencies.app);
    this.query = "";
    this.filter = "all";
    this.folder = "";
    this.visibleItems = [];
    this.selectedPaths = /* @__PURE__ */ new Set();
    this.selectionAnchor = -1;
    this.thumbnailUrls = /* @__PURE__ */ new Map();
    this.videoDurations = /* @__PURE__ */ new Map();
    this.index = dependencies.index;
    this.cache = dependencies.cache;
    this.settings = dependencies.settings;
    this.context = dependencies.context;
    this.onInsert = dependencies.onInsert;
    this.onGroupChange = dependencies.onGroupChange;
    this.onSortChange = dependencies.onSortChange;
    this.onThumbnailSizeChange = dependencies.onThumbnailSizeChange;
    this.sort = dependencies.settings.defaultSort;
    this.sortDirection = dependencies.settings.defaultSortDirection;
    this.group = dependencies.settings.defaultGroup;
    this.includeSubfolders = dependencies.settings.includeSubfolders;
    if (dependencies.settings.defaultScope === "current-folder") {
      this.folder = this.getContextFolder();
    }
  }
  onOpen() {
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
    window.setTimeout(() => this.contentEl.querySelector(".vmp-search")?.focus(), 0);
  }
  onClose() {
    this.grid?.destroy();
    this.contentEl.empty();
  }
  renderToolbar() {
    const toolbar = this.contentEl.createDiv({ cls: "vmp-toolbar" });
    const searchWrap = toolbar.createDiv({ cls: "vmp-search-wrap" });
    const searchIcon = searchWrap.createSpan({ cls: "vmp-search-icon" });
    (0, import_obsidian.setIcon)(searchIcon, "search");
    const search = searchWrap.createEl("input", { cls: "vmp-search", attr: { type: "search", placeholder: "Search media...", "aria-label": "Search media" } });
    const updateSearch = (0, import_obsidian.debounce)((value) => {
      this.query = value.trim().toLocaleLowerCase();
      this.applyFilters();
    }, 80, true);
    search.addEventListener("input", () => updateSearch(search.value));
    const filter = toolbar.createEl("select", { cls: "dropdown vmp-select", attr: { "aria-label": "Media type" } });
    this.addOptions(filter, { all: "All media", image: "Images", gif: "GIFs", video: "Videos" });
    filter.value = this.filter;
    filter.addEventListener("change", () => {
      this.filter = filter.value;
      this.applyFilters();
    });
    const sort = toolbar.createEl("select", { cls: "dropdown vmp-select", attr: { "aria-label": "Sort by" } });
    this.addOptions(sort, { name: "Name", modified: "Date modified", type: "Type", size: "Size", created: "Date created" });
    sort.value = this.sort;
    sort.addEventListener("change", () => {
      this.sort = sort.value;
      this.applyFilters();
      void this.onSortChange(this.sort, this.sortDirection);
    });
    const direction = toolbar.createEl("select", { cls: "dropdown vmp-select vmp-direction-select", attr: { "aria-label": "Sort direction" } });
    this.addOptions(direction, { ascending: "Ascending", descending: "Descending" });
    direction.value = this.sortDirection;
    direction.addEventListener("change", () => {
      this.sortDirection = direction.value;
      this.applyFilters();
      void this.onSortChange(this.sort, this.sortDirection);
    });
    const group = toolbar.createEl("select", { cls: "dropdown vmp-select vmp-group-select", attr: { "aria-label": "Group by" } });
    this.addOptions(group, { none: "Group: None", name: "Group: Name", modified: "Group: Date modified", type: "Group: Type", size: "Group: Size", created: "Group: Date created" });
    group.value = this.group;
    group.addEventListener("change", () => {
      this.group = group.value;
      this.applyFilters();
      void this.onGroupChange(this.group);
    });
    const size = toolbar.createEl("select", { cls: "dropdown vmp-select vmp-size-select", attr: { "aria-label": "Thumbnail size" } });
    this.addOptions(size, { small: "Small", medium: "Medium", large: "Large" });
    size.value = this.settings.thumbnailSize;
    size.addEventListener("change", () => {
      const value = size.value;
      this.grid.setSize(value);
      void this.onThumbnailSizeChange(value);
    });
  }
  renderScopeBar() {
    const scopeBar = this.contentEl.createDiv({ cls: "vmp-scope-bar" });
    const folderSelect = scopeBar.createEl("select", { cls: "dropdown vmp-folder-select", attr: { "aria-label": "Folder scope" } });
    folderSelect.createEl("option", { text: "Entire vault", value: "" });
    const contextFolder = this.getContextFolder();
    if (contextFolder) folderSelect.createEl("option", { text: `Current folder \u2014 ${contextFolder}`, value: contextFolder });
    for (const folder of this.getMediaFolders()) {
      if (folder !== contextFolder) folderSelect.createEl("option", { text: folder, value: folder });
    }
    folderSelect.value = this.folder;
    folderSelect.addEventListener("change", () => {
      this.folder = folderSelect.value;
      this.applyFilters();
    });
    const includeLabel = scopeBar.createEl("label", { cls: "vmp-checkbox-label" });
    const include = includeLabel.createEl("input", { attr: { type: "checkbox" } });
    include.checked = this.includeSubfolders;
    includeLabel.appendText(" Include subfolders");
    include.addEventListener("change", () => {
      this.includeSubfolders = include.checked;
      this.applyFilters();
    });
    this.resultLabel = scopeBar.createSpan({ cls: "vmp-result-count" });
  }
  addOptions(select, options) {
    for (const [value, label] of Object.entries(options)) select.createEl("option", { text: label, value });
  }
  getContextFolder() {
    const source = this.context.sourcePath;
    const slash = source.lastIndexOf("/");
    return slash < 0 ? "" : source.slice(0, slash);
  }
  getMediaFolders() {
    return Array.from(new Set(this.index.getItems().map((item) => item.parentPath).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }
  applyFilters() {
    const folderPrefix = this.folder ? `${this.folder}/` : "";
    const filteredItems = this.index.getItems().filter((item) => {
      if (this.filter !== "all" && item.kind !== this.filter) return false;
      if (this.query && !item.path.toLocaleLowerCase().includes(this.query)) return false;
      if (!this.folder) return true;
      return this.includeSubfolders ? item.path.startsWith(folderPrefix) : item.parentPath === this.folder;
    }).slice();
    filteredItems.sort((left, right) => this.compareItems(left, right));
    const groups = this.buildGroups(filteredItems);
    this.visibleItems = groups.flatMap((group) => group.items);
    this.resultLabel?.setText(`${this.visibleItems.length.toLocaleString()} items`);
    this.grid?.setGroups(groups);
  }
  compareItems(left, right) {
    const compareText = (a, b) => a.localeCompare(b, void 0, { numeric: true, sensitivity: "base" });
    let result;
    if (this.sort === "modified") result = left.mtime - right.mtime;
    else if (this.sort === "created") result = left.ctime - right.ctime;
    else if (this.sort === "size") result = left.size - right.size;
    else if (this.sort === "type") result = compareText(left.extension, right.extension) || compareText(left.name, right.name);
    else result = compareText(left.name, right.name);
    if (result === 0) result = compareText(left.path, right.path);
    return this.sortDirection === "ascending" ? result : -result;
  }
  buildGroups(items) {
    if (this.group === "none") return [{ label: "", order: 0, items }];
    const buckets = /* @__PURE__ */ new Map();
    for (const item of items) {
      const descriptor = this.getGroupDescriptor(item);
      const existing = buckets.get(descriptor.key);
      if (existing) existing.items.push(item);
      else buckets.set(descriptor.key, { label: descriptor.label, order: descriptor.order, items: [item] });
    }
    const groups = Array.from(buckets.values());
    groups.sort((left, right) => {
      const result = typeof left.order === "number" && typeof right.order === "number" ? left.order - right.order : String(left.order).localeCompare(String(right.order), void 0, { numeric: true, sensitivity: "base" });
      return this.sortDirection === "ascending" ? result : -result;
    });
    for (const group of groups) group.items.sort((left, right) => this.compareItems(left, right));
    return groups;
  }
  getGroupDescriptor(item) {
    if (this.group === "modified") return this.getDateGroup(item.mtime);
    if (this.group === "created") return this.getDateGroup(item.ctime);
    if (this.group === "type") {
      const extension = item.extension.toUpperCase();
      return { key: `type-${extension}`, label: extension, order: extension };
    }
    if (this.group === "size") return this.getSizeGroup(item.size);
    const label = this.getNameGroup(item.name);
    return { key: `name-${label}`, label, order: label };
  }
  getDateGroup(timestamp) {
    const date = new Date(timestamp);
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const korean = navigator.language.toLowerCase().startsWith("ko");
    if (itemDay === today) return { key: "date-today", label: korean ? "\uC624\uB298" : "Today", order: today };
    if (itemDay < today && itemDay >= today - 6 * 864e5) {
      return { key: "date-last-seven-days", label: korean ? "\uC9C0\uB09C 7\uC77C" : "Last 7 days", order: today - 864e5 };
    }
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const formatter = new Intl.DateTimeFormat(void 0, date.getFullYear() === now.getFullYear() ? { month: "long" } : { year: "numeric", month: "long" });
    return { key: `date-${date.getFullYear()}-${date.getMonth()}`, label: formatter.format(date), order: monthStart };
  }
  getSizeGroup(size) {
    const korean = navigator.language.toLowerCase().startsWith("ko");
    const megabyte = 1024 * 1024;
    const gigabyte = 1024 * megabyte;
    if (size < megabyte) return { key: "size-0", label: korean ? "1MB \uBBF8\uB9CC" : "Under 1 MB", order: 0 };
    if (size < 10 * megabyte) return { key: "size-1", label: "1\u201310 MB", order: 1 };
    if (size < 100 * megabyte) return { key: "size-2", label: "10\u2013100 MB", order: 2 };
    if (size < gigabyte) return { key: "size-3", label: "100 MB\u20131 GB", order: 3 };
    return { key: "size-4", label: korean ? "1GB \uC774\uC0C1" : "1 GB and larger", order: 4 };
  }
  getNameGroup(name) {
    const first = name.trim().charAt(0);
    if (!first) return "#";
    if (/\d/.test(first)) return "0\u20139";
    if (/[a-z]/i.test(first)) return first.toLocaleUpperCase();
    const code = first.charCodeAt(0);
    if (code >= 44032 && code <= 55203) {
      const initials = ["\u3131", "\u3132", "\u3134", "\u3137", "\u3138", "\u3139", "\u3141", "\u3142", "\u3143", "\u3145", "\u3146", "\u3147", "\u3148", "\u3149", "\u314A", "\u314B", "\u314C", "\u314D", "\u314E"];
      return initials[Math.floor((code - 44032) / 588)];
    }
    return first.toLocaleUpperCase();
  }
  createCard(item, index) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "vmp-card";
    card.dataset.path = item.path;
    card.setAttribute("aria-label", `${item.name}, ${item.kind}`);
    card.toggleClass("is-selected", this.selectedPaths.has(item.path));
    const preview = card.createDiv({ cls: "vmp-preview" });
    const image = preview.createEl("img", { cls: "vmp-thumbnail", attr: { alt: "", loading: "lazy", draggable: "false" } });
    const playBadge = item.kind === "video" ? preview.createSpan({ cls: "vmp-play-badge" }) : null;
    if (playBadge) (0, import_obsidian.setIcon)(playBadge, "play");
    const selectionMark = preview.createSpan({ cls: "vmp-selection-mark" });
    (0, import_obsidian.setIcon)(selectionMark, "check");
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
  handleCardClick(event, item, index) {
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
  toggleSelection(path) {
    if (this.selectedPaths.has(path)) this.selectedPaths.delete(path);
    else this.selectedPaths.add(path);
    this.updateSelectionUi();
    this.grid.refresh();
  }
  updateSelectionUi() {
    const count = this.selectedPaths.size;
    this.selectionBar.toggleClass("is-hidden", count === 0);
    this.selectionBar.querySelector(".vmp-selection-count")?.setText(`${count} selected`);
    this.insertButton.disabled = count === 0;
  }
  insertSelection() {
    const files = this.visibleItems.filter((item) => this.selectedPaths.has(item.path)).map((item) => item.file);
    if (files.length === 0) {
      new import_obsidian.Notice("No visible media is selected.");
      return;
    }
    this.onInsert(files);
    this.close();
  }
  attachVideoPreview(card, preview, thumbnail, item) {
    let timer = 0;
    let video = null;
    const stop = () => {
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
  attachGifPreview(card, image, item) {
    const stillSource = () => this.thumbnailUrls.get(`${item.path}:${item.mtime}`);
    card.addEventListener("pointerenter", () => {
      image.src = this.app.vault.getResourcePath(item.file);
    });
    card.addEventListener("pointerleave", () => {
      const source = stillSource();
      if (source) image.src = source;
    });
  }
  getVideoDuration(item) {
    const key = `${item.path}:${item.mtime}`;
    const existing = this.videoDurations.get(key);
    if (existing) return existing;
    const promise = new Promise((resolve) => {
      const video = document.createElement("video");
      let settled = false;
      const finish = (value) => {
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
};
var VirtualMediaGrid = class {
  constructor(host, size, createCard) {
    this.createCard = createCard;
    this.groups = [];
    this.layoutGroups = [];
    this.columns = 1;
    this.cardWidth = 210;
    this.rowHeight = 220;
    this.scrollEl = host.createDiv({ cls: "vmp-grid-scroll" });
    this.stageEl = this.scrollEl.createDiv({ cls: "vmp-grid-stage" });
    this.onScroll = () => this.renderWindow();
    this.scrollEl.addEventListener("scroll", this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.scrollEl);
    this.setSize(size);
  }
  setGroups(groups) {
    this.groups = groups;
    this.scrollEl.scrollTop = 0;
    this.measure();
  }
  setSize(size) {
    const widths = { small: 150, medium: 210, large: 280 };
    this.cardWidth = widths[size];
    this.rowHeight = Math.round(this.cardWidth * 0.72) + 62;
    this.scrollEl.style.setProperty("--vmp-card-width", `${this.cardWidth}px`);
    this.measure();
  }
  refresh() {
    this.renderWindow();
  }
  destroy() {
    this.resizeObserver.disconnect();
    this.scrollEl.removeEventListener("scroll", this.onScroll);
  }
  measure() {
    const width = this.scrollEl.clientWidth;
    this.columns = Math.max(1, Math.floor((width + 12) / (this.cardWidth + 12)));
    let top = 0;
    let startIndex = 0;
    this.layoutGroups = this.groups.map((group) => {
      const headerHeight = group.label ? GROUP_HEADER_HEIGHT : 0;
      const contentTop = top + headerHeight;
      const rows = Math.ceil(group.items.length / this.columns);
      const bottom = contentTop + rows * this.rowHeight;
      const layout = { ...group, top, contentTop, bottom, startIndex };
      top = bottom;
      startIndex += group.items.length;
      return layout;
    });
    this.stageEl.style.height = `${top}px`;
    this.renderWindow();
  }
  renderWindow() {
    const viewportTop = this.scrollEl.scrollTop;
    const viewportBottom = viewportTop + this.scrollEl.clientHeight;
    const overscan = OVERSCAN_ROWS * this.rowHeight;
    this.stageEl.empty();
    for (const group of this.layoutGroups) {
      if (group.bottom < viewportTop - overscan || group.top > viewportBottom + overscan) continue;
      if (group.label) {
        const header = this.stageEl.createDiv({ cls: "vmp-group-header" });
        header.createSpan({ cls: "vmp-group-title", text: group.label });
        header.createSpan({ cls: "vmp-group-count", text: group.items.length.toLocaleString() });
        header.createDiv({ cls: "vmp-group-line" });
        const stickyTop = Math.min(Math.max(group.top, viewportTop), Math.max(group.top, group.bottom - GROUP_HEADER_HEIGHT));
        header.style.transform = `translateY(${stickyTop}px)`;
      }
      const rowCount = Math.ceil(group.items.length / this.columns);
      const firstRow = Math.max(0, Math.floor((viewportTop - group.contentTop) / this.rowHeight) - OVERSCAN_ROWS);
      const lastRow = Math.min(rowCount, Math.ceil((viewportBottom - group.contentTop) / this.rowHeight) + OVERSCAN_ROWS);
      const start = firstRow * this.columns;
      const end = Math.min(group.items.length, lastRow * this.columns);
      for (let localIndex = start; localIndex < end; localIndex += 1) {
        const card = this.createCard(group.items[localIndex], group.startIndex + localIndex);
        const row = Math.floor(localIndex / this.columns);
        const column = localIndex % this.columns;
        card.style.width = `${this.cardWidth}px`;
        card.style.height = `${this.rowHeight - 12}px`;
        card.style.transform = `translate(${column * (this.cardWidth + 12)}px, ${group.contentTop + row * this.rowHeight}px)`;
        this.stageEl.appendChild(card);
      }
    }
  }
};

// src/inserters.ts
var import_obsidian2 = require("obsidian");
var CARD_WIDTH = 360;
var CARD_HEIGHT = 240;
var GAP = 40;
var COLUMNS = 3;
var MediaInserter = class {
  constructor(app) {
    this.app = app;
  }
  insert(files, context) {
    if (files.length === 0) return;
    if (context.kind === "markdown") {
      const embeds = files.map((file) => {
        const link = this.app.metadataCache.fileToLinktext(file, context.sourcePath, true);
        return `![[${link}]]`;
      }).join("\n");
      context.editor.replaceSelection(embeds);
      return;
    }
    this.insertIntoCanvas(files, context);
  }
  pointFromEvent(leaf, event) {
    const canvas = leaf.leaf.view.canvas;
    try {
      return canvas?.posFromEvt?.(event);
    } catch {
      return void 0;
    }
  }
  insertIntoCanvas(files, context) {
    const canvas = context.leaf.view.canvas;
    if (!canvas?.createFileNode) {
      new import_obsidian2.Notice("Visual Media Picker: this Obsidian version does not expose Canvas node creation.");
      return;
    }
    if (this.insertIntoSelectedTextNode(files, context, canvas)) return;
    const center = context.point ?? this.getCanvasCenter(canvas);
    const rowCount = Math.ceil(files.length / COLUMNS);
    const startX = center.x - (Math.min(files.length, COLUMNS) * (CARD_WIDTH + GAP) - GAP) / 2;
    const startY = center.y - (rowCount * (CARD_HEIGHT + GAP) - GAP) / 2;
    for (let index = 0; index < files.length; index += 1) {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const position = { x: startX + column * (CARD_WIDTH + GAP), y: startY + row * (CARD_HEIGHT + GAP) };
      const node = canvas.createFileNode({
        file: files[index],
        path: files[index].parent?.path ?? "",
        pos: { ...position, width: CARD_WIDTH, height: CARD_HEIGHT },
        size: { ...position, width: CARD_WIDTH, height: CARD_HEIGHT },
        save: true,
        focus: index === files.length - 1
      });
      if (!this.containsNode(canvas.nodes, node)) canvas.addNode?.(node);
    }
    canvas.requestSave?.();
  }
  insertIntoSelectedTextNode(files, context, canvas) {
    if (canvas.selection?.size !== 1) return false;
    const node = Array.from(canvas.selection)[0];
    const data = node.getData?.();
    if (data?.type !== "text" || typeof node.setText !== "function") return false;
    const embeds = files.map((file) => {
      const link = this.app.metadataCache.fileToLinktext(file, context.sourcePath, true);
      return `![[${link}]]`;
    }).join("\n");
    const currentText = typeof data.text === "string" ? data.text : "";
    const separator = currentText.length > 0 && !currentText.endsWith("\n") ? "\n" : "";
    node.setText(`${currentText}${separator}${embeds}`);
    canvas.markDirty?.(node);
    canvas.requestSave?.();
    return true;
  }
  getCanvasCenter(canvas) {
    try {
      const center = typeof canvas.posCenter === "function" ? canvas.posCenter.call(canvas) : canvas.posCenter;
      if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) return center;
    } catch {
    }
    return { x: 0, y: 0 };
  }
  containsNode(nodes, node) {
    if (!nodes) return false;
    if (Array.isArray(nodes)) return nodes.includes(node);
    return node.id ? nodes.has(node.id) : Array.from(nodes.values()).includes(node);
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var DEFAULT_SETTINGS = {
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
var VisualMediaPickerSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Visual Media Picker" });
    new import_obsidian3.Setting(containerEl).setName("Thumbnail size").addDropdown((dropdown) => dropdown.addOptions({ small: "Small", medium: "Medium", large: "Large" }).setValue(this.plugin.settings.thumbnailSize).onChange(async (value) => this.updateSettings({ thumbnailSize: value })));
    new import_obsidian3.Setting(containerEl).setName("Default sort by").addDropdown((dropdown) => dropdown.addOptions({ name: "Name", modified: "Date modified", type: "Type", size: "Size", created: "Date created" }).setValue(this.plugin.settings.defaultSort).onChange(async (value) => this.updateSettings({ defaultSort: value })));
    new import_obsidian3.Setting(containerEl).setName("Default sort direction").addDropdown((dropdown) => dropdown.addOptions({ ascending: "Ascending", descending: "Descending" }).setValue(this.plugin.settings.defaultSortDirection).onChange(async (value) => this.updateSettings({ defaultSortDirection: value })));
    new import_obsidian3.Setting(containerEl).setName("Default group by").addDropdown((dropdown) => dropdown.addOptions({ none: "None", name: "Name", modified: "Date modified", type: "Type", size: "Size", created: "Date created" }).setValue(this.plugin.settings.defaultGroup).onChange(async (value) => this.updateSettings({ defaultGroup: value })));
    new import_obsidian3.Setting(containerEl).setName("Video hover preview").addToggle((toggle) => toggle.setValue(this.plugin.settings.videoHoverPreview).onChange(async (value) => this.updateSettings({ videoHoverPreview: value })));
    new import_obsidian3.Setting(containerEl).setName("GIF hover preview").addToggle((toggle) => toggle.setValue(this.plugin.settings.gifHoverPreview).onChange(async (value) => this.updateSettings({ gifHoverPreview: value })));
    new import_obsidian3.Setting(containerEl).setName("Default scope").addDropdown((dropdown) => dropdown.addOptions({ vault: "Entire vault", "current-folder": "Current file or Canvas folder" }).setValue(this.plugin.settings.defaultScope).onChange(async (value) => this.updateSettings({ defaultScope: value })));
    new import_obsidian3.Setting(containerEl).setName("Include subfolders").addToggle((toggle) => toggle.setValue(this.plugin.settings.includeSubfolders).onChange(async (value) => this.updateSettings({ includeSubfolders: value })));
    new import_obsidian3.Setting(containerEl).setName("Supported extensions").setDesc("Comma-separated. Unsupported formats are ignored.").addText((text) => text.setPlaceholder("png, jpg, jpeg, webp, svg, gif, mp4, webm").setValue(this.plugin.settings.supportedExtensions.join(", ")).onChange(async (value) => {
      const extensions = value.split(",").map((item) => item.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
      await this.updateSettings({ supportedExtensions: Array.from(new Set(extensions)) });
      this.plugin.rebuildIndex();
    }));
    new import_obsidian3.Setting(containerEl).setName("Thumbnail cache").setDesc("Rebuild GIF and video thumbnails on next use.").addButton((button) => button.setButtonText("Clear cache").onClick(async () => {
      await this.plugin.thumbnailCache.clear();
      new import_obsidian3.Notice("Visual Media Picker thumbnail cache cleared.");
    }));
  }
  async updateSettings(change) {
    this.plugin.settings = { ...this.plugin.settings, ...change };
    await this.plugin.saveData(this.plugin.settings);
  }
};

// src/thumbnail-cache.ts
var DATABASE_NAME = "visual-media-picker";
var STORE_NAME = "thumbnails";
var ThumbnailCache = class {
  constructor(app) {
    this.app = app;
    this.databasePromise = null;
  }
  async get(item) {
    if (item.kind === "image" && item.extension !== "gif") {
      return this.app.vault.getResourcePath(item.file);
    }
    const key = `${item.path}:${item.mtime}`;
    const cached = await this.read(key);
    if (cached) return cached;
    const resourcePath = this.app.vault.getResourcePath(item.file);
    const dataUrl = item.kind === "video" ? await this.captureVideoFrame(resourcePath) : await this.captureImageFrame(resourcePath);
    await this.write({ key, dataUrl });
    return dataUrl;
  }
  async clear() {
    const database = await this.openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear thumbnail cache."));
    });
  }
  async captureVideoFrame(source) {
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
  async captureImageFrame(source) {
    const image = new Image();
    image.src = source;
    await this.waitFor(image, "load");
    return this.drawFrame(image, image.naturalWidth, image.naturalHeight);
  }
  drawFrame(source, width, height) {
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
  waitFor(target, eventName) {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}.`)), 12e3);
      const cleanup = () => window.clearTimeout(timeout);
      target.addEventListener(eventName, () => {
        cleanup();
        resolve();
      }, { once: true });
      target.addEventListener("error", () => {
        cleanup();
        reject(new Error("Media preview could not be loaded."));
      }, { once: true });
    });
  }
  async read(key) {
    try {
      const database = await this.openDatabase();
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result?.dataUrl ?? null);
        request.onerror = () => reject(request.error ?? new Error("Could not read thumbnail cache."));
      });
    } catch {
      return null;
    }
  }
  async write(value) {
    try {
      const database = await this.openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(value);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not write thumbnail cache."));
      });
    } catch {
    }
  }
  openDatabase() {
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
};

// src/main.ts
var VisualMediaPickerPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.lastCanvasPointer = null;
  }
  async onload() {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      supportedExtensions: loaded?.supportedExtensions ?? DEFAULT_SETTINGS.supportedExtensions
    };
    this.mediaIndex = new MediaIndex(this.app);
    this.thumbnailCache = new ThumbnailCache(this.app);
    this.inserter = new MediaInserter(this.app);
    this.rebuildIndex();
    this.addCommand({
      id: "open",
      name: "Open",
      checkCallback: (checking) => {
        const context = this.getActiveContext();
        if (!context) return false;
        if (!checking) this.openPicker(context);
        return true;
      }
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      menu.addItem((item) => item.setTitle("Visual Media Picker").setIcon("images").onClick(() => this.openPicker({ kind: "markdown", editor, sourcePath: info.file?.path ?? "" })));
    }));
    this.registerDomEvent(document, "contextmenu", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".canvas-wrapper, .canvas")) {
        this.lastCanvasPointer = { event, time: Date.now() };
      }
    }, true);
    this.registerCanvasMenu();
    this.registerVaultEvents();
    this.addSettingTab(new VisualMediaPickerSettingTab(this.app, this));
  }
  rebuildIndex() {
    this.mediaIndex.rebuild(this.settings);
  }
  registerVaultEvents() {
    this.registerEvent(this.app.vault.on("create", (file) => this.handleFileChange(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleFileChange(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.mediaIndex.remove(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof import_obsidian4.TFile) this.mediaIndex.rename(file, oldPath, this.settings);
      else this.mediaIndex.remove(oldPath);
    }));
  }
  handleFileChange(file) {
    if (file instanceof import_obsidian4.TFile) this.mediaIndex.upsert(file, this.settings);
  }
  registerCanvasMenu() {
    try {
      const workspace = this.app.workspace;
      this.registerEvent(workspace.on("canvas-menu", (menu) => {
        const leaf = this.app.workspace.activeLeaf;
        if (!leaf || leaf.view.getViewType() !== "canvas") return;
        const context = this.getCanvasContext(leaf);
        menu.addItem((item) => item.setTitle("Visual Media Picker").setIcon("images").onClick(() => this.openPicker(context)));
      }));
    } catch {
    }
  }
  getActiveContext() {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf) return null;
    if (leaf.view instanceof import_obsidian4.MarkdownView) {
      return { kind: "markdown", editor: leaf.view.editor, sourcePath: leaf.view.file?.path ?? "" };
    }
    if (leaf.view.getViewType() === "canvas") return this.getCanvasContext(leaf);
    return null;
  }
  getCanvasContext(leaf) {
    const view = leaf.view;
    let point;
    if (this.lastCanvasPointer && Date.now() - this.lastCanvasPointer.time < 2e3) {
      const canvas = view.canvas;
      try {
        point = canvas?.posFromEvt?.(this.lastCanvasPointer.event);
      } catch {
        point = void 0;
      }
    }
    return { kind: "canvas", leaf, sourcePath: view.file?.path ?? "", point };
  }
  openPicker(context) {
    if (this.mediaIndex.getItems().length === 0) {
      new import_obsidian4.Notice("Visual Media Picker: no supported media found in this vault.");
      return;
    }
    new MediaPickerModal({
      app: this.app,
      index: this.mediaIndex,
      cache: this.thumbnailCache,
      settings: this.settings,
      context,
      onInsert: (files) => this.inserter.insert(files, context),
      onSortChange: async (sort, direction) => {
        this.settings.defaultSort = sort;
        this.settings.defaultSortDirection = direction;
        await this.saveData(this.settings);
      },
      onGroupChange: async (group) => {
        this.settings.defaultGroup = group;
        await this.saveData(this.settings);
      },
      onThumbnailSizeChange: async (size) => {
        this.settings.thumbnailSize = size;
        await this.saveData(this.settings);
      }
    }).open();
  }
};
