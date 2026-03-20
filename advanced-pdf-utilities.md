# Advanced PDF Utilities

Notes for a more careful second pass on text-copy utilities, thumbnail capture, and nearby PDF-reader quality-of-life tools.

This document is meant to complement `stretch-goal.md`, but with more attention to what likely happened in the last text-highlighting attempt, what the safer re-attempt paths are, and where the computational cost actually sits.

## Current Context

- The app already has an embedded read-only PDF reader.
- The reader uses stacked pages, lazy visible-page rendering, fit modes, and per-article page/zoom persistence.
- The reader currently renders page canvases and keeps text selection disabled.
- The reader already does some text extraction work for in-document search, so not every future text utility starts from zero.

## Text Highlighting And Copying

### What Probably Went Wrong Last Time

The most likely issue is that the browser was not selecting the visible glyphs the user thought they were dragging across. It was selecting the invisible PDF text layer.

Common reasons that feels "wrong" in science PDFs:

- The PDF canvas looked correct, but the text layer boxes were slightly offset from the visual text.
- The PDF's internal text order did not match the visual reading order.
- A line or paragraph was split into strange chunks, so a drag grabbed more or less text than expected.
- Two-column layouts, superscripts, subscripts, equations, footnotes, and ligatures made selection boundaries feel unpredictable.
- Some PDFs likely had OCR text underneath page images, and that OCR text may have been imperfect or spatially misaligned.
- Zoom and fit modes can amplify alignment problems if the text layer and the canvas do not stay in exactly the same viewport math.

### Why This App Is A Little More Sensitive To That

The current reader is not a plain stock PDF.js viewer. It has a custom stacked-page reader with:

- lazy rendering of visible pages
- fit-width and fit-page modes
- custom zoom handling
- page shells that are resized and re-rendered
- scroll anchoring logic during zoom

That is all good for UX, but it means text selection is more fragile. If the text layer is even slightly out of sync with the canvas size, device-pixel ratio, or transform state, selection quality drops fast.

### Specific Failure Modes To Expect

- Highlight lands a few words too high or too low.
- Dragging across one column spills into the next.
- Copy result contains awkward line breaks, hyphenation, ligature substitutions, or missing symbols.
- Mathematical text copies poorly even when general prose copies acceptably.
- Scanned PDFs look selectable but produce OCR noise.
- Rotated figure labels or side notes end up in the selection unexpectedly.

### Options For Re-Attempting

#### Option A: Re-enable A Standard PDF.js Text Layer

What it is:

- Turn the text layer back on for visible pages.
- Let the browser handle highlight and copy normally.
- Keep the feature "best effort" rather than promising precision.

Pros:

- Lowest implementation cost.
- Works well on many born-digital PDFs.
- Natural browser-style selection and copy.

Cons:

- Same category of problems can come back.
- Scientific PDFs are exactly where native text-layer selection tends to feel worst.
- Hard to guarantee trust.

Cost:

- Low engineering cost.
- Medium runtime/DOM cost.

#### Option B: Word- Or Line-Box Overlay

What it is:

- Extract text items from the PDF.
- Group them into words or lines.
- Build a selection/highlight system around those boxes instead of raw browser span selection.

Pros:

- Much more control over what gets selected.
- Easier to make copying feel intentional.
- Better foundation for stored highlights later.

Cons:

- Considerably more implementation work.
- Word grouping is tricky for ligatures, kerning, symbols, and equations.
- Still limited by bad PDF text extraction.

Cost:

- Medium-to-high engineering cost.
- Medium-to-high runtime/DOM cost.

#### Option C: Drag A Rectangle, Then Copy Text In Region

What it is:

- The user draws a box on the page.
- The app gathers text items whose bounding boxes intersect that region.
- The app copies the extracted text directly rather than relying on browser selection.

Pros:

- Often better for two-column science PDFs than native selection.
- Lets the user express visual intent directly.
- Avoids a lot of browser text-layer weirdness.

Cons:

- Less "native" than ordinary highlighting.
- Users cannot casually drag-select a sentence the way they can in a browser.
- Needs good heuristics for ordering text inside the selected region.

Cost:

- Medium engineering cost.
- Low-to-medium runtime cost unless kept active all the time.

#### Option D: Hybrid Approach

What it is:

