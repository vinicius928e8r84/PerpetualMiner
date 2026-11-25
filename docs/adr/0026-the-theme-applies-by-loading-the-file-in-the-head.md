# The theme applies by loading the file in the head

`veio/tema.js` applies the saved theme as soon as the file is loaded in the `<head>`; the page calls nothing. The extension's security policy (MV3) does not let an inline `<script>` make that call, and the theme must hold before the first paint, so it cannot wait for the page. Outside the extension (the showcase, served over HTTP) there is no `chrome.storage`, and the page stays in the CSS default; without `localStorage` (restricted mode) it opens in the default and corrects itself when `chrome.storage` answers.
