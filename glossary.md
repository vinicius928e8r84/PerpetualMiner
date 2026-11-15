# PerpetualMiner

Extensão que minera frases de legendas, páginas web e livros físicos num histórico de estudo e as envia ao Anki como cartões.

Como ler: o nome em negrito é o único nome do conceito, e é o que a tela diz. `_Nome no código_` é o nome técnico que o código já usa e pode manter; fora dele (tela, docs, issues, testes, nomes novos) vale o termo. `_Avoid_` são os nomes que saem. **(a confirmar)** marca o nome recomendado que ainda espera a decisão do dono.

## Frases e origem

**Frase**:
A unidade de estudo guardada no histórico: um texto curto minerado de qualquer fonte, com seu idioma e contexto.
_Nome no código_: `frases` (a lista gravada), `texto`; `phraseId` na Conexão com o Anki; `phrase` no motor
_Avoid_: Trecho, sentença, item

**Histórico**:
O conjunto das Frases mineradas, neste computador e, com Conta, na nuvem. A Área do Painel que o mostra chama-se Frases.
_Nome no código_: `frases` em `chrome.storage.local`; a mensagem `SALVAR_HISTORICO`
_Avoid_: Coleção (é a do Anki), lista (é só a da tela)

**Minerar**:
Pôr uma frase no histórico, qualquer que seja a Fonte (legenda, seleção, foto de livro, mineração automática). Cada entrada tem o seu nome na tela: Minerar legenda e Minerar seleção (os atalhos), Minerar com PerpetualMiner (o botão direito), Minerar frases (colar ou importar um .txt, no Painel) e Minerar de uma foto.
_Nome no código_: `salvarFrase`, `Mineracao.gravar`
_Avoid_: Capturar, salvar, coletar, adicionar

**Minerar de uma foto**:
A página que lê, com o Gemini, as Marcações de fotos de páginas de livro e deixa escolher quais frases minerar.
_Nome no código_: `bookreader.html/js/css`
_Avoid_: BookReader, leitor de livros

**Marcação** (a confirmar):
O sinal feito à mão na página do livro (barras, underscores, sublinhado, colchetes, círculo ou traço na margem) que diz qual texto a foto deve ler. O texto marcado só vira Frase quando é minerado.
_Avoid_: Trecho marcado

**Mineração automática**:
Modo em que a extensão minera sozinha as linhas de legenda de um idioma enquanto o vídeo roda, até um limite diário. Só minera a linha em que a leitura do Vocabulário acha algo que a pessoa ainda não conhece.
_Nome no código_: `AUTO_MINER_*`, `autoMiner`, `lib/mineracao-automatica.js`, `lib/mineracao-do-dia.js`
_Avoid_: Auto Miner

**Fonte**:
De onde a frase veio: netflix, youtube e os outros players, web, pdf, livro, manual, importado. Os nomes da tela estão no ID `PAI-29` do catálogo da Voz.
_Nome no código_: `contexto.fonte`; `streaming` (o campo antigo, ainda gravado na Frase); `origem` (no pedido de gravação)
_Avoid_: Streaming, plataforma, origem

**Contexto**:
A procedência completa de uma frase: Fonte, Título (obra, vídeo, página) e Detalhe (episódio, capítulo, canal).
_Nome no código_: `contexto { fonte, titulo, detalhe }`; `[Contexto: fonte - título - detalhe]` na linha do .txt e do Envio
_Avoid_: Metadados

**Palavra**:
A palavra da frase que o cartão ensina, grifada na frase; pode ser escolhida pela pessoa ou detectada automaticamente. Na tela, o chip diz `palavra: …` quando foi escolhida e `auto: …` quando foi detectada. "keyword" pode ser nome técnico no código, nunca na tela. Pode ter mais de uma palavra (“take it for granted”), e uma Frase pode ter mais de uma Palavra: cada uma vira um Cartão.
_Nome no código_: `keywords` (`palavra@posição` para cada palavra, com `|` entre uma Palavra e a seguinte), `autoKeyword`; `keyword` no motor
_Avoid_: Keyword (na tela), palavra-chave, nova, grupo

**Idioma**:
O idioma da Frase, detectado do texto: Inglês ou Russo. Cada idioma tem os seus Ajustes de envio, o seu Baralho e a sua Mineração automática.
_Nome no código_: `idioma` (`'Inglês'`, `'Russo'`) na Frase; `lang` (`en`, `ru`) na Conexão com o Anki e no motor
_Avoid_: Língua, lang

