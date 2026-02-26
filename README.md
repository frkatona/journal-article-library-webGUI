# Literature Library

A native desktop application for managing and browsing local PDF article collections. Features thumbnail cards, full-text search, metadata editing, tags, and notes — all running locally with no server or internet required.

![hero shot of front page](readme-images/hero.png)

![example of modal which appears of the abstract when abstract button is selected](readme-images/abstract_modal.png)

Built with [Tauri v2](https://tauri.app/) (Rust backend + vanilla JS frontend).

## Installation

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) (v18+)

### Build from Source

```powershell
# Clone or download this repository, then from the repo root:

# 1. Install the Tauri CLI
npm install

# 2. Build the release binary
npx tauri build
```

The installer/executable will be output to `src-tauri/target/release/bundle/`.

### Run in Development Mode

```powershell
npx tauri dev
```

This compiles the Rust backend and opens the app window with hot-reload for frontend changes.

## Usage

### Adding Articles

Place your PDF files anywhere inside the `Articles/` folder at the project root:

```text
Articles/
  (2024) Smith, Jones - Deep Learning Survey.pdf
  subfolder/
    another-paper.pdf
```

The app will scan `Articles/` recursively on launch. If the folder doesn't exist, it will be created automatically.

#### Filename Convention (Optional)

For best auto-extraction, name your PDFs using this pattern:

```text
(<year>) <authors> - <title>.pdf
```

For example: `(2023) Chen, Li - Neural Architecture Search.pdf`

The app will parse title, authors, and year directly from this pattern. If your filenames don't follow this convention, the app will still work — it falls back to PDF metadata and the raw filename.

### Browsing & Searching

- **Search bar**: type any keyword to filter articles across all metadata fields (title, authors, abstract, tags, DOI, notes, etc.)
- **Tag filter**: use the dropdown to filter by assigned tags
- **Sort**: choose primary and secondary sort criteria (year, title, authors, journal)
- **View modes**: toggle between thumbnail card grid and compact list view
- **Card size**: adjust the card height slider in the settings panel

### Editing Metadata

Click the **pencil icon** on any article card to open the edit modal. You can modify:

- Title, authors, year, journal, DOI
- Abstract
- Tags (comma-separated)
- Notes
- Thumbnail mode (auto or manual)

All manual edits are saved as override files in `library_data/overrides/` and survive reindexing.

### Thumbnails

The app auto-generates thumbnails from your PDFs:

- **Hybrid** (default): extracts the best embedded image from the PDF; falls back to a placeholder if none found
- **Embedded**: only uses embedded images from the PDF
- **Manual upload**: drag-and-drop or click to upload a custom thumbnail image

To change the thumbnail strategy, use the settings panel in the app header.

### Opening PDFs

Click any article card to open the PDF in your system's default viewer.

### Reindexing

Click the **refresh icon** in the header to rescan `Articles/` and rebuild the index. This re-extracts metadata and regenerates auto thumbnails while preserving all your manual edits and tags.

## Data Layout

```text
Articles/                          # your source PDFs (add files here)
library_data/
  index.json                       # generated catalog (auto-rebuilt on reindex)
  thumbnails/                      # auto-generated thumbnails
  manual_thumbnails/               # uploaded manual thumbnail overrides
  overrides/
    <article_id>.json              # your edits (metadata/tags/notes/thumbnail mode)
```

> **Tip**: Keep original PDFs in `Articles/` and avoid renaming files after tagging — article IDs are derived from file paths, so moving files creates new IDs.

## How It's Built

### Architecture

| Layer | Technology | Role |
|---|---|---|
| Backend | Rust (Tauri v2) | PDF scanning, metadata extraction, thumbnails, index management |
| Frontend | Vanilla HTML/CSS/JS | UI rendering, search, filtering, modal editing |
| IPC | Tauri `invoke()` | Frontend ↔ backend communication (no HTTP server) |
| PDF parsing | `lopdf` + `pdf-extract` | Pure-Rust PDF metadata and text extraction |
| Image processing | `image` crate | Thumbnail compositing with blur + letterbox |

### Backend Commands

The Rust backend exposes these commands to the frontend:

| Command | Purpose |
|---|---|
| `get_articles` | Fetch articles with optional search/tag/pagination |
| `get_tags` | List all tags with usage counts |
| `reindex` | Rescan PDFs and rebuild the index |
| `save_metadata` | Save manual metadata overrides |
| `upload_thumbnail` | Upload a manual thumbnail image |
| `open_pdf` | Open a PDF in the system default viewer |
| `get_thumbnail_url` | Load a thumbnail as a base64 data URL |
| `get_root_dir` | Get the application root directory |

### Key Dependencies

**Rust**: `tauri`, `lopdf`, `pdf-extract`, `image`, `serde`, `serde_json`, `regex`, `walkdir`, `opener`, `sha1_smol`, `base64`, `chrono`

**Frontend**: `@tauri-apps/api` (via `withGlobalTauri`)

## Editing the Source

### Project Structure

```text
src/                    # Frontend assets
  index.html            # Main HTML
  styles.css            # All styling
  app.js                # Application logic (invoke-based IPC)
src-tauri/              # Rust backend
  src/lib.rs            # All backend logic (~1300 lines)
  src/main.rs           # Entry point
  Cargo.toml            # Rust dependencies
  tauri.conf.json       # Tauri window/build config
  capabilities/         # Tauri v2 permission grants
```

### Making Changes

- **Frontend**: Edit files in `src/`. Changes are picked up automatically in dev mode.
- **Backend**: Edit `src-tauri/src/lib.rs`. The Rust code recompiles automatically when running `npx tauri dev`.
- **Add a new command**: Define a `#[tauri::command]` function in `lib.rs`, register it in the `invoke_handler!` macro in `run()`, then call it from JS with `window.__TAURI__.core.invoke("command_name", { args })`.

## Notes for Larger Libraries

- For very large collections, the per-article override file approach scales well — no single giant JSON to manage.
- Article IDs are stable SHA1 hashes of the relative path, so they persist across reindexes as long as files aren't moved.
- If search performance degrades with thousands of articles, consider adding SQLite FTS while keeping the same override schema.


## to-do
 - have edit modal appear in front of the top bar  (currently the exit button is inaccessible at normal heights, <1080)
  - also allow a left click *down* to click out of it, not *up*
 - think on thumbnail images
  - where to store them (do they need separate storage?)
  - avoid resetting them (and other customized fields) on reindex (in menu, add a "save paths/json/toml" option?)
  - automatically check the custom folder and sidestep extraction if found?  Check based on exact filename, fuzzy, trailing hash from the file itself, or ?
  - auto-rescale stored image when resolution is unecessarily high 
 - add menu option to highlight which articles have unfilled fields (other than tags and notes)
 - fix the app's icon not appearing in the taskbar
 - explore adding a database
 - explore pushing a build that can be launched from an executable
 - drag-and-drop pdfs into the app to add to library and images onto the cards to replace thumbnail images
   - show a prompt to accept or undo the changes for drag-and-drop thumbnails