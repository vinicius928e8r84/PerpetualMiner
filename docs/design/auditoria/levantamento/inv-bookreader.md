# BookReader: UI inventory (read-only audit)

Repo: `/mnt/c/Users/sadvi/Desktop/MineradorLegendas`. Files: `bookreader.html` (214 lines), `bookreader.js` (581), `bookreader.css` (610). Only one commit touches them (`7c4464c Initial commit`). No repo files were modified.

> **Scope correction:** BookReader is **not a reader**. It has no pagination, font size, theme, TOC or text-selection UI. It is a **photo → Gemini Vision → list of hand-marked passages → save to history** tool. The name "BookReader" doesn't describe it (see Terminology).

---

## 0. How it is opened / navigation

| Entry point | file:line | Mechanism | Notes |
|---|---|---|---|
| Painel header link "BookReader" (`a.bookreader-btn`) | painel.html:123 | `<a href="bookreader.html" target="_blank">`, title `"Abrir BookReader – transcrição de livros físicos"` | **This is the only entry point.** Popup, background and content.js never open it (grep: no `bookreader` references). Styled amber (`#b45309`/`#fcd34d`, painel.css:185-199), matching the painel `livro` source badge color, while BookReader itself is purple. |
| `web_accessible_resources` | manifest.json:40 | `["painel.html","bookreader.html"]` for `<all_urls>` | Not needed for the painel link, since extension→extension navigation doesn't need WAR. It lets any website frame or open the page that holds the Gemini key input. |
| "Voltar ao Painel" (`#btn-voltar`) | bookreader.html:89-94 → bookreader.js:56, 507-512 | `history.length > 1 ? history.back() : location.href='painel.html'` | Because the page is always opened with `target="_blank"`, `history.length` is 1, so the button **turns the BookReader tab into a second painel tab**. The original painel tab stays open, so you end up with duplicate painel tabs. The code comment says "Tenta fechar aba", but the code never closes the tab. Works, with a UX defect. |

Page `<title>`: `BookReader – PerpetualMiner` (html:5).

---

## 1. Sidebar (always visible)

| # | Element | Selector / file:line | What it does (handler → fn → effect) | Status | Shown when |
|---|---|---|---|---|---|
| S1 | Logo: purple book SVG + "BookReader" / "PerpetualMiner" | `.sidebar-logo` html:13-31 | Static | working (static) | always |
| S2 | Section label "Gemini API Key" (key icon) | `.section-label` html:37-42 | Static | — | always |
| S3 | API key input, `type=password`, placeholder `AIza...` | `#api-key-input` html:44 | Prefilled from `chrome.storage.local.geminiApiKey` (`carregarConfiguracoes` js:556-560). `analisarImagem`/`drainQueue` read the **live input value**, so an unsaved typed key also works. | working | always |
| S4 | Show/hide key (eye icon), title "Mostrar/ocultar" | `#btn-toggle-key` html:46 → js:55 → `alternarVisibilidadeKey` js:514 | Toggles input type password/text | working (icon and title never change state; no aria-label) | always |
| S5 | "Salvar Key" | `#btn-save-key` html:53 → js:54 → `salvarApiKey` js:563 | `chrome.storage.local.set({geminiApiKey})` → toast "API Key salva!". Rejects an empty value, so **there is no way to clear a stored key**. Doesn't validate the key. | working | always |
| S6 | Hint "Obtenha grátis em aistudio.google.com" | `.sidebar-hint a` html:54-57 | External link, `target=_blank` (no `rel=noopener`, harmless for extension pages) | working | always |
| S7 | Label "Título do Livro (opcional)" | html:64-70 | Static | — | always |
| S8 | Book title input, placeholder "Ex: Atomic Habits" | `#book-title` html:71 | Read at save time (js:435) → `contexto.titulo`. Default when empty: `'Físico/Livro'`. Prefilled from `bookTitleDefault` (js:559), but **nothing writes `bookTitleDefault`** (grep across the repo), so the title is never persisted and you retype it every session. | working, persistence dead | always |
| S9 | Legend "Marcações reconhecidas": `/texto/` Barras oblíquas · `_texto_` Underscores · <u>texto</u> Sublinhado físico · "Textos circulados ou com colchetes" | `.marking-list` html:78-86 | Static help. Matches the PROMPT at js:14-18. | — | always |
| S10 | "Voltar ao Painel" | `#btn-voltar` | See §0 | working, duplicates tabs | always |

