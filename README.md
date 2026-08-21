# Visual Media Picker

Visual Media Picker is an Obsidian asset browser for finding vault images, GIFs, and videos by sight and inserting them into Markdown or Canvas.

## Included in the first build

- PNG, JPG/JPEG, WebP, SVG, GIF, MP4, and WebM scanning
- Real image previews, cached GIF stills, and cached video representative frames
- Muted looping video hover previews and GIF hover animation
- Live filename/path search, media-type filter, folder scope, subfolder toggle, and four sort modes
- Small, medium, and large thumbnail grids
- Windowed virtual grid rendering for large vaults
- Single-click insertion plus Ctrl/Cmd-click and Shift-click multi-selection
- Markdown embeds at the active cursor
- Canvas file nodes, including automatic multi-file grid layout
- Command palette, Markdown context menu, Canvas context menu where supported, and user-configurable hotkeys
- Persistent settings and IndexedDB thumbnail cache invalidated by file modification time

## Build

```powershell
pnpm install
pnpm build
```

Copy `manifest.json`, `main.js`, and `styles.css` into:

```text
<Vault>/.obsidian/plugins/visual-media-picker/
```

Then reload Obsidian, enable **Visual Media Picker** under Community plugins, and optionally assign a hotkey to **Visual Media Picker: Open**.

## Canvas compatibility

Obsidian publishes the JSON Canvas file format but does not currently publish a complete Canvas view/node-creation plugin API. This plugin detects the desktop Canvas methods used by current Obsidian builds. It uses the right-click position when available and otherwise falls back to the Canvas viewport center. The command remains hidden outside Markdown and Canvas views.
