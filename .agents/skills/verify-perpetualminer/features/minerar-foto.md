# Mine from a photo

`bookreader.html` ("Minerar de uma foto") lets a person upload photos of marked book pages, have Gemini Vision read the marked passages, pick which phrases to keep and mine them into the history with Fonte Livro and the typed book title.

## Sub-features

- `foto-read-one` one photo stops at the preview; `Ler marcações` reads it, the column lists the phrases, all checked.
- `foto-read-many` several photos skip the preview and are read in sequence with per-photo status and progress.
- `foto-mine` `Minerar N frases` stores the checked phrases with `contexto { fonte: 'livro', titulo: <Livro> }`, toast `N frases mineradas`.
- `foto-edit-select` edit a phrase in place; `Selecionar todas` is tri-state; the button counts only the checked.
- `foto-errors` Gemini with no marks (`Sem marcações`), rate limit, rejected key (leads to Configurações), no network, blocked answer: each says the real cause.
- `foto-cancel-restart` Cancelar halfway keeps the phrases already read; Recomeçar asks before dropping unmined phrases; Tentar de novo rereads one photo.
- `foto-book` the typed `Livro` is remembered next visit; empty becomes Título `Físico/Livro`.

## How to get to it (user POV)

- Panel › Frases › **Minerar frases** menu › **Foto** (opens a new tab), or the **Foto ↗** button beside the tabs of the Colar/Arquivo modal.
- Open `chrome-extension://<id>/bookreader.html` (every recipe below does).
- Needs a Gemini key (Configurações › Chave do Gemini, or Boas-vindas step 6).

## Driving it with the Playwright e2e harness

Preconditions:

- `doctor.sh` green. The specs write `geminiApiKey: 'chave-de-teste'`, load `bookreader.html`, upload a 1×1 PNG with `page.locator('#foto-arquivo').setInputFiles(...)` and set what Gemini answers with `fakes.gemini.responderFrases([...])`. Gemini is faked at HTTP; no real vision runs.

- **One photo, read and mine (`foto-read-one`, `foto-mine`, `foto-book`).** Run `drive.sh foto-uma minerar-foto.spec -g "uma foto: prévia, leitura"`. Observable: after typing `Atomic Habits` in the `Livro` field and uploading `pagina.png`, the preview text `Confira se as marcações aparecem na foto` shows and Gemini was not called yet; `Ler marcações` leaves the item `3 frases`, three checked checkboxes named by their text, button `Minerar 3 frases`; the Gemini fake saw the key `chave-de-teste` in the `x-goog-api-key` header; clicking it shows toast `3 frases mineradas`, and `frases()` has 3 entries with `contexto { fonte: 'livro', titulo: 'Atomic Habits', detalhe: '' }`, `idioma 'Inglês'`. Evidence: `c1-foto-minerada.png`, `c1-foto-minerada.json`.
- **The key is in the header, not the URL (`foto-read-one`).** `drive.sh foto-chave minerar-foto-chave.spec`. Observable: one Gemini call whose `chave` is `chave-de-teste` and whose `url` is the bare `…gemini-3-flash-preview:generateContent` (no `?key=`), the three phrases mined, `geminiApiKey` unchanged.
- **Entry from the panel.** `drive.sh foto-menu painel-minerar-frases.spec -g "Foto abre Minerar de uma foto numa aba nova"` and `-g "Foto ↗, ao lado das abas"`. Observable: a new tab at `…/bookreader.html`, the menu or modal closed.
- **Edit and select (`foto-edit-select`).** `-g "a frase editada na lista"` (the edited text is what is stored) and `-g "Selecionar todas” marca e desmarca"` (tri-state, button counts only the checked).
- **Book title (`foto-book`).** `-g "o Livro digitado volta preenchido"` and `-g "com o Livro em branco"` (Título `Físico/Livro`).
- **Several photos (`foto-read-many`).** `-g "várias fotos pulam a prévia"`.
- **Errors (`foto-errors`).** `-g "o Gemini sem marcações"`, `-g "o Gemini com pedidos demais"` (rate limit), `-g "a chave recusada pelo Gemini"`, `-g "sem rede, a foto falha"`.
- **Blocked answer (`foto-errors`).** `drive.sh foto-bloqueada minerar-foto.spec -g "uma resposta do Gemini sem texto"`. The fake answers as a request blocked for `SAFETY`. Observable: the photo shows `Falhou`, the column says `Não deu para ler a foto` and `Algo deu errado. Tente de novo.`, and `Sem marcações` appears nowhere.
- **Reread one photo (`foto-cancel-restart`).** `drive.sh foto-reler minerar-foto.spec -g "lê só aquela foto"`. Three photos: the 2nd fails, the 3rd has no marks. Observable: only `b.png` has `Tentar de novo` (3 Gemini calls so far); after clicking it `b.png` shows `2 frases`, `a.png` still `3 frases`, `c.png` still `Sem marcações`, exactly 4 Gemini calls in all, no failure warning, and the button says `Minerar 5 frases`.
- **Cancel and restart (`foto-cancel-restart`).** `-g "4 fotos, Cancelar depois da 2ª"`, `-g "Recomeçar com frases não mineradas"`.

## Gotchas

- The photo content is irrelevant to the fake: the answer comes from `responderFrases`. Do not claim this proves Gemini's reading quality.
- Click Minerar twice and nothing is stored twice; the mined phrases turn `Minerada` and leave the button's count (`minerar e clicar de novo`).
- A service worker that answers without confirming the write leaves the phrase un-"Minerada" (`um service worker que responde sem confirmar`); the specs inject that fault at the storage boundary.
- Clock/animation: the visual spec masks the toast; do not compare the toast pixel-wise.
- `minerar-foto-visual.spec.js` baselines use `pages/pagina-marcada.png`; they are Linux references, do not update them.
