# PerpetualMiner verification map

The maintained source for verifying PerpetualMiner's user-facing behavior. Read this index, then the feature file, before driving. Procedure (launch, doctor, evidence, cleanup): [`../SKILL.md`](../SKILL.md).

## Baseline preconditions

- `scripts/doctor.sh` prints `doctor: worth driving` (from `.agents/skills/verify-perpetualminer/`).
- Every run goes through `scripts/drive.sh <run-id> …`, so it has its own `TMPDIR`, its own Chromium profiles and its own evidence directory. Never reuse another agent's run ID.
- The extension is the repo root, loaded unpacked into a fresh Chromium profile per test; the fixture closes the install's Boas-vindas tab and clears the "Configuração pela metade" reminder (`pm_boas_vindas`), so every test starts as a person who finished setup. `test.use({ manterAbaDaInstalacao: true })` and `test.use({ lembreteDaConfiguracao: true })` bring them back.
- Anki, Gemini and Google are fakes in `e2e/fakes/` (`fakes.anki`, `fakes.gemini`, `fakes.google`). The Anki fake is on by default with an empty vocabulary; `fakes.anki.desligar()` makes it refuse like Anki closed.
- Fixture pages: `paginas.url('player.html')` (fake player with a caption), `texto.html` (selectable text), `sem-video.html`. UI copy is Portuguese from `lib/voz/catalogo.js`.

## Driving conventions

- Recipes below name a spec file and a `-g` title substring. Run them as `scripts/drive.sh <run-id> <spec> -g "<substring>"`; the commands are literal, keep the quoting.
- Locate by role and accessible name, never by CSS position. The few `.veio-…`/`perpetualminer-overlay .pm-…` classes used are the ones the existing specs already use (the overlay's drawings live in a Shadow DOM, outside the accessibility tree).
- Time is frozen in the specs (`2026-09-18T12:00:00`); keep it.
- Anki `Envio` results are driven by the test through `fakes.anki.moverEnvio(jobId, …)` / `concluirEnvio(jobId, { duplicadas, falhas })`, as the bridge would.
- Never `--update-snapshots`; never start the real bridge.

## Proof and skip reporting

- Proof = the screen the person saw (PNG via `fotografar`) + the stored state (`registrarEstado` JSON or the spec's own `extensao.frases()` assertion) + the Playwright `run.log` showing the test passed.
- Specs that do not call `fotografar` leave only `run.log` and `report.json`: for UI proof of those, add a `fotografar` call in a scratch copy (`zz-scratch-*.spec.js`) at the state you claim.
- Record the feature ID and entry point with every artifact (put them in the file name: `mineracao-selecao-atalho.png`).
- Report an unreachable path with the attempted command and the unmet precondition. Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behavior, then exactly four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with the Playwright e2e harness`, `Gotchas`. Keep implementation details out; name user paths, stable handles, state, commands and observable proof.

## Features

- [Mine a phrase](./mineracao.md): caption shortcut and floating button, selection shortcut, context menu, popup quick mining.
- [Frases list in the panel](./frases.md): cards, search and filters, selection bar, delete/edit.
- [Anki connection and send](./anki.md): the Conexão com o Anki area and the Envio ao Anki with its summary.
- [Boas-vindas (first run)](./boas-vindas.md): the 6-step setup opened by installing the extension.
- [Mine from a photo](./minerar-foto.md): `bookreader.html`, Gemini reading marked book pages.

## Other surfaces (not driven through the browser)

- **Python bridge** (`bridge/`): `python3 bridge/test_envio.py` (43 tests, no Flask). `bridge/test_anki_launcher.py` and `bridge/test_envio_api.py` need Flask: `scripts/preparar-python.sh`, then `.venv/bin/python -m unittest discover -s bridge -p "test_*.py"`. The routes the panel uses (`GET /health`, `/jobs`, `/analytics/jobs`, `/anki/…`) are described in `bridge/README.md`; the e2e Anki fake follows the same contract (`bridge/envio.py` docstring). Starting the real bridge launches Anki Desktop: not part of this skill.
- **Engine** (`engine/`, the card pipeline): `(cd engine && python3 -m unittest discover -p "test_*.py")` (needs `engine/requirements.txt`; see `engine/CLAUDE.md`).
- **Anki add-on Connection server** (`complemento/`): `python3.9 complemento/test_*.py` (also `python3.13`; its `LEIA-ME.md` lists them), plain stdlib HTTP, `GET /health` open to any local client and everything else (`POST /anki/decks`, `/anki/stats/decks`, `/anki/vocabulary`) requiring the extension's origin. It reads the collection through an adapter; the tests use an in-memory one and the Anki one runs only inside a real Anki (the owner's rehearsal on the Mac, `complemento/LEIA-ME.md`). The contract is `complemento/contrato/exemplos.json`, read by the add-on tests and by `e2e/tests/contrato-da-conexao.spec.js`.
- **Not mapped yet** (specs exist in `e2e/tests/`): Configurações (Conta & sync, Atalhos, Chave do Gemini, Aparência, Zona de perigo: `configuracoes-*.spec.js`), automatic mining (`mineracao-automatica-*.spec.js`), popup cards (`popup.spec.js`), Baralhos e Vocabulário (`painel-anki-baralhos.spec.js`), Web Store packaging (`node test_empacotar.js`).
