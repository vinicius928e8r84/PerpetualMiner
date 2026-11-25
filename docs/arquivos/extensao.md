# Arquivos da extensão

O papel de cada arquivo da raiz, de `lib/` e de `veio/`, em uma frase. Lido sob demanda, não em toda sessão.

A regra `indice-de-arquivos` exige uma linha, aqui ou em [testes-e-ferramentas.md](testes-e-ferramentas.md), para cada arquivo novo da raiz, de `lib/`, de `veio/` e do topo de `scripts/`, e acusa a linha que cita um arquivo que não existe mais. Estas duas tabelas usam `merge=union` no `.gitattributes`; por isso a mesma regra acusa duas linhas com a mesma primeira coluna.

| File | Role |
|------|------|
| `manifest.json` | Permissions and content script registration. |
| `content.js` | Injected into all pages; mines captions and selections and drives the overlay (skill `overlay`). |
| `overlay/overlay.js` + `overlay/overlay.css` | The in-page overlay: the floating button and the feedback pill in a Shadow DOM (skill `overlay`). |
| `background.js` | The service worker: saves Frases, the context menu, the toolbar badge, the day rollover. |
| `lib/nuvem-do-firestore.js` | The conversation with Firestore: the field codec, the cloud errors and the HTTP calls. Loaded before `lib/sincronizacao.js`. |
| `lib/sincronizacao.js` | Cloud sync of the Histórico. |
| `popup/popup.html/js/css` | The popup (skill `popup`). |
| `lib/ranking.js` | The group ranking of the level quiz. |
| `lib/atalhos.js` | The recorded shortcuts: storage, defaults and event matching. |
| `lib/chave-legada.js` | The old `pm-segredos` store of the OpenAI key (open, read, clear) and the old `pm_chave_openai` marks. Temporary: delete it, its `<script>` in `painel/painel.html` and the migration in `limparLegado` after 2027-03-01. |
| `lib/chave-da-openai.js` | The extension's side of the OpenAI key: requests to the Conexão and the cached summary (skill `configuracoes`). |
| `conexao/perpetualminer.ankiaddon` | The Conexão com o Anki as the file the person downloads, built at the merge by `complemento/versao_no_merge.py`. |
| `bookreader/bookreader.html/js/css` | Minerar de uma foto (skill `minerar-foto`). |
| `bookreader/coluna-da-foto.js` | The column states and the list of read phrases of Minerar de uma foto. |
| `bookreader/leitura-do-gemini.js` | The request that reads the marked passages of a photo with Gemini. |
| `bookreader/abrir-o-painel.js` | Opens or focuses the Painel from Minerar de uma foto. |
| `veio/componentes-formulario.css` | The Veio form controls (`veio-campo`, `veio-select`, `veio-checkbox`, `veio-toggle`, `veio-segmentado`, `veio-busca`), cut from `veio/componentes.css` with their order kept. Every page that loads `componentes.css` loads it right after (`painel/painel.html`, `popup/popup.html`, `bookreader/bookreader.html`, `e2e/vitrine/vitrine.html`). |
| `veio/tokens.css`, `veio/tema.js`, `veio/componentes.css`, `veio/componentes.js` | The shared Veio identity: tokens, the chosen theme and the base components (`veio/README.md`, skill `veio-componentes`); `veio/` also holds the fonts and icons. |
| `lib/voz/catalogo.js`, `lib/voz/catalogo-nivel.js` | The Voice catalog as data, the source of every screen text. |
| `lib/voz/texto.js` | `textoDaVoz(id, valores)`: a catalog text by ID, with its templates filled. |
| `lib/idioma.js` | The one language detector and the Idioma helpers. |
| `lib/contexto.js` | The Contexto as the screen says it: the Fonte's name, the day and how long ago. |
| `lib/filtro-das-frases.js` | What the Frases list shows: the Frases that pass every active filter, newest or oldest first. Pure, no screen. |
| `lib/contexto-do-site.js` | The Contexto of a mined caption, one rule per player; any other site is `web`. |
| `lib/legenda-da-amazon.js` | The Prime Video caption reader: the direct selectors, then the position on screen. |
| `lib/legenda-da-pagina.js` | The caption on screen of the active video: a site-to-reader table, the selector reader and the visual reader. |
| `lib/conexao-anki.js` | The shared owner of `/health` and the connection state across Painel and popup. |
| `lib/conexao-na-tela.js` | The shared presentation of the Conexão in the first-connection strip, card and step. |
| `lib/configuracao.js` | The first-run setup: the steps of Boas-vindas and the "Configuração pela metade" reminder. |
| `lib/ajustes-de-envio.js` | The Ajustes de envio of each Idioma: defaults, stored shape and the save that refuses a stale version. |
| `lib/txt-de-frases.js` | The format of the Frases `.txt` (`[Contexto: …]`, the Palavras before ` : `): read a line, write a line. Pure, no screen. |
| `lib/mineracao.js` | Shared mining requests and selection context. |
| `lib/mineracao-do-dia.js` | The day rules and channel names of the Mineração automática. |
| `lib/historico.js` | The one owner of the writes of `frases`, under the `pm-historico` Web Lock. |
| `lib/apagar-frases-pendente.js`, `lib/envio-gravado.js` | A pending Apagar tudo that resends itself; the writer of `pm_envio`. |
| `lib/pedido-ao-anki.js` | The only way the extension asks the Conexão com o Anki: one builder per request. |
| `lib/pareamento.js` | This browser's Pareamento with the Conexão: the credential, the proof and the signatures. |
| `lib/abridor.js` | The Conexão's opener seen from the extension (Native Messaging). |
| `lib/abrir-o-anki.js` | Opening the Anki on the person's click, and the opener's own repair. |
| `abridor/ponte.html` | The empty page the Painel keeps in a hidden frame for `lib/abridor.js`. |
| `lib/vocabulario-da-mineracao.js` | The last Vocabulário reading the Mineração automática uses; it has no expiry. |
| `lib/palavra-automatica.js` | The choice of the Termo for the Mineração automática and for saving a Frase, as a pure function. |
| `lib/mineracao-automatica-decisao.js` | The Mineração automática's decision, through ports. |
| `lib/mineracao-automatica.js` | The Mineração automática seen from a page: state, save and the daily-limit field. |
| `lib/mineracao-automatica-na-pagina.js` | The Mineração automática seen from the page, loaded before `content.js`: waits for the caption to stop, sends the candidate, draws the badge and the notice. |
| `lib/arquivos-da-extensao.js` | The files the extension uses at run time, found from `manifest.json`. |
| `lib/ankiweb.js` | The code of the Conexão's AnkiWeb page and its download link. |
| `lib/quiz-de-nivel.js`, `lib/festa-do-quiz.js`, `lib/som-do-quiz.js` | The level quiz of Boas-vindas, its celebration and its sound. |
| `lib/auto-recarregar.js` | Reloads an unpacked extension when its files change. |
