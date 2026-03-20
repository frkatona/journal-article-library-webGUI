# Stretch Goals

Notes for higher-effort ideas around an embedded PDF reader and a more capable screenshot workflow.

## Embedded PDF Reader

### Why It May Be Worth It

- Keeps scanning, reading, tagging, and note-taking in one place.
- Reduces the friction of bouncing between the library and an external PDF viewer.
- Creates a natural foundation for screenshots, figure capture, highlights, and page-linked notes.

### Architectural Directions

- Browser-style embedded viewer:
  - Likely the simplest path for a Tauri app.
  - Easier to get page rendering, zoom, selection, and text search on screen quickly.
- Rust/native-heavy viewer:
  - Could offer tighter control and better long-term integration.
  - Likely more work up front, especially for text selection and viewer polish.
- Hybrid:
  - Use a frontend PDF viewer for rendering and interaction.
  - Keep file access, caching, and metadata persistence in the Rust backend.

### Core Reader Requirements

- Open the current article inside the app from cards, metadata, and abstract views.
- Basic page navigation, zoom, fit width, fit page, and scroll position persistence.
- Remember the last page opened per article.
- A reliable text layer for copy/paste and in-document search.
- A clear way to jump back to metadata editing without losing reading context.

### Likely Pain Points

- Large PDFs and memory use.
- Smooth rendering while quickly scrolling.
- Text layer alignment on some PDFs.
- Search performance across long documents.
- Handling PDFs with weird page sizes, rotations, or scanned pages.
- Avoiding a half-finished annotation system that becomes a maintenance trap.

### Good First Iteration

- Read-only embedded viewer.
- Page thumbnails or a simple page list.
- Page number box, zoom controls, fit width, fit page.
- Remember last viewed page and zoom per article.
- Basic in-document text search.
- One button to open the same file in the system PDF viewer when needed.

### Strong Follow-Up Features

- Open directly to the page where a screenshot was captured.
- Link notes to page numbers.
- Quick-copy selected text into notes.
- A lightweight bookmark system for important pages or figures.
- Optional side-by-side mode: reader on one side, metadata/notes on the other.

## Screenshot And Figure Capture Tool

### Why It Fits This App

- The library already uses thumbnails heavily, so a capture tool has immediate value.
- Figures, diagrams, and tables are often more useful than first-page screenshots.
- An in-app capture flow could make article curation much faster than using the OS snipping tool manually.

### Aspect Ratio Considerations

- The current thumbnail target is `420 x 260`, which is about `1.62:1`.
- A capture tool should make that ratio easy to hit on purpose instead of by trial and error.
- It may be worth supporting a few presets:
  - `Thumbnail` (`420 x 260` feel)
  - `Square`
  - `Tall detail`
  - `Free crop`

### Ideal Capture UX

- Enter a "capture mode" from the PDF reader.
- Show a translucent crop box with a locked ratio preset.
- Let the user drag, resize, and nudge the box with keyboard arrows.
- Show a live preview of the processed result before saving.
- Offer quick actions:
  - `Set as thumbnail`
  - `Save as extra screenshot`
  - `Copy to clipboard`

### A Small Helper Tool For The "Ideal Ratio"

- A fixed-ratio crop frame is probably the highest-value little tool here.
- It should support:
  - Lock/unlock ratio
  - Cycle preset ratios
  - Edge handles for resize
  - Keyboard nudging
  - Optional snap-to-page margins
- A live overlay showing "this is what the card thumbnail will roughly look like" could help a lot.

### Easy Image Processing Ideas

- Crop and rotate.
- Brightness and contrast sliders.
- Mild sharpening for text-heavy figures.
- Desaturate or slightly reduce color noise for screenshots with distracting backgrounds.
- Auto-trim uniform page margins.
- Blur-fill or pad the background when the crop does not match the target ratio.
- One-click "thumbnail polish" preset that applies a mild, consistent cleanup.

### Slightly More Ambitious But Still Plausible

- Edge detection to help snap the crop to the figure bounds.
- Basic deskew for crooked captures.
- Separate presets for:
  - plots/graphs
  - microscopy/photos
  - tables/text
- Batch downscaling/compression rules so stored images stay lightweight.

### Management And Storage Questions

- Store the original capture as well as the processed version.
- Track which screenshot is the active thumbnail and which are just extras.
- Keep page number, source article, and maybe an optional caption.
- Make replacement reversible with a simple undo history.
- Consider a screenshot tray/gallery per article for saved figures.

### Good First Iteration

- Fixed-ratio crop overlay tuned for the current thumbnail shape.
- Save capture directly as the article thumbnail.
- Basic crop, rotate, brightness, contrast.
- Save the original image too, so future processing is non-destructive.

## Reader And Screenshot Features Together

### Why They Pair Well

- A PDF reader without capture is useful, but capture makes it feel meaningfully integrated with the library.
- A capture tool without an embedded reader is still possible, but it will be much clunkier.
- The reader can supply page context, while the screenshot tool creates more visual metadata for browsing.

### Suggested Rollout Order

1. Add a read-only embedded PDF reader.
2. Remember page/zoom state per article.
3. Add a fixed-ratio screenshot overlay for thumbnail capture.
4. Support extra saved screenshots per article.
5. Add light processing presets and a small gallery manager.

### Scope Warning

- A polished reader plus screenshot manager can quietly turn into a second app inside the app.
- The safest path is probably:
  - reader first
  - thumbnail capture second
  - screenshot gallery third
  - annotations only if the earlier layers prove worthwhile
