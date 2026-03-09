### immediate (bug fixes, small features)

- [ ] place "tag color intensity" slider under the button like the similar options
  
- address why the filename not writing with underscores

- [ ] 'niche' filters not hiding properly
  - [ ] fix niche chips preventing autofill elsewhere and appearing with strange characters in the niche field
  - [x] just putting in 'experimental' for now
    - [ ] but hide the checkbox in the tag dropdown while it is unchecked in the files menu

- [ ] make referenced dois into columns instead of one row and several columns

### major version revision features

- [ ] json -> database

- [ ] consider ways to synchronize metadata (and papers) between multiple computers
  - add an option to use a non-app folder for the articles, thumbnails, and metadata, and then advise the user to choose a cloud-synced or active git folder? 

### minor version revision features

- [ ] how-to-use modal for first time user (hotkeys, colors, editing metadata, pasting images, toggling views) with a "show first-time helper" in the '?' modal

- [ ] find specific reasons why PDF parsing is so hard
  - [ ] can the NLP model assist?

### flesh out

- [ ] include a resizing/cropping feature to the 'paste thumbnail image' to encourage getting large screenshots and cropping in
  - allow dragging the thumbnail image around and scrolling in and out in the preview to
  - maybe basic image editing, like masking 
  - dedicated screenshot button that maintains an ideal aspect ratio for the thumbnail?
    - scroll makes it bigger or smaller and when it's below a certain pixel size, an enlarged preview window follows it around like a magnifying glass

- [ ] auto-rescale stored image when resolution is unecessarily high 

- [ ] pivot how articles are indexed so that filename changes aren't breaking?

### questions

- when should I be considering a database approach?  really ~1000 articles?  
  - is there a helpful metric to keep an eye on, like time to open the app, or time to render the full library that I can log in the debug? 
  - is there a good tool for development and visualization of the database implementation?

- try to better understand the snake/camel case relationship between the front and back end here

- is 'warn duplicate DOIs' defaulted on on in the file settings?