# Arquivos do painel

O papel de cada arquivo de `painel/`, em uma frase, com a skill do assunto. Lido sob demanda, não em toda sessão.

A regra `indice-de-arquivos` exige uma linha, aqui ou nas outras tabelas de `docs/arquivos/`, para cada arquivo novo de `painel/`.

| File | Role |
|------|------|
| `painel/painel.html/js/css` | The Painel page: the Frases list, Google sign-in and sync (skill `painel-frases`). |
| `painel/esqueleto-modais.js` | The markup of the five modals of the Painel, built with `Veio.elemento` before `painel/painel-shell.js`; no logic (`testes/test_painel_modais.js` keeps the tree equal). |
| `painel/painel-shell.js` | The "Ilhas" shell: one page, one area per address, the sidebar indicators. |
| `painel/painel-conta.js` | The Conta in the Painel: the Conta & sync card and the sidebar chip (skill `configuracoes`). |
| `painel/painel-atalhos.js` | The shortcut recorder, used in Configurações and in a step of Boas-vindas (skill `configuracoes`). |
| `painel/painel-boas-vindas.js`, `painel/painel-boas-vindas-minerar.js`, `painel/painel-boas-vindas-nivel.js`, `painel/painel-boas-vindas-quiz.js`, `painel/painel-boas-vindas-festa.js`, `painel/painel-boas-vindas-envio.js`, `painel/painel-quiz.css` | The Boas-vindas page, one step per card, with the level quiz and the first Envio (skill `boas-vindas`). |
| `painel/painel-boas-vindas-ranking.js` | The ranking under the quiz result. |
| `painel/painel-chave.js` | The Chave do Gemini card (skill `configuracoes`). |
| `painel/painel-ia.js`, `painel/painel-ia-chatgpt.js`, `painel/painel-ia-modelo.js/css`, `painel/painel-ia-estado.js` | The IA dos cartões card: the OpenAI key column, the ChatGPT sign-in column and the model choice (skill `configuracoes`). |
| `painel/painel-perigo.js` | The Zona de perigo card and the Apagar tudo confirmation (skill `configuracoes`). |
| `painel/painel-abrir-anki.js` | The Conexão com o Anki card of Configurações: open the Anki with the computer, and the Perfil do Anki (skill `configuracoes`). |
| `painel/painel-anki.js` | The Custos tab and the area's first-connection strip (skill `painel-anki`). |
| `painel/painel-anki-primeira-conexao.js`, `painel/painel-anki-primeira-conexao-estado.js` | The first-connection card over the tabs and its state machines. |
| `painel/painel-conexao-passos.js`, `painel/painel-conexao-passos-pecas.js`, `painel/painel-conexao-arraste.js/css`, `painel/painel-conexao-passos-estado.js` | The steps to put the Conexão in the Anki, shared by Boas-vindas and the first-connection card. |
| `painel/painel-anki-plano.js` | The Custos pieces that need no DOM: the ChatGPT plan card, the sums and the period. |
| `painel/painel-anki-continuar.js` | The Continuar envio of the Custos detail. |
| `painel/painel-anki-baralhos.js` | The Baralhos e termos and Vocabulário tabs. |
| `painel/painel-ajustes.js` | The Ajustes de envio tab, one card per Idioma. |
| `painel/painel-anki-estilo.js`, `painel/painel-anki-previa.js`, `painel/painel-anki-tipo-proprio.js`, `painel/painel-previa.css` | The Estilo do cartão of Ajustes de envio: Nível, preview and own note type. |
| `painel/painel-envio.js`, `painel/painel-envio-estado.js` | The Envio ao Anki modal and the state machines that follow an Envio. |
| `painel/painel-envio-anki-fechado.js` | Enviar ao Anki with the Anki closed. |
| `painel/painel-envio-cartao.js` | An Envio's card in the modal. |
| `painel/painel-envio-apagar.js` | The Apagar tudo request to the Conexão. |
| `painel/painel-envio-resumo.js` | The Envio's summary: when to open it, how it is written and what each answer does. |
| `painel/painel-envio-parado.js` | The Envio stopped by a closed Anki, and Continuar envio. |
| `painel/painel-envio-limite.js` | The Envio waiting for the ChatGPT plan's limit. |
| `painel/painel-teto.js`, `painel/painel-teto.css` | The monthly cap: the warning, the Custos card and the Envio band. |
| `painel/painel-conexao-versao.js`, `painel/painel-conexao-versao-estado.js` | The notices at the top of the Painel: the Conexão version and the Pareamento. |
| `painel/painel-lembrete.js` | The "Configuração pela metade" strip at the top of Frases (skill `boas-vindas`). |
