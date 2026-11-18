# The Conexão's variants and the platforms

Part of [`SKILL.md`](./SKILL.md). Read it when a slice touches the Conexão com o Anki (the key, sync, any route that carries state), and when a proof says which system it ran on.

## Platforms

| | Linux (this skill) | Mac | Windows |
|---|---|---|---|
| Extension in Chromium | e2e harness, headless | owner | owner (Chrome 153 has no `--load-extension`: load the folder in chrome://extensions) |
| Conexão (Python) | `scripts/conexao-real.py`, outside Anki | inside Anki (owner) | inside Anki (owner) |
| Opener (Native Messaging, `anki-open-alone`) | none: `abridor.deste_computador` returns None; the e2e uses a fake host | registered in Chrome's host folder only | registered in HKCU\Software\Google\Chrome; found by Chrome 153 and Opera GX 136 |
| Login item (`anki-no-login`) | none: `/abrir-com-o-computador` answers 501 `login_item_unsupported` | LaunchAgent | Startup-folder shortcut |
| Key file mode | 0600 | 0600 | inherits the folder ACL (no 0600; see `docs/seguranca/chave-da-openai.md`) |

A proof says which column it ran in. The Linux cells come from `item_de_login.deste_computador` and the opener's `deste_computador` returning None outside Mac and Windows (`test_item_de_login.py`); `conexao-real.py` is created without a login item, so it answers 501 on any system and does not prove the Linux decision. The Mac and Windows columns are facts cited from `complemento/LEIA-ME.md` and the owner's Windows run of PR 205, not something this skill proves. Owner steps for Mac/Windows: `complemento/LEIA-ME.md`.

## The 8 variants of the Conexão

A slice that touches the Conexão com o Anki (the key, sync, any route that carries state) is proven in each of these 8 variants, or says in writing which one does not apply and why. The same list is in `docs/design/modelo-fatia-alta.md` § 4. "Today" is how the e2e reproduces it now; "Missing" is a mode the Anki fake does not have yet.

| # | Variant | Today | Missing |
|---|---|---|---|
| 1 | No Conexão | `fakes.anki.desligar()` (`configuracoes-ia.spec.js`: `N2:`, "com a Conexão desligada…") | |
| 2 | Anki closed | `configuracoes-ia.spec.js -g 'K3:'`: the add-on runs inside Anki, so closed means nothing on 8766, `fakes.anki.desligar()` | |
| 3 | Old add-on (0.1.0, unversioned state) | `configuracoes-ia.spec.js -g 'K4'` (`K4:` and `K4-delete:`), built by hand with `fakes.anki.responder('POST', '/ia/estado', …)` without `versao`; `guardarChaveNaConexao(…)` only seeds the key | an old-version mode of the fake |
| 4 | An add-on version without the key routes | `configuracoes-ia.spec.js -g 'B1:'`, a 404 set per route with `fakes.anki.responder('POST', rota, …)` | a mode of the fake that 404s every key route |
| 5 | Two profiles or accounts on one Conexão | `chave-autoridade.spec.js -g 'K1:'` (a second Chromium profile), `-g 'K1-delete:'`, `-g 'P1'` | |
| 6 | Coming from `main` (legacy store, no UID) | `chave-autoridade.spec.js -g 'K2:'`, `-g 'P1 legado:'` | |
| 7 | Lost answer or panel closed | `chave-autoridade.spec.js -g 'R1'` (`R1:` and `R1 autoridade`) | |
| 8 | Repeated request | `chave-autoridade.spec.js -g 'K1-PC:'` | |

There is no helper yet that runs one test over the variants; until it lands, name the variant in the test title or in a comment.
