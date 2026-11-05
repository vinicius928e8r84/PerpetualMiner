# Usar um tipo de nota que já tenho (#165)

Fatia da spec [#138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138), histórias 62 e 63. Continuação de [`tipo-de-nota-por-idioma.md`](tipo-de-nota-por-idioma.md): lá a Conexão **cria** o tipo de nota
dela; aqui a pessoa usa o dela. Diferente do #161, **nada é criado nem mudado na coleção**: a Conexão só grava notas.

## O que entrega

- Em Ajustes de envio › Estilo do cartão, **Usar um tipo que já tenho** (BRG-45): a pessoa escolhe um tipo de nota do Anki e diz, para cada **parte** do Cartão, o campo dele (várias partes podem ir no mesmo campo), e vê a prévia no tipo dela.
- As partes são seis: `frase`, `audio_da_frase`, `resposta` (o verso do nível, sem a Palavra, o áudio e a imagem: a pronúncia, as traduções, o contexto, a definição, outro exemplo), `palavra`, `audio_da_palavra` e `imagem`. A Frase e a resposta são obrigatórias e vão em **campos diferentes**.
- Sem o campo da Frase ou o da resposta: **Continuar fica desligado**, a tela explica (“Nada foi alterado no Anki”) e oferece o estilo pronto. Nada é gravado, nem no storage nem no Anki.
- Quem usa um tipo próprio **fica com a frente que já tem**: a escolha da Frente (#166) some, e a Conexão não reescreve o modelo de Cartão dele. As frentes extras valem para os estilos prontos.

## Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| o tipo de nota da pessoa e os campos dele | a coleção do Anki, da pessoa | nenhum | criado, regravado ou apagado pela Conexão |
| o mapeamento (`tipoProprio: { nome, mapa }`) de cada idioma | a extensão (`ankiBridgePresets`, Salvar ajustes) | o pedido do Envio e o da prévia, só enquanto dura | decidido pela Conexão; ela só o confere |
| a lista de tipos e campos que a tela mostra | a coleção (lida por `POST /anki/note-types`) | a tela, só enquanto aberta | guardada: cada abertura do painel lê de novo |

## Estados e transições

Por idioma: **estilo pronto** (padrão; nada em `tipoProprio`) ⇄ **tipo da pessoa** (`tipoProprio` gravado). Só a pessoa troca, na tela: Continuar (rascunho) e Salvar ajustes (storage); “Usar o estilo pronto” e Salvar voltam ao pronto.

| transição | quem pede | o que lê | quem aceita | o que muda | o que não pode mudar |
|---|---|---|---|---|---|
| ver os tipos | a tela (`POST /anki/note-types`) | os tipos de nota e os campos | a thread principal do Anki | nada | a coleção |
| ver a prévia no tipo | a tela (`POST /anki/card-preview` com `tipoProprio`) | o tipo e o mapa | o renderizador do Anki | nada (nota de mentira) | a coleção |
| gravar um Cartão no tipo | o Envio (`POST /jobs` com `tipoProprio`) | o tipo, o mapa e o `guid` | a thread principal, na função de sempre (`gravar_cartao`) | uma nota nova, só nos campos do mapa | o tipo, o modelo de Cartão, os campos, as notas que já estão |

- **Recusas**: o mapa sem a Frase ou a resposta, com os dois no mesmo campo ou com uma parte que a Conexão não conhece é `400 invalid_mapping` (no `POST /jobs` e na prévia): nada é criado. Um campo que o tipo não tem na prévia é `409 invalid_mapping`; um tipo que não está na coleção é `404 note_type_missing`. No Envio, um tipo apagado ou sem os campos faz o Cartão falhar com `note_type_missing` **sem gravar nada** e sem recriar o tipo, antes de gastar a chave.
- **Repetido**: gravar de novo o mesmo Cartão acha o `guid` e não grava; a busca de duplicatas olha o campo onde a Frase foi.
- **Atômico, perdido, reverter**: como o Envio de sempre (`envio-no-complemento.md`). Reverter é a pessoa pôr “Usar o estilo pronto” e salvar: os Cartões já gravados ficam como estão.

## Limites aceitos

- A duplicata só é achada se o campo da Frase tem **só** a Frase: com o áudio ou outra parte no mesmo campo, o texto muda e o Cartão entra de novo.
- O mapeamento não vai no passo do nível da Boas-vindas (ele só pergunta o nível; o resto mora em Ajustes de envio).
- A prévia usa o modelo de Cartão do tipo da pessoa como o Anki o desenha; o áudio vira ▶ e as partes que o modelo não cita não aparecem, como no Anki.
- Um tipo cloze ou com frente feita só de campos que o mapa não preenche mostra uma prévia vazia: a pessoa vê e muda o mapa.
- A cópia do pacote da loja (`conexao/perpetualminer.ankiaddon`) sobe para a 0.4.2.

## Provas

- `complemento/test_tipo_proprio.py` (o servidor real, a coleção em memória, a OpenAI e a voz de mentira): o Cartão nos campos do mapa e o tipo intocado, várias partes num campo, nenhum campo fora do mapa, a duplicata, a recusa sem a Frase, sem a resposta, no mesmo campo e com uma parte desconhecida, o campo ou o tipo que sumiu (falha sem gravar), a lista de tipos e a prévia.
- `complemento/contrato/exemplos-do-tipo-proprio.json` (lido pelo servidor real e pelo fake do e2e) e `test_contrato_fechado.js`.
- `e2e/tests/painel-ajustes-tipo-proprio.spec.js`: o mapeamento e o que ficou guardado, a frente que some, as recusas, a Conexão desligada e o Envio com o `tipoProprio`. As referências visuais (`painel-ajustes-tipo-proprio-visual.spec.js`) são **propostas** (`test.fixme`) até o dono aprovar.
- **Não prova**: o Anki do dono com um tipo dele de verdade (o ensaio no Mac e no Windows) e a biblioteca de verdade do Anki gravando num tipo de terceiros.
