# Página de desenho: a imagem do Cartão na Conexão com o Anki (#144)

Continuação de [envio-no-complemento.md](envio-no-complemento.md) (#142): o Cartão que a Conexão grava ganha a imagem, como o de
hoje: a **foto real** (Openverse, com o juiz de imagem) ou a **imagem gerada** pela chave. Nenhum pedido nem resposta entre a
extensão e a Conexão muda: `POST /jobs` já leva `imageSource` (`"1"` foto real, `"2"` gerada, os Ajustes de envio) e a etapa
`generate_images` já é uma etapa que o painel sabe dizer (“Escolhendo imagens”, ENV-07). Não há tela nova nem cópia nova.

## O que acontece

Por Cartão, depois do texto e antes da nota (`envio.Trabalho`, `imagem_do_cartao.py`), na thread de trabalho:

1. A Conexão lê a chave do cofre (a mesma do texto, só para este pedido; sem chave, o Cartão vai sem imagem e o Cartão seguinte para o Envio
   com `openai_key_missing`, como já era) e põe o Envio na etapa `generate_images`.
2. O motor escolhe a imagem com o **mesmo código da Conexão de hoje** (`engine/image_pipeline.py`, que a `start.py` também usa):
   - `imageSource` `"1"`: busca no Openverse as consultas do texto do Cartão (`Google Image Search Queries:`, em ordem), baixa as
     candidatas, o juiz de imagem (GPT-vision) dá nota, e a foto fica se passar do mínimo; se não, a imagem gerada disputa com a melhor
     foto, e o juiz escolhe (`engine/image_real_first.py`). Sem foto nenhuma, a gerada entra sem juiz;
   - `imageSource` `"2"`: a triagem (`image_guard`, GPT-4o-mini) diz se a Palavra é concreta; abstrata fica sem imagem, sem gastar a geração;
     concreta, a imagem é gerada.
3. A foto baixada passa pelo **adaptador de imagem** (`engine/image_utils.py`): um PNG fica como veio; JPEG, WebP ou GIF viram PNG pelo
   adaptador. No complemento é o Qt do Anki (`imagem_qt.py`: `QImageReader` com a orientação do EXIF e `QImage.save`, só classes que servem
   fora da thread principal); na Conexão de hoje, o Pillow (importado só quando há o que converter).
4. A nota ganha `<img src="<guid>.png">` no verso (`send_to_anki.card_fields`) e `gravar_cartao` guarda o PNG na mídia da coleção
   (`col.media.write_data`) **junto com a nota nova**, na mesma função da thread principal (o `midia` que o #143 também usa). Nota que já
   estava (`guid`) ou duplicata: nenhuma mídia é gravada.

A busca, o juiz, a triagem e a geração falam com Openverse e OpenAI por `urllib` (`engine/google_images.py`, `image_judge.py`,
`image_guard.py`, `generate_images.py`, `openai_http.py`): nenhuma biblioteca de fora no complemento, e a Conexão de hoje roda o mesmo
código sem o SDK da OpenAI nem o `requests` para imagens. A imagem nunca fica em `user_files`: vai da rede à coleção na mesma volta (um
diretório temporário do sistema guarda os candidatos enquanto o juiz decide, e some no fim).

## Quando a imagem falha

**Só a imagem falha, o Cartão vai sem ela e conta como enviado.** Qualquer erro da busca, do juiz, da triagem, da geração ou da conversão
(Openverse fora do ar, 4xx/5xx da OpenAI, foto que o Qt não lê, crédito acabado para imagens) termina a escolha sem imagem; o Cartão
fica `added` e o Envio `completed`. O log (`complemento.log`) diz o Cartão (`<phraseId>-<n>`) e o código (`openai_request_rejected`,
`UnsupportedImageFormatError`…), nunca o que a OpenAI respondeu, a Palavra nem a Frase. É a escolha da issue; custa dizer “Enviado” a um Cartão
sem figura, e a pessoa só vê a diferença no Anki (a tela de hoje não tem estado para “sem imagem”, e nenhum foi inventado aqui).

## O que fica guardado (e o que não)

Os registros de custo do Envio ganham as linhas `image` e `image_pipeline` (a aba Custos já as lê: fotos reais, geradas, o que o juiz
economizou) e os tokens do juiz e da triagem (`[image_judge]`, `[image_guard]`). Como os custos **ficam depois do Apagar tudo**, eles citam o
Cartão, nunca a Palavra: o rótulo é `<phraseId>-<n>`, e o `image_pipeline` do complemento não guarda as consultas de busca (`queries`,
`query_stats`, `best_real_query`), que vêm do texto do Cartão (`config["image_records_by_card"]`, só do complemento; a Conexão de hoje segue
registrando como antes). As consultas saem sim da máquina, para o Openverse, como já saíam.

## Riscos e limites

- **Risco 10 (a imagem fora do SDK, nos dois caminhos):** o juiz, a triagem e o pedido de geração agora são `urllib`, no complemento **e na
  Conexão de hoje** (`POST /v1/chat/completions` e `POST /v1/images/generations`, os mesmos corpos que o SDK mandava). Foi provado só contra
  a OpenAI de mentira: depois da mescla, **nenhum dos dois caminhos rodou contra a OpenAI de verdade**, nem com o modelo `gpt-image-2.5-flare`.
  O ensaio do dono (#269) é a prova, e vale também um Envio pela Conexão de hoje.
- **As tentativas do SDK:** as chamadas de imagem (juiz, triagem e geração) repetem 2 vezes, esperando 0,5 s e depois 1 s, um 408, 409, 429
  (menos o de crédito), 5xx, tempo esgotado ou falta de resposta, como o SDK fazia (`engine/openai_http.py`). Passadas as tentativas, é como
  era: na Conexão de hoje o erro do juiz derruba o Envio, a geração perde a imagem e a triagem manda gerar; no complemento a imagem vai sem
  ela. O texto do Cartão não repete aqui (o complemento espera e repete por conta própria).
- **Duplicata e retomada gastam a imagem:** a busca da duplicata e a gravação são uma função só (N6), então o Cartão que acaba `duplicate`
  já pagou o juiz e, se foi o caso, a geração (como já pagava o texto). Um Envio interrompido entre a imagem e a nota (o Anki fechou) a
  pede de novo na volta.
- **O Qt de verdade:** `imagem_qt.py` foi conferido contra o PyQt6 6.11 sem tela (`test_imagem_qt.py`, pulado onde o PyQt6 não está), não
  contra o `aqt.qt` do Anki (PyQt5 do Anki 2.1.5x/6.x). A foto convertida passa pelo Qt do Mac do dono só no ensaio (#269).
- **Foto grande:** o PNG da foto original (o Openverse serve o original, não a miniatura) pode ser grande; é o de hoje. Acima de 25 MB o
  motor tenta a miniatura.
- **Fora do escopo (da issue):** o juiz ver miniaturas e o crédito do Openverse.

## Ensaio do dono, no Mac (risco 10; é o #269)

Com o primeiro Cartão funcionando (`complemento/LEIA-ME.md`, passo 9), uma Palavra concreta (“bicycle”) e **Foto real** nos Ajustes de envio:
a nota nova tem a foto no verso, e ela está na pasta de mídia do Anki (Ferramentas › Verificar mídia não a acha órfã). Uma foto que o Openverse
serve em JPEG ou WebP vira PNG pelo Qt do Anki: abre, de pé (a orientação do EXIF vale)? Depois **Gerada por IA**: a imagem gerada entra (é a
primeira vez que ela roda sem o SDK; se não vier, o `complemento.log` diz o código e o Cartão chegou sem imagem mesmo assim). Uma
Palavra abstrata (“resilience”) na imagem gerada vai sem imagem. Em `user_files/custos/<jobId>/costs.jsonl` estão as linhas `image` e
`image_pipeline` (sem a Palavra nem as buscas), a aba Custos conta a foto ou a imagem gerada, e `user_files` não tem imagem nenhuma.

## Provas

| o quê | teste |
|---|---|
| a nota cita a foto que o juiz escolheu, a coleção guarda os bytes dela, e o juiz recebeu as candidatas e a chave certas | `complemento/test_envio_imagem.py` (o Openverse de mentira: `test_imagens_de_mentira.py`; a OpenAI de mentira: `test_openai_de_mentira.py`) |
| a imagem gerada (sem foto que preste, o juiz a prefere, sem foto nenhuma, `imageSource` `"2"`, a triagem abstrata) | `test_envio_imagem.py` |
| só a imagem falha (geração recusada, Openverse e geração fora do ar, juiz recusado, foto que não converte): o Cartão vai sem imagem e conta como enviado | `test_envio_imagem.py` |
| JPEG pelo adaptador de imagem; a imagem não fica na pasta de dados; nem a Palavra nem a Frase nos custos, no log, no pacote de diagnóstico; a chave vai só à OpenAI (nunca ao Openverse nem a um arquivo fora do cofre) | `test_envio_imagem.py` |
| o 429 ou 5xx passageiro do juiz, da triagem e da geração é pedido de novo (2 vezes); a chave recusada e o crédito não | `engine/test_image_judge_invalid_format.py`, `test_image_guard.py`, `test_generate_images.py` |
| o Qt de verdade (JPEG→PNG, EXIF, transparência, o que não lê) | `complemento/test_imagem_qt.py` (com PyQt6) |
| a mídia da imagem nos dois adaptadores da coleção; pelo adaptador do Anki, na thread principal | `test_colecao_em_memoria.py`, `test_no_anki.py`, `test_no_anki_envio.py` |
| os testes de imagem do motor, **sem Pillow instalado**: adaptador de mentira, busca, juiz, triagem, geração e download na fronteira HTTP | `engine/test_image_normalization.py`, `test_google_images.py`, `test_image_judge_invalid_format.py`, `test_image_guard.py`, `test_generate_images.py` |
| o motor de imagem importa só com a biblioteca padrão, no pacote e solto | `engine/test_imagens_sem_bibliotecas.py`, `complemento/test_motor.py`, `test_pacote.py` |
| a Conexão de hoje escolhe a imagem como antes (a mesma política, agora em `image_pipeline.py`) | `engine/test_image_fallback_policy.py` (inalterado, salvo os `import`) |
| o Cartão chega ao Anki do Mac com a imagem | ensaio do dono (#269), `complemento/LEIA-ME.md` |
