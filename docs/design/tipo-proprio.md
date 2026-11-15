# Usar um tipo de nota que já tenho (#165)

Fatia da spec [#138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138), histórias 62 e 63, continuação de [`tipo-de-nota-por-idioma.md`](tipo-de-nota-por-idioma.md): lá a Conexão **cria** o tipo de nota dela; aqui a pessoa usa o dela. Fatia fechada: o código é `complemento/tipo_proprio.py`, `tipo_do_envio.py` e `painel-anki-tipo-proprio.js`, e o contrato é `complemento/contrato/exemplos-do-tipo-proprio.json`; esta página guarda só as decisões e os limites.

## Decisões

- **Nada é criado nem mudado na coleção**: a Conexão só grava notas (diferente do #161). Reverter é a pessoa pôr “Usar o estilo pronto” e salvar; os Cartões já gravados ficam como estão.
- **O mapeamento é da extensão** (`tipoProprio: { nome, mapa }` em `ankiBridgePresets`, por idioma); a Conexão só o confere, e a lista de tipos e campos se lê de novo a cada abertura do painel (`POST /anki/note-types`).
- **As partes do Cartão são seis**: `frase`, `audio_da_frase`, `resposta` (o verso do nível, sem a Palavra, o áudio e a imagem), `palavra`, `audio_da_palavra` e `imagem`. A Frase e a resposta são obrigatórias e vão em **campos diferentes**; várias partes podem ir no mesmo campo. Sem uma delas, Continuar fica desligado, a tela diz “Nada foi alterado no Anki” e oferece o estilo pronto.
- **Quem usa um tipo próprio fica com a frente que já tem**: a escolha da Frente (#166) some e a Conexão não reescreve o modelo de Cartão dele.
- **Recusas**: o mapa sem a Frase ou a resposta, com os dois no mesmo campo ou com uma parte desconhecida é `400 invalid_mapping` (no `POST /jobs` e na prévia). Um campo que o tipo não tem na prévia é `409 invalid_mapping`; um tipo que não está na coleção é `404 note_type_missing`. No Envio, um tipo apagado ou sem os campos faz o Cartão falhar com `note_type_missing` **sem gravar nada** e sem recriar o tipo, antes de gastar a chave.

## Limites aceitos

- A duplicata só é achada se o campo da Frase tem **só** a Frase: com o áudio ou outra parte no mesmo campo, o texto muda e o Cartão entra de novo.
- O mapeamento não vai no passo do nível da Boas-vindas (ele só pergunta o nível).
- A prévia usa o modelo de Cartão do tipo da pessoa como o Anki o desenha: o áudio vira ▶ e as partes que o modelo não cita não aparecem. Um tipo cloze, ou com frente feita só de campos que o mapa não preenche, mostra uma prévia vazia: a pessoa vê e muda o mapa.
- **Não provado**: o Anki do dono com um tipo dele de verdade (o ensaio no Mac e no Windows) e a biblioteca de verdade do Anki gravando num tipo de terceiros. As referências visuais (`painel-ajustes-tipo-proprio-visual.spec.js`) são **propostas** (`test.fixme`) até o dono aprovar.
