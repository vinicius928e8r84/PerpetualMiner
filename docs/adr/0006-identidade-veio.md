# The visual identity is Veio: graphite and gold, one accent

Four directions were prototyped: A Veio (graphite and gold), B Caderno (paper and ink), C Sinal (black and mint) and D Aurora (indigo and violet). The owner chose A as the base, dark by default with a light theme as an option, and borrowed one thing from each of the others: from B the highlighter mark on the word, from C the small blinking cursor at the end of the name, from D the generous rounded shapes (pills, round toggles). The values live in `veio/tokens.css` and the components in `veio/`; this record keeps the rules the tokens do not say.

- **One accent.** Gold is the only accent. Green, red and blue mean state (Enviada ao Anki, danger, Exportada) and never decorate. The one exception is data visualization: inside a chart and its legend, gold and `info` mark series (gold for real photo and mature, `info` for AI-generated and recent). Outside a chart, gold stays for the primary action and for selection.
- **The overlay is always dark.** It lives over third-party pages, so it uses the dark tokens whatever theme the person chose.
- **The mark.** The toolbar tile is always dark, in both Chrome toolbars, because that is what reads at 16 px. Inside the pages the mark follows the theme: the dark tile weighed too much on a light page.
- **Shape.** A selection never uses a side bar; it uses the accent border and a faint accent fill. An input always has a border.
- **Motion.** Nothing moves unless it says something. The blinking cursor is the only ambient animation; every other motion signals a state.
- **Contrast.** Text is at least 4.5:1 and control borders and icons at least 3:1, in both themes.
- **Danger buttons come in two forms.** The outlined one opens the confirmation modal; the filled one confirms inside it.
- **Fonts.** Every typeface of the identity has Cyrillic (measured on the Google Fonts API on 2026-09-14).

The other three directions were not used as a base; what the owner liked in each is the loan listed above, and the prototype that compares the four (`docs/design/identidade-veio/prototipo-identidade.html`) remains the record of what they looked like. The mix is the "locked" variant (`?variant=F`) of that prototype.
