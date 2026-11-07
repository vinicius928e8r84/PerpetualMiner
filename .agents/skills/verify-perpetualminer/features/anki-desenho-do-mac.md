# The Mac drawing in “Ter o Anki”

In the never-connected card (and Boas-vindas step 4), step 1 **Ter o Anki**: after **Não tenho** on a Mac, the step shows a small drawing of dragging the Anki to the Aplicativos folder (ONB-25, #238), between the **Baixar o Anki** link and the sentence “Arraste o Anki para a pasta Aplicativos e abra-o de lá.”. Windows and other systems have no drawing.

## Sub-features

- `mac-drawing` two frames in the style of the ONB-19 warning animation, alternating by themselves (`--veio-ciclo-dos-quadros`): the Anki icon beside the `Aplicativos` folder with an arrow, then the icon inside the folder (the folder gets the Base's focus ring). Image only (`aria-hidden`); the sentence below is what a screen reader reads.
- `mac-drawing-reduced-motion` with reduced motion the two frames are still and side by side; below 560 px they stack inside the card.
- `mac-drawing-only-on-mac` Windows and other systems keep only the link and their sentence (`.pc-arraste` is not built).

## How to get to it (user POV)

- Sidebar › **Conexão com o Anki** (never connected, Conexão off) › step 1 **Ter o Anki** › **Não tenho**, on a Mac.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green; `fakes.anki.desligar()`; the spec sets the system with `comOSistema(page, SISTEMAS.MAC)`.

- **The drawing.** `drive.sh mac-desenho ter-o-anki-mac.spec -g "Mac"`. Observable: `.pc-arraste` with two `.pc-arraste__quadro`, its order between the link and `.pc-anki__depois`; `ter-o-anki-mac-desenho.png` (and `-parado.png` with reduced motion).
- **Other systems.** `drive.sh sem-desenho ter-o-anki-mac.spec -g "Windows"` (and `-g "fora do Mac"`): no `.pc-arraste`.

## Gotchas

- The Chromium of the tests is Linux: without `comOSistema` it is neither Mac nor Windows.
- The visual references are `test.fixme` (`painel-anki-visual.spec.js` “Não tenho, no Mac” and `ter-o-anki-mac-visual.spec.js`) until the owner looks; never `--update-snapshots`.
