# O tipo de nota próprio por idioma e o Cartão Iniciante (#161)

Fatia ALTA (dados): a Conexão **cria** tipos de nota e Baralhos numa coleção de verdade. Segue o [modelo de fatia ALTA](modelo-fatia-alta.md); o que esta página
não diz não foi decidido. Spec: o [#138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138), seção “Os estilos do Cartão”.

## O que entrega

- **O estilo é dado**: `engine/estilos.json` diz, por idioma, o tipo de nota, o Baralho, como uma linha minerada se lê (`entrada`), **todos** os campos e,
  por nível, a língua da explicação, as partes do verso, as cores ligadas ou não e o prompt. Um idioma novo é uma entrada nova e um arquivo de prompt.
  O Iniciante existe nos dois idiomas; o Intermediário e o Avançado do inglês entraram com o #162 e os do russo, com a morfologia, com o #163 (ver “Os níveis do inglês” e “Os níveis do russo” abaixo).
- **Um tipo de nota por idioma** (`PerpetualMiner Inglês`, `PerpetualMiner Russo`), com os nossos nomes de campos: o Envio não depende mais de o Anki ser “Básico/Frente/Verso”.
- **Os campos nascem todos juntos.** Mudar os campos de um tipo de nota depois obriga o Anki a uma sincronização completa; por isso já nascem os dos níveis (Definição, Outro exemplo),
  os do inglês (Significado simples, Gatilho), os da morfologia do russo (Sílaba forte, Morfologia, Explicação das cores, Mesma raiz, Raiz), os das frentes (Dica, Frase com lacuna) e os da Criação
  (Frase escrita, Escrito antes, Correção). O que o nível não usa fica vazio. O modelo de Cartão de hoje é `Frase com áudio`; as outras frentes entram como modelos do mesmo tipo (#166 a #168).
- **O Cartão Iniciante**, nos dois idiomas: a Frase e o áudio na frente; no verso, a pronúncia, a literal e a natural em português (as cores ligam o pedaço da Frase ao pedaço da literal que o traduz),
  o contexto da cena, a Palavra com o áudio e a imagem. O russo parte do Cartão de russo de antes, explicado em português (`engine/prompts/ru_iniciante.txt`).
- **Os Baralhos**: numa instalação nova (nenhum Baralho além do padrão do Anki) nascem `PerpetualMiner::Inglês` e `PerpetualMiner::Russo`; quem já tem Baralho fica com o seu e não ganha nenhum.

## 1. Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| o tipo de nota e os campos de cada idioma | a coleção do Anki, criados pela Conexão (`tipo_de_nota.py`) | `engine/estilos.json` (a definição de onde sai) | uma regravação: um tipo que já tem o nome não é tocado, qualquer que seja o conteúdo |
| os Baralhos nossos | a coleção do Anki | nenhum | criados a quem já tem Baralho |
| os Cartões e Baralhos antigos (o “Básico” do dono) | a coleção do Anki, da pessoa | nenhum | renomeados, convertidos ou apagados pela Conexão |
| o estilo (idioma × nível) | `engine/estilos.json`, no pacote da Conexão | nenhum | lido da extensão: o nível ainda não atravessa o contrato (#164) |
| o Baralho de cada Envio | a extensão (Ajustes de envio, `deckName` do pedido) | a Conexão, só dentro do Envio | decidido pela Conexão: o padrão da extensão segue `CIMV`/`RUSSIAN` até um ticket seguinte |

## 2. Estados

Por perfil e por idioma: **sem tipo** → **com o tipo** (criado; nunca volta a “sem tipo” por obra da Conexão). Por coleção: **instalação nova** (só o Baralho padrão, de id 1; o nome dele segue o idioma do Anki:
“Default”, “Padrão”, “По умолчанию”) → **com Baralhos** (os nossos criados, ou os da pessoa). Um tipo com o nosso nome e sem os nossos campos é um terceiro estado: o Envio diz `note_type_missing` e não grava nada.
Não há tela nova: a pessoa vê o resultado no Anki (Ferramentas › Gerenciar Tipos de Nota, a lista de Baralhos, o Cartão).

## 3. Transições

| transição | quem pede | o que lê antes | quem aceita | o que muda | o que não pode mudar |
|---|---|---|---|---|---|
| criar o tipo de nota | `tipo_de_nota.preparar` (ao carregar e a cada perfil que abre) ou o Envio, se faltar | `models.by_name(nome)` | a thread principal do Anki, numa função só (`criar_tipo_de_nota`) | um tipo novo, com todos os campos e o modelo `Frase com áudio` | qualquer tipo que já existe |
| criar os Baralhos | o mesmo `preparar` | todos os Baralhos (`decks.all_names_and_ids`) | a thread principal | `PerpetualMiner::…`, só se nenhum Baralho tem id diferente de 1 | os Baralhos da pessoa |
| gravar um Cartão | o Envio (`gravar_cartao`) | o `guid`; a Frase normalizada nos campos `Frase`, `Frente` e `Front` do Baralho | a thread principal | uma nota nova no tipo do idioma | notas que já estão (duplicata: nada é gravado) |

- **Atômico**: cada criação é uma função só na thread principal do Anki (`_gravando`): confere o perfil marcado e a sincronização, e só então lê e grava. Não há passo entre processos: a Conexão é o único escritor.
- **Repetido**: criar de novo devolve “não criei” e não grava nada (a prova: `test_contrato_da_criacao.py` nos dois adaptadores; no Anki real, `ensaio_anki_real.py`: ids e notas iguais).
- **Resposta perdida / Anki morto no meio**: a criação é uma operação do Anki, que a grava inteira ou não grava; a próxima volta vê o tipo (ou não) e segue. Morrer entre o tipo e os Baralhos deixa só o tipo: o `preparar` seguinte cria os Baralhos.
- **Reverter**: só a pessoa, pelo Anki (Gerenciar Tipos de Nota › Excluir, Baralhos › Excluir). A Conexão nunca apaga. Excluir o tipo faz a Conexão criá-lo de novo no próximo perfil aberto ou Envio.
- **Sincronização**: medido na biblioteca do Anki (2.1.50 e 25.09.5), criar o nosso tipo de nota e o Baralho **não** muda `col.scm`: não se espera pedido de sincronização completa, nem com o AnkiWeb (uma sincronização normal). Um pedido inesperado é o sinal para o dono parar. Mudar campos depois muda o esquema, por isso eles nascem todos juntos.
- **As outras frentes (#166 a #168)**: entrando como modelos de Cartão do mesmo tipo de nota, forçam uma sincronização completa **e** criam um Cartão novo para cada nota que já existe (medido: o segundo modelo mudou o `scm` e fez `cards: 2`). Precisam de decisão própria, ou de um tipo de nota separado.

## 4. As 8 variantes

| # | variante | o que acontece |
|---|---|---|
| 1 | sem Conexão | nada: a extensão não cria nada |
| 2 | Anki fechado | nada é criado; o Anki, ao abrir o perfil, dispara `preparar`; o Envio espera o Anki como antes |
| 3 | complemento antigo | o estado dele não tem o tipo: o complemento novo o cria; nada é migrado |
| 4 | bridge Flask na 8766 | o bridge segue no “Básico”; esta fatia não o toca |
| 5 | dois perfis numa Conexão | só o perfil marcado (#149) recebe tipos e Baralhos; outro aberto não é tocado (`OutroPerfil`) |
| 6 | quem vem da `main` | a coleção dele (o “Básico”, CIMV, RUSSIAN) fica como está; ganha os dois tipos, nenhum Baralho |
| 7 | resposta perdida ou painel fechado | o Envio e o `preparar` não dependem do painel; repetir é seguro |
| 8 | pedido repetido | idempotente (a mesma resposta, nada de novo na coleção) |

## 5. Limites aceitos

- O Baralho que a extensão usa por padrão continua `CIMV`/`RUSSIAN` (`lib/ajustes-de-envio.js`); apontá-lo para os Baralhos novos é de um ticket seguinte (Boas-vindas e Ajustes de envio, #164 e #173). Mudar o padrão hoje trocaria o Baralho do dono, sem que ele escolhesse.
- A Conexão não avalia o conteúdo de um tipo que a pessoa já nomeou como o nosso (só confere os campos que grava): ela o deixa como está.
- A lista de Baralhos dos Ajustes de envio (`/anki/decks`) esconde só o nome “Default”: num Anki em português o “Padrão” aparece na lista. É de antes desta fatia.
- A voz de um idioma novo (`tts.profiles` do `config.json`) segue a escrita do texto (cirílico ou não): um terceiro idioma por dados fala com a voz do inglês até a voz também ser dado.

## 6. Provas

- **Coleção em memória** (`unittest`, sem Anki): `test_contrato_da_criacao.py` (nos dois adaptadores: o tipo com todos os campos, repetir, quem já tem Baralho, Cartões antigos intactos, tipo da pessoa intocado, sincronização,
  Anki em português com o “Padrão”, a busca de duplicatas do “Básico” e do tipo próprio), `test_envio_tipo_de_nota.py` (o Envio num Anki em inglês, o Iniciante, o russo, um idioma por dados), `test_inicio_preparo.py` (o gancho de perfil),
  `engine/test_estilos.py`, `test_nota_do_cartao.py`, `test_prompt_contracts.py` (o contrato dos prompts por nível) e `test_generate_cards.py`.
- **A biblioteca de verdade do Anki** (`pip install anki`, o motor em Rust, 2.1.50, 2.1.66 e 25.09.5, Python 3.9, numa coleção em pasta temporária; Anki em inglês, português e russo): o Envio inteiro e o Cartão renderizado pelo renderizador do Anki.
- **O Anki de verdade** (aqt 25.9.2, Qt sem tela, base e perfil descartáveis em pasta temporária): o complemento carregado do `.ankiaddon`, o gancho `profile_did_open` na janela principal, a primeira abertura (tipos e Baralhos), a segunda (nada de novo),
  o perfil do dono (CIMV, RUSSIAN, o “Básico” com um Cartão: nada criado além dos tipos, nada mexido) e um Anki em português do Brasil.
- **Não prova**: o Anki do dono (interface em inglês e em português do Brasil), o Mac e o Windows, a sincronização com o AnkiWeb, o AnkiMobile e o AnkiDroid: o ensaio do dono (`complemento/LEIA-ME.md`, passo 10), **pendente**.

## 7. Os níveis do inglês (#162)

O Cartão do inglês ganhou o Intermediário e o Avançado (o russo ganhou os dele no #163, na seção 8). O estilo continua dado (`engine/estilos.json`); o que muda é o prompt, as partes do verso e o campo de `nivel` no pedido do Envio.

| nível | prompt | verso (campos preenchidos) | cores |
|---|---|---|---|
| Iniciante | `en_iniciante.txt` | Pronúncia, Tradução literal, Tradução natural, Contexto da cena, Palavra, Imagem | sim |
| Intermediário | `en_intermediario.txt` | Contexto da cena (português), Palavra, Definição (português), Outro exemplo (inglês), Imagem | não |
| Avançado | `en_avancado.txt` (o Cartão de inglês de hoje, `en_card.txt`, sem Simple meaning e Trigger) | as mesmas partes, tudo em inglês | não |

- A frente é a mesma nos três: a Frase com o áudio. O Intermediário e o Avançado não pedem o alinhamento, e a Frase vai sem cor.
- **Um modelo de Cartão só**: o verso do modelo `Frase com áudio` traz as partes de todos os níveis, na ordem `ordem_do_verso`, e cada parte só aparece se o campo dela tem texto. Trocar o nível não troca o tipo de nota nem o modelo, e Cartões de níveis diferentes convivem. Mudar o verso de um tipo de nota **que já existe** a Conexão não faz (ela só cria): um tipo criado pela #161 fica com o verso do Iniciante até a pessoa o apagar e a Conexão criar o novo; o Cartão novo grava Definição e Outro exemplo no campo, que só não aparecem no verso.
- **O pedido**: `POST /jobs` leva `nivel` só quando não é o Iniciante (como `tts.reserva`). Um nível fora dos que o idioma tem é `400` `invalid_level` e nada é criado. O nível entra no pedido guardado: repetir o pedido com outro nível é outro pedido (`409`), e o Envio retomado usa o nível com que nasceu.
- **A imagem** continua no verso dos três níveis (a escolha Foto real · Gerada por IA dos Ajustes de envio vale em todos).
- **A tela**: Ajustes de envio › Estilo do cartão (`painel-ajustes.js`, BRG-42), um controle segmentado por idioma; só grava em Salvar ajustes e vale a partir do Envio seguinte.

## 8. Os níveis do russo (#163)

O Cartão do russo ganhou o Intermediário e o Avançado, com a morfologia. O estilo continua dado (`engine/estilos.json`); o prompt de cada nível é `ru_intermediario.txt` e `ru_avancado.txt`, a língua da explicação é o inglês nos dois, e o pedido do Envio leva `nivel` como no inglês.

| nível | verso (campos preenchidos) | frente |
|---|---|---|
| Iniciante | como antes: Pronúncia, Tradução literal, Tradução natural, Contexto da cena, Palavra, Imagem | a Frase com o áudio; as cores vêm do alinhamento (a Frase e a literal) |
| Intermediário | Pronúncia, Palavra, Sílaba forte, Definição (inglês), Explicação das cores, Outro exemplo, Imagem; **a Frase não se repete no verso** | a Frase com o áudio; as 4 cores da morfologia |
| Avançado | as mesmas, mais as palavras da Mesma raiz | as mesmas 4 cores |

- **As 4 cores** são fixas por tipo de pedaço, iguais nos dois níveis: prefixo (roxo), raiz (verde), sufixo (âmbar) e terminação de pessoa, tempo ou caso (vermelho). **Só as palavras com pedaço a explicar ganham cor**: o prompt devolve uma seção `Morphology:` com uma linha por palavra (`palavra | tipo:pedaço | …`) e a Conexão pinta a primeira ocorrência de cada uma na Frase. Uma palavra cujos pedaços não somam a palavra, letra por letra, fica sem cor e fora da Morfologia: nada é adivinhado. A frente não ganha acento (a sílaba forte vai só no verso).
- **A explicação por cor** vem da seção `Colors:` (`tipo | pedaços | explicação`), uma linha por cor, na ordem prefixo, raiz, sufixo, terminação; o sufixo e a terminação levam as etiquetas de pessoa, tempo e aspecto e, num substantivo, adjetivo ou pronome, o caso (com a preposição que o pede).
- **A Palavra** é a que o Cartão escolhe na Frase (linha `Word:`), e não as duas primeiras palavras da linha minerada, como no Iniciante: o áudio da Palavra fala essa. A Sílaba forte é a Palavra com o acento agudo na vogal tônica; a Pronúncia é a transliteração com a sílaba forte em maiúsculas.
- **Campos que se gravam e o verso não mostra** (`guarda`): a **Morfologia** (`palavra = prefixo + raiz + sufixo…`, uma por linha) e a **Raiz**. A Criação (#168) usa a Raiz como radical. A Mesma raiz só se grava no Avançado.
- **O verso sem a Frase**: o modelo de Cartão é um só para todos os níveis do russo, e o começo do verso (`{{FrontSide}}` e a linha) só aparece quando a Sílaba forte está vazia (`{{^Sílaba forte}}`): o Iniciante, que a deixa vazia, repete a Frase; os outros dois não. Conferido com o renderizador do Anki de verdade (`pip install anki`). O campo é escolhido pelos dados: o primeiro, na ordem do verso, que só os níveis com `repete_a_frase: false` preenchem.
- **Leituras do worker, ainda não confirmadas pelo dono** (risco 14): o verso sem a Frase vale também no Avançado; a frente não ganha acento; só as palavras com pedaço a explicar ganham cor; a Pronúncia fica acima da Palavra (a ordem do verso do Iniciante é Pronúncia antes de Palavra e um modelo só ordena os três níveis); a definição do Avançado também é em inglês (a issue só pede a mesma coisa mais as palavras da mesma raiz).
- **Tipo de nota que já existe** a Conexão não muda (só cria): o do russo criado pelo #161 fica com o verso do Iniciante (repete a Frase, não mostra Sílaba forte, Explicação das cores nem Mesma raiz) até a pessoa o apagar e a Conexão criar o novo; o Cartão novo grava os campos mesmo assim.
- **A tela**: Ajustes de envio › Estilo do cartão (`painel-anki-estilo.js`) passa a ter os três níveis também no russo; a nota “No russo, por enquanto só o Iniciante.” saiu.
