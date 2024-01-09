# tree-explorer

A simple webapp to explore a tree of information. 

Originally used to run simple tracking of a teams work.

Features:
* Running online free at [https://tree-explorer.github.io/](https://jezternz.github.io/tree-explorer/)
* Wildly simple, all leafs can contain other leafs and text and thats it!
* All changes are saved to local storage, so you can just come back to the site and continue where you left off (in the same browser).
* Ability to zoom/pan
* Ability to add/remove branches/leafs at any depth
* Ability to resize leafs between 3 sizes to indicate size or importance.
* Leafs can either contain child leafs (and have a text title) or contain text.

Future features:
* Various panning/zooming improvements
* Ability to import/export json
* Redo/Undo history buttons
* Ability to select another source beyond localstorage (e.g. an endpoint to put/get json from)
