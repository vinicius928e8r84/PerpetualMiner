# A mouse button used as a shortcut is held on release

The side buttons of the mouse navigate the page on release, not on `mousedown`, so stopping only the `mousedown` is not enough: when a button is the shortcut (or is being recorded as one) the extension also holds its release, or the page goes back or forward under the person. The shortcut also yields to the field the person is typing in, including a field inside a closed shadow root, where the event arrives retargeted to the host: in the content script `chrome.dom.openOrClosedShadowRoot` opens the root to see where the focus is.
