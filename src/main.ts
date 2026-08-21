import { EventRef, MarkdownView, Menu, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { MediaIndex } from "./media-index";
import { MediaPickerModal } from "./media-picker-modal";
import { MediaInserter } from "./inserters";
import { DEFAULT_SETTINGS, VisualMediaPickerSettingTab } from "./settings";
import { ThumbnailCache } from "./thumbnail-cache";
import type { CanvasPoint, MediaGroup, MediaSort, PickerContext, SortDirection, ThumbnailSize, VisualMediaPickerSettings } from "./types";

interface CanvasViewLike {
  getViewType(): string;
  file?: TFile;
  canvas?: unknown;
}

interface CanvasMenuWorkspace {
  on(name: "canvas-menu", callback: (menu: Menu, canvas: unknown) => void): EventRef;
}

export default class VisualMediaPickerPlugin extends Plugin {
  settings: VisualMediaPickerSettings = DEFAULT_SETTINGS;
  mediaIndex!: MediaIndex;
  thumbnailCache!: ThumbnailCache;
  private inserter!: MediaInserter;
  private lastCanvasPointer: { event: MouseEvent; time: number } | null = null;

  async onload(): Promise<void> {
    const loaded = await this.loadData() as Partial<VisualMediaPickerSettings> | null;
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
      menu.addItem((item) => item
        .setTitle("Visual Media Picker")
        .setIcon("images")
        .onClick(() => this.openPicker({ kind: "markdown", editor, sourcePath: info.file?.path ?? "" })));
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

  rebuildIndex(): void {
    this.mediaIndex.rebuild(this.settings);
  }

  private registerVaultEvents(): void {
    this.registerEvent(this.app.vault.on("create", (file) => this.handleFileChange(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleFileChange(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.mediaIndex.remove(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile) this.mediaIndex.rename(file, oldPath, this.settings);
      else this.mediaIndex.remove(oldPath);
    }));
  }

  private handleFileChange(file: TAbstractFile): void {
    if (file instanceof TFile) this.mediaIndex.upsert(file, this.settings);
  }

  private registerCanvasMenu(): void {
    try {
      const workspace = this.app.workspace as unknown as CanvasMenuWorkspace;
      this.registerEvent(workspace.on("canvas-menu", (menu) => {
        const leaf = this.app.workspace.activeLeaf;
        if (!leaf || leaf.view.getViewType() !== "canvas") return;
        const context = this.getCanvasContext(leaf);
        menu.addItem((item) => item
          .setTitle("Visual Media Picker")
          .setIcon("images")
          .onClick(() => this.openPicker(context)));
      }));
    } catch {
      // Canvas commands remain available when this private event is absent.
    }
  }

  private getActiveContext(): PickerContext | null {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf) return null;
    if (leaf.view instanceof MarkdownView) {
      return { kind: "markdown", editor: leaf.view.editor, sourcePath: leaf.view.file?.path ?? "" };
    }
    if (leaf.view.getViewType() === "canvas") return this.getCanvasContext(leaf);
    return null;
  }

  private getCanvasContext(leaf: WorkspaceLeaf): PickerContext & { kind: "canvas" } {
    const view = leaf.view as unknown as CanvasViewLike;
    let point: CanvasPoint | undefined;
    if (this.lastCanvasPointer && Date.now() - this.lastCanvasPointer.time < 2_000) {
      const canvas = view.canvas as { posFromEvt?: (event: MouseEvent) => CanvasPoint } | undefined;
      try {
        point = canvas?.posFromEvt?.(this.lastCanvasPointer.event);
      } catch {
        point = undefined;
      }
    }
    return { kind: "canvas", leaf, sourcePath: view.file?.path ?? "", point };
  }

  private openPicker(context: PickerContext): void {
    if (this.mediaIndex.getItems().length === 0) {
      new Notice("Visual Media Picker: no supported media found in this vault.");
      return;
    }
    new MediaPickerModal({
      app: this.app,
      index: this.mediaIndex,
      cache: this.thumbnailCache,
      settings: this.settings,
      context,
      onInsert: (files) => this.inserter.insert(files, context),
      onSortChange: async (sort: MediaSort, direction: SortDirection) => {
        this.settings.defaultSort = sort;
        this.settings.defaultSortDirection = direction;
        await this.saveData(this.settings);
      },
      onGroupChange: async (group: MediaGroup) => {
        this.settings.defaultGroup = group;
        await this.saveData(this.settings);
      },
      onThumbnailSizeChange: async (size: ThumbnailSize) => {
        this.settings.thumbnailSize = size;
        await this.saveData(this.settings);
      }
    }).open();
  }
}
