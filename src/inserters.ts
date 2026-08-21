import { App, Notice, TFile } from "obsidian";
import type { CanvasPoint, PickerContext } from "./types";

interface InternalCanvasNode {
  id?: string;
  nodeEl?: HTMLElement;
}

interface InternalCanvas {
  createFileNode?: (options: {
    file: TFile;
    path?: string;
    pos: CanvasPoint & { width: number; height: number };
    size: CanvasPoint & { width: number; height: number };
    save?: boolean;
    focus?: boolean;
  }) => InternalCanvasNode;
  addNode?: (node: InternalCanvasNode) => void;
  nodes?: Map<string, InternalCanvasNode> | InternalCanvasNode[];
  requestSave?: () => void;
  zoomToSelection?: () => void;
  posCenter?: (() => CanvasPoint) | CanvasPoint;
  posFromEvt?: (event: MouseEvent) => CanvasPoint;
}

interface CanvasViewLike {
  canvas?: InternalCanvas;
  file?: TFile;
}

const CARD_WIDTH = 360;
const CARD_HEIGHT = 240;
const GAP = 40;
const COLUMNS = 3;

export class MediaInserter {
  constructor(private readonly app: App) {}

  insert(files: TFile[], context: PickerContext): void {
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

  pointFromEvent(leaf: PickerContext & { kind: "canvas" }, event: MouseEvent): CanvasPoint | undefined {
    const canvas = (leaf.leaf.view as CanvasViewLike).canvas;
    try {
      return canvas?.posFromEvt?.(event);
    } catch {
      return undefined;
    }
  }

  private insertIntoCanvas(files: TFile[], context: PickerContext & { kind: "canvas" }): void {
    const canvas = (context.leaf.view as CanvasViewLike).canvas;
    if (!canvas?.createFileNode) {
      new Notice("Visual Media Picker: this Obsidian version does not expose Canvas node creation.");
      return;
    }

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

  private getCanvasCenter(canvas: InternalCanvas): CanvasPoint {
    try {
      const center = typeof canvas.posCenter === "function"
        ? canvas.posCenter.call(canvas)
        : canvas.posCenter;
      if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) return center;
    } catch {
      // Fall through to a safe origin when the private Canvas API changes.
    }
    return { x: 0, y: 0 };
  }

  private containsNode(nodes: InternalCanvas["nodes"], node: InternalCanvasNode): boolean {
    if (!nodes) return false;
    if (Array.isArray(nodes)) return nodes.includes(node);
    return node.id ? nodes.has(node.id) : Array.from(nodes.values()).includes(node);
  }
}
