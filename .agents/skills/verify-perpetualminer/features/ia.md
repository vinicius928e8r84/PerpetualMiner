# IA dos cartões

Configurações › IA dos cartões and Boas-vindas step 5 mount the same card: OpenAI key works, ChatGPT login awaits #155. Copy is CFG-35/41/42. **Option B:** only the Conexão owns a local secret; the extension caches mask/UID/revision/unsent flag, never a second key.

## Feature IDs and paths

- `ia-card`: equal columns, advice on spending limit/revocation, image-by-key line; stacked below ~620 px.
- `ia-paste`: paste/Enter, Conferir e salvar, masked summary/toast; Trocar chave opens empty.
- `ia-errors`: refusal, credit, organization, OpenAI/Conexão unavailable; persistent entry-naming strip + retry/Detalhes, no false save.
- `ia-copy`: read the real owner's nonsecret state on opening/reopening and every completed health check, including late acceptance without Google or reconnection. Accepted lost replies survive; identical replay is a read, not another validation or revision.
- `ia-storage`: whole local key only in add-on `user_files/chaves/openai.json`; Chrome storage has one public cache, old `pm-segredos` is cleared during migration/wipe.
- `ia-session-isolation`: Firebase bearer/refresh tokens in extension-origin IndexedDB `pm-sessao`, legacy readable credentials migrated/removed; content-script CDP proof.
- `ia-account`: Conexão replicates `usuarios/{uid}/segredos/openai` through Firestore with transient bearer. Arrival, change (including same suffix) and deletion become the real owner; no repeated OpenAI check on download.
- `ia-account-isolation`: failed A upload cannot move to B or silently discard A. Finish A's unsent change before automatic replacement by B (CFG-42); a synced A may be replaced by B's older key. An unbound key (including `conta: ''`) cannot go to the first requesting A/B profile: paste/check again in the chosen account. Exact-proof legacy UID migration prevents exporting an old A key to B; a divergent legacy is retained pending an explicit choice, but the screen shows the Conexão's mask and unbound-account hint. Cache failure after accepted deletion must not keep the old “Conexão guarda” claim; a newer accepted key during a held deletion reply remains visible.
- `ia-optional`: no known key or pending deletion + unavailable optional Conexão does not turn successful phrase sync into a key error; once connected, cloud arrival still works.
- `ia-delete`: explicit deletion also clears divergent legacy, without trying to bind it; danger outline + Veio modal; owner and account get empty value/new time. No per-UID marks. Apagar tudo clears every old secret copy, including `conta:<uid>`.
- `ia-delete-failure`: persistent retry/Detalhes, partial wipe result; key sync outcome never hides phrase failure or authentication errors. CFG-41 does not claim an already-uploaded key never arrived.

## Driving and reading the actual values

Launch/doctor/drive/cleanup: parent `SKILL.md`; heavy runs sequential under `/tmp/pm-heavy.lock`. Only fake keys. Never update visual snapshots without owner approval.

- Card/paste/error/layout: `configuracoes-ia.spec.js -g 'sem chave:|colar a chave:|a OpenAI responde|com a Conexão desligada|abaixo de ~620 px'`.
- Owner regressions: `chave-autoridade.spec.js` covers N1, L1, R1 (abort/reload/late acceptance), same-suffix change/deletion, legacy P1 and F4. Check `fakes.anki.chaveNaConexao()`, `estadoDaChave()`, `fakes.google.chaveDaOpenAIDe(uid)` and `extensao.lerStorage('pm_chave_openai')`. `pm-segredos/chaves.getAll()` must have no secrets after completed migration/wipe.
- Pending/auth outcomes: `configuracoes-ia.spec.js -g 'N2:|N3:|R2:|F1:|S1:|S4:|PATCH recusado|trocar para B'`. The key cloud seam is now the add-on: `fakes.anki.responderFirebase(status)`; Firestore fake still owns shared cloud records and write refusals. Never intercept browser key-REST requests that no longer exist.
- Isolation: `configuracoes-ia.spec.js -g 'o content script e o overlay não alcançam a chave'`; session tests in `configuracoes-conta.spec.js`. Read the isolated world over CDP, not only page-world storage.
- Server: `PYTHON=python3.9 node scripts/testar.mjs complemento`, also 3.13. Real HTTP tests cover owner CAS, two add-ons with shared external Firestore, refused uploads, HTTP timeout/restart/replay and credential secrecy. `contrato-da-conexao.spec.js` / `test_fake_anki.js` share exact contract examples with the real add-on.
- Unavailable Conexão: there is no second key to restore. Reads are uncertain and save/wipe cannot falsely declare success. Key-only failure leaves synced phrases true; phrase failure stays visible during key retry.

## Boundaries and owner gates

Chromium/product modules and Python owner/HTTP are real in these tests; OpenAI, Firebase and the Anki collection are external fakes. This is **not** proof of real provider login/rules or two physical computers. P6 remains PENDING OWNER (own-UID read/write, cross-UID and unauthenticated refusal). Physical Mac/Windows/Anki/OpenAI/Google rehearsal and visual approval remain with owner.

`configuracoes-visual.spec.js` / `boas-vindas-visual.spec.js` references remain `test.fixme`; capture review evidence, never freeze new PNGs. Cloud timestamp ordering/availability/legacy-migration limits are in `docs/seguranca/chave-da-openai.md`.
