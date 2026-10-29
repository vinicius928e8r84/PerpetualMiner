# The AI card: the OpenAI key and the ChatGPT login

Configurações › IA dos cartões and Boas-vindas step 5 show the same card. A person pastes an OpenAI key; the Conexão checks it with OpenAI, keeps the only whole copy (`user_files/chaves/openai.json`), and the extension keeps only a public cache (mask, account, revision, unsent flag), never a second key. With a Google account the key follows the account through the Conexão (arrival, Trocar chave, Apagar chave, Apagar tudo). ChatGPT login awaits #155. Copy: CFG-35/41/42.

## Sub-features

Codes such as K1, N2 and P1 are the names the PR 204 review rounds gave each scenario; the spec titles start with them.

- `ia-card`: equal columns, advice on spending limit/revocation, image-by-key line; stacked below ~620 px.
- `ia-paste`: paste/Enter, Conferir e salvar, masked summary/toast; Trocar chave opens empty.
- `ia-errors`: refusal, credit, organization, OpenAI/Conexão unavailable; persistent entry-naming strip + retry/Detalhes, no false save.
- `ia-copy`: read the real owner's nonsecret state on opening/reopening and every completed health check, including late acceptance without Google or reconnection. Accepted lost replies survive; identical replay is a read, not another validation or revision. Passive reads of another account do not trigger sync: `K1` uses two independent Chromium profiles sharing one Conexão; only an unsent change of the current session requests replication.
- `ia-storage`: whole local key only in add-on `user_files/chaves/openai.json`; Chrome storage has one public cache, old `pm-segredos` is cleared during migration/wipe.
- `ia-session-isolation`: Firebase bearer/refresh tokens in extension-origin IndexedDB `pm-sessao`, legacy readable credentials migrated/removed; content-script CDP proof.
- `ia-account`: Conexão replicates `usuarios/{uid}/segredos/openai` through Firestore with transient bearer. Arrival, change (including same suffix) and deletion become the real owner; no repeated OpenAI check on download.
- `ia-account-isolation`: failed A upload cannot move to B or silently discard A. Finish A's unsent change before automatic replacement by B (CFG-42); a synced A may be replaced by B's older key. An unbound key (including `conta: ''`) cannot go to the first requesting A/B profile: paste/check again in the chosen account. Exact-proof legacy UID migration prevents exporting an old A key to B; a divergent legacy is retained pending an explicit choice, but the screen shows the Conexão's mask and unbound-account hint. Cache failure after accepted deletion must not keep the old “Conexão guarda” claim; a newer accepted key during a held deletion reply remains visible.
- `ia-optional`: no pending change or deletion, including an already-replicated key, + unavailable optional Conexão or today's bridge (`/ia/estado` 404) does not turn successful phrase sync into a key error; once supported/connected, cloud arrival still works. Pending changes with that bridge require update. Bearer is sent only after a complete versioned owner state, never on 404 or malformed 200; this is protocol detection, not #192 pairing.
- `ia-upgrade`: main users with key + Google paste/check again in the chosen account; CFG-42 opens Trocar chave. Install add-on 0.2.0 first. A 0.1.0 state without revision/account/flag yields an update/download action, not a false no-response claim; no mutation is sent to that owner. Apagar chave/Apagar tudo check support before clearing legacy/cache, preserve the old mask through reload, and show update/download.
- `ia-confirm-idempotent`: `chave-autoridade.spec.js -g K1-PC`: confirm once, then paste and check the same key three times; v1 stays v1, and owner, time, flag, cloud and cache do not change; the health check neither reconfirms nor starts an upload. Only the four explicit POSTs (the first plus three) are needed to prove the whole value; do not compare suffixes or cache the secret in the client. Real HTTP/CAS: `complemento/test_chave_da_openai.py` (`tres_reconfirmacoes`, `reconfirmar_preserva`). The Windows ACL is a Known limit, neither tested nor fixed here.
- `ia-delete`: a key bound to a different signed-in account offers only Trocar chave, not Apagar chave. Signed out, a linked key offers local-only deletion in both entry points, with no cloud key erased; login can bring the account's key back. Its note does not ask to link it again. Fresh owner read/CAS protects the signed-in foreign-owner case, including an already-open modal and Apagar tudo, from creating the current account's tombstone. Specific refusal copy explains what stayed and offers Trocar chave without retry; the wipe modal promises no key deletion in this case. For an eligible owner, explicit deletion also clears divergent legacy, without trying to bind it; danger outline + Veio modal; owner and account get empty value/new time. No per-UID marks. Apagar tudo clears every old secret copy, including `conta:<uid>`.
- `ia-chatgpt` (#155): the Conta do ChatGPT column. Continuar com o ChatGPT asks the Conexão for the official authorize URL (dynamic client, PKCE S256, return on `127.0.0.1:8766/auth/callback`) and opens it in a tab; “Esperando o ChatGPT…” re-reads `POST /ia/chatgpt/estado`; logged in, “Usando o plano do ChatGPT · Gerenciar uso” and Sair do ChatGPT; refusal/Conexão-off strips open with “Conta do ChatGPT:”. Tokens only in the add-on's `user_files/chaves/chatgpt.json`, never in Chrome storage; with the login, the Envio's card text goes through the Responses API (no `temperature`, `instructions`, `stream: true`), never silently through the key.
- `ia-delete-failure`: persistent retry/Detalhes, partial wipe result; key sync outcome never hides phrase failure or authentication errors. CFG-41 does not claim an already-uploaded key never arrived.

## How to get to it (user POV)

- Sidebar › Configurações › the **IA dos cartões** card, or `painel.html#configuracoes/ia`.
- Boas-vindas › step 5 (`#boas-vindas/ia`).
- Signing out: Configurações › Conta & sync › **Sair da conta**; then the card offers local-only deletion (`ia-delete`, `O1:`; see [conta.md](./conta.md)).

## Driving it with the Playwright e2e harness

Each line is `scripts/drive.sh <run-id> <command>`; the filters are regexes (SKILL.md § Drive), kept literal.

- `ia-card`: `configuracoes-ia.spec -g "sem chave: as duas entradas|abaixo de ~620 px"`
- `ia-paste`: `configuracoes-ia.spec -g "colar a chave:|Enter no campo|Trocar chave abre o campo vazio"`
- `ia-errors`: `configuracoes-ia.spec -g "a OpenAI responde|com a Conexão desligada, a faixa"`
- `ia-copy`: `chave-autoridade.spec -g "R1:|R1 autoridade|L1:"`
- `ia-storage`, `ia-session-isolation`: `configuracoes-ia.spec -g "o content script e o overlay"`
- `ia-account`: `chave-autoridade.spec -g "a conta traz mudança|K2:"` and `configuracoes-ia.spec -g "trocar para B|a chave de uma conta Google não sobe"`
- `ia-account-isolation`: `chave-autoridade.spec -g "P1:|P1 legado|legado divergente|N1:"` and `configuracoes-ia.spec -g "PATCH recusado"`
- `ia-optional`: `configuracoes-ia.spec -g "N2:|K3:|B1:"`
- `ia-upgrade`: `configuracoes-ia.spec -g "K4:|K4-delete:"`
- `ia-confirm-idempotent`: `chave-autoridade.spec -g "K1-PC"`
- `ia-delete`: `chave-autoridade.spec -g "K1-delete:|O1:|A3:|F4:"`
- `ia-chatgpt`: `configuracoes-chatgpt.spec` (the whole file: column, login with the fake, waiting, refusal, Sair, Conexão off) and `python3.9 complemento/test_login_do_chatgpt.py` / `test_plano_do_chatgpt.py` for PKCE, the return, the tokens file and the Responses API request. `auth.openai.com` is mapped to the local fake server by the fixture; observable: `fakes.anki.chatgpt.situacao()`, `fakes.chatgpt.abertas`.
- `ia-delete-failure`: `configuracoes-ia.spec -g "S1:|S4:|R2:|F1:|N3:"`

**Regression proofs of PR 204** (run them on any change to the key, the account or the Conexão): `drive.sh ia-204 chave-autoridade.spec -g "K1: a saúde|K1-PC|P1: uma chave sem conta|O1:"`. They cover the ping-pong between two profiles, the revision advancing on reconfirm, an unbound (`conta: ''`) key exported to the first account, and deleting while signed out. Observable: `fakes.anki.estadoDaChave()` keeps its revision at rest; `fakes.google.chaveDaOpenAIDe(uid)` is unchanged for every account. They run against the fake Conexão; for the real one see SKILL.md § Driving against the real Conexão.

Reading the actual values:

- Owner regressions: `chave-autoridade.spec.js` covers K1/K2 (independent profiles and exact main migration), N1, L1, R1 (abort/reload/late acceptance), same-suffix change/deletion, legacy P1 and F4. Check `fakes.anki.chaveNaConexao()`, `estadoDaChave()`, `fakes.google.chaveDaOpenAIDe(uid)` and `extensao.lerStorage('pm_chave_openai')`. `pm-segredos/chaves.getAll()` must have no secrets after completed migration/wipe.
- Upgrade/delete/bridge: `configuracoes-ia.spec.js -g 'K4-delete:|B1:'` checks old store/cache retention and no bearer without versioned state. `chave-autoridade.spec.js -g 'K1-delete:'` checks two profiles, a changed owner during confirmation and partial Apagar tudo; both cloud keys must remain unchanged. `chave-autoridade.spec.js -g 'O1:'` signs out through the native UI before Apagar chave/Apagar tudo and checks a cleared local owner/cache/legacy, unchanged cloud keys/phrases and the local-only modal.
- Pending/auth outcomes: `configuracoes-ia.spec.js -g 'N2:|N3:|R2:|F1:|S1:|S4:|PATCH recusado|trocar para B'`. The key cloud seam is now the add-on: `fakes.anki.responderFirebase(status)`; Firestore fake still owns shared cloud records and write refusals. Never intercept browser key-REST requests that no longer exist.
- Isolation: `configuracoes-ia.spec.js -g 'o content script e o overlay não alcançam a chave'`; session tests in `configuracoes-conta.spec.js`. Read the isolated world over CDP, not only page-world storage.
- Server: `PYTHON=python3.9 node scripts/testar.mjs complemento`, also 3.13. Real HTTP tests cover owner CAS, two add-ons with shared external Firestore, refused uploads, HTTP timeout/restart/replay and credential secrecy. `contrato-da-conexao.spec.js` / `test_fake_anki.js` share exact contract examples with the real add-on.

## Gotchas

- Launch/doctor/drive/cleanup: parent `SKILL.md`. Only fake keys. Never update visual snapshots without owner approval.
- Unavailable Conexão: there is no second key to restore. Reads are uncertain and save/wipe cannot falsely declare success. Key-only failure leaves synced phrases true; phrase failure stays visible during key retry.
- Chromium/product modules and Python owner/HTTP are real in these tests; OpenAI, Firebase and the Anki collection are external fakes. This is **not** proof of real provider login/rules or two physical computers. P6 remains PENDING OWNER (own-UID read/write, cross-UID and unauthenticated refusal). Physical Mac/Windows/Anki/OpenAI/Google rehearsal and visual approval remain with owner.
- `configuracoes-visual.spec.js` / `boas-vindas-visual.spec.js` references remain `test.fixme`; capture review evidence, never freeze new PNGs. Cloud timestamp ordering/availability/legacy-migration limits are in `docs/seguranca/chave-da-openai.md`.
