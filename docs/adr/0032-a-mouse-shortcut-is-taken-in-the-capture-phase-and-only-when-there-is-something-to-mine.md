# A mouse shortcut is taken in the capture phase, and only when there is something to mine

When a mouse button is the shortcut to mine a caption or a selection, the content script listens in the capture phase, to act before the browser navigates (the side buttons go back and forward). The button is taken only when there is something to mine: on a page with no caption, or with no selection, it keeps doing what it always did. When it is taken, it is taken whole: the `mousedown` is cancelled and the release is held too, because the release is when back and forward would navigate (see 0025).
