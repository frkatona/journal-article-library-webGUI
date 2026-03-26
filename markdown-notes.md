# Notes Panel Thoughts

## Current first pass

- A `Notes` panel sits to the right of the internal PDF reader when enabled.
- It shares the article's existing `notes` field rather than creating a second storage location.
- The panel is now a straightforward multiline text editor rather than a mixed Markdown-preview editor.
- Notes use a debounced partial save path so they do not require the full metadata modal save button every time.

## Desirable low-hanging follow-ups

- Add a tiny saved/unsaved/saving indicator inside the notes panel itself.
- Remember whether `Notes` was open last time the reader was used.
- Add keyboard shortcuts for:
  - new line
  - next/previous note line
  - toggle notes panel
- Add clickable Markdown links that open externally.
- Make the reader notes width draggable.
- Let the notes panel collapse down to a slimmer preview rail.
- Reuse the same note renderer in more places, like card hover or abstract preview popouts.

## Lightweight but worthwhile improvements

- Optional rendered Markdown preview mode as a second view, rather than mixing preview and editing in the same surface.
- Better plain-text editing comfort:
  - tab indentation
  - optional soft wrap toggle
  - line numbers or paragraph guides
- Small page-reference helpers like:
  - `p. 4`
  - `pp. 4-5`
  - click-to-jump page chips
- A `Copy as Markdown excerpt` helper that pastes a quote plus page reference into the notes.

## Useful but slightly more involved

- Note backlinks into the PDF:
  - clicking a note line could jump to a saved page or region
  - copied regions could optionally append into notes automatically
- Structured callouts like:
  - `idea`
  - `quote`
  - `todo`
  - `question`
- A small notes outline generated from Markdown headings.
- Search within notes from the reader.
- Export notes to plain Markdown files.

## Difficult or architecture-heavy ideas

- A truly Obsidian-like live Markdown editor where multi-line blocks render correctly while only the current line stays raw.
  - That likely needs a more specialized editor model than a plain textarea.
  - It becomes especially tricky for fenced code blocks, multi-line blockquotes, and long lists.
- Rich block editing with drag-reorder, embeds, and slash commands.
- Persistent per-note links to PDF regions or text anchors that survive layout/zoom changes robustly.
- Conflict-safe editing if the same article notes are opened in multiple windows or processes at once.

## Autosave thoughts

- Debounced autosave of the `notes` field is pretty straightforward.
- Saving after literally every keystroke, exactly the way Obsidian feels, is more subtle than it first appears.
- The main complications are:
  - not interrupting typing with rerenders or focus loss
  - keeping save indicators honest when requests overlap
  - avoiding accidental overwrites if notes are also being edited in the metadata modal
  - deciding what should happen if the user closes the reader during an in-flight save

- A practical middle ground is usually best:
  - debounce for a short interval like 500-1000 ms
  - save again on blur
  - flush one last time on reader close or article switch

## Good future direction

- Keep the storage model simple:
  - one canonical `notes` field per article
- Keep the reader UI fast:
  - local draft state first
  - debounced persistence second
- Add PDF-linked note references before pursuing richer Markdown editing.
  - That is likely the most useful science-paper-specific upgrade.
