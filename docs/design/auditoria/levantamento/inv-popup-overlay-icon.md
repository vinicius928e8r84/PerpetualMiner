# UI inventory: popup, in-page overlay, toolbar icon

Repo: `/mnt/c/Users/<usr>/Desktop/MineradorLegendas` (HEAD 42994e0). This was a read-only audit; no repo files were changed.

Status legend: **working** = wired and functional · **broken** = wired but misbehaves · **orphan** = no handler, or a handler/asset with nothing attached · **dead** = never shown or never reached.

---

## 1. Popup (`popup.html` / `popup.css` / `popup.js`)

Opened by clicking the toolbar action (`manifest.json` `action.default_popup`). Width is fixed at 340px (`popup.html:2`, `popup.css:4`). There is no `lang` attribute; painel has `lang="pt-BR"`.

### 1.1 Header

| # | Element | Location | What it does | Status | Shown when |
|---|---|---|---|---|---|
| P1 | Logo: inline SVG, 30x30, lightning bolt | popup.html:11-14 | Decoration only. Same drawing as `icon.svg`: `#0c0c0c` rounded square with a `#00ffff` bolt | working (static) | always |
| P2 | Wordmark "**Perpetual**Miner" | popup.html:16 | Static text. "Perpetual" is bold cyan, "Miner" is light weight | working | always |
| P3 | Subtitle "Minerador de legendas" | popup.html:17 | Static text | working | always |

### 1.2 Open panel

| # | Element | Location | What it does | Status | Shown when |
|---|---|---|---|---|---|
| P4 | `#btnIrPainel` "Abrir Painel de Estudos" (4-square grid icon) | popup.html:24-32; handler popup.js:18 -> `abrirPainel()` popup.js:316 | Looks for an existing `painel.html` tab with `chrome.tabs.query`. If one exists it focuses that tab and window, otherwise it creates one. Uses the `tabs` permission. | working | always |

### 1.3 Auto Miner

| # | Element | Location | What it does | Status | Shown when |
|---|---|---|---|---|---|
| P5 | Heading "Auto Miner" | popup.html:35 | Static. There is no explanation or tooltip saying what Auto Miner does | working (uninformative) | always |
| P6 | `#autoMinerEn` checkbox + label "EN" | popup.html:39-40; popup.js:24 -> `salvarAutoMiner()` popup.js:78 | Sends `{type:'AUTO_MINER_SET_SETTINGS', settings}`. Background `setAutoMinerSettings` (background.js:849, 850) persists `pm_auto_miner_settings`, writes `pm_auto_miner_state_view`, and broadcasts to tabs | working | always |
| P7 | `#autoLimitEn` number input 1–100, default 20 | popup.html:42; popup.js:26 | Same message. Background clamps the value to 1–100 (background.js:886). Empty or 0 becomes 20. The input has no label, placeholder, title or unit, so its meaning is only implied | working (unlabelled) | always |
| P8 | `#autoCountEn` pill "0/20" | popup.html:43; set by `renderizarAutoMiner()` popup.js:74 | Shows `daily.en.count/dailyLimit` for **today**, but nothing tells the user the count is daily. Updates through `storage.onChanged` on `pm_auto_miner_state_view` (popup.js:46) | working (unlabelled) | always |
| P9 | `#autoMinerRu` checkbox "RU" | popup.html:47-48; popup.js:25 | Same as P6, for RU | working | always |
| P10 | `#autoLimitRu` | popup.html:50; popup.js:27 | Same as P7 | working (unlabelled) | always |
| P11 | `#autoCountRu` "0/20" | popup.html:51; popup.js:75 | Same as P8 | working (unlabelled) | always |
| P12 | `chrome.runtime.onMessage` listener for `AUTO_MINER_STATE_CHANGED` | popup.js:52-56 | Background only sends this with `chrome.tabs.sendMessage` (background.js:926), which never reaches the popup. The storage listener at popup.js:46 does the real work | **dead** (harmless) | n/a |

Nothing tells the user when the limit is reached: the checkbox stays ticked and the counter just reads "20/20". Load and save errors are dropped silently (popup.js:61, 90).

### 1.4 Capture shortcut

