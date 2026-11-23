# PerpetualMiner

O PerpetualMiner guarda as frases que a pessoa minera de legendas, páginas web e livros físicos e as envia ao Anki como cartões, para ela estudar um idioma.

Como ler: o nome em negrito é o único nome do conceito, na tela, nos docs, nas issues, nos testes e nos nomes novos do código ([ADR 0001](docs/adr/0001-nome-novo-segue-o-glossario.md)). _Avoid_ são os nomes que saem.

## Language

### Frases e origem

**Frase**:
O texto que a pessoa minerou, guardado no Histórico com o seu Idioma e o seu Contexto, e de onde saem os Cartões. Qualquer tamanho conta, e o que ainda não foi minerado não é Frase.
_Avoid_: Trecho, sentença, item

**Histórico**:
O conjunto das Frases mineradas, neste computador e, com Conta, na Nuvem.
_Avoid_: Coleção (é a do Anki), lista

**Minerar**:
Pôr um texto no Histórico, o que o torna uma Frase. Vale para qualquer Fonte: legenda, seleção, foto de livro ou Mineração automática.
_Avoid_: Capturar, salvar, coletar, adicionar

**Minerar de uma foto**:
A tela que lê, com o Gemini, as Marcações de fotos de páginas de livro e deixa escolher quais Frases minerar.
_Avoid_: BookReader, leitor de livros

**Marcação**:
O sinal feito à mão na página do livro (barras, sublinhado, colchetes, círculo ou traço na margem) que diz qual texto a foto deve ler. O texto marcado só vira Frase quando é minerado.
_Avoid_: Trecho marcado

**Mineração automática**:
O modo em que o PerpetualMiner minera sozinho as linhas de legenda de um Idioma enquanto o vídeo roda, até um limite por dia. Só minera a linha que tem algo que a pessoa ainda não conhece, segundo o Vocabulário.
_Avoid_: Auto Miner

**Fonte**:
De onde a Frase veio: Netflix, YouTube e outros players, web, PDF, livro, manual ou importado.
_Avoid_: Streaming, plataforma, origem

**Contexto**:
A procedência completa de uma Frase: Fonte, Título (obra, vídeo, página) e Detalhe (episódio, capítulo, canal).
_Avoid_: Metadados

**Termo**:
O que o Cartão ensina, com uma ou mais palavras (“take it for granted”). Uma Frase pode ter vários Termos, e cada um vira um Cartão.
_Avoid_: palavra-chave, keyword

**Idioma**:
O idioma da Frase, detectado do texto: Inglês ou Russo. Cada Idioma tem os seus Ajustes de envio, o seu Baralho e a sua Mineração automática.
_Avoid_: Língua

### Onde a pessoa usa

**Painel**:
A tela grande do PerpetualMiner, onde a pessoa vê o Histórico, cuida da Conexão com o Anki e muda as configurações.
_Avoid_: Dashboard, página de opções

**Boas-vindas**:
A configuração da primeira execução, em passos, do primeiro minerar ao primeiro Cartão no Anki. Quem para no meio vê o lembrete “Configuração pela metade”.
_Avoid_: Onboarding

### Destino da Frase

**Conexão com o Anki**:
O que roda dentro do Anki do computador da pessoa, grava as Frases como Cartões na coleção e responde ao PerpetualMiner. Está ligada ou desligada.
_Avoid_: Anki Bridge, Bridge, AnkiConnect, serviço residente, servidor local, Conexão de hoje

**Pareamento**:
O vínculo de um navegador com a Conexão com o Anki, feito quando a pessoa digita no Painel o código que só o Anki dela mostra. Desfaz-se no Anki, em “Desconectar navegadores”.
_Avoid_: Token, senha, login, autorização

**Perfil do Anki**:
O perfil do Anki em que os Cartões entram, escolhido pela pessoa; com outro perfil aberto, o Envio espera.
_Avoid_: Conta (é a do Google)

### Envio

**Enviar ao Anki**:
A ação que entrega as Frases selecionadas à Conexão com o Anki para virarem Cartões.
_Avoid_: Exportar

**Envio**:
As Frases de um único Idioma entregues de uma vez ao Anki pela Conexão com o Anki. Enviar Frases de dois Idiomas gera dois Envios.
_Avoid_: Job, lote