## Onde a pessoa usa

**Extensão**:
O PerpetualMiner no Chrome. Na tela, “a extensão” é sempre ele; o menu do Anki (Ferramentas › Extensões) chama de extensão o Complemento, e esse uso só aparece ao citar o menu.
_Avoid_: Plugin, add-on

**Painel**:
A tela grande da extensão, com três Áreas: Frases, Conexão com o Anki e Configurações.
_Nome no código_: `painel.html`, `painel*.js`
_Avoid_: Dashboard, página de opções

**Área**:
Cada uma das três partes do Painel, com endereço próprio (`#frases`, `#anki`, `#configuracoes`). A Área Conexão com o Anki tem abas (Custos, Baralhos e termos, Vocabulário, Ajustes de envio); Configurações tem seções.
_Avoid_: Página, tela, vista

**Popup**:
A janela pequena que abre pelo ícone da extensão: a mineração rápida, as últimas mineradas e a Mineração automática. “Cockpit” é só o nome da variante de desenho aprovada.
_Avoid_: Cockpit

**Overlay**:
O que a extensão desenha por cima da página do vídeo: o botão Minerar legenda e o aviso do que foi minerado. Não tem nome na tela.
_Nome no código_: `overlay.js`, `<perpetualminer-overlay>`
_Avoid_: Botão flutuante (é só uma parte)

**Boas-vindas**:
A configuração da primeira execução: nove passos, do primeiro minerar ao primeiro Cartão no Anki. Quem para no meio vê o lembrete “Configuração pela metade”. Passo é só o da Boas-vindas; o Envio tem Etapas.
_Nome no código_: `pm_boas_vindas`, `lib/configuracao.js`, `painel-boas-vindas*.js`; IDs `ONB-`
_Avoid_: Onboarding

## Destino da frase

**Conexão com o Anki**:
O complemento do Anki mais o Abridor: o complemento roda dentro do Anki do computador do usuário, grava as frases como cartões na coleção e responde à extensão; o Abridor abre o Anki quando ele está fechado. Não há programa à parte nem serviço residente para instalar ou rodar, e o Windows não tem caminho próprio. Na tela, o nome é sempre “Conexão com o Anki”, e ela está ligada ou desligada. A Área do Painel e a seção de Configurações que cuidam dela levam o mesmo nome.
_Nome no código_: `ConexaoAnki` (`lib/conexao-anki.js`), `complemento/`, `http://127.0.0.1:8766`; sobras do nome antigo: `ankiBridgePresets`, `CODIGOS_DO_BRIDGE`, IDs `BRG-`
_Avoid_: Anki Bridge, Bridge, AnkiConnect, serviço residente, servidor local, Conexão de hoje

**Complemento**:
O nome técnico da parte da Conexão com o Anki que roda dentro do Anki (o arquivo `.ankiaddon`). Vale no código e nos docs; na tela é “Conexão com o Anki”, e o Anki em português o lista em Ferramentas › Extensões.
_Nome no código_: `complemento/`, `conexao/perpetualminer.ankiaddon`
_Avoid_: Add-on, addon, plugin

**Abridor**:
O script pequeno que a Conexão com o Anki deixa no computador para a extensão abrir o Anki fechado; a extensão só o chama com a permissão que a pessoa deu em “Abrir o Anki sozinho”.
_Nome no código_: `complemento/abridor.py`, `lib/abridor.js`
_Avoid_: host, native host, launcher

**Consertar sozinho**:
O que o Abridor faz, sem clique, quando a Conexão com o Anki não responde: fecha à força o Anki travado e o abre de novo, ou liga de novo a Conexão desativada. Não tem nome na tela.
_Nome no código_: `consertar` (`complemento/conserto_do_anki.py`, `lib/abrir-o-anki.js`)
_Avoid_: Reparo, repair, conserto

**Pareamento**:
O vínculo de um navegador com a Conexão com o Anki: a pessoa digita no Painel o código que só o Anki dela mostrou, e dali em diante a Conexão só atende os pedidos que esse navegador assina (e o navegador só aceita as respostas que a Conexão prova). Na tela: “Conectar este navegador ao Anki”; desfaz-se no Anki, em “Desconectar navegadores”.
_Avoid_: Token, senha, login, autorização

