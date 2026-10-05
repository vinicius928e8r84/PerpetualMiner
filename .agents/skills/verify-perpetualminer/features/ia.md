# The AI card: the OpenAI key (Configurações › IA dos cartões)

The card that sets up who writes the card text. Two entries side by side in equal columns: **Chave da OpenAI** (works) and **Conta do ChatGPT** (shown, button disabled, arrives with #155). A person pastes an OpenAI key; the Conexão com o Anki checks it against OpenAI and keeps a private copy; the card shows "Chave conferida" with the key masked (`••••••••9f3a`). The same card is step 5 of the Boas-vindas.

## Sub-features

- `ia-card` Configurações › IA dos cartões: both columns the same size, the project-with-spending-limit and "revogue a chave" advice, the image-always-by-key line; below ~620 px the columns stack.
- `ia-paste` paste the key, Conferir e salvar (or Enter): checked, masked, toast `Chave da OpenAI conferida e salva`, Trocar chave opens an empty field.
- `ia-errors` chave recusada, sem crédito, organização não verificada, OpenAI fora do ar, Conexão sem responder: a strip across the card naming "Chave da OpenAI", what to do, and Detalhes; nothing is stored.
- `ia-copy` the Conexão's copy: "A Conexão com o Anki tem uma cópia da chave", and re-delivery when the Conexão comes back without it.
- `ia-storage` where the key lives: whole key only in the extension's IndexedDB (`pm-segredos`) and the Conexão's copy, only the last 4 characters in `chrome.storage.local` (`pm_chave_openai`), out of reach of the content script.
- `ia-boas-vindas` the same card as Boas-vindas step 5 (`#boas-vindas/ia`), done when the key is checked.

## How to get to it (user POV)

- Panel › Configurações › IA dos cartões, or `chrome-extension://<id>/painel.html#configuracoes/ia` (opens the card and focuses the field when there is no key).
- Boas-vindas › step "Configurar a IA dos cartões" (`#boas-vindas/ia`).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The Conexão is the Anki fake: `fakes.anki.responderOpenAI('aceita' | 'recusa' | 'sem_credito' | 'org_nao_verificada' | 'fora_do_ar')` says how OpenAI answers the check, `fakes.anki.chaveNaConexao()` is the copy the Conexão kept (null: none), `fakes.anki.desligar()` makes it unreachable. It answers from `complemento/contrato/exemplos.json`, the same file the add-on's own tests read. Real OpenAI is never reached.

- **Card (`ia-card`).** `drive.sh ia-card configuracoes-ia.spec -g "sem chave: as duas entradas"`. Observable: both columns with equal width and top, the `Plus ou Pro` badge, the disabled `Continuar com o ChatGPT`, the closed-row summary `Sem chave`. Narrow: `-g "abaixo de ~620 px"`.
- **Paste (`ia-paste`).** `-g "colar a chave: a Conexão a confere"`. Observable: `Chave conferida`, `••••••••9f3a`, the toast, the Conexão's copy equal to the pasted key, `pm_chave_openai` = `{ ultimos4: '9f3a' }`, and the whole `chrome.storage.local` dump without the key.
- **Errors (`ia-errors`).** `-g "a OpenAI responde"` runs the four OpenAI answers; `-g "com a Conexão desligada, a faixa"` the unreachable Conexão. Observable: the strip (`role=alert`) naming `Chave da OpenAI`, the action button, Detalhes (`HTTP 402 · openai_no_credit`), the pasted text kept in the field, nothing stored.
- **Copy (`ia-copy`).** `-g "a chave guardada na extensão volta à Conexão"`, `-g "se a Conexão sem a cópia recusa a chave"`.
- **Storage (`ia-storage`).** `-g "o content script e o overlay não alcançam a chave"`: reads the content script's isolated world over CDP.
- **Boas-vindas (`ia-boas-vindas`).** `drive.sh ia-bv boas-vindas.spec -g "passo 5: o card IA dos cartões"`.

## Gotchas

- The extension never talks to OpenAI (no host permission): the Conexão checks the key, so with the Conexão off there is no way to check, and the strip says so.
- The key shown is only its end: the screen never knows more than `ultimos4`, so a "key is on screen" assertion should look for the 4 characters, not the whole key.
- A rejected key never replaces the one already stored; Cancelar in Trocar chave keeps it too.
- The fake keeps the copy in memory per test; a new test starts with no copy. Seed one with `fakes.anki.guardarChaveNaConexao('9f3a')`.
- The visual references are `configuracoes-visual.spec.js` (`ia-*.png`) and `boas-vindas-visual.spec.js` (`passo-5-ia*.png`); never `--update-snapshots` without the owner's approval of the look.
