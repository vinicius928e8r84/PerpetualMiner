# The recorded shortcut works only through the content script, so the manifest declares no `commands`

The shortcut that mines the caption (Alt+S by default, `lib/atalhos.js`, stored in `pm_atalho_legenda`) is recorded by the person in Configurações and handled by `content.js`. We chose that over Chrome's own `commands` because the content script accepts mouse buttons as part of a shortcut, and `chrome.commands` does not. `manifest.json` therefore declares no `commands` and does not start to, so the recorded shortcut is the only one and nothing is reserved.

The cost is accepted: with no `commands`, Chrome reserves no shortcut for the extension and lists none on `chrome://extensions/shortcuts`.
