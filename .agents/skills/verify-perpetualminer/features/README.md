# PerpetualMiner verification map

The maintained source for verifying PerpetualMiner's user-facing behavior. Read this index, then the feature file, before driving. Procedure (launch, doctor, evidence, cleanup): [`../SKILL.md`](../SKILL.md).

## Baseline preconditions

- `scripts/doctor.sh` prints `doctor: worth driving` (from `.agents/skills/verify-perpetualminer/`).
- Every run goes through `scripts/drive.sh <run-id> …`, so it has its own `TMPDIR`, its own Chromium profiles and its own evidence directory. Never reuse another agent's run ID.
- The extension is the repo root, loaded unpacked into a fresh Chromium profile per test; the fixture closes the install's Boas-vindas tab and clears the "Configuração pela metade" reminder (`pm_boas_vindas`), so every test starts as a person who finished setup. `test.use({ manterAbaDaInstalacao: true })` and `test.use({ lembreteDaConfiguracao: true })` bring them back.
- Anki, Gemini and Google are fakes in `e2e/fakes/` (`fakes.anki`, `fakes.gemini`, `fakes.google`), and so is the Conexão's opener (`fakes.abridor`, a Native Messaging host registered in each test profile; `test.use({ permissaoDoAbridor: true })` gives the optional `nativeMessaging` as Chrome stores it). The Anki fake is on by default with an empty vocabulary; `fakes.anki.desligar()` makes it refuse like Anki closed.
- Fixture pages: `paginas.url('player.html')` (fake player with a caption), `texto.html` (selectable text), `sem-video.html`. UI copy is Portuguese from `lib/voz/catalogo.js`.

## Driving conventions