- Use native text-layer selection when the PDF looks healthy.
- Offer region-copy as a fallback when selection quality is poor.
- Keep "Open Externally" as the escape hatch.

Pros:

- Best balance of convenience and trust.
- Gives users a fallback without making the main reader too complex.
- Lets the app improve incrementally.

Cons:

- More UI surface area.
- Two mental models instead of one.

Cost:

- Medium engineering cost.
- Medium runtime cost.

#### Option E: OCR Fallback For Scanned PDFs

What it is:

- Detect pages with unusable or absent text extraction.
- Run OCR locally, either page-wide or region-only.

Pros:

- Makes scanned PDFs copyable at all.
- Could work very well for figure captions and prose-heavy scans.

Cons:

- Highest complexity.
- OCR quality varies.
- Mathematical notation, small labels, and dense tables remain hard.

Cost:

- High engineering cost.
- High CPU cost.
- Potentially high memory and latency cost.

### What I Would Recommend

The safest next attempt is not "turn full text highlighting back on and hope it feels better." A better sequence would be:

1. Add a diagnostic/dev mode for selection quality.
2. Re-enable the text layer only in a controlled branch or toggle.
3. Test against a representative set of PDFs:
   - clean publisher PDFs
   - multi-column reviews
   - scanned/OCR-heavy documents
   - papers with equations, tables, and figure captions
4. Add a simple region-copy tool even if normal selection also exists.
5. Only ship native highlighting if the common case feels trustworthy.

### A Good Practical Middle Ground

If the real goal is "copy text from the PDF without frustration," then a region-copy tool may actually be more valuable than traditional highlighting.

Reason:

- Users usually care more about getting the right text than about literal browser-style highlighting.
- Region selection maps better to scientific layouts.
- It is easier to explain and easier to trust when it works.

### Computational Cost Of Text Copy/Highlight Features

#### Lowest Cost Version

- Re-enable PDF.js text spans on visible pages only.
- No stored highlights.
- No OCR.

Expected cost:

- Mostly DOM and layout cost.
- Each visible page can add hundreds to thousands of span elements.
- Zooming gets more expensive because the text layer must stay aligned.

#### Medium Cost Version

- Word/line grouping or region-copy.
- Cached text geometry per page.
- Maybe a small selection overlay.

Expected cost:

- More JS processing than raw PDF.js text selection.
- Less browser-selection weirdness, but more app-owned logic.
- Still manageable if restricted to visible pages or on-demand interaction.

#### High Cost Version

- OCR fallback.
- Stored highlights with geometry persistence.
- Reflow-safe reattachment of annotations across zoom modes.

Expected cost:

- CPU cost becomes noticeable.
- Background jobs or worker threads become more important.
- Large PDFs may need more careful caching and eviction.

### Rough Runtime Expectations

These are deliberately qualitative rather than precise benchmarks:

- Native text layer on visible pages: usually acceptable on desktop, but can feel heavy on long PDFs when zooming or scrolling quickly.
- Word-box overlays: acceptable if limited to the active page or a small visible window.
- OCR on demand: fine as a user-triggered action, not ideal as an always-on background feature.
- OCR for every page in a long article: likely too expensive for a first implementation.

### Implementation Note For This Codebase

Because the reader already uses lazy visible-page rendering and already pulls text content for search, a region-copy or "copy text from page area" utility probably gives better value per unit of complexity than fully reviving freeform browser-style highlighting right away.

## Thumbnail Screenshot Utility

### Goal

Let the user capture a thumbnail directly from the embedded PDF reader without using the Windows snipping tool, saving a separate file manually, and then pasting/importing it later.

### Why This Seems Worthwhile

- It removes a surprisingly clunky multi-step workflow.
- It fits naturally with article curation.
- It makes visual browsing of the library much stronger.
- It turns the PDF reader into a more integrated tool rather than just a convenience viewer.

### Best First UX Shape

- Add a `Capture Thumbnail` action in the PDF reader.
- Enter a crop mode on the current page.
- Show a movable crop box with the target thumbnail aspect ratio locked by default.
- Show a live preview of the final thumbnail.
- Let the user:
  - drag the crop area
  - resize it with handles
  - nudge it with arrow keys
  - switch between locked ratio and free crop
  - confirm with `Set As Thumbnail`

### Aspect Ratio Guidance

- The current thumbnail target is roughly `420 x 260`.
- That is about `1.62:1`.
- The crop tool should visualize that ratio explicitly so the user can compose for the actual card shape.

