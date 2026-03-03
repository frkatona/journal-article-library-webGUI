### immediate

- [x] for the "fetch data" button, if a DOI is not given in the DOI field, attempt to parse the first 3 pages of the PDF for a DOI 

- [x] add a checkbox with the height slider to automatically change the height of cards such that the black borders are not necessary in thumbnails

- [x] 'include' toggle to include 'all' vs include 'any' for tags
  - [ ] current weird break (does not work for 'include any')

- [x] prompt user with metadata modal on import of new PDF 
  - how to handle multiple PDFs imported at once?

- [x] on re-index, check for duplicate DOIs and prompt user "remove the following duplicates? :"

- [x] turn 'filter incomplete' from button to another checkbox in the tag filter dropdown
  - [x] just call the checkbox "incomplete fields"

- [x] extend the tag-based coloration and the hotkeys for opening the abstract and metadata modals to the rows in the list view
  - [x] hotkeys do not seem to work

- [x] attempt to extract DOIs from the papers in the references section for each paper and display them in the abstract viewer
  - [x] BREAKING - it does this during the abstract modal opening (gated behind 'files' setting)

- [ ] give the 'display' dropdown a title like 'files' has "file management"

- [ ] create an 'experimental' section in file management which contains the 'auto references compilation' box, and one or two other side branch features

- [ ] add 'open article' and 'open file location' to the metadata editor

### think about more first

- [ ] include a resizing/cropping feature to the 'paste thumbnail image' to encourage getting large screenshots and cropping in

- [ ] auto-rescale stored image when resolution is unecessarily high 

- [ ] show a prompt to accept or undo the changes for drag-and-drop thumbnails

- [ ] cleaning input
  - add preferences for how to clean ("and" vs "&" vs none, periods after initials, keep asterisks for PIs, casing {remove all uppercases?  force sentence vs title casing? how to chunk the abstract - 3 * 1/3 sentences?}) in the files menu

- [ ] how-to-use modal for first time user (hotkeys, colors, editing metadata, pasting images, toggling views) with a "show first-time helper" in the '?' modal

- [ ] screenshot button that maintains an ideal aspect ratio for the thumbnail
  - (vs crop tool for existing screenshot mentioned previously)

- [ ] pivot how articles are indexed so that filename changes aren't breaking