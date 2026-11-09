# Página de desenho: o Envio dentro da Conexão com o Anki (#142)

Fatia ALTA pelo [modelo](modelo-fatia-alta.md): o Envio passa a viver em dois processos (o painel acompanha, a Conexão faz) e
gasta a credencial (a chave da OpenAI que a Conexão guarda). O que a fatia entrega: apertar Enviar ao Anki entrega as Frases à
Conexão, e cada uma vira um Cartão de **texto** (áudio e imagem: #143 e #144), gravado direto na coleção, no tipo de nota
próprio do idioma (#161, que a Conexão cria).

**Histórico (não é parte do desenho):** a página saiu de três rodadas de revisão independente na PR #231; o que as rodadas mudaram
está nas seções, e a tabela do fim (“A revisão e onde está a resposta”) é só o histórico delas. A coluna “hoje” da §6 descreve o código do repositório.

## 1. Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| **o status** de cada Envio (`queued`, `running`, `completed`, `partial`, `failed`) e o estado de cada Cartão | a Conexão: **só** `user_files/estado/<jobId>.json` | o painel relê pelo `POST /jobs/list` a cada 2 s; em `pm_envio` guarda só o que acompanha (`{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar, corpo }`) | a fila: `user_files/fila/fila.json` guarda **a ordem e o id**, nunca o status (C1). O painel nunca decide o estado de um Cartão |
| o pedido de cada Envio (idioma, Baralho, imagens, sotaque, as Frases) | a Conexão: `user_files/fila/<jobId>.json`, com a **impressão do corpo** (`corpoSha256`, o SHA-256 do JSON canônico do corpo recebido), gravada no criar e nunca mudada (N2) | o painel, em `pm_envio.corpo`, **antes** do primeiro `POST` (o corpo congelado) | outro corpo com o mesmo `jobId` (`409`). O criar compara a impressão, **nunca** o pedido guardado, que o fim do Envio e o Apagar tudo reescrevem (C7) |
| a identidade de cada Cartão | o pedido: um Cartão é **(`phraseId`, a posição da Palavra na Frase)**, escrito como `<phraseId>-<n>` (C4); a Palavra e a Frase de cada Cartão ficam **só na linha do pedido** (nunca no estado, nos custos nem no pacote de diagnóstico: #248), e o texto é gerado lendo a linha, que o Cartão mantém até chegar ao Anki (#247) | o `guid` da nota e o nome do texto derivam dela | o `filename_stem` do motor (Palavra + hash da frase): duas Frases iguais têm o mesmo stem, e o Cartão não pode ser o mesmo |
| o texto gerado de cada Cartão | a Conexão: `user_files/estado/<jobId>/<phraseId>-<n>.txt` | ninguém | pedido de novo quando já existe (seria pagar duas vezes) |
| **o texto das Frases dentro da Conexão** (as linhas do pedido e os textos gerados) | é uma **cópia** das Frases da extensão, enquanto o Envio precisa dela (C7) | — | guardada depois que o Envio não precisa mais dela: some quando cada Frase chega ao Anki, e o Apagar tudo a apaga (§3). Escrita no `complemento.log`: o log cita o Cartão por `<phraseId>-<n>`, nunca a Palavra nem a Frase (N3) |
| a nota no Anki | a coleção do Anki, com `guid` = `pm` + sha1(`jobId`, `phraseId`, `n`) | — | gravada duas vezes: o `guid` reconhece a nota deste Envio (`added`), e a busca de duplicatas reconhece a que já existia (`duplicate`) |
| os custos de cada Envio | a Conexão: `user_files/custos/<jobId>/costs.jsonl` (cada registro cita o Cartão, `<phraseId>-<n>`, nunca a Palavra) | a aba Custos guarda a última leitura em `pm_anki_custos` (já existia) | fonte: o cache só aparece com o selo BRG-12 |
| a chave da OpenAI | a Conexão (o cofre, `user_files/chaves`), **uma só, de uma conta** (C5) | ninguém | lida antes de cada pedido de texto, e só para ele; escrita na fila, no estado, nos custos, no log, no pacote de diagnóstico ou numa resposta |
| a configuração do motor | na `main`, `engine/config.yaml`; na fase do código, `engine/config.json`, e o `config.yaml` **sai no mesmo commit** (N7, §3 “O motor”) | — | duas fontes ao mesmo tempo |
| as Frases | a extensão (`frases`) | a cópia acima, dentro da Conexão | escrita de volta pela Conexão: “Enviada ao Anki” continua sendo o painel que marca, lendo `successfulPhraseIds` |

## 2. Estados

O Envio tem os estados da Conexão de hoje (`bridge/envio.py`), que o painel já lê: `queued` → `running` (etapa
`generate_cards`, `wait_anki` ou `send_to_anki`) → `completed` | `partial` | `failed`. Cada Cartão tem o seu: `pending` → `text`
(o texto está gravado) → `added` | `duplicate`; ou `failed`, com o código do motivo.

O que a tela diz (regra C8: o estado verdadeiro):

- as etapas e o fim, como hoje (ENV-07, ENV-08, ENV-10…12). “Esperando o Anki” é verdade enquanto a coleção está fechada,
  sincronizando ou ocupada, porque a Conexão de fato espera (sem prazo: I4 da revisão, #246, com as histórias 82 e 83);
- **as falhas novas não têm cópia própria nesta fatia** (C8, limite 5.i): `openai_key_missing`, `openai_key_rejected`,
  `openai_no_credit`, `note_type_missing`, `job_conflict` e o `404` de um complemento antigo aparecem como o que já existe
  (“Não concluído” / ENV-03 “não começou” e “N não entrou”), com o código em Detalhes. É verdade (o Envio de fato não fez os
  Cartões), mas não diz o que fazer. A cópia que diz vem com o ticket de cada uma: a chave com o primeiro Envio (#173, história 76,
  “Este cartão não foi” + Trocar a chave), o tipo de nota com o #161, e “atualize a Conexão” com a atualização (#177, história 104).

## 3. Transições

| transição | quem pede | o que lê antes | quem aceita | o que muda | o que não pode mudar |
|---|---|---|---|---|---|
| criar | o painel: `POST /jobs` com `jobId` = o `id` do Envio (`crypto.randomUUID()`), idioma, Baralho e as Frases; o corpo é montado uma vez, gravado em `pm_envio` antes do pedido e reenviado igual (Tentar de novo do ENV-03, painel reaberto com o pedido sem resposta) | a fila (o `jobId` está nela?) | a Conexão | grava, nesta ordem: o pedido (com a impressão do corpo), o estado (`queued`, cada Cartão `pending` com a sua Palavra) e, **por último, a entrada na fila: é o ponto de confirmação** (C2). Frases com o mesmo `phraseId` no corpo valem uma vez (a primeira) | um `jobId` **na fila**: o mesmo corpo (a mesma impressão) é `201` com o Envio como ele está e nada é gravado, **mesmo depois de o Envio terminar ou de o Apagar tudo** reescrever o pedido (N2); outro corpo, `409 job_conflict`. Um `jobId` com pedido gravado e **sem** entrada na fila é um criar que não terminou: o mesmo corpo de novo **termina**: grava o estado a partir do pedido guardado **se ele falta** (N1), e depois a entrada na fila; um estado que já existe fica como estava. Outro corpo é `409` |
| trabalhar | a thread de trabalho | a fila (a ordem) e, para cada id, **o estado** (o status; um id da fila sem estado é refeito como na subida, abaixo, e nunca lido como `{}`) | a própria thread, que muda **só o estado** (o arquivo do status), sob a tranca | `running`; confere o tipo de nota e os campos (faltando: `failed`, `note_type_missing`, nada gasto); por Cartão: **lê a chave do cofre** (sem chave: o Envio para com `openai_key_missing` e nada mais é gasto) → pede o texto (rede, nesta thread, 120 s por pedido) → grava o texto → grava a nota (uma função na thread principal do Anki, abaixo) → grava o estado do Cartão. Chave recusada ou sem crédito: o Envio para com o código, e os textos já pagos ainda vão ao Anki; limite de uso, 5xx ou sem rede: o Cartão tenta 3 vezes com espera e depois fica `failed` | um Cartão `added`/`duplicate` não roda de novo; um texto gravado não é pedido de novo; `lastError` é um código, nunca o texto da OpenAI |
| gravar a nota | a thread de trabalho | — | **uma única função na thread principal do Anki** (C3) | dentro dela, nesta ordem: confere a sincronização (o sinal dos ganchos `sync_will_start`/`sync_did_finish`; sincronizando, **devolve** `ColecaoIndisponivel` sem gravar) → procura o `guid` do Cartão (achou: devolve `added`, sem gravar) → procura a frente normalizada no Baralho (achou: devolve `duplicate`, sem gravar) (N6) → cria o Baralho se falta → confere o tipo de nota e os campos → `add_note` com o `guid` | uma nota dobrada: a função que o Anki ocupado atrasou e roda depois de a thread desistir acha o próprio `guid` na volta seguinte (ou a volta seguinte acha o dela); uma nota própria contada como `duplicate`, porque a busca da frente e a gravação estão na mesma função. Nenhuma exceção sai da função para a thread principal: o que dá errado é devolvido, nunca levantado (abaixo) |
| esperar o Anki | a thread de trabalho | a resposta da função: `ColecaoIndisponivel` (perfil fechado, sincronizando, ou a thread principal sem responder em 10 s) | — | etapa `wait_anki` (e `waiting`, #149); tenta de novo a cada poucos segundos, sem prazo | o Envio não falha por isso |
| terminar | a thread de trabalho | o estado **guardado** de cada Cartão (não só os desta volta) | — | `completed` / `partial` / `failed` pelas regras de `settle` de hoje (a Frase está no Anki quando todos os Cartões dela estão `added`/`duplicate`, e é duplicada quando todos são `duplicate`); o texto das Frases que chegaram ao Anki é apagado (a linha no pedido vira só o `phraseId` e o que cada Cartão foi, `noAnki`, que refaz o estado sem gerar nada; o `.txt` de cada Cartão some quando a nota dele está no Anki) (C7, R4-b) | os números da aba Custos: o pedido guarda quantas Frases tinha |
| tentar de novo | o painel: `POST /jobs/retry` (`{ jobId }`) | o estado, sob a mesma tranca | a Conexão | de `completed`/`partial`/`failed` para `queued`, guardando o estado de cada Cartão | já `queued` ou `running`: responde o estado e nada é gravado. Um Envio `failed` com `wiped` (as linhas já foram apagadas) também: responde o estado e não grava nada (N5) |
| Apagar tudo (CFG-17) | o painel: `POST /jobs/apagar-frases` (rota nova, C7) | o estado de cada Envio, sob a tranca | a Conexão | um Envio `queued`/`running` vai a `failed` com `wiped` (a thread para antes do próximo Cartão); de todo Envio somem as linhas das Frases e os textos gerados; ficam os `phraseId`, o estado de cada Cartão e os custos | as notas que já estão no Anki (o Anki não é o histórico). Repetido, responde igual e não grava nada. No painel, o Apagar tudo encerra o acompanhamento dos Envios e é recusado com a Conexão fora: [apagar-tudo](envio-apagar-tudo.md) |
| a Conexão sobe | o Anki abre | **o estado** de cada id da fila | a Conexão | um estado `running` volta a `queued` e o Envio continua de onde parou; um id da fila **sem estado** (o arquivo sumiu) tem o estado refeito a partir do pedido guardado (`queued`, cada Cartão `pending`; o `guid` acha as notas que já estão no Anki), e sem pedido o id sai da fila e o log diz por quê (N1); um pedido sem entrada na fila **não** é posto na fila sozinho (só o mesmo pedido do painel o termina: ninguém gasta a chave por um Envio que ninguém acompanha) | um id da fila sem estado nunca fica como está. Espera até 60 s a extensão antes de retomar: [apagar-tudo](envio-apagar-tudo.md) |
| ler | o painel: `POST /jobs/list`, `/jobs/get`, `/jobs/debug-bundle`, `/analytics/jobs` | o estado | a Conexão | nada | a forma das respostas: cada item do `/jobs/list` continua com o `status` no topo, **preenchido do estado** (a fila não o tem mais), então o contrato, o fake do e2e e o painel ficam como estão (N4) |

**A base observada** é o `jobId`: ele é a chave de idempotência do criar. Não há revisão do lado do painel, porque só a
thread de trabalho avança o estado; o painel só cria (idempotente), pede para tentar de novo (idempotente) e pede o apagamento
das Frases (idempotente).

**Atômico.** Cada arquivo é escrito num temporário e trocado de uma vez (`os.replace`), e toda leitura e escrita da fila e do
estado passa pela mesma tranca (no Windows, trocar um arquivo que outra thread tem aberto falha). A tranca serializa, **não** junta
duas escritas numa só: por isso o status mora num arquivo só (C1) e o criar tem um ponto de confirmação (C2). Entre dois passos que
cruzam processos:

- o painel pediu e a resposta se perdeu: o mesmo corpo de novo, e a Conexão devolve o Envio que já tem (ou termina o criar);
- a Conexão parou entre gravar o pedido e a fila: o mesmo corpo de novo termina o criar (C2); sem ele, o pedido fica parado e
  não gasta nada (limite 5.g);
- a nota foi gravada e o estado do Cartão não: na volta, o `guid` acha a nota, e o Cartão fica `added`;
- a OpenAI respondeu e o texto não foi gravado: na volta o texto é pedido de novo (pago duas vezes; limite 5.c);
- o Anki fechou com o Envio no meio: abaixo.

**Fechar o Anki no meio do Envio (C11, história 109).** A thread de trabalho é *daemon* e ninguém espera por ela ao fechar:
`Conexao.parar()` (que espera até 5 s) só é chamada pelos testes; nada a liga ao fechamento do Anki. Um pedido de 120 s à OpenAI
morre com o processo e não segura o fechamento. Uma função de gravação que a thread principal roda depois de o perfil fechar acha
`mw.col` vazio: a função captura o erro dentro dela (`ColecaoIndisponivel`) e o devolve à thread de trabalho; **nenhuma exceção
sai para a thread principal**, então o diálogo de erro do Anki nunca abre. Na volta, o Envio continua (`running` → `queued`).

**A chave (C5, C6).** O cofre tem uma chave, vinculada a uma `conta`. O Envio gasta essa chave, venha de qual perfil do Chrome
ou conta Google vier o pedido, e também uma chave legada (`conta: ''`): é o limite já escrito em
[`docs/seguranca/chave-da-openai.md`](../seguranca/chave-da-openai.md) (“dois perfis no mesmo computador dividem uma Conexão e uma
chave”), agora com custo (5.j). A chave é lida do cofre **antes de cada pedido de texto**: Trocar chave no meio do Envio faz o
próximo Cartão usar a chave nova; Apagar chave ou Apagar tudo faz o próximo Cartão parar o Envio com `openai_key_missing`, e nada
mais é gasto. Nada do que a OpenAI devolve num erro é guardado: `openai_http.py` lê só o código da resposta e joga o corpo fora
(o 401 ecoa a chave: “Incorrect API key provided: sk-…”); o logger do motor (`perpetualminer.motor`, o mesmo arquivo
`complemento.log`) só escreve o Cartão (`<phraseId>-<n>`) e o código, nunca a Palavra nem a Frase (N3): o log fica depois do Apagar
tudo e entra em todo pacote de diagnóstico. O pacote de diagnóstico junta o pedido, o estado, os registros de custo, os
nomes dos arquivos do Envio e as linhas do `complemento.log` que citam o `jobId`; nunca a pasta `chaves`.

**O motor dentro do Anki (Python 3.9) e a configuração (B1).** O motor de texto (`engine/parser.py`, `prompt_loader.py`,
`generate_cards.py`, `cost_tracker.py`, `config_loader.py`, `send_to_anki.py`, o novo `openai_http.py`, a configuração e os
prompts) vira, no `.ankiaddon`, o subpacote `motor` (o `empacotar.py` os copia; no repositório, `complemento/motor/__init__.py`
aponta para `engine/`): importações relativas quando é pacote, absolutas no bridge; a OpenAI por HTTP direto; a configuração lida
sem PyYAML nem dotenv; a chave passada pela Conexão, sem ler o ambiente; logger no lugar de `print`; nenhum `warnings.filterwarnings`.
Na `main`, `engine/config.yaml` é a configuração. A troca por `config.json` é **um commit só**, na PR do código, com tudo o que a lê:
`config_loader.load_config()` (que o `start.py`, o `generate_cards.py`, o `send_to_anki.py` e o `bridge/envio.py` usam) e o
`bridge/server.py` (`_deck_stats_config`, que serve os números dos Baralhos e o vocabulário e lia o YAML pelo `yaml` do
`config_loader`), mais o `test_generate_images.py`; **o mesmo commit apaga o `config.yaml`** (N7: os dois têm os mesmos dados, e o
código não volta a ler YAML). Nunca há dois arquivos com um só lido. A máquina de estados do bridge (que usa `zip(strict=)` do
3.10 e o `anki_session` do Windows) é reaproveitada **como contrato**: o complemento tem a sua (`complemento/envio.py`), com os
mesmos estados, transições e regras de `settle`.

**Quem pede, na extensão.** Tudo passa por `PedidoAoAnki` (POST com a origem): `criarEnvio`, `listarEnvios`, `verEnvio`,
`tentarEnvioDeNovo`, `pacoteDeDiagnostico`, `custosDosEnvios` e `apagarFrasesDosEnvios`. A Conexão de hoje (bridge) ganha as mesmas
rotas POST; os custos dela continuam em `<job>/log/costs.jsonl`.

**O id nas rotas (C9).** O complemento só **cria** Envio com `jobId` UUID. Nas rotas que só acham um Envio (`get`, `retry`,
`debug-bundle`), um id que a Conexão não tem é `404 job_not_found`, seja qual for o formato; só um id que não é texto, ou com
caractere de caminho (`/`, `\`, `..`), é `400 invalid_job_id`. No bridge, o criar aceita o UUID do painel ou os ids que ele mesmo
gera (letras, números, `-` e `_`), e as rotas de achar aceitam os ids dele como hoje: o Continuar envio de um Envio que já está
no bridge segue funcionando no bridge.

**Reverter:** ninguém apaga uma nota gravada nem desfaz um Cartão pronto. Um Cartão que falhou volta pelo Tentar de novo.

## 4. As 8 variantes

| # | variante | o que acontece |
|---|---|---|
| 1 | sem Conexão | `POST /jobs` não tem resposta: ENV-03 “não começou”, como hoje. Nada se afirma |
| 2 | Anki fechado | igual à 1 (ninguém na 8766). Com o Anki aberto na tela de perfis, o Envio entra e espera em `wait_anki` |
| 3 | complemento antigo (≤ 0.2.0) | as rotas do Envio dão `404 not_found`: ENV-03 com a causa `HTTP 404` em Detalhes; a lista dá 404 e o painel diz “sem notícias” (ENV-09). Nada muda no Anki. **Não pede a atualização** (C8): aceito em 5.i até o #177 |
| 4 | bridge Flask na 8766 | a Conexão de hoje ganha as mesmas rotas POST e o criar idempotente pelo `jobId`, e faz o mesmo Cartão com o motor mudado. Ela grava pelo AnkiConnect, cujo `addNote` não aceita `guid`: lá, “nota gravada, estado não” vira `duplicate` na volta, não `added` (C4, limite 5.k) |
| 5 | dois perfis **ou duas contas** numa Conexão | a nota só vai para o perfil marcado (#149, limite 5.b); a chave gasta é a única do cofre, de qualquer conta (C5, limite 5.j) |
| 6 | quem vem da `main` | um Envio acompanhado em `pm_envio` com um `jobId` do bridge, lido de uma Conexão que não o conhece, mostra o cartão “Não encontrado” com Esquecer (limite 5.f, #245); nada é recriado sozinho. Um `pm_envio` antigo sem `corpo` segue funcionando |
| 7 | resposta perdida ou painel fechado | o criar é idempotente pelo `jobId` e termina um criar interrompido; com o painel e o Chrome fechados o Envio continua; ao reabrir, o painel lê o progresso da Conexão |
| 8 | pedido repetido | criar, tentar de novo e apagar as Frases repetidos respondem igual e não gravam nada: a regra do contrato pede duas vezes todo `POST` que responde 2xx (não só 200), com a thread de trabalho parada, e compara os arquivos; `MATRIZ` diz `muda: True` nas três rotas |

## 5. Limites aceitos

- **a. A origem não autentica (#192).** Um processo local que declara a origem da extensão pode criar Envios: gasta a chave e grava
  notas no Anki. É o limite das rotas da chave (`complemento/contrato/LEIA-ME.md`, “Quem o complemento atende”); o
  pareamento entra antes da loja. Um corpo de 4 MB sem teto de Frases agrava isso (#243).
- **b. Perfil fixo (#149):** a nota só entra no marcado; com outro aberto o Envio espera (`waiting`); na tela de perfis a Conexão o abre.
- **c. Texto pago duas vezes** na janela entre a resposta da OpenAI e a gravação do texto, se o Anki for morto nela.
- **d. Tipo de nota próprio (#161):** a Conexão cria o de cada idioma, então um Anki em inglês não falha; só um tipo com o nosso nome e sem os nossos campos dá `note_type_missing`.
- **e. Áudio e imagem:** [áudio](audio-do-cartao.md), [imagem](imagem-do-cartao.md).
- **f. Envio que a Conexão não conhece** (veio do bridge, ou a pasta de dados foi apagada): o cartão diz “Não encontrado” (ENV-22) e
  oferece Esquecer, que o tira do acompanhamento sem tocar nas Frases (#245); o painel não decide `failed` por conta própria (§1).
- **g. Sem limpeza dos Envios terminados:** os arquivos de estado e de custo de cada Envio ficam (os textos das Frases não: §3);
  a retenção fica para a retomada (#151), e um pedido gravado sem entrada na fila fica parado até o mesmo pedido voltar (o Apagar tudo o alcança: #248).
- **h. Custos de antes:** o histórico de custos do bridge não passa para o complemento (é a passagem, #115).
- **i. Falhas novas sem cópia própria** (C8): a tela diz “não começou” / “não entrou” com o código em Detalhes, não o que fazer,
  até o #173 (a chave), o #161 (o tipo de nota) e o #177 (atualizar a Conexão).
- **j. Uma chave por Conexão** (C5): o Envio gasta a chave do cofre, de qualquer conta ou perfil do Chrome, inclusive a legada sem
  conta (`docs/seguranca/chave-da-openai.md`).
- **k. No bridge, a nota sem estado vira `duplicate`** (C4): o AnkiConnect não grava `guid`.
- **l. Frases repetidas no mesmo Envio** (C4): duas Frases com o mesmo texto e `phraseId` diferentes são dois Cartões; o segundo
  acha a frente do primeiro e fica `duplicate` (“já estava lá”), embora o primeiro seja deste Envio.
- **m. Edições locais do `engine/config.yaml` não passam** (N7): quem mudou o YAML à mão (o bridge do dono, no Windows) perde a
  mudança quando ele sai; o `config.json` tem os valores da `main`, e a mudança tem de ser refeita nele.

## 6. Provas

Cada prova abaixo é um teste que o código tem de ter antes do merge; “hoje” diz o que o código já tem.

| o quê | teste | hoje | o que não prova |
|---|---|---|---|
| a fila, o estado por Cartão, as duplicatas, a espera com o perfil fechado e na sincronização, a retomada sem refazer, os custos | `complemento/test_envio.py`: o servidor real, a coleção em memória, a OpenAI de mentira na fronteira HTTP | existe | o Anki de verdade |
| **o status num arquivo só** (C1): um `fila.json` sem status (ou com um status velho) não muda o que a lista, o retry e a retomada dizem | `test_envio.py` | existe | — |
| **o criar interrompido em cada ponto** (C2, N1): entre o pedido e o estado (o mesmo corpo grava o estado que falta), entre o estado e a fila; o mesmo corpo termina o criar e o Envio roda; outro corpo é `409`; sem o pedido de novo, a Conexão que sobe não o põe na fila; um id da fila sem estado tem o estado refeito na subida | `test_envio.py` | existe | — |
| **o criar repetido depois do fim** (N2): criar, deixar o Envio terminar (as linhas viram só `phraseId`), mandar o mesmo corpo: `201` com o Envio terminado, nada gravado; o mesmo depois do Apagar tudo | `test_envio.py` | existe | — |
| **a gravação atrasada** (C3): o adaptador em memória e o `mw` de mentira seguram a função além dos 10 s; a volta seguinte dá **uma** nota, `added`; uma sincronização que começa com a função na fila a impede | `test_colecao_em_memoria.py`, `test_no_anki.py`, `test_envio.py` | existe | as funções do Anki 2.1.50…26.x |
| **a identidade do Cartão** (C4): duas Frases com o mesmo texto viram dois Cartões, dois `guid`, dois textos; o segundo é `duplicate`; o mesmo `phraseId` repetido vale uma vez | `test_envio.py` | existe | — |
| **a chave durante o Envio** (C5): Trocar no meio faz o Cartão seguinte usar a nova; Apagar no meio para o Envio com `openai_key_missing` e nenhum pedido depois | `test_envio.py` | existe | — |
| **a chave fora de tudo** (C6): a OpenAI de mentira ecoa a chave inteira no 401; ela não está na fila, no estado, nos custos, no log, no pacote de diagnóstico nem em resposta HTTP | `test_envio.py` | existe | — |
| **a gravação conta certo** (N6): a busca da frente roda na mesma função que o `add_note`; uma função atrasada que grava a nota não faz a volta seguinte contá-la `duplicate` | `test_envio.py`, `test_no_anki.py` | existe | as funções do Anki 2.1.50…26.x |
| **as Frases na Conexão** (C7, N3, N5): a Frase que chega ao Anki perde o texto na Conexão; `POST /jobs/apagar-frases` para o Envio andando e apaga as linhas e os textos; repetido, nada muda; o tentar de novo de um Envio `wiped` não grava nada; o `complemento.log` não tem a Palavra nem a Frase; o painel o pede no Apagar tudo | `test_envio.py`, `test_servidor.py`, `configuracoes-chave-perigo.spec.js` | existe | — |
| **a lista com o status do estado** (N4): `/jobs/list` dá o `status` de cada item lido do estado, com um `fila.json` que não o tem | `test_envio.py`, `test_servidor.py` (os exemplos de hoje) | existe | — |
| **o id nas rotas** (C9): no complemento, um id fora de UUID é `404` no `get`/`retry`/`debug-bundle`; no bridge, o Continuar envio de um id dele funciona | `test_servidor.py`, `bridge/test_envio_api.py` | existe | — |
| **o motor no 3.9** (C10): os testes do motor de texto rodam pelo pacote `complemento.motor` nos grupos 3.9 e 3.13 do complemento; o `motor` importado **de dentro do `.ankiaddon` montado**, num Python sem PyYAML, dotenv e o SDK da OpenAI, gera um Cartão contra a OpenAI de mentira | `complemento/test_motor.py`, `test_pacote.py` | existe | — |
| **fechar o Anki no meio** (C11): a função de gravação que roda depois de o perfil fechar não levanta nada na thread principal de mentira; a thread de trabalho não segura o fim do processo (um subprocesso sai com um pedido de 120 s pendente) | `test_no_anki.py`, `test_envio.py` | existe | o fechamento do Anki de verdade |
| cada rota e cada estado tem exemplo; criar, tentar de novo e apagar as Frases repetidos não mudam nada | `test_servidor.py` (`MATRIZ`, repetição) e `contrato/exemplos.json` | existe | — |
| o fake do e2e responde os mesmos exemplos; o painel cria, acompanha e reabre lendo da Conexão | `test_fake_anki.js`, `contrato-da-conexao.spec.js`, `painel-envio.spec.js`, `painel-anki.spec.js` | existe | — |
| o motor mudado faz o mesmo Cartão na Conexão de hoje | `engine/test_*.py`, `bridge/test_envio*.py` | existe | o Windows do dono (I2 da revisão, #244: até quando o bridge recebe mudança é uma linha no #115) |
| o painel real contra a Conexão real (fora do Anki) | a skill `verify-perpetualminer`, § Driving against the real Conexão | existe | o Anki e a OpenAI de verdade |
| **a tela do Apagar tudo** (CFG-17, “Falha local” ganha as Frases na Conexão): referência visual da variante | `e2e/tests/configuracoes-visual.spec.js`, variante com `test.fixme` até o dono aprovar a cópia | `test.fixme` (a cópia espera o dono) | a cópia aprovada |
| **as classes R4** (#248): a sentinela (Palavra e Frase únicas somem de `user_files/`, do `complemento.log`, do pacote de diagnóstico e do `chrome.storage.local` depois do Apagar tudo) e a fronteira de gravação (matar, subir, reenviar, tentar de novo em cada gravação: sem id encalhado, sem `409`, sem segunda chamada à OpenAI para um Cartão já no Anki; o `guid` é procurado antes de gerar o texto) | `complemento/test_envio.py`, `complemento/test_envio_fronteiras.py`, `e2e/tests/painel-envio-apagar.spec.js` | existe | — |
| uma Frase vira Cartão de texto no Anki do Mac | ensaio do dono (`complemento/LEIA-ME.md`, passo 9) | escrito | — |

## Histórico: a revisão e onde está a resposta

| ponto | resposta |
|---|---|
| B1 `config.yaml` apagado antes do código | restaurado byte a byte da `main`; a troca por `config.json` é um commit só com o `config_loader` e o `bridge/server.py`, que apaga o YAML (§1, §3 “O motor”, N7) |
| C1 o status com dois donos | só `estado/<jobId>.json`; a fila guarda ordem e id; a retomada lê o estado (§1, §3) |
| C2 o criar que encalha | a entrada na fila é o ponto de confirmação; o mesmo corpo termina um criar interrompido; a Conexão não enfileira sozinha (§3, prova na §6) |
| C3 a gravação depois dos 10 s | `guid`, sincronização e `add_note` numa função só da thread principal (§3 “gravar a nota”, prova na §6) |
| C4 a identidade do Cartão | (`phraseId`, posição da Palavra); Frases repetidas; o bridge sem `guid` (§1, §4 variante 4, 5.k, 5.l) |
| C5 que chave o Envio gasta | a única do cofre, lida antes de cada pedido; Trocar e Apagar no meio (§3 “A chave”, 5.j) |
| C6 a chave no corpo do erro | o corpo nunca é lido nem logado; o que o pacote junta (§3 “A chave”, prova na §6) |
| C7 as Frases na Conexão | são cópia (§1); somem quando chegam ao Anki; Apagar tudo as apaga pela rota nova (§3) |
| C8 a tela nas falhas novas | aceito com nome (5.i), com os tickets que trazem a cópia (§2) |
| C9 o UUID no Continuar envio | só o criar exige UUID; achar dá `404`; o bridge aceita os ids dele (§3 “O id nas rotas”) |
| C10 o motor no 3.9 | os testes do motor pelo pacote, nos grupos 3.9/3.13, e o `.ankiaddon` montado gerando um Cartão (§6) |
| C11 fechar o Anki no meio | thread *daemon* sem espera; nenhuma exceção na thread principal (§3, prova na §6) |
| I1…I4 | issues #243 (I1, 5.a), #244 (I2, §6), #245 (I3, 5.f) e #246 (I4, §2) |
| N0 o código no branch da página | o código saiu para o branch `fm/pm-142-codigo`, sem PR; a PR #231 tem só esta página |
| N1 o criar que acha o pedido sem o estado | o mesmo corpo grava o estado que falta; na subida, um id da fila sem estado é refeito ou sai (§3 “criar”, “a Conexão sobe”, prova na §6) |
| N2 o criar repetido depois do fim dá `409` | o criar compara a impressão do corpo, gravada uma vez, nunca o pedido que o fim e o Apagar tudo reescrevem (§1, §3 “criar”, prova na §6) |
| N3 a Palavra no `complemento.log` | o log cita o Cartão por `<phraseId>-<n>` (§1, §3 “A chave”) |
| N4 o `status` da lista | preenchido do estado; a forma do contrato não muda (§3 “ler”) |
| N5 tentar de novo um Envio `wiped` | responde o estado e não grava nada (§3 “tentar de novo”) |
| N6 a busca de duplicatas fora da função | dentro dela, depois do `guid`; a função devolve, não levanta (§3 “gravar a nota”) |
| N7 o `config.yaml` | sai no mesmo commit do código que lê o `config.json`; 5.m |
| a Palavra relida a cada volta | fixada no estado no criar (§1, #247) |

## Histórico: o que o código não fazia

A primeira versão do código, escrita sobre a primeira versão desta página, não seguia as revisões; o código de hoje a segue
(status só no estado, criar interrompido e id sem estado, impressão do corpo, retomada sem pedido órfão, gravação numa função só,
Cartão por `phraseId` e posição, chave lida antes de cada pedido, Apagar tudo na Conexão, `404` para id fora de UUID, `test_motor.py`
e o Cartão gerado de dentro do `.ankiaddon`, as provas de C11, `config.yaml` apagado) e acrescentou o que o #248 pede: a Palavra e a
Frase só na linha do pedido, o `guid` procurado antes de gerar o texto, o Apagar tudo em todo pedido da pasta (os órfãos também) e no
`pm_envio`, o tentar de novo bloqueado depois dele em qualquer status, a impressão do corpo também no bridge, e os dois testes
estruturais (a sentinela e a fronteira de gravação).