Useful presets:

- `Thumbnail`
- `Square`
- `Tall detail`
- `Free crop`

### Best Image Source

For a first iteration, the crop should come from the PDF page rendering already inside the app rather than from OS-level screenshots.

That means:

- no Windows capture UI
- no clipboard juggling
- no temporary manual files
- consistent quality and color

A good implementation detail would be:

- use the visible page as the selection surface
- export from a higher-resolution re-render of that page region when the user confirms

That gives better thumbnail quality than cropping the current on-screen pixels alone.

### Very Minor Image Processing That Could Help

These should stay subtle and reversible:

- crop
- rotate by tiny increments
- brightness
- contrast
- mild sharpening
- auto-trim large white page margins
- slight background fill or padding when needed to hit the target ratio
- careful downscaling so the saved thumbnail stays crisp

### "Thumbnail Polish" Preset

A single optional preset could do a lot of good:

- trim extra page margins
- apply a small contrast boost
- apply mild sharpening
- resize to thumbnail target

That would likely be more valuable than exposing lots of sliders immediately.

### What Should Probably Not Happen In The First Version

- heavy filters
- aggressive AI upscaling
- figure detection that guesses wildly
- large editing panels
- full screenshot gallery management in the first pass

### Storage Model

The app should probably store:

- the processed thumbnail used by the article card
- optional source metadata:
  - page number
  - crop rectangle
  - export scale
  - processing preset used

A nice second step would be storing the original crop source too, so future retuning can be non-destructive.

### Computational Cost Of Thumbnail Capture

#### Low Cost

- crop from an already-rendered page
- save directly as thumbnail

Runtime impact:

- minimal
- mostly one extra canvas operation when the user confirms

#### Medium Cost

- re-render the source page at higher resolution before export
- run small crop and polish operations

Runtime impact:

- still very reasonable because it happens only on demand
- likely the best quality/performance tradeoff

#### Higher Cost

- live smart edge detection
- repeated high-resolution previews while dragging
- automated figure finding

Runtime impact:

- can get expensive if the tool tries to be too clever in real time
- better as a later enhancement, not a first pass

## Other Similar Utilities That Could Be Useful

### Page-Linked Text Excerpts

Instead of full annotation systems, a lightweight utility could:

- capture selected or region-copied text
- append it to notes
- store the source page number automatically

This is probably one of the highest-value nearby features.

### Figure Or Table Gallery Per Article

Let users save several visual captures, not just one thumbnail.

Useful for:

- remembering key figures
- comparing results visually
- scanning a paper without reopening it fully

### Important Pages / Page Pins

A simple bookmark tool for:

- figure-heavy pages
- methods pages
- appendix tables
- discussion/conclusion pages

This is cheap and useful.

### "Copy With Citation Context"

A utility that copies:

- excerpt text
- article title
- authors
- year
- page number

That would be useful for notes, literature reviews, and drafting.

### Figure Caption Quick Copy

A tool that:

- searches around a selected figure region
- tries to capture nearby caption text
- copies or saves it with the image

This could be very helpful for science articles, but it is more heuristic-heavy.

### Page Snapshot To Notes

Allow inserting a small page-region image directly into the article's notes area or a sidecar note entry.

This could be especially good for:

- equations
- complex tables
- diagrams

### Search Result Snippets

When a PDF search match is found, show a small extracted text snippet near the result instead of only the page number.

That would make search much more useful with relatively modest complexity.

### Figure-First Navigation

A future utility could collect saved captures and let the user reopen the PDF directly to the page a figure came from.

That would tie the reader and screenshot tooling together nicely.

## Recommended Rollout Order

If the goal is maximum usefulness with controlled complexity, the best order is probably:

1. Add the thumbnail capture tool with fixed-ratio crop and very light processing.
2. Add page-linked image or excerpt insertion into notes.
3. Add a region-copy text utility for PDFs.
4. Revisit true freeform text highlighting only after testing shows it is trustworthy enough.
5. Consider OCR fallback only as an explicit later step.

## Bottom Line

For this app, the safest high-value path is probably:

- thumbnail capture first
- text region copy second
- native highlight selection only after careful validation

That route is more likely to produce tools that feel dependable, which matters more than checking the box that the PDF viewer technically supports text highlighting.