**Etapa**:
O ponto em que um Envio está, nesta ordem: Na fila, Criando cartões, Preparando imagens, Gerando áudio, Escolhendo imagens, Esperando o Anki, Enviando ao Anki. Termina Concluído, Concluído em parte ou Não concluído, e Não começou é o Envio em que nenhuma Etapa andou.
_Avoid_: Stage, passo (é da Boas-vindas), fase

**Enviada ao Anki**:
O estado da Frase cujos Cartões chegaram ao Anki por um Envio, ou já estavam lá.
_Avoid_: No Anki

**Ajustes de envio**:
O que cada Envio de um Idioma usa: o Baralho, a origem das imagens, a voz e o sotaque do áudio, o Nível e a Frente.
_Avoid_: Presets

**IA dos cartões**:
Quem escreve o texto dos Cartões e como se paga por ele: a chave da OpenAI da pessoa (por uso) ou o plano do ChatGPT dela. A chave do Gemini é outra, e só lê as fotos de Minerar de uma foto.
_Avoid_: API key, token, “chave” sem dizer de quem

### Cartão e Anki

**Baralho**:
O baralho do Anki que recebe os Cartões de um Idioma. Cada parte do nome depois de “::” é um sub-baralho: em “Inglês::Mineradas”, Inglês é o Baralho e Mineradas é o sub-baralho.
_Avoid_: Deck, nível (é o do Cartão)

**Cartão**:
O item de estudo do Anki gerado a partir de uma Frase. Cada Termo da Frase gera um Cartão.
_Avoid_: Card

**Nível**:
O quanto o Cartão explica, por Idioma: Iniciante, Intermediário ou Avançado. É a escolha que define o Estilo do cartão, e o quiz de nível da Boas-vindas sugere um.
_Avoid_: Estilo (é o que o Nível define)

**Estilo do cartão**:
O que o Cartão de um Idioma traz em cada Nível: a língua da explicação e as partes do verso.
_Avoid_: Nível (é a escolha)

**Frente**:
O lado do Cartão que pergunta; o verso responde. Cada Idioma escolhe uma de seis Frentes: Frase com áudio, Ouvir primeiro, Lacuna, Produção, Ditado ou Criação.
_Avoid_: Front, modelo de cartão

**Vocabulário**:
As palavras soltas e os Termos que aparecem nos Cartões de um Baralho, cada um Novo, Recente, Maduro ou Misto segundo o Anki. É por ele que a Mineração automática sabe o que a pessoa já conhece.
_Avoid_: Vocab, dicionário

**Novo, Recente, Maduro**:
O ponto em que o Anki tem um Cartão: Novo (nunca estudado), Recente (em aprendizado, ou com intervalo menor que 21 dias) e Maduro (21 dias ou mais). No Vocabulário, o que está em Cartões de pontos diferentes é Misto.
_Avoid_: Young, learning, jovem

### Conta e sincronização

**Conta**:
A conta Google com que a pessoa entra para ter as mesmas Frases em qualquer computador. É opcional: sem Conta, as Frases ficam só neste computador.
_Avoid_: Login, usuário, perfil (é o do Anki)

**Nuvem**:
Onde as Frases da Conta ficam fora do computador. Sincronizar é deixar o Histórico e a Nuvem iguais.
_Avoid_: Firestore, servidor, backup, sync

**Apagar**:
Tirar a Frase do Histórico de vez; com Conta, ela some também dos outros computadores. “Tirar do histórico”, no fim de um Envio, é o mesmo Apagar, oferecido para as enviadas.
_Avoid_: Excluir, remover, deletar, descartar (é desistir de Frases ainda não mineradas)

## Relações

- Fonte → Minerar → Frase (no Histórico) → Enviar ao Anki → Envio (um por Idioma) → Cartão (um por Termo) → Baralho

## Ambiguidades resolvidas

- **cartão**: só o item do Anki. Um bloco de tela, como o da IA dos cartões, não é cartão.
- **termo e palavra**: o Termo é o que o Cartão ensina, com uma ou mais palavras, e “palavra” é só a palavra solta.
- **nível, estilo e sub-baralho**: o Nível é a escolha (Iniciante, Intermediário, Avançado) e o Estilo do cartão é o que ela define. A parte do nome de um Baralho depois de “::” é um sub-baralho, nunca “nível”.
- **trecho**: não é Frase, e o texto marcado no livro é Marcação até ser minerado.
