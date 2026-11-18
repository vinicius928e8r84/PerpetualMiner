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
- The computer's port 8766 is out of the test Chromium's reach (#551). Playwright's routing does not see the first navigation of a tab the extension opens with `chrome.tabs.create`, nor the redirect it follows (the ChatGPT login's return to `http://127.0.0.1:8766/auth/callback`); left alone, that request goes to the real port, where an open Anki answers it. So the fixture maps `127.0.0.1:8766` and `localhost:8766` (`--host-resolver-rules`) to the test Conexão's port: the worker fixture `portaDaConexaoDeTeste` (`e2e/fakes/porta-da-conexao.js`), or the real add-on server's port with `PM_CONEXAO=real`. On that port the fake answers the return tab (`fakes.anki.responderNaPortaDeTeste`, the same login state as the routed `/auth/callback`) and drops the connection of anything else, as a closed port would; `fakes.anki.chegaramNaPortaDeTeste` lists what arrived (transport, not stored state). Proved by `e2e/tests/configuracoes-chatgpt.spec.js` › `a aba de retorno do ChatGPT chega à porta da Conexão de teste, nunca à porta 8766 do computador`. No test listens on 8766: with the port taken, an Anki that opens meanwhile leaves its Conexão down.
- While working, run only the specs of the area you changed (`npx playwright test <specs> --workers=2`); the whole suite runs in CI (`.github/workflows/testes.yml`, with the Node, engine and add-on tests), not on your machine, but a PR that touches only the add-on, the engine or documentation skips the e2e there (`scripts/ci/selecao-de-testes.js`), so run the e2e specs a cross-read could break yourself. A test that also fails on `main` has an open issue: do not prove it again.
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

**Time ceiling.** The Noturna (`.github/workflows/noturna.yml`) sets `PM_TETO_S` on each e2e slice (420 s) and on the add-on (360 s): `testar.mjs` then fails a green run that took longer, with `::error title=Teto de tempo::`, so a slice or the add-on that drifts slower opens the `noturna` issue instead of lengthening every PR wait. The add-on group runs in 2 processes (`"paralelo"` in `scripts/testes.json`, `scripts/unittest-em-paralelo.js`); `PM_PARALELO=1`, or arguments after `--`, run it in series with `unittest discover`.