## 2. Main header / global

| # | Element | Selector / file:line | Behaviour | Status | Shown when |
|---|---|---|---|---|---|
| M1 | H1 "Transcrição de Livro Físico" | `.main-title` html:103 | static | — | always |
| M2 | Sub "Fotografe a página e extraia apenas os trechos que você marcou" | `.main-sub` html:104 | static | — | always |
| M3 | Error bar | `#error-bar` html:109; `mostrarErro` js:527-532 | Shows the text, auto-hides after 5 s. **Timers are never cleared**, so a later error gets hidden by an earlier error's timer (in batch mode errors come 2 s apart, so the 2nd message stays up only about 3 s). Cleared in `resetarParaUpload`. | working, timer bug | on any error |
| M4 | Toast (dynamic `#_toast`, bottom-right, `#7c3aed`) | `mostrarToast` js:534-552 | Inline-styled div, 2.5 s | working | after key save / trecho save |
| M5 | Global drag/drop guard | js:47-48 | `preventDefault` on document dragover/drop, so dropping outside zones doesn't open the image | working | always |

## 3. State machine (`mostrarSecao` js:521-525): upload → preview → loading → results

### 3.1 Upload state (`#upload-section`, initial)

| # | Element | Selector / file:line | Behaviour | Status | Notes |
|---|---|---|---|---|---|
| U1 | Drop zone (image icon, "Arraste fotos aqui", "ou clique para selecionar · múltiplas imagens suportadas · JPG, PNG, HEIC, WEBP") | `#upload-zone` html:113-124; js:80-91 | Click → `file-input.click()`. Drop → filters `type.startsWith('image/')` → `carregarImagens`. With no images: error. | working | **HEIC claim is partly broken:** on Windows Chrome, `.heic` files often have `file.type === ''`, so the drop filter rejects them ("Nenhum arquivo de imagem…"). Through the picker they aren't filtered, `mimeType` falls back to `'image/jpeg'` (js:193) and the file is sent to Gemini mislabelled. Chrome also can't render HEIC in `<img>`, so the preview shows nothing. Not measured, inferred from code. |
| U2 | Hidden file input `accept="image/*" multiple` | `#file-input` html:114; change handler js:157-167 | In results state → `enfileirarImagens`; otherwise `carregarImagens`. Resets its value after. | working | Lives inside `#upload-zone`, which is hidden in results state. `btn-add-more` still clicks it programmatically (works: a click on a hidden file input is allowed). |
| — | `carregarImagens` js:172-186 | 1 image → preview; >1 images → **skips preview**, straight to `analisarImagem` | working | |

### 3.2 Preview state (`#preview-section`, single image only)

