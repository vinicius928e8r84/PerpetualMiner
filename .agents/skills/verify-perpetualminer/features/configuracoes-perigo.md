# Zona de perigo

Configurações › Zona de perigo has one action, **Apagar todas as frases**: it deletes the whole history, behind a confirmation. Without an account it reaches only this computer; with an account it reaches every computer on it (the cloud too) and, if the OpenAI key is there, the key too.

## Sub-features

- `perigo-local` without an account: `Apagar tudo aqui não dá para desfazer.`, `3 frases neste computador`, the button `Apagar todas as 3 frases`; it opens a dialog `Apagar todas as 3 frases?` (`Elas somem deste computador.`) with the focus on **Cancelar**; Esc or Cancelar closes it, returns the focus to the entry and deletes nothing; confirming deletes the history, shows `Todas as frases foram apagadas` (CFG-18) and sets the sidebar total to `0`. With one phrase everything is in the singular (`Apagar 1 frase`).
- `perigo-empty` with no phrase the entry is disabled and says `Nenhuma frase para apagar` (the card: `Nenhuma frase no histórico`, the closed row `Nenhuma frase`); no dialog exists.
- `perigo-account` with an account: `… vale para todos os computadores da sua conta.`, `2 frases em todos os computadores da sua conta`; the dialog says `Elas somem deste computador e de todos os outros conectados à sua conta. Não dá para desfazer.`; the toast comes only when the cloud is empty. While the cloud has not answered the card does not pretend there are no phrases (no entry, no `Nenhuma frase no histórico`).
- `perigo-openai-key` with an account and the OpenAI key, the dialog adds `A chave da OpenAI também sai, da sua conta e da Conexão com o Anki.` and the key leaves the cloud (versioned empty value), the extension and the Conexão; without a key the dialog does not mention it ([ia.md](./ia.md) › `ia-delete`).
- `perigo-cloud-down` with an account and the cloud down: the local history is emptied and kept as a pending wipe (`pm_apagar_tudo` with `uid` and `ate`), the chip says `Sem sincronizar` and **no** toast says everything was deleted; when the cloud returns, the phrases (those of this computer and those another computer had put there before the wipe) do not come back, and a phrase mined after the wipe stays; `pm_apagar_tudo` is then `{}`.
- `perigo-many` with an account and more phrases than one tombstone request holds (the tombstone mask travels in the URL, and the Firestore refuses a URL over 16 KB, about 350 phrases): every phrase still leaves the cloud and gets its tombstone, `pm_apagar_tudo` does not stay pending and the chip returns to `Sincronizado`. Deleting a 400-phrase selection in Frases leaves the 400 tombstones too.
- `anki-wipe-phrases` the Envio's own copy of the Frases is cleared too: [anki.md](./anki.md).

## How to get to it (user POV)

- Sidebar › **Configurações** › **Zona de perigo**, or `painel.html#configuracoes/perigo`.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. Phrases are seeded with `extensao.gravarStorage({ frases })`; an account with `extensao.semearSessao({ uid })` plus `fakes.google.gravarFrases(uid, frases)`; the cloud is `fakes.google` (`ficarForaDoAr()`, `segurarLeituras()`, `frasesDe`, `apagadasDe`). The spec fails if a native dialog opens.

- **Without an account.** `drive.sh perigo configuracoes-chave-perigo.spec -g "sem conta"`. Observable: Cancelar focused; after Esc `frases()` still has 3 and `#shell-total` is `3`; after confirming `frases()` is `[]`, `#shell-total` `0`, toast CFG-18, the entry `Nenhuma frase para apagar` disabled. `-g "com 1 frase"`, `-g "sem frases, a entrada"`.
- **With an account.** `-g "com conta: o alcance"`: `fakes.google.frasesDe(uid)` is `[]` and local `frases()` too. `-g "com conta e a chave da OpenAI"`: the Conexão fake holds no key (`fakes.anki.chaveNaConexao()` null), the cloud holds the versioned empty value, `pm_chave_openai.ultimos4` is empty. `-g "sem a chave da OpenAI"`: the dialog does not say `chave`. `-g "enquanto a nuvem não responde"`.
- **Cloud down.** `drive.sh perigo-nuvem configuracoes-chave-perigo.spec -g "nuvem fora do ar"` (with `TEST_EVIDENCE_DIR=<dir>` set the spec also writes `apagar-tudo-*.png` and `apagar-tudo-recuperacao.json`; `drive.sh` sets `PM_EVIDENCE_DIR`, not that one). Observable: offline `pm_apagar_tudo` has `ate` at or after the other computer's phrase id; after the cloud returns `apagadasDe(uid)` lists every deleted id, `frases()` only the phrase mined after.
- **Many phrases (`perigo-many`).** `drive.sh perigo-muitas painel-apagar.spec -g "400 frases"`. Observable: `fakes.google.frasesDe(uid)` is empty and `apagadasDe(uid)` lists the 400 ids (the fake refuses a URL over 16 KB, as the real Firestore does); for the wipe, `pm_apagar_tudo` is gone.
- **Visual.** `configuracoes-perigo-visual.spec.js` compares against committed Linux references; never `--update-snapshots`.
- **Motion.** `-g "movimento reduzido"` (the new-card flash and the key dot stay still).

## Gotchas

- The cloud is `fakes.google`; the real Firestore rules are the owner's. Say so in any proof of `perigo-account` or `perigo-cloud-down`.
- The toast is transient: specs freeze the page clock (`relogioParado`) when they read stored state under load; do the same.
- `Apagar tudo` is irreversible in the product; in the harness each test has its own throwaway profile, so nothing real is touched.
