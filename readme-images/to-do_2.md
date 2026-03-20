### immediate (bug fixes, small features)

- [ ] edit the tokenized tag suggestions so that existing tags are visibly distinct from new tags
  - maybe right-click replaces it with the next guess
  - does the tokenizer convey any kind of confidence that can be visualized?  Does that currently weigh on the order?


  
- address why the filename not writing with underscores

- [ ] 'niche' filters not hiding properly
  - [ ] fix niche chips preventing autofill elsewhere and appearing with strange characters in the niche field
  - [x] just putting in 'experimental' for now
    - [ ] but hide the checkbox in the tag dropdown while it is unchecked in the files menu

- [ ] make referenced dois into columns instead of one row and several columns

- [ ] get the pdf reader search function to highlight the found text

- [ ] clean markup from DOI extraction (I found a <i> </i> in an article title)

- many clicks around the filter dropdown accidentally trigger "select all"

- a way to export DOIs for a certain tag and then a way to compare two sets of DOIs from two people to separate them into "shared" "only person 1" "only person 2"
  - option to import those DOIs along with the tags they were assigned in the owner's collection

### major revision features

- syncing papers, preferences, thumbnails, and metadata across devices
  - add an option to use a non-app folder for the articles, thumbnails, and metadata, and then advise the user to choose a cloud-synced or git-initalized folder? 
    - resolving conflicts in obsidian's sync system sucks with its git solution...probably avoid that unless I can think of a way to make conflicts virtually impossible

- json -> database
  - add some startup assessment to the existing project size metrics?
  - ask someone with 1000 PDFs to test (Ben?  Kristen?)


### minor version revision features

- [ ] how-to-use modal for first time user (hotkeys, colors, editing metadata, pasting images, toggling views) with a "show first-time helper" in the '?' modal

- [ ] find specific reasons why PDF parsing is so hard
  - [ ] can the NLP model assist?

- [ ] add very small first-page or journal render thumbnail image to the abstract view

### flesh out

- [ ] native PDF reader

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