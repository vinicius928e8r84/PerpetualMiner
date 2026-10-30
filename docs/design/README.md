# Redesign do front-end do PerpetualMiner: spec de design

Handoff do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1) para a construção. Reúne a identidade **Veio**, a voz e o catálogo de mensagens, a auditoria do front e os protótipos travados de cada superfície. Consolidado em 2026-09-15 no ticket [Consolidação da spec de design (handoff para a construção)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/15).

O escopo é redesign: auditar, podar, reagrupar e revestir. Nenhuma função nova e nenhuma mudança de motor, **exceto a [lista fechada](#lista-fechada)**.

## Como ler

- Cada superfície tem uma **spec** (`README.md`) e um **protótipo** HTML autocontido. Abra o protótipo direto no navegador; o GitHub mostra só o código-fonte.
- **A spec vale sobre o protótipo.** Os protótipos ficaram intactos como foram aprovados, com as variantes rejeitadas dentro do arquivo como referência. As specs foram corrigidas na consolidação, então onde um protótipo mostra um texto ou detalhe antigo, a spec corrigida manda.
- Cada link de protótipo abaixo já aponta para a **variante travada** (`?variant=`). As outras variantes do mesmo arquivo servem só de referência.
- A cópia de toda tela sai do [catálogo da Voz](voz/README.md). Estado novo que não estiver no catálogo segue as regras V1–V10 e C1–C9.
- Glossário: [`CONTEXT.md`](../../CONTEXT.md) na raiz (Frase, Palavra, Minerar, Fonte, Contexto, Mineração automática, Conexão com o Anki…).

## Fundamentos

| | spec | protótipo | ticket |
|---|---|---|---|
| **Identidade Veio**: marca, tokens, tipo, componentes, ícones PNG | [identidade-veio/](identidade-veio/README.md) | [`prototipo-identidade.html?variant=F`](identidade-veio/prototipo-identidade.html) · o único que pede `python3 -m http.server` | [Identidade visual própria & design system base](https://github.com/vinicius928e8r84/PerpetualMiner/issues/3) |
| **Voz & catálogo**: regras V1–V10 e C1–C9, e todos os estados com a cópia aprovada | [voz/](voz/README.md) | [`catalogo.html`](voz/catalogo.html) | [Voz, tom & catálogo de mensagens/estados](https://github.com/vinicius928e8r84/PerpetualMiner/issues/4) |
| **Auditoria**: cerca de 260 itens com veredito fica/corta/reagrupa, e o levantamento com `arquivo:linha` | [auditoria/](auditoria/README.md) · [levantamento/](auditoria/levantamento/) | [`auditoria-front.html`](auditoria/auditoria-front.html) | [Auditoria & inventário do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/2) |

## Superfícies

| superfície | arquivos de hoje | spec | protótipo travado | ticket |
|---|---|---|---|---|
| Painel: shell “Ilhas” e endereços | `painel.html/css/js` | [painel/shell/](painel/shell/README.md) | [`prototipo-shell.html?variant=B`](painel/shell/prototipo-shell.html) | [Painel — arquitetura de informação & shell](https://github.com/vinicius928e8r84/PerpetualMiner/issues/6) |
| Painel · Frases mineradas | `painel.*` | [painel/frases/](painel/frases/README.md) | [`prototipo-frases.html?variant=A`](painel/frases/prototipo-frases.html) | [Protótipo: Painel · Frases mineradas](https://github.com/vinicius928e8r84/PerpetualMiner/issues/12) |
| Painel · Conexão com o Anki | `painel.*` | [painel/anki/](painel/anki/README.md) | [`prototipo-anki.html?variant=C`](painel/anki/prototipo-anki.html) | [Protótipo: Painel · Conexão com o Anki](https://github.com/vinicius928e8r84/PerpetualMiner/issues/13) |
| Painel · Configurações | `painel.*` | [painel/configuracoes/](painel/configuracoes/README.md) | [`prototipo-configuracoes.html?variant=C`](painel/configuracoes/prototipo-configuracoes.html) | [Protótipo: Painel · Configurações](https://github.com/vinicius928e8r84/PerpetualMiner/issues/14) |
| Boas-vindas (`painel.html#boas-vindas`) | `painel.*`, `background.js` (`onInstalled`) | [painel/boas-vindas/](painel/boas-vindas/README.md) | [`prototipo-onboarding.html?variant=C`](painel/boas-vindas/prototipo-onboarding.html) | [Protótipo: onboarding & primeira execução](https://github.com/vinicius928e8r84/PerpetualMiner/issues/10) |
| Minerar de uma foto (ex-BookReader) | `bookreader.html/css/js` | [foto/](foto/README.md) | [`prototipo-bookreader.html?variant=C`](foto/prototipo-bookreader.html) | [Protótipo: Minerar de uma foto (ex-BookReader)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/7) |
| Popup (mini painel) e badge | `popup.html/css/js`, ícone da toolbar | [popup/](popup/README.md) | [`prototipo-popup.html?variant=A`](popup/prototipo-popup.html) | [Protótipo: Popup (mini painel)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/5) |
| Overlay in-page | `content.js` (só o visual) | [overlay/](overlay/README.md) | [`prototipo-overlay.html?variant=M1`](overlay/prototipo-overlay.html) | [Protótipo: Overlay in-page (content.js)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/8) |
| Dentro do Anki: o item “PerpetualMiner…” em Ferramentas | `complemento/janela.py`, `qt_do_anki.py`, `texto_da_janela.py` | [dentro-do-anki.md](dentro-do-anki.md) | (sem protótipo de tela; a janela é do Anki) | [Dentro do Anki: o item PerpetualMiner… em Ferramentas](https://github.com/vinicius928e8r84/PerpetualMiner/issues/175) |
| Consertar sozinho: o abridor fecha à força o Anki que travou e liga a Conexão desativada | `complemento/conserto_do_anki.py`, `lib/abrir-o-anki.js` | [ensaio-do-conserto.md](ensaio-do-conserto.md) | (a faixa do Envio, BRG-39) | [O Consertar sozinho, e sai o Reparar Anki](https://github.com/vinicius928e8r84/PerpetualMiner/issues/152) |

Todos os protótipos abrem na variante travada por padrão.

## Regra de desempate

Quando duas fontes discordarem, inclusive em algo que só apareça na construção, a dona é definida pelo assunto:

| assunto | dona |
|---|---|
| texto (rótulos, mensagens, estados) | catálogo da [Voz](voz/README.md) |
| visual: tokens, tipo, cor, componentes | [Veio](identidade-veio/README.md) |
| layout e comportamento de uma superfície | o protótipo travado dela, via a spec |
| escopo (o que é função nova) | a [lista fechada](#lista-fechada) |

Se a dona precisar mudar, mude a spec dela; não crie exceção no lugar.

## Fatia ALTA: a página de desenho vem antes do código

Uma fatia que mexe em credencial, em sync ou em estado que vive em mais de um processo escreve antes a página do [modelo de fatia ALTA](modelo-fatia-alta.md): o dono único de cada dado, os estados, as transições, as 8 variantes da Conexão e os limites aceitos. Não retroage nas fatias já entregues. A primeira feita assim é a do Envio dentro da Conexão com o Anki: [envio-no-complemento.md](envio-no-complemento.md) (#142); depois, a do login do ChatGPT: [login-do-chatgpt.md](login-do-chatgpt.md) (#155). O perfil fixo do Anki tem a sua: [perfil-fixo-do-anki.md](perfil-fixo-do-anki.md) (#149). O modelo dos cartões é de risco médio e tem a página [modelo-dos-cartoes.md](modelo-dos-cartoes.md) (#157).

## Lista fechada

As únicas funções novas que a construção pode fazer:

| # | item | superfície | cópia |
|---|---|---|---|
| 1 | Busca na lista de frases (texto e Título, com × para limpar) | Frases | PAI-04 |
| 2 | Confirmação ao apagar 1 frase | Frases | PAI-12 |
| 3 | Cancelar o carregamento, mantendo as frases das fotos já lidas | Minerar de uma foto | FOT-06, FOT-07 |
| 4 | Confirmação ao Recomeçar com frases não mineradas | Minerar de uma foto | FOT-17, FOT-18 |
| 5 | “Tentar de novo” numa foto que falhou | Minerar de uma foto | FOT-11 |
| 6 | Contador da mineração automática no badge da toolbar, somando só os idiomas ligados | ícone da toolbar | MIN-09 |
| 7 | Atalho “Minerar legenda” gravável (aceita botão do mouse, recusa atalho repetido) + “Restaurar atalhos padrão” | Configurações › Atalhos | CFG-11…14 |
| 8 | Abrir a Boas-vindas na instalação (`onInstalled`, só `install`) | background | ONB-01 |
| 9 | Lembrete “Configuração pela metade”, ocultável | Frases, popup | ONB-14, ONB-15 |
| 10 | Seletor de tema (escuro, o padrão, ou claro), lembrado neste computador; vale para o painel, o popup e Minerar de uma foto, e o overlay continua sempre escuro (popup e Minerar de uma foto passam a seguir quando forem refeitos, passos 5 e 6) | Configurações › Aparência | CFG-29…31 |

O que **não** é função nova, e portanto pode entrar sem estar na lista:

- **Revestimento:** rótulos, aria, ícones PNG, estados vazios, cópia do catálogo, a palavra grifada (o dado já existe).
- **Poda:** as chaves “Mostrar custos com 4 casas” e “Mostrar IDs dos envios” no Avançado do Anki. Hoje os custos saem sempre com 4 casas e o ID do envio aparece sempre; as chaves só escondem isso.
- **Retry da mesma ação:** um “Tentar de novo” que repete a mesma ação com o mesmo dado (MIN-03, ADD-06, PAI-15, CFG-03, CFG-05, FOT-15).
- **Correção de bug:** “✓ minerada” tirando a frase do botão em Minerar de uma foto corrige o bug do re-salvar duplicado.

## Conflitos reconciliados na consolidação

As specs abaixo foram corrigidas no lugar. O histórico está no git e no [ticket da consolidação](https://github.com/vinicius928e8r84/PerpetualMiner/issues/15).

| # | ficou | onde mudou |
|---|---|---|
| C1 | Botão do resumo do envio: **“Manter”** + a nota do ENV-10 | Veio, auditoria |
| C2 | A cópia do popup é a do catálogo (POP-01…10) | popup, Voz (POP-05) |
| C3 | O badge soma só os idiomas ligados: “Mineração automática: N hoje”. O contador do overlay é o do idioma. | Voz (MIN-09), popup, overlay |
| C4 | A cópia do overlay é MIN-01…10 (o MIN-10, `erro_web`, é novo) | overlay, Voz |
| C5 | Faixa ONB-15 em Frases e card ONB-16 na Conexão com o Anki | Frases, Anki |
| C6 | O retry da Conexão é o mesmo componente no [passo 4 da Boas-vindas e na área Anki](painel/boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1): “Tentar de novo” (#145) | Boas-vindas, Anki |
| C7 | Com “4 casas” ligado no Avançado, todos os valores ficam com 4 casas | Voz (V7) |
| C8 | O passo 2 da Boas-vindas mostra o atalho gravado | Boas-vindas |
| C9 | Nomes e lugares da auditoria refinados depois (Minerar frases, Foto, Minerar seleção, Ajustes de envio, Exportar na barra) | auditoria (avisos “Superada em”), Frases |
| C10 | “computadores”, não “dispositivos” | Voz, Configurações |
| C11 | Minúscula depois do “·”: “Sem conta · só neste computador” | shell, Configurações |
| C12 | “painel” em minúscula nos rótulos (“Voltar ao painel”) | Voz, Minerar de uma foto |
| C13 | Sessão expirada: botão **“Entrar”** | Configurações |
| C14 | Exemplo da paginação: “1–10 de 1.284” | Voz (PAI-07) |
| C15 | Estados vazios: os três da C2 + PAI-04 | Veio |
| C16 | Cópia dos protótipos que não tinha ID entrou no catálogo (inclusive ONB-01…16); `#boas-vindas` está na tabela de endereços | Voz, shell |
| C17 | Sem atalho de legenda gravado: “Sem atalho” + “Definir atalho” → `#configuracoes/atalhos` | Voz, popup, Frases, Boas-vindas |

Decisões tomadas na consolidação:

- **Palavra:** o termo entrou no glossário. Na tela, o chip é `palavra: …` quando você escolheu e `auto: …` quando foi detectada, igual no Painel e no overlay. “keyword” fica só no código.
- **Falha no overlay:** como o sucesso, some sozinha em ~3,5 s; o Esc fecha antes. Sem × e sem “Tentar de novo” (revisão do dono, PR #66).
- **Botão de perigo:** contorno na entrada que abre o modal; preenchido só no botão que confirma dentro do modal destrutivo.
- **A Veio absorveu a deriva:** títulos 22/700 (página), 24/800 (hero) e 15/700 (card), além do 20/700; raio 22; a exceção de dataviz (ouro e `info` marcam séries em gráficos); e pulsar/piscar só sem `prefers-reduced-motion`.
- **Popup sem subtítulo:** só a marca Veio + “PerpetualMiner”. A descrição fica para a Boas-vindas e a loja.
- **Mineração automática em dois lugares** (popup e passo 5 da Boas-vindas): é deliberado.

## Pendências da construção

- **`commands` do manifest (fechada no #27):** o manifest não declara `commands` e não passa a declarar. O atalho gravado vale só pelo `content.js`, porque aceita botão do mouse, e o `chrome.commands` não aceita ([Configurações](painel/configuracoes/README.md)).
- **F1 (Conexão não instalada):** é provisória até existir o instalador sem terminal, que é um esforço futuro fora deste mapa ([Boas-vindas](painel/boas-vindas/README.md)).
- **Fontes:** Manrope e JetBrains Mono (latin + cyrillic) empacotadas como `.woff2`. No overlay, entram via `web_accessible_resources` e Shadow DOM. Os protótipos puxam do Google Fonts; a extensão não deve.

## Histórico: a ordem em que a construção foi feita (concluída)

Fundação primeiro, depois de dentro pra fora: cada passo só usava o que já existia. Os 8 passos estão no código; o que cada superfície reconstruída faz hoje está nas skills de superfície em `.claude/skills/` (índice em `CLAUDE.md` § Architecture › Surfaces).

**Antes de tudo: os 4 bugs altos** de [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9), corrigidos no código atual. Dois perdem dados (o salvamento em paralelo do BookReader, `bookreader.js:436 · background.js:167`, e o Deletar do popup que ressuscita no sync, `popup.js:184`). Dois são de segurança (o `postMessage` sem checar a origem, `content.js:148`, e o `innerHTML` sem escape, `content.js:134, 733, 765`).

| passo | o quê | depende de | bugs que o passo fecha |
|---|---|---|---|
| 1 | **Base Veio:** tokens CSS compartilhados, fontes empacotadas, ícones PNG, componentes (botões com perigo nas duas formas, campos, toggle, checkbox com estado misto, badges, `kbd`, controle segmentado, azulejo, modal, toast, aviso persistente com Detalhes, esqueleto) e o módulo de cópia do catálogo | nada | detecção de idioma em 3 cópias (tudo que não é cirílico vira Inglês) |
| 2 | **Shell do Painel + Configurações:** endereços (`#frases`, `#anki/*`, `#configuracoes/*`, `#boas-vindas`), sidebar/trilho, chip de conta, status da Conexão, F1, resumo do envio global; Conta & sync, Chave, Atalhos (gravador), Aparência (tema, item 10, [#45](https://github.com/vinicius928e8r84/PerpetualMiner/issues/45)), Zona de perigo | 1 | nomes de Fonte sem escape na sidebar |
| 3 | **Frases:** linha de frase, barra de seleção, busca, modais (Editar contexto, Minerar frases, Apagar, Envio ao Anki), faixa ONB-15 | 2 | Exportar .txt marca como enviada · duplicatas do bridge contadas como enviadas · duplo clique duplica · erro de rede no envio sem mensagem · Exportar→Importar perde palavras · overlay de importação/spinner/progresso falso · seleção sobrevive à troca de filtro · pergunta “apagar enviadas” que não aparece |
| 4 | **Conexão com o Anki:** azulejos por idioma, Custos, Baralhos e termos, Vocabulário, Ajustes de envio, Avançado, card ONB-16 | 2, 3 (envio compartilhado) | “Reparar Anki” com timeout curto · Vocabulário preso em “Aguardando…” · presets salvos em silêncio · erro com cara de carregando e total ≠ soma · nomes de baralho padrão divergentes (parte no bridge) |
| 5 | **Minerar de uma foto** | 1, 2 (chave em Configurações), 3 (padrão de seleção) | re-salvar duplicado e Limpar/Trocar sem cancelar o Gemini (“✓ minerada”) · estado vazio que culpa as marcações · HEIC, Título esquecido e “Voltar” que abre um 2º painel |
| 6 | **Popup e badge** | 1, 2 (“Mudar atalho” → Configurações) | badge somando idioma desligado |
| 7 | **Overlay** (`content.js`, injetado em sites: maior risco) | 1, 2 (atalho gravável) | Alt+S sequestrando inputs e salvando “legenda” de imagem · salva 2× quando o clipboard falha |
| 8 | **Boas-vindas**, por último: embute controles do popup, do overlay e de Configurações, a F1, e o `onInstalled` | 2–7 | — |

## Próximo passo

Não há: a construção terminou. O estado atual de cada superfície está nas skills de superfície em `.claude/skills/` (índice em `CLAUDE.md` § Architecture › Surfaces); a spec que guiou a construção é [Construção do redesign do front-end (Veio)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/17).
