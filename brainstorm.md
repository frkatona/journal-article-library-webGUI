# Brainstorm

Notes for the more open-ended ideas from `to-do.md`.

## Syncing Between Devices

### Smallest Safe Version

- Sync only `library_data/` first, not the PDFs.
- Treat `Articles/` as local and let each device warn when a referenced PDF is missing.
- Add a manual "pull status" / "push status" preflight before any real sync button exists.

### GitHub Repo Sync Possibility

- A repo works best for metadata JSON, thumbnails, settings, and a manifest of expected PDFs.
- Full PDF sync through Git is likely painful once the library gets large unless Git LFS is involved.
- A hybrid approach could keep metadata in Git and leave PDFs in a user-chosen folder synced by OneDrive/Dropbox/Syncthing.

### Merge-Conflict Pain Points

- Two devices editing the same article metadata before either one syncs.
- One device renaming or deleting a tag while another adds it to more articles.
- Article deletion on one device while another device edits that article.
- Filename/path drift if PDFs are renamed on one machine but not yet on another.

### Ways To Reduce Conflict Risk

- Show "incoming changes" and "outgoing changes" counts before a sync attempt.
- Track per-article `last_modified` timestamps and content hashes for overrides.
- Refuse silent auto-merge for destructive conflicts; show a comparison instead.
- Create an automatic backup snapshot immediately before every pull/merge/apply action.
- Keep article identity based on stable IDs, not filenames.

### Good First Iteration

- Manual export/import of a zipped metadata bundle.
- Then a read-only "check remote status" button.
- Then a guided sync flow with conflict previews.

## Rename PDFs From Formatted Metadata

### Benefits

- Cleaner article folder names.
- Easier browsing outside the app.
- Better consistency once metadata has been curated.

### Risks

- Duplicate target filenames.
- Very long filenames on Windows.
- Characters illegal on some filesystems.
- External references/bookmarks/notes that still point to the old filename.
- Sync churn if another device still has the previous name.

### Safer UX

- Use a preview table: old name -> new name.
- Show collisions before renaming anything.
- Offer a naming template with a live sample.
- Keep a reversible rename log so the last batch can be undone.
- Consider a "rename selected article only" version before batch rename.

### Good Filename Inputs

- `Author - Year - Short Title.pdf`
- Optional DOI suffix only when needed to avoid collisions.
- Aggressive sanitization plus truncation near Windows path limits.

## "All / Some / None" Tag Filtering

### Probably Best Direction

- Replace one global match mode with three buckets:
  - `Require`
  - `Allow any`
  - `Exclude`

### Why This May Beat Separate Dropdowns

- The logic becomes explicit instead of overloading one mode selector.
- Users can express things like "must be MURI, may be review, not textbook".
- It scales better than adding more special-case radio modes.

### UI Possibilities

- Three columns inside the current tag filter dropdown.
- Or one searchable tag list where each click cycles `neutral -> allow -> require -> exclude`.
- Or chips above the grid separated into grouped rows.

### Caution

- This is powerful, but it will need clear visual language and a concise summary string in the closed dropdown button.

## Typed Tags

### Why It Could Help

- Distinguishes broad categories like `project`, `format`, `method`, `status`, `topic`.
- Makes filtering more structured without relying on naming conventions.

### Risks

- Adds data-entry friction.
- Existing flat tags will need a migration story.
- Users may be unsure whether something belongs in `type`, `project`, or a normal tag.

### Soft-Launch Options

- Keep flat tags, but allow an optional type on a subset of tags.
- Start with only 2-3 built-in types such as `project`, `format`, and `status`.
- Let untyped tags continue to exist so the feature stays optional.

### Alternative

- Instead of true typed tags, support tag prefixes like `project:MURI` or `format:textbook`.
- This is cheaper technically, but it pushes structure into naming and is less friendly in the UI.

### Good First Iteration

- Add one lightweight structured field first, probably `project`.
- If that feels useful, generalize into typed tags later.
