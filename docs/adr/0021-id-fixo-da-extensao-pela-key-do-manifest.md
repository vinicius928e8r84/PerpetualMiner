# The extension has a fixed ID, set by the `key` of the manifest

`manifest.json` carries the public `key` of the Chrome Web Store item. Because of it, the extension loaded from a folder (Chrome on the Mac, Opera on the desktop) and the store version have the same ID, `ohpoogiccjmdgilgegholdidgfhjkadf`, on any device and from any folder. The ID matters because the Google OAuth redirect, `https://ohpoogiccjmdgilgegholdidgfhjkadf.chromiumapp.org/`, is registered for it; without that registration only the sign-in with Google fails, and the rest of the extension works, which makes the failure easy to mistake for a bug in the sign-in.

The store zip leaves the `key` out (`scripts/empacotar-extensao.mjs`). A folder copy has to be a copy of the repository with the `key`, never an older one: loading it before the pull that brings the `key` keeps the old ID, and the storage of an extension is separate per ID.

The store assigns its own key and may refuse the field, so `scripts/empacotar-extensao.mjs` takes out only that line and the rest of the file comes out identical. `testes/test_empacotar.js` checks both zips, and `e2e/tests/id-fixo.spec.js` checks the id.

The accepted trade: any computer that loaded the extension before the `key` existed has the old ID and its own storage, and the Frases saved only in that browser do not appear under the new ID (the ones synced to a Conta come back on sign-in). The owner confirmed no installation with the old ID remains, so no migration is kept.
