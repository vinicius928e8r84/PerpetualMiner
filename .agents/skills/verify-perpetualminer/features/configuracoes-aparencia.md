# Aparência

Configurações › Aparência has one control, **Tema**: Escuro (the default) or Claro. The choice changes the panel at once, is kept (`pm_tema`) and is followed by the panel in every open tab and by the popup. What the extension draws over web pages stays dark.

## Sub-features

- `tema-default` with no stored choice the panel opens dark, the row says `Escuro` and `pm_tema` is not stored.
- `tema-choose` picking **Claro** changes the screen at once without reloading, with no toast (the change is its own feedback) and stores `pm_tema: 'claro'`; picking **Escuro** stores `'escuro'` and gives back the default; the choice survives a reload.
- `tema-follow` a panel open in another tab changes together, without reloading; the popup follows on the spot and when opened again (`data-tema="claro"` on `<html>`).
- `tema-overlay` the overlay over the pages (the button, the line, the pill) stays dark in the Claro theme.
- `tema-quality` in Claro the panel text passes the AA contrast (4.5) in the title, description, summary and options; the change does not animate (no running transition in the frame of the change); the brand of the panel and of the popup switch to the light tile (`icone-claro.svg`); the selector is as wide as its options, not as the card; it has a name (`Tema`), is reached by keyboard and the arrows switch the theme.

## How to get to it (user POV)

- Sidebar › **Configurações** › **Aparência** (`painel.html#configuracoes/aparencia`), then **Claro** or **Escuro**.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The option's radio is hidden by the segmented control, so the spec clicks its label (`#cfg-tema label`); the background is read from `getComputedStyle(document.body)`.

- **Choose and keep.** `drive.sh tema configuracoes-tema.spec -g "sem escolha gravada|escolher Claro|continua depois de recarregar|voltar para Escuro"`. Observable: the body background changes between the dark and the light token value, the summary reads `Claro`, `pm_tema` is `'claro'` (not stored at first), after `page.reload()` the radio `Claro` is checked.
- **Follow.** `-g "já aberto em outra aba"`, `-g "popup segue o tema"`, `-g "continua escuro"` (the page overlay).
- **Quality.** `-g "contraste AA"`, `-g "não anima"`, `-g "a marca do painel"`, `-g "largura das opções"`, `-g "alcançável pelo teclado"`.
- **Visual.** `configuracoes-visual.spec.js` and `configuracoes-modelo-visual.spec.js` compare against committed Linux references; never `--update-snapshots`.

## Gotchas

- The popup and the panel are separate pages: a proof that the popup follows needs both open in the same profile, as the spec does.
- Only `escuro` and `claro` exist; there is no "follow the system" option and `veio/tema.js` does not read `prefers-color-scheme`, so the browser's own colour scheme does not change the result.
