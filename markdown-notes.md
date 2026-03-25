# Reader Notes Thoughts

## Current first pass

- A `Reader Notes` panel sits to the right of the internal PDF reader when enabled.
- It shares the article's existing `notes` field rather than creating a second storage location.
- The panel uses a lightweight mixed mode:
  - non-active lines render as Markdown preview
  - the active line shows raw Markdown for editing
- Notes use a debounced partial save path so they do not require the full metadata modal save button every time.

## Desirable low-hanging follow-ups

- Add a tiny saved/unsaved/saving indicator inside the notes panel itself.
- Remember whether `Reader Notes` was open last time the reader was used.
- Add keyboard shortcuts for:
  - new line
  - next/previous note line
  - toggle notes panel
- Add clickable Markdown links that open externally.
- Make the reader notes width draggable.
- Let the notes panel collapse down to a slimmer preview rail.
- Reuse the same note renderer in more places, like card hover or abstract preview popouts.

## Lightweight but worthwhile improvements

- Better line-navigation behavior:
  - arrow-up and arrow-down between note lines
  - better caret-column preservation
  - tab indentation
- Better blank-line affordances so empty spacing feels more intentional.
- Smarter Markdown line rendering for lists so consecutive list items feel like one list visually instead of isolated list rows.
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
  - The current first pass is intentionally line-oriented.
  - That keeps editing manageable, but it is weaker for fenced code blocks, multi-line blockquotes, and long lists.
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
