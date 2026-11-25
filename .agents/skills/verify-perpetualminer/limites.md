# Known limits

Part of [`SKILL.md`](./SKILL.md). Read it before writing what a proof does not cover (proof standard 6). The limits of the helper scripts are in [`ajudantes.md`](./ajudantes.md) § Known gaps; the feature map's, in [`mapa-de-features.md`](./mapa-de-features.md).

- The harness fakes Anki, Gemini and Google; nothing here talks to a real Anki Desktop, Gemini or Firestore.
- The context menu, toolbar badge, midnight alarm and extension update are simulated by calling the function Chrome would call.
- Evidence screenshots exist only where a spec calls `fotografar`; other specs leave `run.log` and `report.json`.
- Windows is the owner's machine; this skill was proven on Linux headless Chromium, and on a Mac (macOS 15, `/bin/bash` 3.2, headless) for `doctor.sh`, `drive.sh`, `cleanup.sh`, `test_helpers.sh` and `conexao-real.py`. On the Mac `painel-frases-selecao.spec` › `Copiar frase põe o texto` fails (it pastes with Control+V). On any host, `painel-envio-estados.spec` › `na aba Custos, o Envio com as Frases apagadas` fails while the local date is not the UTC date (it dates its Envios with the real clock in UTC, and Custos asks for the local month). `.claude/skills/verify-perpetualminer` is a symlink to this directory (one canonical copy); a Windows checkout without symlink support sees a plain file there, so open `.agents/skills/verify-perpetualminer/` directly.
- The Anki add-on (`complemento/`) is mapped in `features/ia.md` (the key), `features/anki-no-login.md` (the login item) and `features/anki.md` › `anki-open-alone` (the opener); its own tests run with `PYTHON=python3.9|python3.13 node scripts/testar.mjs complemento`. Baralhos e termos and Vocabulário: `features/anki-baralhos.md`.
- The add-on's read side (the Anki adapter) is proven only against a fake `mw`; a real Anki is the owner's rehearsal.
- The OpenAI key was never checked against the real OpenAI: its provider and Firestore are the repo's fakes, even in the real Conexão drive.
- The `--update-snapshots` rule is stated in SKILL.md § Drive and in `features/README.md`; the `aprovacao-visual` check owns it.