| # | Element | Location | What it does | Status | Shown when |
|---|---|---|---|---|---|
| P13 | Heading "Configurar Atalho de Captura" | popup.html:56 | Static. It doesn't say the shortcut captures **selected text** only. The subtitle shortcut is a separate, hard-coded Alt+S (see O1) | working (ambiguous) | always |
| P14 | "Atalho atual:" + `#atalhoAtual` badge | popup.html:59; `exibirAtalhoAtual()` popup.js:232 | Shows `pm_atalho.label`, or "Não configurado" (grey) when unset. Cyan (`.atalho-badge--set`) once set. Live-updates through storage.onChanged (popup.js:43) | working | always |
| P15 | `#btnGravarAtalho` "Clique aqui para gravar atalho" / "Cancelar gravação" | popup.html:61; popup.js:21 -> `iniciarGravacao()` popup.js:238, `pararGravacao()` popup.js:295 | Adds capture-phase keydown and mousedown listeners. Ignores bare modifier keys, left click and right click. Saves `pm_atalho` as `{type, button, code, alt/ctrl/shift, label}`; content.js reads it (content.js:28-37). Details below the table | working, with UX issues | always |
| P16 | `#atalhoHint` "⏺ Aguardando… pressione uma tecla ou clique com um botão extra do mouse" | popup.html:62-64 | Blinking hint | working | only while recording |

P15 issues:
- There is no way to clear or remove the shortcut.
- Esc is recorded as a shortcut (or Chrome closes the popup).
- A bare letter such as "S" is accepted with no modifier.
- Labels use raw `e.code` names and English mouse names: "Middle Click", "Mouse Back", "Mouse Forward", "Mouse Btn N", "Semicolon", "BracketLeft", "Numpad1".

### 1.5 Manual add

| # | Element | Location | What it does | Status | Shown when |
|---|---|---|---|---|---|
| P17 | Heading "Adição Manual" | popup.html:68 | Static | working | always |
| P18 | `#txtManual` textarea, placeholder "Cole ou escreva uma frase…" | popup.html:70; Enter handler popup.js:29-31 | Enter submits and Shift+Enter adds a newline. Nothing on screen mentions this | working | always |
| P19 | `#btnAddManual` "Adicionar" | popup.html:71; popup.js:19 -> `adicionarManual()` popup.js:199 | Sends `{type:'SALVAR_HISTORICO', texto, origem:'manual', idioma, contexto:{fonte:'manual', titulo:'Manual Input'}}` to background.js:123 -> `salvarFrase()`. On success it clears the textarea and puts the new phrase at the top of the list. On failure it returns silently and the text stays. Empty input does nothing. There is no success toast and no duplicate check. The stored title "Manual Input" is English; it isn't shown in the popup but appears as context in painel | working (no feedback) | always |

### 1.6 Recent phrases and bulk controls

| # | Element | Location | What it does | Status | Shown when |
|---|---|---|---|---|---|
| P20 | Heading "Últimas mineradas" | popup.html:76 | Static. The list is capped at 5 (popup.js:115) without saying so, and there is no "ver todas" link | working | always |
| P21 | `#btnRefresh` "↻", title "Atualizar lista" | popup.html:78; popup.js:20 -> `carregarFrases()` popup.js:98 | Re-reads `frases` from storage, spins 400ms, **and clears the selection**. Redundant: the list already auto-refreshes through `storage.onChanged` (popup.js:34-42) | working but **redundant** | always |
| P22 | `#chkSelectAll` "Tudo" | popup.html:79-81; popup.js:22 -> `toggleSelectAll()` popup.js:173 | Selects or deselects only the **5 visible** phrases. The label "Tudo" is misleading | working (misleading) | always, even when the list is empty |
| P23 | `#btnDeleteSelected` "Deletar" -> "Deletar (N)" | popup.html:82; popup.js:23 -> `deletarSelecionados()` popup.js:184 | Filters the selected ids out of `chrome.storage.local.frases`. Problems listed below the table | **broken** for logged-in users | only when ≥1 item is selected (popup.js:162) |
| P24 | `#listaUltimas` cards `.card-frase` with checkbox `.chk-frase` and 2-line clamped `.frase-texto` | popup.js:124-151 | The checkbox toggles selection. Clicking the card text does nothing: no open or copy action, no date, no language, no source | working | when there is ≥1 phrase |
| P25 | Loading state "Carregando..." | popup.html:87 | Replaced on the first render | working | before the storage read |
| P26 | Empty state "Nenhuma frase salva ainda." | popup.js:118 | Doesn't tell the user how to mine a phrase | working (uninformative) | when `frases` is empty |