**Perfil do Anki**:
O perfil do Anki em que os Cartões entram, escolhido pela pessoa; com outro perfil aberto, o Envio espera.
_Avoid_: Conta (é a do Google)

**Coleção**:
Os dados do perfil aberto do Anki, onde a Conexão com o Anki grava as notas e lê os Baralhos e o Vocabulário. Só o Anki tem coleção; as Frases ficam no Histórico. Não aparece na tela.
_Nome no código_: `colecao`

**Motor**:
O programa em Python que faz, de uma Palavra e uma Frase, o texto, o áudio e a imagem do Cartão. Roda só dentro da Conexão com o Anki.
_Nome no código_: `engine/`, `complemento/motor`
_Avoid_: Engine, Automatic Anki, pipeline

## Envio

**Enviar ao Anki**:
A ação que entrega as Frases selecionadas à Conexão com o Anki para virarem Cartões.
_Avoid_: Exportar

**Envio**:
As frases de um único idioma entregues de uma vez ao Anki pela Conexão com o Anki; enviar frases de dois idiomas gera dois envios.
_Nome no código_: `job`, `jobId`, as rotas `/jobs`. `CardJob`, no motor, é um Cartão, não um Envio
_Avoid_: Job, lote

**Remessa** (a confirmar):
Os Envios que nascem de um mesmo Enviar ao Anki (um por idioma), acompanhados juntos e fechados por um só resumo. Não tem nome na tela, que diz “2 envios · Inglês, Russo”.
_Nome no código_: `remessa`, `pm_envio`
_Avoid_: Lote, envio (para o conjunto)

**Etapa**:
O ponto em que um Envio está, nesta ordem: Na fila, Criando cartões, Preparando imagens, Gerando áudio, Escolhendo imagens, Esperando o Anki, Enviando ao Anki. Termina Concluído, Concluído em parte ou Não concluído.
_Nome no código_: `queued`, `generate_cards`, `extract_prompts`, `generate_audio`, `generate_images`, `wait_anki`, `send_to_anki`; o fim: `completed`, `partial`, `failed`
_Avoid_: Stage, passo (é da Boas-vindas), fase

**Enviada ao Anki**:
Estado da frase cujos cartões chegaram ao Anki por um Envio, ou já estavam lá.
_Nome no código_: `status: 'exported'` (apesar do nome, não é a Exportada)
_Avoid_: Exportada, No Anki

**Exportada**:
Estado da frase gravada num arquivo .txt; não implica que ela esteja no Anki.
_Nome no código_: `exportadaTxt`
_Avoid_: Enviada

**Ajustes de envio**:
O que cada Envio de um idioma usa: o Baralho, a origem das imagens, a voz e o sotaque do áudio, o Nível, a Frente e o Tipo de nota. É uma aba da Área Conexão com o Anki.
_Nome no código_: `ankiBridgePresets`, `lib/ajustes-de-envio.js`
_Avoid_: Presets

**IA dos cartões**:
Quem escreve o texto dos Cartões e como se paga por ele: a chave da OpenAI da pessoa (por uso) ou o plano do ChatGPT dela. A chave do Gemini é outra: só lê as fotos de Minerar de uma foto.
_Avoid_: API key, token, “chave” sem dizer de quem

**Custos**:
O que os Envios gastaram com a IA, Envio por Envio. O Teto do mês é o limite de gasto da chave neste computador: ao chegar nele, o Envio pausa.
_Nome no código_: `custos`, `/analytics/jobs`, `teto_do_mes.py`
_Avoid_: Analytics

**Detalhes**:
O recolhido copiável que guarda a causa técnica de um erro (código, resposta crua, id do Envio); o texto do erro fala nos termos da pessoa.
_Avoid_: Detalhe (é a parte do Contexto), diagnóstico (é o arquivo que se baixa)

## Cartão e Anki

**Baralho**:
O baralho do Anki que recebe os cartões de um idioma.
_Nome no código_: `deck`, `deckName`
_Avoid_: Deck

**Cartão**:
O item de estudo do Anki gerado a partir de uma frase. Cada Palavra da Frase gera um Cartão.
_Nome no código_: `card`, `cards`, `<phraseId>-<n>`; `CardJob` no motor
_Avoid_: Card

**Nota**:
O registro que o Anki guarda para cada Cartão, com os campos que a Conexão com o Anki preenche. É nome técnico: a tela diz “cartão”, e “nota” só em “tipo de nota”.
_Nome no código_: `nota`, `guid`