| # | Element | Selector / file:line | Behaviour | Status | Notes |
|---|---|---|---|---|---|
| P1 | Preview image, alt "Prévia da foto" | `#preview-img` html:130 | data-URL of `imageQueue[0]` | working (broken for HEIC) | |
| P2 | Overlay hint "Confira se as marcações estão visíveis na foto" | `.preview-hint` html:132 | static | — | |
| P3 | Queue info chip `"${n} fotos na fila · exibindo 1ª"` | `#queue-info`/`#queue-count-text` html:135-141; js:135-137 | Shown only when extra images are dropped onto the preview (js:127-138) | working | Hidden, undiscoverable feature: nothing tells the user they can drop more here. Non-image drops are **silently ignored**. |
| P4 | CSS-only drag label "Solte para adicionar à fila" | css:273-287 (`#preview-section.drag-over::after`) | shows during dragover | working | |
| P5 | "Analisar Marcações" (primary) | `#btn-analisar` html:143 → js:59 → `analisarImagem` js:202 | Loops `imageQueue`, calls `chamarGemini` (direct `fetch` to `generativelanguage.googleapis.com/.../gemini-3-flash-preview:generateContent?key=…`, js:5, 339-362) → appends to `frasesEncontradas` → results | working (model id is a *preview* model, hard-coded; not verified live) | |
| P6 | "Trocar Foto" (ghost) | `#btn-nova-foto` html:149 → js:60 → `resetarParaUpload` | Goes back to the upload screen (doesn't open a picker), drops the queued images | working; label overpromises ("swap" = back + another click) | |

### 3.3 Loading state (`#loading-section`)

| # | Element | Selector / file:line | Behaviour | Status | Notes |
|---|---|---|---|---|---|
| L1 | Spinner | `.spinner` html:162 | CSS anim | working | |
| L2 | Title: "Analisando a imagem…" / "Processando imagem ${i+1} de ${total}…" | `#loading-title` html:163; js:233-235 | | working | |
| L3 | Sub: "O Gemini está identificando os trechos marcados" / "Processando imagens em sequência…" / **"Adicionando ao histórico de frases…"** | `#loading-sub` html:164; js:220-225 | | 3rd string **dead**: needs `prevCount>0` in `analisarImagem`, but you can only reach it from upload/preview, which always come after `resetarParaUpload` (clears `frasesEncontradas`). The only way to reach it is the reset-during-processing race (§5.4). | |
| L4 | Progress bar + filename label (`img.fileName` or "Foto N") | `#progress-wrap/#progress-bar/#progress-label` html:165-170; js:236-249 | Only when >1 image. Bar shows `i/total`, so it reads 0 % during the first image. | working | |
| L5 | Dynamic hint "+N foto(s) na fila aguardando" (`#loading-queue-hint`, inline style `#a78bfa`) | js:294-304 | Created on a drop into the loading section; removed at js:252 | working | Undiscoverable. Non-image drops are silently ignored. |
| L6 | Drop into loading → `processingQueue` → drained after the batch | js:141-154, 258 | | working | |
| — | **No cancel button** during loading. A batch of many photos can't be aborted. | | | missing | |

### 3.4 Results state (`#results-section`)

| # | Element | Selector / file:line | Behaviour | Status | Notes |
|---|---|---|---|---|---|
| R1 | Add-more strip (icon + "Arraste mais fotos aqui para acumular resultados") | `#add-more-zone` html:178-187; drop handled on the whole `#results-section` js:94-120 | Drop → `enfileirarImagens` → `drainQueue` (sequential background loop). Non-images silently ignored. | working | While processing, the text becomes "Processando foto... ${n} na fila · pode arrastar mais!" / "Processando foto... você pode arrastar mais enquanto isso", with a mini spinner (js:306-327). |
| R2 | "Selecionar" | `#btn-add-more` html:186 → js:64 | clicks `#file-input` → change handler → `enfileirarImagens` | working | |
| R3 | Counter `"Total acumulado: ${n} trecho(s) prontos para salvar"` | `#results-count` js:329-335 | | working, **grammar bug**: n=1 gives "1 trecho prontos para salvar". Counts *all* found items, not the checked ones, and still says "prontos para salvar" after saving. | |
| R4 | "Marcar todas" | `#btn-select-all` html:192 → `definirSelecaoResultados(true)` | checks all; disabled when all are checked (`atualizarBotoesSelecao` js:481-491) | working | |
| R5 | "Desmarcar todas" | `#btn-deselect-all` html:193 → `definirSelecaoResultados(false)` | | working | |
| R6 | "Limpar Lista" | `#btn-nova-foto-2` html:194 → `resetarParaUpload` | Discards all found and edited trechos and goes back to upload. **No `confirm()`**, even with unsaved items. The id name (`nova-foto-2`) doesn't match the label. Doesn't cancel an in-flight `drainQueue` (§5.4). | working, destructive without confirm | |
| R7 | Result row: checkbox (`.result-check#rc-i`, default checked) + curly quotes + `contenteditable` text (`.result-text`) | template js:383-394 | Checkbox change → `atualizarBotoesSelecao` (delegated js:68-70). Edits are read from the DOM at save time. Appended rows keep earlier edits. | working | No per-row delete (uncheck only). No `<label for>`. Edits are never written back to `frasesEncontradas`. Enter/paste in contenteditable can insert markup (only `textContent` is used). |
| R8 | Empty state: magnifier + "Não encontrei trechos marcados nesta imagem." + "Certifique-se de que as marcações estão visíveis. Use `/barras/`, `_underlines_` ou sublinhado físico." | js:368-380 | Shown when `frasesEncontradas.length === 0` after a batch | working, **misleading** | Also shown when **every** Gemini call failed (API error, bad key, quota). The error bar disappears after 5 s and the empty state stays, blaming the user's markings. Says "nesta imagem" even after a multi-image batch. Omits circled/bracketed marks. When the list is non-empty and a later photo yields 0 results, **nothing is shown at all** (silent). |
| R9 | "Salvar no PerpetualMiner" (primary, full width) | `#btn-salvar` html:199 → `salvarNoMiner` js:417-453 | Collects checked, non-empty rows → `Promise.all` of `chrome.runtime.sendMessage({type:'SALVAR_HISTORICO', texto, origem:'livro', idioma, contexto:{fonte:'livro', titulo, detalhe:''}})` → background.js:123 `salvarFrase` → `chrome.storage.local.frases` (+ Firestore sync). On success the button becomes green "✓ N trecho(s) salvo(s)!", disabled, plus toast "N trecho(s) salvo(s) no PerpetualMiner!". | **working, with serious bugs** (see §5.1–5.3) | Disabled when the counter is 0 |

---

## 4. Every user-facing string (verbatim)

| Kind | String | Where |
|---|---|---|
| error | `Nenhum arquivo de imagem. Use JPG, PNG, WEBP ou HEIC.` | js:90 (upload-zone drop only) |
| error | `Insira sua Gemini API Key nas configurações à esquerda.` | js:204, js:270 |
| error | `Carregue ao menos uma imagem primeiro.` | js:205 (practically unreachable: buttons only exist with an image loaded) |
| error | `Imagem ${i + 1}: ${err.message}` | js:244 (raw Gemini/HTTP message, English, e.g. "API key not valid…" or `HTTP 429`) |
| error | `Erro ao processar foto: ${err.message}` | js:285 (doesn't say which photo, unlike js:244) |
| error | `Selecione ao menos um trecho para salvar.` | js:431 |
| error | `Não foi possível salvar os trechos.` | js:439, **says nothing**: no reason, no retry hint |
| error | `Digite uma API Key antes de salvar.` | js:565 |
| toast | `API Key salva!` | js:566 |
| toast | `${n} trecho${s} salvo${s} no PerpetualMiner!` | js:451 (reports only successes; partial failures are silently dropped) |
| button state | `${n} trecho${s} salvo${s}!` | js:448 |
| loading | `Analisando a imagem…` / `Processando imagem ${i+1} de ${total}…` / `O Gemini está identificando os trechos marcados` / `Processando imagens em sequência…` / `Adicionando ao histórico de frases…` (dead) | html:163-164, js:220-235 |
| progress | `${fileName}` or `Foto ${i+1}` | js:238 |
| hint | `+${n} foto${s} na fila aguardando` | js:303 |
| hint | `${n} fotos na fila · exibindo 1ª` | js:136 |
| drop strip | `Arraste mais fotos aqui para acumular resultados` / `Processando foto... ${n} na fila · pode arrastar mais!` / `Processando foto... você pode arrastar mais enquanto isso` | html:185, js:318-325 (three dots `...` here vs `…` elsewhere) |
| CSS content | `Solte para adicionar à fila` | css:274 |
| counter | `Total acumulado: ${n} trecho${s} prontos para salvar` | js:333 |
| empty | `Não encontrei trechos marcados nesta imagem.` / `Certifique-se de que as marcações estão visíveis.` / `Use /barras/, _underlines_ ou sublinhado físico.` | js:374-377 |
| static | `Arraste fotos aqui`, `ou clique para selecionar · múltiplas imagens suportadas · JPG, PNG, HEIC, WEBP`, `Confira se as marcações estão visíveis na foto`, `Analisar Marcações`, `Trocar Foto`, `Selecionar`, `Marcar todas`, `Desmarcar todas`, `Limpar Lista`, `Salvar no PerpetualMiner`, `Salvar Key`, `Mostrar/ocultar`, `Obtenha grátis em aistudio.google.com`, `Título do Livro (opcional)`, `Ex: Atomic Habits`, `Marcações reconhecidas`, `Voltar ao Painel`, `Transcrição de Livro Físico`, `Fotografe a página e extraia apenas os trechos que você marcou` | html |
| none | No `alert()`, `confirm()` or `prompt()` anywhere in BookReader | — |

---

## 5. Bugs / broken behaviour (ordered by severity)

1. **Probable data loss on multi-save (lost-update race).** `salvarNoMiner` fires all `SALVAR_HISTORICO` messages in parallel (`Promise.all`, js:436). `background.js:salvarFrase` (l.167-195) does an unsynchronised read-modify-write: `await autoKeywordsForPhrase` → `chromeGet({frases})` → `chromeSet({frases:[nova,...old]})`. Concurrent calls read the same snapshot, so the last write wins and **the other trechos disappear from local storage** (and from `pm_pending_sync`). Every call still answers `{ok:true}`, so the UI says "N trechos salvos!". `id: Date.now()` can also collide within the same ms, and a collision overwrites the same Firestore doc path (`/frases/${id}`). BookReader is the only caller that saves in parallel (popup/content save one at a time). *Inferred from code, not measured in Chrome.*
2. **Duplicate saves / stuck "saved" button.** After a save, the button is disabled with the green `btn-saved` class. Any later photo processed by `drainQueue` calls `atualizarContador`, which re-enables it (js:334) while it still reads "N trechos salvos!". Clicking it re-saves **every checked row, including the ones already saved**, which creates duplicates. `btn-saved` is never removed, not even by "Limpar Lista" plus a new analysis: the button stays green with the "Salvar no PerpetualMiner" label. When a new batch yields 0 results, `renderizarResultados` returns before resetting the label (js:368-381). Nothing tracks which rows were saved.
3. **Partial failures hidden.** `salvos < selecionadas` still shows a success-only toast.
4. **Reset doesn't cancel in-flight work.** "Limpar Lista" / "Trocar Foto" set `isProcessing=false` and `processingQueue=[]`, but the pending `chamarGemini` still resolves and pushes into the *new* `frasesEncontradas` using a stale `startIndex`. That leaves ghost items that are counted but never rendered, or later mis-appended. It also allows two `drainQueue` loops to run at once.
5. **Empty state blames the user when the API failed** (§R8). The error bar auto-hides after 5 s.
6. **HEIC is advertised but not handled** (§U1).
7. **Error bar timer overlap** (§M3).
8. **"Voltar ao Painel" opens a second painel tab** (§0).
9. **`bookTitleDefault` is never written**, so the book title isn't remembered.
10. **Language detection** (js:571) is a copy of background.js:280 and popup.js:203: Cyrillic → 'Russo', **everything else → 'Inglês'**. A Portuguese (or any other language) book gets labelled English and fed to the English auto-keyword pipeline.
11. Grammar: "1 trecho prontos para salvar".

## 6. Orphans / dead code / CSS

- **Orphan controls:** none. Every HTML id is wired (`upload-section` through the template literal `${s}-section`; `lgBook` through an SVG `url(#lgBook)`). Every `getElementById` target exists, except the two dynamic ones created at runtime (`_toast`, `loading-queue-hint`).
- **Orphan CSS:** none found. Every class selector in bookreader.css is used in the html/js (checked with a scripted grep). There is no global `.hidden`: each `.x.hidden` rule is scoped per component (6 copies: css:228, 237, 338, 379, 510-511), which is repetitive but complete.
- **Dead strings/branches:** "Adicionando ao histórico de frases…" (js:224), `Carregue ao menos uma imagem primeiro.` (effectively unreachable), `bookTitleDefault` read path (js:559).
- **Stale comment:** js:508 "Tenta fechar aba" (it never closes the tab).
- Inline styles in JS (toast js:539-546, hint js:299) bypass the stylesheet.

## 7. Redundancies

| Item | Duplicate of | Notes |
|---|---|---|
| `mostrarToast` (js:534) | painel.js:2716 `mostrarToast` | Copy-paste with drift: 2500 ms vs 1800 ms, padding 10/20 vs 9/18, shadow .45 vs .40. |
| `detectarIdioma` (js:571) | background.js:280, popup.js:203 (inline) | 3 copies. Background could detect it itself (it already defaults `idioma`). |
| Save path `SALVAR_HISTORICO` | popup "Adição Manual" (popup.js:199-221), content.js:95/157, context menu | Same message; only BookReader sends it N-parallel. |
| "Marcar todas" / "Desmarcar todas" (two buttons, each disabled when not applicable) | painel "Todas" / "Pág." toggle buttons (painel.html:130-131); popup "Tudo" checkbox (popup.html) | Three different select-all patterns across the extension. |
| "Trocar Foto" and "Limpar Lista" | the same handler `resetarParaUpload` | Two labels, one action. |
| Progress/loading UI | painel `#import-overlay` (painel.html:580-586) | Parallel implementation of spinner + progress bar. |
| Sidebar gradient `linear-gradient(155deg,#7c3aed,#5b21b6,#3b0764)` + body font | painel.css:20 / painel.css:9 | Copied, not shared. Same for `.btn-ghost-sm` (defined in both files with different looks). |
| `web_accessible_resources` entry for bookreader.html | — | Not needed for the only entry point. |
| `contexto.titulo` default `'Físico/Livro'` | painel.js:20 source name `livro: 'Físico/Livro'` | The export string becomes `[Contexto: livro - Físico/Livro - ]`, so the source name is repeated as the title. |

## 8. Terminology inconsistencies

- **"BookReader"** (painel button, page title, logo) vs the page H1 "Transcrição de Livro Físico" vs painel tooltip "transcrição de livros físicos" vs CLAUDE.md "upload a book photo". It is a *photo transcriber/extractor*, not a reader. It's also the only English product name in a Portuguese UI.
- **"trechos"** (BookReader everywhere) vs **"frases"** (painel "Frases mineradas", popup "Últimas mineradas", toasts). BookReader's own loading text says "histórico de frases".
- **Save verb:** "Salvar no PerpetualMiner" (BookReader) vs "Adicionar" (popup manual) vs "minerar/mineradas" (rest of the app). BookReader never uses "minerar".
- **Destination:** "Voltar ao **Painel**" vs popup "Abrir **Painel de Estudos**".
- **Marks:** sidebar says "Underscores", empty state says "_underlines_", the legend says "Sublinhado físico". "underline" and "sublinhado" mean the same thing, which invites confusion with the underscore mark.
- **Language labels:** idioma stored as the Portuguese words 'Inglês'/'Russo', while the popup uses EN/RU.
- "Gemini API Key" / "Salvar Key" / "API Key salva!" mix English and Portuguese. Ellipsis is sometimes `…` and sometimes `...`.

## 9. "Messages that say nothing" / weak feedback

- `Não foi possível salvar os trechos.`: no cause, no next step.
- `Erro ao processar foto: <raw English API message>`: doesn't say which photo; the message is raw and untranslated.
- `Imagem N: HTTP 4xx`: raw status code.
- The empty state is shown on API failure, which misdirects the user.
- Silent paths: non-image drops on preview/loading/results; a later photo with 0 trechos; partial save failures; the drainQueue "no API key" case leaves images queued with only a 5 s error.
- A success toast is shown even when the race in §5.1 has discarded most of the writes.

## 10. Visual identity (BookReader)

| Aspect | Value |
|---|---|
| Font | `'Segoe UI', system-ui, -apple-system, sans-serif`, 14px (css:9). Inputs use `'Courier New', monospace` (css:91, 158). No web fonts. |
| Primary | `#7c3aed` (violet-600); hover `#6d28d9`; deep `#5b21b6`, `#3b0764` |
| Accent / light violets | `#a78bfa`, `#c4b5fd`, `#ddd6fe`, `#ede9fe`, `#f5f3ff`, `#f3f0ff`, `#faf7ff` |
| Sidebar | `linear-gradient(155deg, #7c3aed 0%, #5b21b6 55%, #3b0764 100%)`, radius `0 2.5rem 2.5rem 0`, shadow `rgba(91,33,182,.35)` (identical to painel.css:20) |
| Neutrals | bg `#f9fafb`; text `#111827`, `#1f2937`, `#374151`, `#6b7280`, `#9ca3af`, `#d1d5db`; borders `#e5e7eb`, `#f1f3f5`; preview bg `#1a1a2e` |
| Semantic | error `#fef2f2` / `#fecaca` / `#b91c1c`; saved/success `#059669` |
| Radii | 16px (zones/cards), 10px (rows), 8–9px (buttons/inputs) |
| Logo | Own inline SVG: a book drawn as a violet gradient rectangle (`#a78bfa`→`#7c3aed`, id `lgBook`) with white lines, next to "BookReader" / "PerpetualMiner". **This is the third distinct logo in the extension.** Painel: a Google-4-color speech bubble plus "**Perpetual**Miner" (painel.html:14-24). Popup / `icon.svg`: a black rounded square with a cyan `#00ffff` lightning bolt. |
| Entry button in painel | amber `#b45309` text, `#fcd34d` border, hover `#fffbeb` / `#f59e0b`, which doesn't match the violet page it opens |
| Theme | Light only; no dark mode. No favicon (the page doesn't link `icon.svg`). |
