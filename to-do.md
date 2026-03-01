### immediate

- [x] for the "fetch data" button, if a DOI is not given in the DOI field, attempt to parse the first 3 pages of the PDF for a DOI 

- [x] add a checkbox with the height slider to autometically change the height of cards such that the black borders are not necessary in thumbnails

- [ ] 'include' toggle to include 'all' vs include 'any' for tags
  - current weird break (does not work for 'include any')

- [x] prompt user with metadata modal on import of new PDF 
  - how to handle multiple PDFs imported at once?

- [x] on re-index, check for duplicate DOIs and prompt user "remove the following duplicates? :"

- [x] turn 'filter incomplete' from button to another checkbox in the tag filter dropdown
  - [x] just call the checkbox "incomplete fields"

- [x] extend the tag-based coloration and the hotkeys for opening the abstract and metadata modals to the rows in the list view
  - [ ] does not seem to work

- [x] attempt to extract DOIs from the papers in the references section for each paper and display them in the abstract viewer

### think about more first

- [ ] include a resizing/cropping feature to the 'paste thumbnail image' to encourage getting large screenshots and cropping in

- [ ] auto-rescale stored image when resolution is unecessarily high 

- [ ] show a prompt to accept or undo the changes for drag-and-drop thumbnails

- [ ] cleaning input
  - add preferences for how to clean ("and" vs "&" vs none, periods after initials, keep asterisks for PIs, casing (remove all uppercases?  force sentence vs title casing? how to chunk the abstract - 3 * 1/3 sentences?) in the files menu