P23 problems:
- **No `confirm()`**, whereas painel asks "Deseja deletar as N frase(s) selecionadas?\nEsta ação não pode ser desfeita." (painel.js:794).
- **No Firestore delete and no tombstone** (`pm_deleted_ids`, `chrome.storage.sync` tombstone). painel's `deletarSelecionadas` calls `removerFrasesFirestore` (painel.js:800). So for a signed-in user, a phrase deleted in the popup comes back the next time painel runs `carregarFrasesFirestore()`: painel.js:386-479 treats Firestore as the source list and only drops tombstoned ids.
- No feedback after deleting.

### 1.7 Popup CSS check
Every selector in `popup.css` matches an element that exists: `.popup-header .header-info .popup-logo-text .popup-subtitle .popup-body .btn-painel .section-title .section-atalho .atalho-status .atalho-badge(--set) .btn-gravar(.recording) .atalho-hint .manual-input-area .textarea-manual .btn-add .section-header .bulk-controls .btn-refresh(.spinning) .check-label .chk-frase .btn-delete .card-frase(.selected) .frase-texto .empty-msg .auto-miner-box .auto-row .auto-toggle .auto-limit .auto-count`. **There is no orphan CSS.** Keyframes `pulse-border`, `blink` and `spin` are all used. Minor: the `.btn-delete` default is `display:inline-flex`, but the HTML inline `display:none` overrides it.

---

## 2. In-page overlay (`content.js`, runs in `<all_urls>`, `all_frames: true`)

All of this DOM is built with inline styles. No stylesheet is injected except the `@keyframes slideIn` `<style id="style-minerador-final">`.

### 2.1 Controls and triggers

| # | Element / trigger | Location | What it does | Status | Shown / active when |
|---|---|---|---|---|---|
| O1 | Hard-coded **Alt+S** keyboard shortcut | content.js:3, 169-174 -> `minerarLegenda()` content.js:450 | Mines the current subtitle. Details below the table | working, with side effects | always, on every page and frame |
| O2 | Floating button `#btn-minerador-pro` (a `div`, 48x48, green `#00ff88` border, chat-bubble outline SVG) | created by `criarBotaoVisual()` content.js:187-226, polled every 1s at content.js:178-183 | Click runs `minerarLegenda()`. Hover scales it to 1.05. Details below the table | working, with issues | whenever `obterVideoAtivo()` returns a `<video>`, which is any page with a video element (the fallback at content.js:484 returns `videos[0]` even if it is hidden or tiny, e.g. ads or muted autoplay) |
| O3 | Custom selection-capture shortcut (from popup P15) | content.js:64-89 -> `_ativarCaptura()` content.js:91 | If text is selected and the event matches `pm_atalho`: shows the capture overlay (O6) and sends `SALVAR_HISTORICO` (`origem:'selecao'`) **with no callback** | working (no failure path) | when `pm_atalho` is set and text is selected. The keyboard variant is skipped in inputs |
| O4 | `window.message` bridge `COPIAR_PARA_CLIPBOARD` / `COPIAR_E_SALVAR` | content.js:148-165 | Writes the clipboard and sends `SALVAR_HISTORICO`. Details below the table | working, **risky** | invisible |

O1 details:
- Doesn't skip INPUT or TEXTAREA elements, unlike O3, so Alt+S typed in page forms is hijacked.
- Isn't shown anywhere in the UI: popup, painel and the button have no tooltip for it.
- On pages **without** a video, `obterLegendaAtual()` still runs its generic selectors (`[class*="caption" i]`, `[class*="subtitle" i]` at content.js:302-311). An image caption can be copied and **saved silently**, because `mostrarNotificacaoAcoplada` posts the save before it checks that the button exists (content.js:719-722).

O2 details:
- No `title` or `aria-label`, not a `<button>`, not keyboard-focusable.
- Never removed when the video goes away.
- On non-YouTube sites it is appended to `video.parentElement` with `position:absolute; bottom:95px; right:30px`, so placement depends on the host's CSS.
- The icon is green, while the brand is a cyan bolt.

O4 details:
- **No `event.origin` or `event.source` check**, so any page script can `postMessage({type:'COPIAR_E_SALVAR', texto:'…'})` to overwrite the clipboard and inject phrases into history.
- Duplicate save: in the top frame, if `navigator.clipboard.writeText` fails, `minerarLegenda` posts `COPIAR_PARA_CLIPBOARD` to `window.parent` (which is the same window), and `mostrarNotificacaoAcoplada` posts `COPIAR_E_SALVAR`. That makes **two** `SALVAR_HISTORICO` calls, and `salvarFrase` has no dedupe (background.js:169).

