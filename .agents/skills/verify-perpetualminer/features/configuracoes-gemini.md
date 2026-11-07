# Chave do Gemini

Configurações › Chave do Gemini holds the key that **Minerar de uma foto** uses to read book pages. It is kept only on this computer (`geminiApiKey` in `chrome.storage.local`), shown masked, and never shown again in full.

## Sub-features

- `gemini-saved` with a key: `Chave salva`, the key masked as `AIza••••••••3kQ9` (the full value is nowhere on the page), the line `Usada para ler fotos em Minerar de uma foto. Fica guardada só neste computador.` and **Trocar chave**; the closed row's summary is the same mask.
- `gemini-replace` **Trocar chave** opens an empty field with the focus (the old key never goes to the screen); Enter or **Salvar chave** stores the new key trimmed of the spaces of the paste, shows the toast `Chave do Gemini salva` (CFG-16) and the card goes back to the summary; **Cancelar** changes nothing and returns the focus to Trocar chave.
- `gemini-empty` without a key the field is open (placeholder `Cole a chave (começa com AIza)`), the text says `Sem a chave, Minerar de uma foto não consegue ler as fotos.`, **Salvar chave** is the primary button and there is no Cancelar; saving empty (or spaces) stores nothing, marks the field `aria-invalid` with `Cole a chave antes de salvar` (described by the field, danger border) and keeps the focus; typing clears the error.
- `gemini-address` `painel.html#configuracoes/chave` focuses the field when the key is empty and opens no field when a key is saved; a key written from another page appears in the open card without reloading.

## How to get to it (user POV)

- Sidebar › **Configurações** › **Chave do Gemini**, or `painel.html#configuracoes/chave`.
- The photo mining page asks for it when the key is missing ([minerar-foto.md](./minerar-foto.md)).

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The key is seeded with `extensao.gravarStorage({ geminiApiKey })` (a fake `AIza…` value); the spec fails if the panel opens a native `confirm`/`alert`.

- **Saved, replace, cancel.** `drive.sh gemini configuracoes-chave-perigo.spec -g "chave salva|trocar a chave com Enter"`. Observable: the masked text, `page.getByText(<full key>)` count 0, Cancelar leaves `geminiApiKey` unchanged, Enter stores the trimmed new key, toast `Chave do Gemini salva`, mask `AIza••••••••fG9h`.
- **Empty and refused.** `-g "sem chave: o campo fica aberto"`: `geminiApiKey` stays `''` after saving spaces, the field is `aria-invalid`, then the button stores the key and the toast appears.
- **Address and live update.** `-g "#configuracoes/chave com a chave vazia"`, `-g "a chave gravada em outra página"`, and `-g "pelo teclado"` for the keyboard path.

## Gotchas

- The key is a fake in the harness; whether Google accepts it is not checked here (this card does not check it), and reading a photo with it is [minerar-foto.md](./minerar-foto.md) against `fakes.gemini`.
- This is not the OpenAI key (a different card, checked and kept by the Conexão): [ia.md](./ia.md).
- The same spec file also holds the Zona de perigo tests: [configuracoes-perigo.md](./configuracoes-perigo.md).