**Tipo de nota**:
O molde das notas no Anki: os campos e a aparência do Cartão. A Conexão com o Anki cria um por idioma (`PerpetualMiner Inglês`, `PerpetualMiner Russo`) ou usa um que a pessoa já tem (“Usar um tipo que já tenho”).
_Nome no código_: `tipo_de_nota.py`, `tipoProprio`, `/anki/note-types`
_Avoid_: Modelo (é o da IA), template, note type

**Nível**:
O quanto o Cartão explica, por idioma: Iniciante, Intermediário ou Avançado. É a escolha que define o Estilo do cartão; o quiz de nível da Boas-vindas sugere um.
_Nome no código_: `nivel` (`iniciante`, `intermediario`, `avancado`)
_Avoid_: Estilo (é o que o Nível define)

**Estilo do cartão** (a confirmar):
O que o Cartão de um idioma traz em cada Nível: a língua da explicação e as partes do verso. Na tela, “Estilo do cartão” é hoje o rótulo do campo em que se escolhe o Nível, e “estilo pronto” é o Tipo de nota que a Conexão com o Anki cria.
_Nome no código_: `engine/estilos.json` (idioma × nível)
_Avoid_: Nível (é a escolha)

**Frente**:
O lado do Cartão que pergunta; o verso responde. Cada idioma escolhe uma de seis Frentes: Frase com áudio, Ouvir primeiro, Lacuna, Produção, Ditado ou Criação.
_Nome no código_: `frente` (`frase_com_audio`, `ouvir_primeiro`, `lacuna`, `producao`, `ditado`, `criacao`), `/anki/card-front`
_Avoid_: Front, modelo de cartão (na tela)

**Prévia do cartão**:
O Cartão como o Anki o mostra, antes de enviar: o Cartão de exemplo do estilo ou uma nota já gravada.
_Avoid_: Preview

**Vocabulário**:
As palavras e os Termos que aparecem nos Cartões de um Baralho, cada um Novo, Recente, Maduro ou Misto conforme o Anki. É por ele que a Mineração automática sabe o que a pessoa já conhece.
_Nome no código_: `vocabulary`, `/anki/vocabulary`, `lib/vocabulario-da-mineracao.js`
_Avoid_: Vocab, dicionário

**Termo** (a confirmar):
No Vocabulário, a expressão de duas ou mais palavras que é a Palavra de algum Cartão (“take it for granted”); “palavra”, ali, é cada palavra solta da frente dos Cartões. “Termos-alvo”, em Baralhos e termos, conta todas as Palavras diferentes que os Cartões do Baralho ensinam, de uma palavra só ou não.
_Nome no código_: `term`, `targetTerms`, `uniqueTerms`
_Avoid_: Expressão, termo-alvo

**Novo, Recente, Maduro**:
O ponto em que o Anki tem um Cartão: Novo (nunca estudado), Recente (em aprendizado, ou com intervalo menor que 21 dias) e Maduro (21 dias ou mais). No Vocabulário, a palavra que está em Cartões de pontos diferentes é Mista.
_Nome no código_: `new`; `learning` e `young` (os dois são Recente); `mature`; `mixed`
_Avoid_: Young, learning, jovem

## Conta e sincronização

**Conta**:
A conta Google com que a pessoa entra para ter as mesmas Frases em qualquer computador. É opcional: sem conta, as Frases ficam só neste computador.
_Nome no código_: `pm_user_info`, `uid`
_Avoid_: Login, usuário, perfil (é o do Anki)

**Nuvem**:
Onde as Frases da Conta ficam fora do computador. Sincronizar é deixar o Histórico e a nuvem iguais.
_Nome no código_: Firestore, `lib/sincronizacao.js`
_Avoid_: Firestore, servidor, backup; “sync” (hoje no título “Conta & sync”, a confirmar)

**Apagar**:
Tirar a Frase do Histórico de vez; com Conta, ela some também dos outros computadores. “Tirar do histórico”, no fim de um Envio, é o mesmo apagar, oferecido para as enviadas. Apagar tudo (Zona de perigo) apaga todas as Frases, as cópias delas na Conexão com o Anki e a chave da OpenAI deste computador (menos a que é de outra Conta).
_Nome no código_: `tombstone` (a marca da frase apagada: `pm_del_{id}`, `meta/deleted`); `/jobs/apagar-frases`
_Avoid_: Excluir, remover, deletar, descartar (é desistir de frases ainda não mineradas)

