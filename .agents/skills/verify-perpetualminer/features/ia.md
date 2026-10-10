# The AI card: the OpenAI key (Configurações › IA dos cartões)

The card that sets up who writes the card text. Two entries side by side in equal columns: **Chave da OpenAI** (works) and **Conta do ChatGPT** (shown, button disabled, arrives with #155). A person pastes an OpenAI key; the Conexão com o Anki checks it against OpenAI and keeps a private copy; the card shows "Chave conferida" with the key masked (`••••••••9f3a`). The same card is step 5 of the Boas-vindas.

## Sub-features

- `ia-card` Configurações › IA dos cartões: both columns the same size, the project-with-spending-limit and "revogue a chave" advice, the image-always-by-key line; below ~620 px the columns stack.
- `ia-paste` paste the key, Conferir e salvar (or Enter): checked, masked, toast `Chave da OpenAI conferida e salva`, Trocar chave opens an empty field.
- `ia-errors` chave recusada, sem crédito, organização não verificada, OpenAI fora do ar, Conexão sem responder: a strip across the card naming "Chave da OpenAI", what to do, and Detalhes; nothing is stored.
- `ia-copy` the Conexão's copy is confirmed by non-secret version, never suffix alone. Every change clears the previous confirmation before checking; older/re-delivered HTTP writes cannot undo a persisted removal.
- `ia-session-isolation` Firebase bearer/refresh tokens live in extension-origin IndexedDB `pm-sessao` (legacy readable tokens migrate and are removed), so content scripts cannot use the session to retrieve the cloud key.
- `ia-delete-failure` local key removal failure shows a persistent retry + Detalhes; Apagar tudo names the partial result. Cloud key/tombstone failure remains in Conta & sync with its own key-only text (CFG-41), never claiming synced phrases are only local; its retry also retries the key.
- `ia-wipe-pending` Apagar tudo removes every locally pending account's secret in one transaction; only UID-bound secret-free removal marks survive. Another UID's mark waits for its authentication and retains the removed copy's time, so that UID's newer remote key survives.
- `ia-concurrent-confirm` concurrent panels at the same millisecond reserve different generations before HTTP; the latest COMMITTED change wins locally. A later failed confirmation does not hide the earlier accepted key or leave an untracked Conexão copy. The server refuses equal-version writes with a different key (identical retry stays idempotent).
- `ia-sync-priority` phrase and key outcomes remain separate: key-only retry never hides a phrase failure/partial state, and CFG-41 requires an actual local key/removal to sync. Access refusal/session expiry use CFG-04/CFG-08, not transient-key retry (also without a local key).
- `ia-storage` where the key lives: whole key only in the extension's IndexedDB (`pm-segredos`) and the Conexão's copy, only the last 4 characters in `chrome.storage.local` (`pm_chave_openai`), out of reach of the content script.
- `ia-account` with a Google account the key follows the account (#154): pasting it writes `usuarios/{uid}/segredos/openai` in Firestore, opening the panel on another computer of the account brings it (extension and that computer's Conexão copy), Trocar chave replaces it everywhere; the note says "Vai junto com a sua conta Google…" (without an account, "Fica neste computador…").
- `ia-delete` Apagar chave (danger outline → Veio modal, Cancelar focused) and Apagar tudo (its modal adds the key sentence only when a key is stored) take the key out of the three places and leave the tombstone `{ apagada: true, em }` in Firestore, so an older copy on another computer is removed there instead of coming back; a Conexão that was off loses its copy when it answers again.
- `ia-boas-vindas` the same card as Boas-vindas step 5 (`#boas-vindas/ia`), done when the key is checked.

## How to get to it (user POV)

- Panel › Configurações › IA dos cartões, or `chrome-extension://<id>/painel.html#configuracoes/ia` (opens the card and focuses the field when there is no key).
- Boas-vindas › step "Configurar a IA dos cartões" (`#boas-vindas/ia`).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The Conexão is the Anki fake: `fakes.anki.responderOpenAI('aceita' | 'recusa' | 'sem_credito' | 'org_nao_verificada' | 'limite_de_uso' | 'limite_so_no_pago' | 'fora_do_ar')` says how OpenAI answers the check, `fakes.anki.chaveNaConexao()` is the copy the Conexão kept (null: none), `fakes.anki.desligar()` makes it unreachable. It answers from `complemento/contrato/exemplos.json`, the same file the add-on's own tests read. Real OpenAI is never reached.

- **Card (`ia-card`).** `drive.sh ia-card configuracoes-ia.spec -g "sem chave: as duas entradas"`. Observable: both columns with equal width and top, the `Plus ou Pro` badge, the disabled `Continuar com o ChatGPT`, the closed-row summary `Sem chave`. Narrow: `-g "abaixo de ~620 px"`.
- **Paste (`ia-paste`).** `-g "colar a chave: a Conexão a confere"`. Observable: `Chave conferida`, `••••••••9f3a`, the toast, the Conexão's copy equal to the pasted key, `pm_chave_openai` = `{ ultimos4: '9f3a' }`, and the whole `chrome.storage.local` dump without the key.
- **Errors (`ia-errors`).** `-g "a OpenAI responde"` runs the OpenAI answers (key refused, no credit, usage limit on either call, organization not verified, unreachable); `-g "com a Conexão desligada, a faixa"` the unreachable Conexão. Observable: the strip (`role=alert`) naming `Chave da OpenAI`, the action button, Detalhes (`HTTP 402 · openai_no_credit`), the pasted text kept in the field, nothing stored.
- **Copy (`ia-copy`).** `-g "a chave guardada na extensão volta à Conexão"`, `-g "se a Conexão sem a cópia recusa a chave"`.
- **Regression proofs.** `configuracoes-ia.spec -g 'N1:|N2:|N3:|J1:|F1:|F4:|F5:|PATCH recusado|trocar para B|P4:|S1:|S3:|S4:'` drives account switching after a refused upload, same-suffix versions, switching to another account's older key (new local HTTP generation), pending cloud deletion, stale copy confirmation and both local-delete errors. `node test_chave_da_openai.js` drives the real vault and sync modules in two independent contexts with storage/HTTP boundaries faked. `complemento/test_chave_da_openai.py` suspends OpenAI validation behind a real HTTP request, deletes, then verifies refusal both before and after restart.
- **Storage (`ia-storage`, `ia-session-isolation`).** `-g "o content script e o overlay não alcançam a chave"`: reads the content script's isolated world over CDP.
- **Account (`ia-account`).** `-g "com conta, colar a chave"`, `-g "a chave colada em outro computador da conta chega sozinha"`, `-g "com conta, Trocar chave troca nos três lugares"`. Seed the account with `extensao.semearSessao({ uid })`; another computer's key is `fakes.google.gravarChaveDaOpenAI(uid, { chave, em })`, and `fakes.google.chaveDaOpenAIDe(uid)` is what the account's cloud keeps. Observable: the masked key and the account note, the IndexedDB key, the Conexão copy, the Firestore document.
- **Delete (`ia-delete`).** `-g "Apagar chave"` (with and without an account, and with the Conexão off), `-g "a chave apagada em outro computador"` (tombstone wins), and `configuracoes-chave-perigo.spec -g "chave da OpenAI"` (Apagar tudo). Observable: the modal copy, the toast `Chave da OpenAI apagada`, `Sem chave`, IndexedDB `''`, `pm_chave_openai` gone, `fakes.anki.chaveNaConexao()` null, the Firestore tombstone without a `chave` field.
- **Boas-vindas (`ia-boas-vindas`).** `drive.sh ia-bv boas-vindas.spec -g "passo 5: o card IA dos cartões"`.

## Gotchas

- The extension never talks to OpenAI (no host permission): the Conexão checks the key, so with the Conexão off there is no way to check, and the strip says so.
- The key shown is only its end: the screen never knows more than `ultimos4`, so a "key is on screen" assertion should look for the 4 characters, not the whole key.
- A rejected key never replaces the one already stored; Cancelar in Trocar chave keeps it too.
- The two-computer merge itself (arrival, swap, tombstone, a key pasted after the tombstone) is proven in Node by `node test_sync.js` (section CHAVE); `test_chave_da_openai.js` additionally uses the real key vault in two contexts (only storage and HTTP are fakes); the e2e side plays "the other computer" by writing the Firestore fake.
- The fake keeps the copy in memory per test; a new test starts with no copy. Seed one with `fakes.anki.guardarChaveNaConexao('9f3a')`.
- The visual references for the card (`configuracoes-visual.spec.js` `ia-*`, including `ia-conferida-com-conta` and `ia-apagar-modal` from #154, `boas-vindas-visual.spec.js` `passo-5-ia*`) and the new other-account/local-delete-error/partial-wipe states, plus `conta-chave-pendente.png` (CFG-41), are `test.fixme` until the owner approves the look; do not freeze them (never `--update-snapshots` without that approval) and keep the key field masked in any capture.
