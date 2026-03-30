# Sync Brainstorm

## Core idea

- A good first sync system does not need true live multi-device syncing.
- The safest first pass is probably a manual export/import flow:
  - `Export library bundle`
  - `Import library bundle`
- That gets most of the practical value of cross-computer use without immediately introducing servers, accounts, auth, or conflict-heavy background sync.

## Strong first iteration

- Add a button to export a compressed bundle containing:
  - article PDFs
  - thumbnails
  - metadata
  - app-level settings worth syncing
  - a manifest describing every exported item
- Add a matching import flow that:
  - scans the manifest
  - checks which articles are already present locally
  - imports only new articles by default
  - optionally offers a second pass for metadata updates to existing articles

## What the export file could contain

- A single archive like `.zip` is the easiest first option.
- Inside the archive:
  - `manifest.json`
  - `articles/<article-id>/paper.pdf`
  - `articles/<article-id>/thumbnail.jpg`
  - `articles/<article-id>/metadata.json`
  - optional `assets/` or `prefs.json`

- `manifest.json` should probably include:
  - app export version
  - export timestamp
  - app version
  - article count
  - file hashes
  - relative paths inside the archive
  - stable article identifiers

## Stable article identity

- A sync/export system becomes much easier if each article has a stable ID that survives across computers.
- Good candidate identity layers:
  - internal UUID created once per article
  - DOI when available
  - PDF content hash for fallback

- A practical matching order on import:
  1. internal article UUID
  2. DOI
  3. PDF hash
  4. filename + size as a last weak fallback

## Import behavior options

- Safest default:
  - import only articles not already found locally
- Useful optional modes:
  - `new articles only`
  - `new + metadata updates`
  - `force replace local metadata`
  - `preview changes before import`

- The importer should report:
  - new articles added
  - existing articles skipped
  - conflicts found
  - files missing from the archive

## Metadata merge thoughts

- For the first pass, merging should stay conservative.
- Good default rules:
  - do not overwrite local metadata unless explicitly chosen
  - do not delete local tags/notes just because the archive lacks them
  - prefer union merges for tags
  - prefer newest timestamp only if timestamps are trustworthy

- Notes are the trickiest field because both machines may diverge.
- Easy first policy:
  - keep local notes
  - append imported notes into a second block when they differ
  - mark the result as a conflict for manual cleanup

## Thumbnail handling

- Thumbnail data is straightforward to bundle and restore.
- Import should probably:
  - bring in thumbnails for new articles automatically
  - leave local thumbnails alone for existing articles unless the user opts in

- A useful future refinement:
  - only import a thumbnail replacement if the incoming thumbnail is manual and the local one is auto-generated

## Compression and performance

- `zip` is the easiest likely choice:
  - well-supported
  - easy for users to inspect manually
  - easy to move with cloud storage, USB drives, or email

- Performance considerations:
  - PDFs can make bundles large quickly
  - exporting should stream progress to the UI
  - importing should validate checksums progressively
  - a large import should not require loading everything into memory at once

## UI ideas

- In `Files`, add:
  - `Export library bundle...`
  - `Import library bundle...`

- Export dialog ideas:
  - include PDFs
  - include thumbnails
  - include metadata
  - include settings
  - export selected articles only vs whole library

- Import dialog ideas:
  - summary of archive contents
  - checkboxes for what to import
  - `new only` default
  - optional conflict preview table

## Very useful low-hanging upgrades

- Export only selected articles.
- Export only articles added since a chosen date.
- Import dry-run mode:
  - show what would happen without modifying anything
- Save a short text report after import.
- Offer `Reveal archive` after export completes.

## Nice medium-weight extensions

- Differential exports:
  - export only articles changed since the last export
- Snapshot history:
  - keep older bundle manifests locally for rollback
- Merge helper UI for:
  - notes
  - tags
  - title/authors/journal conflicts
- Optional inclusion of reader state:
  - last viewed page
  - last zoom
  - notes-panel width and fold state

## Heavier future directions

- True background sync through a cloud folder:
  - Dropbox
  - OneDrive
  - Google Drive
- Peer-to-peer or LAN sync between two machines.
- A small private sync server with authenticated clients.
- End-to-end encrypted sync bundles.
- Multi-device conflict resolution with change history per field.

## Risks and tricky parts

- Duplicate detection must be reliable enough not to re-import the same article under a slightly different filename.
- Notes and metadata conflicts can be subtle and easy to overwrite accidentally.
- Large PDF archives could make export/import feel stalled unless progress is explicit.
- Partial import failure handling matters:
  - if import stops halfway through, the library should remain consistent

## Good recommended rollout

1. Build `Export library bundle...` for the whole library.
2. Build `Import library bundle...` with `new articles only`.
3. Add manifest hashing and a dry-run preview.
4. Add optional metadata update import for existing articles.
5. Add conflict reporting for notes and thumbnails.

## Practical recommendation

- The manual archive workflow is probably the right place to start.
- It gives cross-computer portability quickly.
- It keeps the system inspectable and debuggable.
- It creates a clean foundation for any later cloud-sync feature, because the manifest and matching logic will already exist.