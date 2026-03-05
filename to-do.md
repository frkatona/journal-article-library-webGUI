### immediate

- [ ] 'new custom theme' -> give it a name and let is save to the file system and be selectable in the theme dropdown

- [x] have the niche tags use chips components
  - [ ] fix it preventing autofill elsewhere and appearing with strange characters in the niche field

- [ ] should the separators extend all the way, and should the title separator be the same as the top author separator?

- [ ] default 'warn duplicate DOIs' to on in the file settings

- [ ] when should I be considering a database approach?  is there a nice way to visualize that during development?

- [ ] show 'metadata saved' each time its saved (moving between fields, clicking the save button, pushing 'enter' to exit the modal)

- [ ] fine-tune the abstract sentence separation

- [ ] check on the warnings in the console log
  - try to better understand the snake/camel case relationship between the front and back end here

- [ ] consider ways to synchronize metadata (and papers) between multiple computers

- [ ] cycle through a series of brief helpful messages above the version number in the "?" modal (also a refresh button to go to the next one)
  - 20/20/20 - every 20 minutes of reading, take 20 seconds to look at something 20 feet away - [mayoclinic](https://www.mayoclinic.org/diseases-conditions/eyestrain/diagnosis-treatment/drc-20372403)
  - Your blink rate drops by up to 80% during screen use, drying the cornea.  Try to make form a habit repeated blinking—for instance, 5 blinks each time you read a paragraph! - [mayoclinic](https://www.mayoclinic.org/diseases-conditions/eyestrain/diagnosis-treatment/drc-20372403)
  - When is the last time you took a big sip of water? (coffee doesn't count!)  By the time you notice the thirst, you are already dehydrated!
  - Take a moment to deep breathe - sit up straight; inhale for 4 seconds, hold for 7, exhale for 8
    - create a little animation for this one
  - Reset your posture - squeeze your should blades together; hold 5 seconds; repeat 5 times
  - Mouth check!  Relax your jaw and let your tongue rest gently against the roof of your mouth
  - Affect Labeling - "labeling negative feelings can down-regulate distress" - (2022)[https://doi.org/10.1371/journal.pone.0279303]

- [ ] how can I have the selected article active in the folder when I select "open in folder" like windows does when using "open file location"

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