import type { Editor, TFile, WorkspaceLeaf } from "obsidian";

export type MediaKind = "image" | "gif" | "video";
export type MediaFilter = "all" | MediaKind;
export type MediaSort = "name" | "modified" | "type" | "size" | "created";
export type SortDirection = "ascending" | "descending";
export type ThumbnailSize = "small" | "medium" | "large";
export type DefaultScope = "vault" | "current-folder";

export interface MediaItem {
  file: TFile;
  kind: MediaKind;
  extension: string;
  name: string;
  path: string;
  parentPath: string;
  mtime: number;
  ctime: number;
  size: number;
}

export interface VisualMediaPickerSettings {
  thumbnailSize: ThumbnailSize;
  defaultSort: MediaSort;
  defaultSortDirection: SortDirection;
  videoHoverPreview: boolean;
  gifHoverPreview: boolean;
  defaultScope: DefaultScope;
  includeSubfolders: boolean;
  supportedExtensions: string[];
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export type PickerContext =
  | { kind: "markdown"; editor: Editor; sourcePath: string }
  | { kind: "canvas"; leaf: WorkspaceLeaf; sourcePath: string; point?: CanvasPoint };