### 2.2 Visual feedback elements

| # | Element | Location | Content (verbatim) | Status | Shown when |
|---|---|---|---|---|---|
| O5 | Mining toast `#notificacao-minerador` (manual/button/Alt+S) | `mostrarNotificacaoAcoplada()` content.js:717-787 | Header "Minerado &amp; Copiado · {Inglês\|Russo}", optional context line "{titulo} · {detalhe}", then the phrase text (3-line clamp). Black with a green `#00ff88` border, 260px, left of the button, stays 3.8s | working, but **optimistic and unescaped** | after a successful `minerarLegenda()`, **only if the button exists**. Details below the table |
| O6 | Capture overlay `#pm-capture-overlay` (selection shortcut) | `_mostrarOverlayCyan()` content.js:107-144 | "⚡" / "Frase Capturada!" / preview (first 55 chars + "…") | working, but **optimistic and unescaped** | whenever O3 fires. Details below the table |
| O7 | Failure cue: button border turns `red` for 800ms | content.js:462-468 | *(no text)* | working but **says nothing** | Alt+S or click when no subtitle is found (text ≤2 chars). With no button, nothing happens at all |
| O8 | Auto Miner badge `#pm-auto-miner-badge` (pill on the button's top-right corner) | `atualizarAutoMinerBadge()` content.js:324-361 | Text "{count}/{limit}". Green `#00ff88`, or yellow `#facc15` when the limit is reached; text color `#06130d` | working, **buggy count** | only when the button exists **and** EN or RU is enabled. Details below the table |
| O8a | Badge `title` "Auto Miner {count}/{limit} \| último skip: {reason}" | content.js:357 | Tooltip text | **dead**: the badge has `pointer-events:none` (content.js:335), so the tooltip can never appear | never |
| O8b | Badge disabled state: text "A", title "Auto Miner desligado" | content.js:342-345 | Set and then immediately hidden (`display:none`) | **dead** | never |
| O8c | Skip-reason labels `rotuloAutoMinerReason()` | content.js:380-391 | "limite diário", "idioma desligado", "duplicada", "vazia", "texto inválido", "sem item novo", "não é i+1", "inglês longo", fallback = raw reason code or "desconhecido" | **dead** (only feed O8a) | never |
| O9 | Auto Miner toast `#notificacao-minerador` | `mostrarNotificacaoAutoMiner()` content.js:393-438 | Header "Auto Miner - {Inglês\|Russo} - {count}/{limit}", then the escaped phrase text. Dark green `rgba(6,19,13,.98)`, stays 2.8s | working. Details below the table | when background replies `action:'saved'` to `AUTO_MINER_CANDIDATE` and the button exists |
| O10 | `<style id="style-minerador-final">` `@keyframes slideIn` | content.js:769-777 | — | working | injected only by O5 |

O5 details:
- The toast says "Copiado" before the clipboard write settles and before the save is confirmed.
- `${texto}` and `${contexto.titulo}` are inserted through `innerHTML` **without escaping** (content.js:733, 765).

O6 details:
- The overlay says "Frase Capturada!" even if the save fails: `sendMessage` has no callback.
- `${preview}` is inserted through `innerHTML` **without escaping** (content.js:134).
- It is the only overlay drawn in **cyan**, and it is centred on screen.

O8 details:
- The count is `en + ru` whether or not each language is enabled, but the limit only sums enabled languages (content.js:351-352). With RU off and 5 RU phrases mined earlier today you get something like "25/20" in yellow.
- The pill has no label to say what the numbers are.

O9 details:
- It reuses O5's id, so the two toasts replace each other.
- It references `slideIn`, which is only injected by O5. If no manual mine happened on the page yet, there is no entrance animation.
- Skips are never shown to the user, only logged to `console.debug` (content.js:376).

### 2.3 Overlay strings (verbatim)
- "Frase Capturada!" (content.js:131), "⚡" (content.js:130)
- "Minerado &amp; Copiado · ${idioma}" (content.js:759)
- "Auto Miner - ${idioma} - ${count}/${limit}" (content.js:423)
- Badge "${count}/${limit}", "A" (dead)
- Badge title "Auto Miner desligado" (dead), "Auto Miner ${count}/${limit} | último skip: …" (dead)
- Reason labels (dead): see O8c
- Language values shown: "Inglês" / "Russo"

---

## 3. Toolbar icon (`manifest.json`, `icon.svg`, `chrome.action`)

| # | Item | Location | Fact | Status |
|---|---|---|---|---|
| T1 | `action.default_popup` | manifest.json:24-26 | `popup.html` | working |
| T2 | `action.default_icon` / top-level `icons` | manifest.json | **Missing.** Chrome shows its auto-generated grey letter tile ("P") in the toolbar, and a generic icon on chrome://extensions and in the Web Store | **missing** |
| T3 | `icon.svg` (128x128: `#0c0c0c` rounded rect rx 22, `#00ffff` lightning bolt) | icon.svg:1-6 | **Not referenced anywhere** (grep of html/js/json/css finds nothing). Chrome doesn't accept SVG for manifest icons anyway; it needs PNG 16/32/48/128. No PNG icons exist in the repo | **orphan** |
| T4 | `action.default_title` | manifest.json | Missing, so the hover tooltip falls back to the name "PerpetualMiner" | ok (default) |
| T5 | Badge text or color (`chrome.action.setBadgeText`, `setBadgeBackgroundColor`, `setIcon`, `setTitle`) | grep of all JS | **None used anywhere.** The Auto Miner count could appear here but doesn't | n/a |
| T6 | (Adjacent) context menu "Enviar para o PerpetualMiner" on selection | background.js:92-118 | Saves through `salvarFrase` with **no visible feedback** in the page or on the toolbar. It is created only in `onInstalled` | working (silent) |

---

## 4. Redundancies

1. **Auto Miner controls, 3 places.** The popup P6–P11 duplicates painel `.auto-miner-panel` (`#panel-auto-en/ru`, `#panel-auto-limit-en/ru`, `#panel-auto-count-en/ru`, painel.html:430-437, painel.js:997-1061). The overlay badge O8 shows the same counter a third time, with a different formula.
2. **Delete selected.** Popup P23 duplicates painel `#btn-delete-selected` (painel.html:142). painel's version has a confirm, deletes from Firestore and writes tombstones. The popup's has none of these, which is why it is broken.
3. **Select all.** Popup "Tudo" P22 duplicates painel "Pág." / "Todas" (`#btn-sel-pagina`, `#btn-sel-todos`).
4. **Adding phrases.** Popup "Adicionar" P19 overlaps painel "Adição em Massa" (`#btn-multi-add`) and "Importar .txt".
5. **Phrase list.** Popup "Últimas mineradas" (5 items, read-only) is a subset of painel `#phrases-list`.
6. **Refresh inside the popup.** `#btnRefresh` duplicates the automatic `storage.onChanged` refresh.
7. **Capturing selected text, 2 paths.** The custom shortcut (O3, which gives feedback) and the context menu (T6, which gives none).
8. **Mining a subtitle, 2 triggers.** The floating button (O2) and Alt+S (O1), which works even with no button.
9. **Two near-identical toast builders** sharing the id `#notificacao-minerador`: O5 and O9, with duplicated inline CSS.
10. **Two "atalho" concepts.** The configurable selection-capture shortcut, and the fixed, undocumented Alt+S for subtitles.
11. **Auto Miner state push to the popup.** The dead `runtime.onMessage` listener (P12) sits alongside the working storage listener.

## 5. Orphan / dead summary
- **Orphan:** `icon.svg` (T3).
- **Dead:** popup `runtime.onMessage` AUTO_MINER listener (P12); badge tooltip (O8a); badge "A" / "Auto Miner desligado" (O8b); all skip-reason labels (O8c).
- **Missing:** manifest icons (T2); badge API use (T5).
- **Orphan CSS:** none in popup.css.
- **Broken:** popup delete for signed-in users (P23: the phrase comes back, and there is no confirm); overlay badge count math (O8); duplicate save when the clipboard fails (O4).
- **Security/UX risks:** unescaped `innerHTML` in O5 and O6; `postMessage` bridge with no origin check (O4); Alt+S hijacks typing in forms and silently saves on pages without a video (O1).

## 6. Messages that say nothing (vague, missing, dev-speak)

| Where | Text / behaviour | Problem |
|---|---|---|
| content.js:465 | red border for 800ms, no text | the failure isn't explained ("nenhuma legenda encontrada") |
| content.js:131 | "Frase Capturada!" | shown before and regardless of save success. No error path |
| content.js:759 | "Minerado &amp; Copiado · …" | optimistic. The clipboard may have failed |
| background.js:100-118 | context menu save | no feedback at all |
| popup.js:212 | Adicionar failure | silent return, no message |
| popup.js:61, 90 | Auto Miner load/save failure | silent |
| popup.js:184 | Deletar | no confirm and no result message |
| popup P8/P11, overlay O8 | "0/20", "12/40" | no label. Doesn't say "hoje" or "limite diário" |
| popup P7/P10 | bare number input | no label or unit |
| popup P5 | "Auto Miner" | no description of what it does (i+1 filtering, EN/RU) |
| popup.js:259, 268, 272 | "Middle Click", "Mouse Back", "Mouse Forward", "Mouse Btn N", raw `e.code` ("Semicolon", "BracketLeft", "Numpad1") | English / dev-speak in a PT UI |
| popup.js:210 | `titulo: 'Manual Input'` | English, shown later as context in painel |
| content.js:380-391 | "não é i+1", raw reason code fallback, "desconhecido" | dev-speak (currently unreachable) |
| popup.js:118 | "Nenhuma frase salva ainda." | doesn't say how to capture one |
| popup P13 | "Configurar Atalho de Captura" | doesn't say it is for **selected text**, not subtitles. Alt+S isn't documented |
| popup P22 | "Tudo" | selects only the 5 visible items |

---

## 7. Current visual identity

**Logos and icons in use**

| Where | Mark |
|---|---|
| `icon.svg` (unused) and popup header (popup.html:11-14) | 128-grid rounded square `#0c0c0c` (rx 22) with a `#00ffff` lightning bolt, path `M76 12 L40 68 H60 L52 116 L88 60 H68 Z` |
| Capture overlay (content.js:130) | "⚡" emoji, matching the bolt |
| Floating button (content.js:206-212) | Feather-style "message-circle" chat-bubble outline, stroke `#00ff88`, 24px, on a dark glass square with a green border. **Doesn't match the bolt** |
| painel sidebar (painel.html:14-24) | **A different logo**: a filled speech bubble with a Google 4-colour gradient (`#4285F4` → `#EA4335` → `#FBBC05` → `#34A853`), plus the wordmark "**Perpetual**Miner" |
| bookreader (bookreader.html:14-29) | Purple book (`#a78bfa` → `#7c3aed`), "BookReader / PerpetualMiner" |
| Toolbar | none (Chrome's generated "P") |

**Wordmark:** "**Perpetual**Miner". In the popup "Perpetual" is weight 700 `#00ffff` and "Miner" is weight 300 `#e2e8f0`.

**Popup palette** (all hard-coded hex or rgba; there are **no CSS custom properties**)
- Backgrounds: body `#111214`, header `#0d0d0f`, surfaces and cards `#18191d`, card hover `#1c1e23`, logo tile `#0c0c0c`
- Text: `#e2e8f0` primary, `#b8c4d0` card text, whites at 0.22–0.7 alpha for secondary text
- Primary accent: cyan `#00ffff`, used at alpha 0.05, 0.07, 0.08, 0.09, 0.1, 0.13, 0.14, 0.17, 0.18, 0.2, 0.22, 0.25, 0.28, 0.3, 0.38, 0.42, 0.45, 0.48, 0.5, 0.55, 0.6, 0.7. Many ad-hoc steps
- Secondary accent (Auto Miner): green `#00ff88`, used at alpha 0.08, 0.13, 0.18, 0.2, 0.52
- Danger: `#f87171` text on `rgba(239,68,68,.09–.5)`

**Overlay palette**
- Button: `rgba(10,10,10,.85)` background (hover `rgba(20,20,20,.95)`), border and icon `#00ff88`, error `red`
- Mining toast: `rgba(10,10,10,.98)` with `#00ff88` header and border, `#fff` text
- Auto Miner toast: `rgba(6,19,13,.98)` with `#00ff88` and `#fff`
- Capture overlay: `rgba(15,15,15,.95)` with a cyan `#00ffff` border at 0.3, a glow, and cyan text
- Badge: `#00ff88` / `#facc15`, text `#06130d`

So the overlay mixes green and cyan: the button and toasts are green, while the capture overlay is cyan like the popup.

**painel (for contrast):** a light theme, body `#f9fafb`, text `#111827`, and a purple gradient sidebar (`#7c3aed` → `#5b21b6` → `#3b0764`). This is a completely different identity from the dark/cyan popup.

**Fonts:** `'Segoe UI', system-ui, sans-serif` in the popup and every overlay element (painel and bookreader add `-apple-system`). No webfonts. The popup uses sizes 9–13px (section titles are 9px uppercase with 0.1em tracking).
