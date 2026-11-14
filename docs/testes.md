# Testing

The extension is tested for real in Chromium via Playwright, from `e2e/` (its own `package.json`, so the unpacked root stays free of Node files):

```bash
cd e2e
npm ci           # once
npm run setup    # once: downloads Playwright's Chromium
npm test         # launches Chromium with the unpacked extension and runs the suite
```

On Linux/WSL, Chromium also needs system libraries (NSS, ALSA…): `sudo npx playwright install-deps chromium`, once.

The browser sees only the DejaVu fonts (`e2e/fontconfig/fonts.conf`, set as `FONTCONFIG_FILE` by `e2e/fixtures.js`; Debian/Ubuntu package `fonts-dejavu-core`; the machine's own fontconfig, `50-user.conf` and `51-local.conf`, is left out on purpose), so the host pages' fallback fonts and symbol glyphs are the same on a dev machine and on the CI runner, and the `-linux` visual references hold on both.

- The fixtures (`e2e/fixtures.js`), the fakes (`e2e/fakes/`), the local test pages (`e2e/pages/`), the Veio showcase (`e2e/vitrine/`) and the list of visual references (`tests/*-visual.spec.js`) are described in the `e2e-suite` skill: `.claude/skills/e2e-suite/SKILL.md`. Open it before adding or changing an e2e test.
- `HEADED=1 npm test` shows the browser.
- While working, run only the specs of the area you changed (`npx playwright test <specs> --workers=2`); the whole suite runs in CI (`.github/workflows/testes.yml`, with the Node, engine and add-on tests), not on your machine. A test that also fails on `main` has an open issue: do not prove it again.
- Tests assert what the person sees and what ends up stored, never internal functions. A test that acts reads the stored state afterwards and compares it with a concrete value (`e2e/estado-final.js`; rule `e2e-estado-final`); the read comes after the last action and reaches an `expect`; a fake's reader of what it kept is declared `@estado-guardado`; one that stores nothing says `// Exceção de teste: sem-estado-guardado — <reason>`. Three narrow exceptions, each named in the test's comment:
  - Where Chromium gives Playwright no way to drive the native UI or clock (the context menu, the toolbar badge, the midnight alarm, an extension update), a test does what Chrome would do — calls the function Chrome would call (`minerarSelecaoDoMenu`, `registrarMenuDeContexto`, `aoInstalar({ reason: 'update' })`) or fires the alarm early under its own name — and asserts what gets stored or what is handed to Chrome (`chrome.action.getBadgeText`, `getTitle`, the next alarm's time).
  - Until a surface shows a catalog state, the catalog's own guarantees (every ID present, pt-BR numbers) are asserted through `PerpetualMiner.textoDaVoz`, inside an extension page. These move to the screen when the surface is rebuilt.
  - Two guarantees of the base components have no on-screen trigger of their own, so the test calls the component's own function and still asserts the visible result: how long a toast of a given length *stays on screen* (`mostrarToastDeSucesso`), and that a phrase carrying markup is written as text (`escreverFrase`). The surfaces that call them assert the same thing through the screen once they are rebuilt.

The add-on's contract with the extension is tested from both sides on the same examples: `complemento/test_servidor.py` (the real server over an in-memory collection) and `e2e/tests/contrato-da-conexao.spec.js` (the fake, which answers from `complemento/contrato/exemplos.json`; a context such as `fakes.anki.abrirColecao(nome)`, `abrirPerfil(perfil)` or `definirItemDeLogin(situacao)` needs an example, which `node test_fake_anki.js` checks).

The legacy tests keep running: `node test_sync.js` (loads `lib/sincronizacao.js` for real, two computers over a memory cloud, plus the HTTP adapter over a fake `fetch`), `node test_auto_keyword.js`.

**Every test runs in the gate.** The groups of `scripts/testes.json` are the one list of what runs: a workflow job only calls `node scripts/testar.mjs <group>`. `node scripts/regras/verificar.js` (rule `testes-no-portao`) fails on a test file no group runs, a group no PR workflow calls, and a workflow that runs a test by hand. Still outside the gate, on the rule's baseline: `.agents/skills/verify-perpetualminer/scripts/test_helpers.sh` (minutes long, sends signals).


## Testing on devices and the Chrome Web Store

- `lib/auto-recarregar.js` (started by `background.js`): only when `chrome.management.getSelf()` says `installType === "development"`, a 1-minute alarm hashes the files `PerpetualMiner.arquivosDaExtensao` lists and calls `chrome.runtime.reload()` when they change (confirmed after 4 s, so a half-finished `git pull` never reloads). Store installs do nothing. Test: `e2e/tests/atualizacao-automatica.spec.js`, on a temp copy of the extension.
- `scripts/atualizar-extensao.sh` (+ `scripts/com.perpetualminer.atualizar.plist.exemplo`) keeps a clone on `main` up to date with `git pull --ff-only`; see `docs/instalar-extensao.md`.
- `node scripts/empacotar-extensao.mjs` writes `dist/perpetualminer-<version>.zip` (runtime files only, manifest validated; `node test_empacotar.js` checks it); see `docs/publicar-chrome-web-store.md`, which ends with the manifest permissions the store may question.
