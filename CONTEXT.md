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

## Destino da frase

**Conexão com o Anki**:
O programa que roda no computador do usuário e leva as frases ao Anki, transformando-as em cartões.
_Avoid_: Anki Bridge, Bridge, AnkiConnect, serviço residente

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
