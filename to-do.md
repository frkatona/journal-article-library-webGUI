### immediate

- [ ] number the reference DOIs

- [ ] 'new custom theme' -> give it a name and let is save to the file system and be selectable in the theme dropdown

- [x] have the niche tags use chips components
  - [ ] fix it preventing autofill elsewhere and appearing with strange characters in the niche field

- abstract style
  - [x] center align year/author/journal and move the 'open article' button
  - [x] un-bold year

- [ ] default 'warn duplicate DOIs' to on in the file settings

- [ ] when should I be considering a database approach?  is there a nice way to visualize that during development?

- [ ] show 'metadata saved' each time its saved (moving between fields, clicking the save button, pushing 'enter' to exit the modal)

- [ ] fine-tune the abstract sentence separation
  - [x] use a natural language processing sentence tokenizer model to chunk the abstract into sentences instead of just splitting on periods
  - [x] consider additional artifacts, like hyphenated line wraps and ligatures from the PDFs
  - [ ] the 'degrees' symbol appears to sometimes be replaced with "", and +/- symbols seem sometimes replaced with "G"

- [ ] check on the warnings in the console log
  - try to better understand the snake/camel case relationship between the front and back end here

- [ ] consider ways to synchronize metadata (and papers) between multiple computers

- [ ] slider to lower the maximum value

- [ ] how can I have the selected article active in the folder when I select "open in folder" like windows does when using "open file location"

- [ ] save space in display -> hide the slider until the user clicks on the button

- [ ] warnings
  - warning: unused import: `self` --> src\lib.rs:17:23
  - structure field `DOI` should have a snake case name --> src\lib.rs:103:9
  - `literature-library` (lib) generated 2 warnings (run `cargo fix --lib -p literature-library` to apply 1 suggestion)
   
### flesh out

- [ ] include a resizing/cropping feature to the 'paste thumbnail image' to encourage getting large screenshots and cropping in
  - allow dragging the thumbnail image around and scrolling in and out in the preview to
  - maybe basic image editing, like masking 
  - dedicated screenshot button that maintains an ideal aspect ratio for the thumbnail?
    - scroll makes it bigger or smaller and when it's below a certain pixel size, an enlarged preview window follows it around like a magnifying glass

- [ ] auto-rescale stored image when resolution is unecessarily high 

- [ ] show a prompt to accept or undo the changes for drag-and-drop thumbnails

- [ ] cleaning input
  - add preferences for how to clean ("and" vs "&" vs none, periods after initials, keep asterisks for PIs, casing {remove all uppercases?  force sentence vs title casing? how to chunk the abstract - 3 * 1/3 sentences?}) in the files menu

- [ ] how-to-use modal for first time user (hotkeys, colors, editing metadata, pasting images, toggling views) with a "show first-time helper" in the '?' modal


- [ ] pivot how articles are indexed so that filename changes aren't breaking