- Recipes below name a spec file and a `-g` title substring. Run them as `scripts/drive.sh <run-id> <spec> -g "<substring>"`; the commands are literal, keep the quoting.
- Locate by role and accessible name, never by CSS position. The few `.veio-…`/`perpetualminer-overlay .pm-…` classes used are the ones the existing specs already use (the overlay's drawings live in a Shadow DOM, outside the accessibility tree).
- Time is frozen in the specs (`2026-09-18T12:00:00`); keep it.
- Anki `Envio` results are driven by the test through `fakes.anki.moverEnvio(jobId, …)` / `concluirEnvio(jobId, { duplicadas, falhas })`, as the Conexão would.
- Never `--update-snapshots`; never install the add-on into a real Anki. On a loaded host drive with `PM_WORKERS=1`.

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
- [The Card in the Anki](./anki-cartao.md): the note type per language the Conexão creates, the new Baralhos of a new install and the Beginner Card (front: Phrase and audio; back: pronunciation, literal and natural in Portuguese with linked colours, Word audio, image); only in the Anki, not on a screen (#161).
- [The Custos tab with the key and with the plan](./anki-custos-plano.md): US$ spent with the key; with the ChatGPT plan the Cartões made, “Você economizou” and Gerenciar uso ↗; the Envio shows no value (#159).
- [The monthly cap](./anki-teto-do-mes.md): US$ 10 by default, per computer; 80% warning in the Painel, the Envio pauses at 100% with Ver Custos and no value, the cap is adjusted in Custos (#160).
- [Open the Anki with the computer](./anki-no-login.md): Configurações › Conexão com o Anki, the login-item switch.
- [The fixed Anki profile](./anki-perfil.md): Configurações › Conexão com o Anki, the row Perfil do Anki; the Envio that waits on another open profile with Abrir <perfil> (#149).
- [The Estilo do cartão](./anki-estilo.md): Ajustes de envio › Estilo do cartão, the level of each language (Iniciante, Intermediário, Avançado) and the Envio asking for the saved level (#162), and its front (Frase com áudio, Ouvir primeiro, Lacuna), swapped in the Anki by the Conexão on save (#166).
- [The voice and accent of the audio](./anki-voz.md): Ajustes de envio › Avançado, the Google accents, the Voz de reserva and the Ouvir buttons; the audio of the Cartão when Google fails (#174).
- [Boas-vindas (first run)](./boas-vindas.md): the 7-step setup opened by installing the extension.
- [The AI card: the OpenAI key](./ia.md): Configurações › IA dos cartões and Boas-vindas step 5; the key checked by the Conexão, masked, stored out of the content scripts' reach, following the Google account (arrival, Trocar, Apagar chave, Apagar tudo, versioned empty value; #154).
- [Conta & sync](./conta.md): Configurações › Conta & sync, the states of the card and the chip, first upload, partial sync, signing in and out, deleting from the cloud, the session.
- [Mine from a photo](./minerar-foto.md): `bookreader.html`, Gemini reading marked book pages.

## Other surfaces (not driven through the browser)

- **Engine** (`engine/`): `node scripts/testar.mjs engine` (needs `scripts/preparar-python.sh` → `.venv`). It runs only inside the add-on; the routes the panel uses (`GET /health`, `/jobs`, `/analytics/jobs`, `/anki/…`) are in `complemento/contrato/LEIA-ME.md`, and the e2e Anki fake follows the same contract.
- **Engine** (`engine/`, the card pipeline): `(cd engine && python3 -m unittest discover -p "test_*.py")` (needs `engine/requirements.txt`; see `engine/CLAUDE.md`).
- **Anki add-on Connection server** (`complemento/`, on the default branch since #185): plain stdlib HTTP on `127.0.0.1:8766`. `GET /health` is open to any local client; other routes require the extension's origin: `POST /anki/decks`, `/anki/stats/decks`, `/anki/vocabulary`, `/abrir-com-o-computador[/estado]`, `/ia/openai/chave`, `/ia/openai/chave/apagar`, `/ia/estado`, `/ia/openai/sincronizar` and `/ia/openai/legado`. It reads the collection through an adapter: tests use an in-memory one; the Anki one runs inside a real Anki (`complemento/LEIA-ME.md`, owner's rehearsal). Run `PYTHON=python3.9 node scripts/testar.mjs complemento` and with `python3.13`: server/collection/startup, key owner ([ia.md](./ia.md)), login item ([anki-no-login.md](./anki-no-login.md)), package and `test_abridor.py` (Mac script, Windows `.bat` + `.ps1`, manifests and registration, in temporary destinations; `.ps1` executes where `pwsh` exists). Native host discovery/launch on Mac/Windows remains the owner's rehearsal ([anki.md](./anki.md) › `anki-open-alone`). The shared contract is `complemento/contrato/exemplos.json`; `scripts/drive.sh <run-id> contrato-da-conexao.spec` exercises the extension's HTTP examples and the ligada area. With the contract collection open, `painel-anki-baralhos.spec.js` › `com a coleção do contrato aberta, Baralhos e termos e Vocabulário mostram o que o complemento leu` checks both tabs. The Anki-side window (the **PerpetualMiner…** item in Ferramentas, its Config button and the Envio notices, #175) is not driveable by this harness (Qt inside a real Anki): `complemento/test_janela.py` proves the state it reads and the notices with a fake Qt, and the owner's rehearsal (`docs/design/dentro-do-anki.md`) the real window. The owner's Windows handover (#178: the new Conexão finds today's one on 8766, waits for the current Envio, copies the key, the cost history and the edited prompts, removes the auto-start entries and stops the old process) has no route and no screen of its own; `complemento/test_passagem.py` (a fake old Conexão, a fake Windows) and `test_prompts_do_dono.py` prove it, and the real handover on the owner's Windows is the owner's step (`docs/design/passagem-do-windows.md`). There is no feature file for other add-on routes until a person can see them.
- **Not mapped yet** (specs exist in `e2e/tests/`; the per-surface skills `.agents/skills/{configuracoes,popup,painel-anki,overlay,…}/SKILL.md` describe how each works): the rest of Configurações (Atalhos, Chave do Gemini, Aparência, Zona de perigo: `configuracoes-*.spec.js`; the AI card is mapped in [ia.md](./ia.md), Conta & sync in [conta.md](./conta.md)), automatic mining (`mineracao-automatica-*.spec.js`), popup cards (`popup.spec.js`), Baralhos e Vocabulário (`painel-anki-baralhos.spec.js`), Web Store packaging (`node test_empacotar.js`).
