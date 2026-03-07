### immediate (bug fixes, small features)

- [ ] niche filters not hiding properly
  - [ ] fix niche chips preventing autofill elsewhere and appearing with strange characters in the niche field
  - [x] just putting in 'experimental for now'

- [ ] make referenced dois into columns instead of one row and several columns

- [ ] brightness adjustments (lowering max value across the window, filtering the thumbnails, etc.)

- [ ] how can I have the selected article active in the folder when I select "open in folder" like windows does when using "open file location"



- [ ] warnings
  - warning: unused import: `self` --> src\lib.rs:17:23
  - structure field `DOI` should have a snake case name --> src\lib.rs:103:9
  - `literature-library` (lib) generated 2 warnings (run `cargo fix --lib -p literature-library` to apply 1 suggestion)

- [ ] demo mode (uses a tmp articles and thumbnails folder and index json to delete on exit)
   
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

- when should I be considering a database approach?  really ~1000 articles?  
  - is there a helpful metric to keep an eye on, like time to open the app, or time to render the full library that I can log in the debug? 
  - is there a good tool for development and visualization of the database implementation?

- try to better understand the snake/camel case relationship between the front and back end here

- is 'warn duplicate DOIs' defaulted on on in the file settings?