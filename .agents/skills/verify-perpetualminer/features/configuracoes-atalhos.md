# Atalhos

Configurações › Atalhos is where a person records the key combination (or an extra mouse button) for **Minerar legenda** (default Alt+S) and **Minerar seleção** (default none). They apply to every page open in Chrome without reloading it; the popup footer follows them.

## Sub-features

- `atalhos-card` the card shows the two rows with the current shortcut (`Alt+S`, and `Sem atalho` dashed for the selection) and a **Gravar atalho** per row; a shortcut stored with an English label (`Alt+Mouse Back`) shows in Portuguese (`Alt+Botão voltar`); the closed row summarises (`Legenda Ctrl+Shift+K`, `Seleção Sem atalho`).
- `atalhos-record` recording: the next combination becomes the shortcut (`pm_atalho_legenda` / `pm_atalho` with `type`, `code`, modifiers), the pill says `Pressione as teclas ou um botão extra do mouse…`, the button becomes **Cancelar** and the other row's is unavailable. A key without Ctrl, Alt or Shift (not even with Meta) and only modifier keys do not record; Esc without modifier cancels; leaving the card cancels; left and right mouse clicks do not record; an extra mouse button does (and the page does not navigate back while recording).
- `atalhos-duplicate` a shortcut already used by the other action is refused with `Esse atalho já é do Minerar legenda. Grave outro.` (danger colour); recording goes on and nothing is stored until a free combination is pressed.
- `atalhos-restore` **Restaurar atalhos padrão** appears only when something is off the default (`Padrão: Minerar legenda em Alt+S, Minerar seleção sem atalho.`), stores legenda Alt+S and selection none at once, with no confirm, modal or toast, and keeps the focus on the first row's button.
- `atalhos-effect` a new combination mines in an already open player without reloading; the old default stops mining; with no caption shortcut, Alt+S does not mine; a recorded selection shortcut mines the selected text.

## How to get to it (user POV)

- Sidebar › **Configurações** › **Atalhos** (`painel.html#configuracoes/atalhos`).
- The popup footer's **Mudar atalho** (or **Definir atalho** when none) opens the same card.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. Recording is driven by real key presses (`page.keyboard.press`); the stored result is read with `extensao.lerStorage`.

- **Card and recording.** `drive.sh atalhos configuracoes-atalhos.spec`. `-g "aberto, o card mostra"`: `Alt+S` and `Sem atalho` with the dashed class, no Restaurar. `-g "gravar Ctrl\+Shift\+K"`: after recording, the row says `Ctrl+Shift+K`, `pm_atalho_legenda` matches `{ type: 'keyboard', code: 'KeyK', ctrlKey: true, shiftKey: true, altKey: false }`, and in an open player Alt+S mines nothing while Ctrl+Shift+K saves the caption.
- **Refused and restore.** `-g "um atalho repetido é recusado"` (stored shortcuts stay `{}` until `Alt+D`), `-g "Restaurar atalhos padrão só aparece"` (`pm_atalho` null, `pm_atalho_legenda` Alt+S, zero `confirm()` calls).
- **Edges.** `-g "Esc sem modificador"`, `-g "uma tecla sem Ctrl"`, `-g "sair do card cancela"`, `-g "clique esquerdo e direito"`, `-g "botão voltar"`, `-g "pelo teclado"`, `-g "o leitor de tela ouve"`, and the reduced-motion pairs (`-g "movimento reduzido"`).

## Gotchas

- Native shortcuts of Chrome or the system (and shortcuts the OS swallows) never reach the page; the specs press keys inside the page. A combination that works in the harness can still be taken by the person's browser.
- The mouse back button is recorded by its `button` number (`3`) and a stored English label (`Alt+Mouse Back`) is shown in Portuguese; the spec seeds that one only to prove the label.
- A spec that records another shortcut changes it only in that test's profile.
