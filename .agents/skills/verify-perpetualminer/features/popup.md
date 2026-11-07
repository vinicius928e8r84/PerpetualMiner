# The toolbar popup

The popup (click the toolbar icon) is the quick door: type a phrase and mine it, see the last 5 phrases, open the panel, see the shortcut that mines the caption, and turn the automatic mining on or off per language ([mineracao-automatica.md](./mineracao-automatica.md)). It reads, it does not manage: the full list is in the panel.

## Sub-features

- `popup-open-panel` **Abrir painel** focuses the panel tab if there is one (without opening another or changing its address) and otherwise opens a new one.
- `popup-last-five` the 5 last phrases, read-only: the Palavra highlighted (`mark`) and the Contexto (`Netflix · The Bear · T2 · E7 · hoje`, `Livro · Маугли · cap. 3 · hoje`, `Web · The Atlantic · hoje`); no checkbox, Deletar, ↻ or Tudo. A phrase mined in another tab appears at the top at once (a short highlight, still with reduced motion); **Ver todas** takes the open panel tab to `#frases`.
- `popup-quick-mining` the quick field is `mine-popup-quick` in [mineracao.md](./mineracao.md) (Enter mines, Shift+Enter breaks the line, the Russian text takes the Russian language); a failing service worker shows POP-06 with the alert and keeps the text in the field.
- `popup-empty` POP-01 loading is a skeleton with no text; POP-02 empty is `Nenhuma frase ainda` with `Aperte Ctrl+Shift+L num vídeo com legenda para minerar a primeira.` (the recorded shortcut, as `kbd`), or `Defina um atalho para minerar legendas de vídeo.` with **Definir atalho** when none; **Ver todas** is absent.
- `popup-shortcut-footer` the footer says `Alt+S minera a legenda do vídeo` with the recorded shortcut (it follows a change made in Configurações) and **Mudar atalho** (or `Sem atalho` and **Definir atalho**) takes the panel tab to Configurações › Atalhos ([configuracoes-atalhos.md](./configuracoes-atalhos.md)).
- `popup-auto-tiles` the Inglês | Russo tiles of the automatic mining: [mineracao-automatica.md](./mineracao-automatica.md) › `auto-settings`.
- `popup-anki-seal` with the Conexão off or the Anki closed the tile says `— esperando o Anki` or the seal says `Vocabulário de ontem, 14:02` (the day and hour of the oldest reading among the languages that are on); with the Anki open the seal goes away; **Abrir o Anki** is `anki-open-button` in [anki.md](./anki.md).
- `popup-access` every control has a name for the screen reader and Tab visits them in order, each with a visible focus.

## How to get to it (user POV)

- Click the PerpetualMiner icon on the toolbar (the harness opens `popup.html` as a page of the extension).

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The popup is opened with `page.goto(extensao.url('popup.html'))`; phrases are seeded with `extensao.gravarStorage({ frases })`; the active tab is read from the service worker (`abaAtiva`).

- **Panel door.** `drive.sh popup-painel popup.spec -g "Abrir painel|Ver todas"`. Observable: with a panel tab open, the active tab becomes it, with its address unchanged (`#configuracoes`) and exactly one panel tab; without one, a new panel tab opens; Ver todas makes the open tab `…/painel.html#frases` showing the list.
- **Last five.** `-g "as 5 últimas, só leitura"`: five items, the first `mark` is `responsibility`, no input or button inside `#ultimas`. `-g "frase minerada em outra aba"`, `-g "carregando (POP-01)"`.
- **Empty and shortcut.** `-g "vazio"` (POP-02, with and without a recorded shortcut; `kbd` Ctrl, Shift, L), `-g "rodapé"`, `-g "Mudar atalho"`: the panel tab ends at `#configuracoes/atalhos` with `Atalhos` expanded, still one panel tab.
- **Quick mining.** `-g "mineração rápida"` — see [mineracao.md](./mineracao.md) › `mine-popup-quick`.
- **Seal and tiles.** `-g "selo"`, `-g "esperando o Anki"`, `-g "leitura de outro Baralho"`.
- **Accessibility and motion.** `-g "todo controle do popup"`, `-g "o Tab passa por todos"`, `-g "movimento reduzido"` / `-g "sem movimento reduzido"`.
- **Visual.** `popup-visual.spec.js` against committed Linux references; never `--update-snapshots`.

## Gotchas

- The real popup is a Chrome bubble the harness cannot click; the specs load the same page in a tab, so its size is the tab's unless the spec sets a viewport (the visual one uses 340 px wide).
- The Conexão is the fake: the seal and `— esperando o Anki` prove the popup against the contract, not against a real Anki.
- `popup.spec.js` does not freeze the clock (`hoje` is the host's today and the seal's "ontem" is built from `new Date()`); `popup-visual.spec.js` freezes `2026-09-18T12:00:00`. Keep each as it is.
