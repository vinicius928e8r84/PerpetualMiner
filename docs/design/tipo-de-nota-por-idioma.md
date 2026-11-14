# O tipo de nota próprio por idioma e o Cartão Iniciante (#161)

Fatia ALTA (dados) fechada: a Conexão **cria** tipos de nota e Baralhos numa coleção de verdade. Segue o [modelo de fatia ALTA](modelo-fatia-alta.md). Spec: o [#138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138), seção “Os estilos do Cartão”. O código é `complemento/tipo_de_nota.py`, `previa_do_cartao.py` e `engine/estilos.json` (o estilo é dado: por idioma, o tipo de nota, o Baralho, os campos e, por nível, a língua da explicação, as partes do verso, as cores e o prompt); esta página guarda só as decisões e os limites.

## Decisões

- **Um tipo de nota por idioma** (`PerpetualMiner Inglês`, `PerpetualMiner Russo`), com os nossos nomes de campos: o Envio não depende de o Anki ser “Básico/Frente/Verso”.
- **Os campos nascem todos juntos**, de todos os níveis, frentes e da Criação: mudar os campos de um tipo de nota depois obriga o Anki a uma sincronização completa. O que o nível não usa fica vazio.
- **Um modelo de Cartão só** (`Frase com áudio`): o verso traz as partes de todos os níveis, na ordem `ordem_do_verso`, e cada parte só aparece se o campo tem texto. Um segundo modelo mudaria o `scm` e criaria um Cartão novo para cada nota (medido: `cards: 2`); por isso trocar de frente ou de nível não troca o modelo (a frente o reescreve: [`frentes-do-cartao.md`](frentes-do-cartao.md)) e Cartões de níveis diferentes convivem.
- **A Conexão só cria, nunca regrava nem apaga**: um tipo que já tem o nome não é tocado, qualquer que seja o conteúdo; os Baralhos nascem só numa instalação nova (nenhum além do padrão do Anki, de id 1, qualquer que seja o nome dele); os Cartões e Baralhos antigos da pessoa não são renomeados, convertidos nem apagados. Reverter é a pessoa, pelo Anki; excluído o tipo, a Conexão o cria de novo no próximo perfil aberto ou Envio. Um tipo com o nosso nome e sem os nossos campos faz o Envio dizer `note_type_missing` e não gravar nada.
- **O Baralho de cada Envio é da extensão** (Ajustes de envio, `deckName` do pedido; o padrão é `PerpetualMiner::Inglês`/`::Russo`, os que a Conexão cria, #366). Quem já gravou outro o mantém.
- **O nível vem no pedido** (`nivel`, só quando não é o Iniciante; fora dos que o idioma tem é `400 invalid_level` e nada é criado). Repetir o pedido com outro nível é outro pedido (`409`); o Envio retomado usa o nível com que nasceu. A imagem vale nos três níveis.
- **Atômico**: cada criação é uma função só na thread principal do Anki (`_gravando`), que confere o perfil marcado e a sincronização antes de gravar. Repetir não grava nada. Morrer entre o tipo e os Baralhos deixa só o tipo: o `preparar` seguinte cria os Baralhos. Só o perfil marcado (#149) recebe tipos e Baralhos.
- **Sincronização**: medido na biblioteca do Anki (2.1.50 e 25.09.5), criar o nosso tipo e o Baralho **não** muda `col.scm`. Um pedido de sincronização completa inesperado é o sinal para o dono parar.

## Os níveis

- **Inglês (#162)**: Iniciante (pronúncia, tradução literal e natural em português, as cores ligando a Frase à literal), Intermediário (contexto, Definição e Outro exemplo, em português e inglês, sem cores) e Avançado (o Cartão de inglês de antes, tudo em inglês). A frente é a Frase com o áudio nos três.
- **Russo (#163)**: Iniciante (**sem a Palavra do dicionário**, para quem não busca i+1 por falta de vocabulário; decisão do dono), Intermediário (explicado em inglês, com a morfologia: prefixo roxo, raiz verde, sufixo âmbar, terminação vermelha, e a palavra-chave destacada) e Avançado, **monolingue em russo** (Definição e Significado simples em russo, sem Pronúncia, que é em letras portuguesas, e sem morfologia; decisão do dono). A Palavra é a que o Cartão escolhe na Frase (`Word:`) e aparece **uma vez só** no verso, na Sílaba forte.
- **O verso sem a Frase** (russo): o começo do verso (`{{FrontSide}}` e a linha) só aparece quando a Sílaba forte está vazia (`{{^Sílaba forte}}`), isto é, no Iniciante; conferido com o renderizador do Anki de verdade. Só vale na frente Frase com áudio.
- **Campos que se gravam e o verso não mostra** (`guarda`): a Morfologia e a Raiz (a Criação usa a Raiz como radical); a Mesma raiz só se grava no Avançado.
- **O Significado simples do russo entrou depois** (0.4.22) como campo **opcional** (`opcionais` no `estilos.json`): se o tipo da pessoa não o tem, o Envio não falha e o texto vai para o fim da Definição. Acrescentar o campo a um tipo existente pede sincronização completa: decisão do dono.
- **A tela** é Ajustes de envio › Estilo do cartão (`painel-anki-estilo.js`, BRG-42): um controle por idioma, que só grava em Salvar ajustes e vale a partir do Envio seguinte.

## A prévia do Cartão (#164)

`POST /anki/card-preview` mostra um Cartão como o Anki o desenha (`Note.ephemeral_card(...).render_output()`, do 2.1.50 em diante, sem gravar nota), para o passo do nível da Boas-vindas e Ajustes de envio.

- Cada nível do `estilos.json` traz um `exemplo`, posto no tipo de nota que a coleção **tem** (criado antes, se falta): a prévia mostra o verso que o Cartão vai ter de verdade, e um tipo antigo mostra só o verso do Iniciante. Também serve uma nota gravada, pelo `guid` (o primeiro Cartão da Boas-vindas, #173).
- Para a página vão `front`, `back` e `css`. O áudio vira um botão ▶ e a imagem vai dentro do HTML (`data:`, até 2 MB, lida só da pasta de mídia da coleção, nunca por um caminho). A extensão a mostra num `iframe` sem scripts e com uma política que só deixa `data:` entrar. Sem coleção aberta, `503`; idioma ou nível que a Conexão não tem, `400`; nota que ela não tem, `404`.

## Limites aceitos

- A Conexão **não regrava um tipo de nota que já existe**: o criado pelo #161 (ou antes do #162/#163) fica com o verso do Iniciante, sem as partes novas, até a pessoa o apagar e a Conexão criar o novo; o Cartão novo grava os campos que o tipo tem. Ela também não avalia o conteúdo de um tipo que a pessoa já nomeou como o nosso.
- A lista de Baralhos dos Ajustes de envio (`/anki/decks`) esconde só o nome “Default”: num Anki em português o “Padrão” aparece. É de antes desta fatia.
- A voz de um idioma novo (`tts.profiles` do `config.json`) segue a escrita do texto (cirílico ou não): um terceiro idioma por dados fala com a voz do inglês até a voz também ser dado.
- **Leituras do worker, ainda não confirmadas pelo dono** (risco 14): o verso sem a Frase vale também no Avançado do russo; a frente não ganha acento; a Pronúncia fica acima da Sílaba forte; o Avançado mantém a Mesma raiz, a Sílaba forte e a Imagem; o destaque no Outro exemplo procura a Palavra na forma exata (uma forma flexionada fica sem destaque). Uma palavra cujos pedaços não somam a palavra fica sem cor.
- **Não provado**: o Anki do dono (interface em inglês e em português do Brasil), o Mac e o Windows, a sincronização com o AnkiWeb, o AnkiMobile e o AnkiDroid, e a prévia com o tipo de nota que ele já tem: o ensaio do dono (`complemento/LEIA-ME.md`, passo 10), **pendente**. O que rodou: a biblioteca de verdade do Anki (2.1.50, 2.1.66 e 25.09.5, em inglês, português e russo) e o Anki real sem tela (aqt 25.9.2, base descartável).
