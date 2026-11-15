# PerpetualMiner

Extensão que minera frases de legendas, páginas web e livros físicos num histórico de estudo e as envia ao Anki como cartões.

## Frases e origem

**Frase**:
A unidade de estudo guardada no histórico: um texto curto minerado de qualquer fonte, com seu idioma e contexto.
_Avoid_: Trecho, sentença, item

**Minerar**:
Pôr uma frase no histórico, qualquer que seja a Fonte (legenda, seleção, foto de livro, mineração automática).
_Avoid_: Capturar, salvar, coletar, adicionar

**Mineração automática**:
Modo em que a extensão minera sozinha as linhas de legenda de um idioma enquanto o vídeo roda, até um limite diário.
_Avoid_: Auto Miner

**Fonte**:
De onde a frase veio: netflix, youtube, web, pdf, livro, manual, importado.
_Avoid_: Streaming, plataforma, origem

**Contexto**:
A procedência completa de uma frase: Fonte, Título (obra, vídeo, página) e Detalhe (episódio, capítulo, canal).
_Avoid_: Metadados

**Palavra**:
A palavra da frase que o cartão ensina, grifada na frase; pode ser escolhida pela pessoa ou detectada automaticamente. Na tela, o chip diz `palavra: …` quando foi escolhida e `auto: …` quando foi detectada. "keyword" pode ser nome técnico no código, nunca na tela.
_Avoid_: Keyword (na tela), palavra-chave, nova

## Destino da frase

**Conexão com o Anki**:
O complemento do Anki mais o Abridor: o complemento roda dentro do Anki do computador do usuário, grava as frases como cartões na coleção e responde à extensão; o Abridor abre o Anki quando ele está fechado. Não há programa à parte nem serviço residente para instalar ou rodar, e o Windows não tem caminho próprio. Na tela, o nome é sempre “Conexão com o Anki”; “complemento” só onde o próprio Anki usa a palavra.
_Avoid_: Anki Bridge, Bridge, AnkiConnect, serviço residente, servidor local, Conexão de hoje

**Abridor**:
O script pequeno que a Conexão com o Anki deixa no computador para a extensão abrir o Anki fechado; a extensão só o chama com a permissão que a pessoa deu em “Abrir o Anki sozinho”.
_Avoid_: host, native host, launcher

**Pareamento**:
O vínculo de um navegador com a Conexão com o Anki: a pessoa digita no Painel o código que só o Anki dela mostrou, e dali em diante a Conexão só atende os pedidos que esse navegador assina (e o navegador só aceita as respostas que a Conexão prova). Na tela: “Conectar este navegador ao Anki”; desfaz-se no Anki, em “Desconectar navegadores”.
_Avoid_: Token, senha, login, autorização

**Envio**:
Uma remessa de frases de um único idioma ao Anki pela Conexão com o Anki; enviar frases de dois idiomas gera dois envios.
_Avoid_: Job, lote

**Enviada ao Anki**:
Estado da frase que foi incluída num Envio concluído e virou cartão.
_Avoid_: Exportada, No Anki

**Exportada**:
Estado da frase gravada num arquivo .txt; não implica que ela esteja no Anki.
_Avoid_: Enviada

**Baralho**:
O baralho do Anki que recebe os cartões de um idioma.
_Avoid_: Deck

**Cartão**:
O item de estudo do Anki gerado a partir de uma frase.
_Avoid_: Card
