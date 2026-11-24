# The manifest asks for Chrome 110 so the toolbar badge keeps its contrast

The Mineração automática counter on the toolbar badge uses gold `#F5B83D` behind dark `#1A1204` text, a 10.4:1 contrast. `chrome.action` takes colors, not CSS, so the two colors are written in `background.js` (the one exception to the token rule, registered in `veio/README.md`) and travel as a pair: `setBadgeBackgroundColor` and `setBadgeTextColor`. `setBadgeTextColor` exists only from Chrome 110, so `manifest.json` declares `minimum_chrome_version: 110`. Without the minimum, the text color would fall back to the default and the badge would lose that contrast.

We chose to refuse older Chrome versions over shipping a badge that may lose its contrast. The cost is accepted: a person on Chrome below 110 cannot install the extension.