## Nomes do projeto

**Veio**:
A identidade visual da extensão e os componentes base de todas as páginas.
_Nome no código_: `veio/`
_Avoid_: Design system, tema (é só claro ou escuro)

**Voz**:
O guia de voz e tom e o catálogo que dá um ID a cada texto de tela (`POP-`, `PAI-`, `ENV-`…); texto novo entra primeiro no catálogo. A voz que fala o Cartão é outra coisa: “voz do cartão”, com sotaque e voz de reserva.
_Nome no código_: `lib/voz/catalogo.js`, `textoDaVoz`; `complemento/voz.py` é a voz do cartão
_Avoid_: Voice, i18n

## Relações

```text
Fonte → Minerar → Frase (no Histórico) → Enviar ao Anki → Remessa → Envio (um por Idioma) → Cartão (um por Palavra) → Baralho
```

- Minerar põe uma **Frase** no **Histórico**, com um **Idioma**, um **Contexto** (que tem a **Fonte**) e zero ou mais **Palavras**.
- **Enviar ao Anki** abre uma **Remessa**: um **Envio** por Idioma, cada um para o **Baralho** dos **Ajustes de envio** daquele idioma.
- Um Envio passa pelas **Etapas** e gera um **Cartão** por Palavra de cada Frase, com o **Nível** (que define o **Estilo do cartão**), a **Frente** e o **Tipo de nota** do idioma.
- Cada Cartão é uma **Nota** num Baralho da **Coleção** do **Perfil do Anki**.
- A Frase fica **Enviada ao Anki** quando os Cartões dela chegaram; **Exportada** é só o .txt.
- O **Vocabulário** é lido dos Cartões de um Baralho; a **Mineração automática** decide por ele o que minerar e qual é a Palavra.
- A **Conexão com o Anki** (o **Complemento**, com o **Motor**, mais o **Abridor**) faz o Envio; a **Extensão** pede e acompanha, depois do **Pareamento**.

## Ambiguidades resolvidas

- **exported**: no código, `status: 'exported'` é a Frase Enviada ao Anki; a Exportada é `exportadaTxt`.
- **job**: `jobId` e `/jobs` são o Envio; `CardJob`, no motor, é um Cartão.
- **remessa**: era a palavra da definição de Envio e, no código, o conjunto dos Envios de um clique. Fica só para o conjunto.
- **extensão**: o PerpetualMiner no Chrome. O menu Extensões do Anki lista o Complemento.
- **Conexão com o Anki**: o conceito é o complemento mais o Abridor; a Área e a seção de mesmo nome são só onde se cuida dele.
- **cartão**: o item do Anki. O bloco de tela é “card” (a confirmar): hoje o código o chama de “cartão do Envio” e uma mensagem diz “card da IA dos cartões”.
- **palavra**: a Palavra é o que o Cartão ensina e pode ter várias palavras (um botão ainda a chama de “grupo”); no Vocabulário, “palavra” é cada palavra solta.
- **termo**: no Vocabulário, só a expressão; em “Termos-alvo” e no nome da aba Baralhos e termos, toda Palavra.
- **nível e estilo**: o Nível é a escolha (Iniciante, Intermediário, Avançado) e o Estilo do cartão é o que ela define; a tela usa os dois nomes para a mesma escolha. Uma mensagem também chama de “nível” cada parte do nome de um Baralho (`Inglês::Mineradas`).
- **modelo**: Modelo dos cartões é o modelo de IA que escreve o texto; o molde do Anki é o Tipo de nota.
- **voz**: a Voz é o guia e o catálogo; a do áudio é a voz do cartão.
- **perfil**: sempre o do Anki. Quem entra com Google tem Conta.
- **passo e etapa**: passo é da Boas-vindas; etapa é do Envio.
- **Detalhe e Detalhes**: Detalhe é a terceira parte do Contexto; Detalhes é o recolhido da causa técnica de um erro.
- **histórico e Frases**: o conjunto e a Área do Painel que o mostra.
- **trecho**: não é Frase. Em Minerar de uma foto a tela ainda diz “trechos marcados” para a Marcação.
- **chave**: a da OpenAI paga a IA dos cartões; a do Gemini lê fotos.
