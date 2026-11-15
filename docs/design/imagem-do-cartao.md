# A imagem do Cartão na Conexão com o Anki (#144)

Continuação de [envio-no-complemento.md](envio-no-complemento.md) (#142). Fatia fechada: o código é `complemento/imagem_do_cartao.py`, `imagem_qt.py` e `engine/image_pipeline.py`; esta página guarda só as decisões e os limites. Com o login do ChatGPT o juiz vai pelo plano e a imagem gerada, só pela chave ([imagem-pelo-plano.md](imagem-pelo-plano.md), #156). Nenhum pedido nem resposta entre a extensão e a Conexão mudou (`POST /jobs` já leva `imageSource`: `"1"` foto real, `"2"` gerada) e não há tela nem cópia nova.

## Decisões

- **O motor é o da Conexão de hoje** (`engine/image_pipeline.py`, que a `start.py` também usa): com `"1"`, a foto do Openverse que o juiz de imagem aprova, e a imagem gerada disputa com a melhor foto se nenhuma passar do mínimo; com `"2"`, a triagem diz se a Palavra é concreta e uma abstrata fica sem imagem, sem gastar a geração.
- **Só a imagem falha, o Cartão vai sem ela e conta como enviado.** Qualquer erro da busca, do juiz, da triagem, da geração ou da conversão termina a escolha sem imagem; o Cartão fica `added` e o Envio `completed`. É a escolha da issue; custa dizer “Enviado” a um Cartão sem figura, e a pessoa só vê a diferença no Anki (a tela não tem estado para “sem imagem”, e nenhum foi inventado). Sem chave, o Cartão vai sem imagem e o seguinte para o Envio com `openai_key_missing`.
- **Nada de biblioteca de fora**: Openverse e OpenAI por `urllib`. A foto que não é PNG passa pelo adaptador de imagem (`engine/image_utils.py`): o Qt do Anki no complemento (`imagem_qt.py`, com a orientação do EXIF), o Pillow na Conexão de hoje.
- **A imagem vai da rede à coleção na mesma volta, junto com a nota nova** (`<img src="<guid>.png">` no verso); nunca fica em `user_files`. Duplicata e `guid` repetido não gravam mídia.
- **O que fica guardado**: os custos do Envio ganham as linhas `image` e `image_pipeline` e os tokens do juiz e da triagem. Como os custos **ficam depois do Apagar tudo**, eles citam o Cartão (`<phraseId>-<n>`), nunca a Palavra nem as buscas (as consultas saem sim da máquina, para o Openverse, como já saíam); o log diz o Cartão e o código, nunca o que a OpenAI respondeu.

## Limites aceitos

- **Risco 10 (a imagem fora do SDK, nos dois caminhos):** o juiz, a triagem e a geração são `urllib` no complemento **e na Conexão de hoje** (`POST /v1/chat/completions` e `/v1/images/generations`). Provado só contra a OpenAI de mentira: nenhum dos dois caminhos rodou contra a OpenAI de verdade, nem com o modelo `gpt-image-2.5-flare`. O ensaio do dono (#269) é a prova, e vale também um Envio pela Conexão de hoje.
- **As tentativas do SDK:** o juiz, a triagem e a geração repetem 2 vezes (0,5 s e 1 s) um 408, 409, 429 (menos o de crédito), 5xx ou tempo esgotado, como o SDK fazia. Passadas as tentativas, na Conexão de hoje o erro do juiz derruba o Envio, a geração perde a imagem e a triagem manda gerar; no complemento a imagem vai sem ela.
- **Duplicata e retomada gastam a imagem:** a busca da duplicata e a gravação são uma função só, então o Cartão que acaba `duplicate` já pagou o juiz e, se foi o caso, a geração. Um Envio interrompido entre a imagem e a nota a pede de novo na volta.
- **O Qt de verdade:** `imagem_qt.py` foi conferido contra o PyQt6 6.11 sem tela, não contra o `aqt.qt` do Anki. A foto convertida passa pelo Qt do Mac do dono só no ensaio (#269).
- **Foto grande:** o Openverse serve o original, que pode ser grande; acima de 25 MB o motor tenta a miniatura.
- **Fora do escopo (da issue):** o juiz ver miniaturas e o crédito do Openverse.

## Ensaio do dono, no Mac (risco 10; é o #269)

Com o primeiro Cartão funcionando (`complemento/LEIA-ME.md`, passo 9), uma Palavra concreta (“bicycle”) e **Foto real**: a nota nova tem a foto no verso, e ela está na pasta de mídia do Anki (Verificar mídia não a acha órfã). Uma foto que o Openverse serve em JPEG ou WebP vira PNG pelo Qt do Anki: abre, de pé (o EXIF vale)? Depois **Gerada por IA**: a imagem entra (é a primeira vez que ela roda sem o SDK; se não vier, o `complemento.log` diz o código e o Cartão chegou sem imagem). Uma Palavra abstrata (“resilience”) na imagem gerada vai sem imagem. Em `user_files/custos/<jobId>/costs.jsonl` estão as linhas `image` e `image_pipeline` (sem a Palavra nem as buscas), e `user_files` não tem imagem nenhuma.
