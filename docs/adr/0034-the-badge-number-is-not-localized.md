# The badge number is not localized

The number on the toolbar badge does not go through the voice catalog. The limit of each language is at most 100, so the sum never reaches the thousands where Brazilian Portuguese would put a dot, and the Chrome badge cuts the text in a few characters anyway. The tooltip, which has room, is from the catalog. The two colors of the badge are the only colors written outside `veio/tokens.css`, because `chrome.action` does not read CSS; the exception is in `veio/README.md`.
