### immediate (bug fixes, small features)

- [ ] try to maintain at least 2 sentences for each section in the abstract separation.

- [ ] niche filters not hiding properly
  - [ ] fix niche chips preventing autofill elsewhere and appearing with strange characters in the niche field
  - [x] just putting in 'experimental for now'

- [ ] make referenced dois into columns instead of one row and several columns

- [ ] default 'warn duplicate DOIs' to on in the file settings

- [ ] brightness adjustments (lowering max value across the window, filtering the thumbnails, etc.)

- [ ] how can I have the selected article active in the folder when I select "open in folder" like windows does when using "open file location"

- [ ] save space in display -> hide the slider until the user clicks on the button

- [ ] warnings
  - warning: unused import: `self` --> src\lib.rs:17:23
  - structure field `DOI` should have a snake case name --> src\lib.rs:103:9
  - `literature-library` (lib) generated 2 warnings (run `cargo fix --lib -p literature-library` to apply 1 suggestion)
   
### major version revision features

- [ ] consider ways to synchronize metadata (and papers) between multiple computers

- [ ] how-to-use modal for first time user (hotkeys, colors, editing metadata, pasting images, toggling views) with a "show first-time helper" in the '?' modal

### minor version revision features

- [ ] 'new custom theme' -> give it a name and let is save to the file system and be selectable in the theme dropdown
  
### flesh out

- [ ] include a resizing/cropping feature to the 'paste thumbnail image' to encourage getting large screenshots and cropping in
  - allow dragging the thumbnail image around and scrolling in and out in the preview to
  - maybe basic image editing, like masking 
  - dedicated screenshot button that maintains an ideal aspect ratio for the thumbnail?
    - scroll makes it bigger or smaller and when it's below a certain pixel size, an enlarged preview window follows it around like a magnifying glass

- [ ] auto-rescale stored image when resolution is unecessarily high 

- [ ] show a prompt to accept or undo the changes for drag-and-drop thumbnails

- [ ] pivot how articles are indexed so that filename changes aren't breaking?

### questions

- when should I be considering a database approach?  is there a nice way to visualize that during development?

- try to better understand the snake/camel case relationship between the front and back end here