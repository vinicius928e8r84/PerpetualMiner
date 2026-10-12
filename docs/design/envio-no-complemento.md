# Página de desenho: o Envio dentro da Conexão com o Anki (#142)

Fatia ALTA pelo [modelo](modelo-fatia-alta.md): o Envio passa a viver em dois processos (o painel acompanha, a Conexão faz) e
gasta a credencial (a chave da OpenAI que a Conexão guarda). Escrita antes do código. O que a fatia entrega: apertar Enviar ao Anki
entrega as Frases à Conexão, e cada uma vira um Cartão de **texto** (sem áudio, sem imagem: #143, #144), gravado direto na coleção,
no tipo de nota e nos campos de hoje (“Básico”, “Frente”, “Verso”, até o #161).

## 1. Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| a fila e o estado de cada Envio e de cada Cartão | a Conexão: `user_files/fila` (pedido e ordem), `user_files/estado` (estado do Envio e de cada Cartão) | o painel guarda em `pm_envio` o que acompanha (`{ id, lang, ids, baralho, jobId, criadoEm, falhaAoCriar }`) e, **antes do primeiro `POST`**, o corpo congelado do pedido (`corpo`); relê o estado a cada 2 s | o painel nunca decide o estado de um Cartão, nem cria o mesmo Envio com outro id ou outro corpo |
| o texto gerado de cada Cartão | a Conexão (`user_files/estado/<jobId>/<stem>.txt`) | ninguém | refeito quando já existe (seria pagar duas vezes) |
| a nota no Anki | a coleção do Anki, com um `guid` fixo por Cartão (hash de `jobId` + Cartão) | — | gravada duas vezes: o `guid` reconhece a nota deste Envio (fica `added`), e a busca de duplicatas (a frente normalizada, no Baralho e nos subbaralhos, lida uma vez por volta) reconhece a que já existia (`duplicate`) |
| os custos de cada Envio | a Conexão (`user_files/custos/<jobId>/costs.jsonl`) | a aba Custos guarda a última leitura em `pm_anki_custos` (já existia) | fonte: o cache só aparece com o selo BRG-12 |
| a chave da OpenAI | a Conexão (o cofre, `user_files/chaves`), lida pela thread do Envio só para o pedido que a gasta | ninguém | escrita na fila, no estado, nos custos, no log ou no pacote de diagnóstico |
| as Frases | a extensão (`frases`) | o pedido do Envio leva `phraseId` e a linha de mineração | escrita de volta pela Conexão: “Enviada ao Anki” continua sendo o painel que marca, lendo `successfulPhraseIds` |

## 2. Estados

O Envio tem os estados da Conexão de hoje (`bridge/envio.py`), que o painel já lê: `queued` → `running` (etapa
`generate_cards`, `wait_anki` ou `send_to_anki`) → `completed` | `partial` | `failed`. Cada Cartão (um por Palavra da Frase) tem
o seu: `pendente` → `texto` (o texto está gravado) → `added` | `duplicate`; ou `failed`, com o código do motivo.

A tela não ganha cópia nova: o modal de progresso diz a etapa (ENV-07: “Criando cartões”, “Esperando o Anki”, “Enviando ao
Anki”) e o resumo diz o fim (ENV-10…12), como hoje. Regra C8: “Esperando o Anki” é verdade enquanto a coleção está fechada ou
sincronizando, porque a Conexão de fato espera.

## 3. Transições

| transição | quem pede | o que lê antes | quem aceita | o que muda | o que não pode mudar |
|---|---|---|---|---|---|
| criar | o painel: `POST /jobs` com `jobId` = o `id` do Envio (`crypto.randomUUID()`, validado como UUID dos dois lados), idioma, Baralho e as Frases; o corpo é montado uma vez, gravado em `pm_envio` antes do pedido e reenviado igual (Tentar de novo do ENV-03, painel reaberto com o pedido sem resposta) | nada | a Conexão, se o `jobId` é novo e válido | grava o pedido, o estado (`queued`, cada Cartão `pendente`) e a entrada na fila | um `jobId` que já existe: o mesmo corpo (comparado em JSON canônico) é `201` igual e nada é gravado; outro corpo com o mesmo `jobId` é `409 job_conflict`. O corpo pode ter até 4 MB (o limite das outras rotas segue 64 KB) |
| trabalhar | a thread de trabalho da Conexão | a fila; a chave no cofre (sem chave: `failed`, `openai_key_missing`, nada gasto); o tipo de nota e os campos na coleção (faltando: `failed`, `note_type_missing`, nada gasto) | a própria thread, que marca a fila e o estado juntos, sob a tranca | `running`; por Cartão: texto gerado (rede, na thread de trabalho, 120 s por pedido) → gravado no disco → a nota gravada (na thread principal do Anki, uma operação curta por Cartão) → o estado do Cartão gravado. Chave recusada ou sem crédito: o Envio para com o código; limite de uso, 5xx ou sem rede: o Cartão tenta 3 vezes com espera e depois fica `failed` | um Cartão `added`/`duplicate` não roda de novo; um texto gravado não é pedido de novo à OpenAI; `lastError` é um código, nunca o texto da OpenAI |
| esperar o Anki | a thread de trabalho | a coleção (`ColecaoIndisponivel`: perfil fechado, sincronizando, Anki ocupado) | — | etapa `wait_anki`; tenta de novo a cada poucos segundos, sem prazo | o Envio não falha por isso |
| terminar | a thread de trabalho | o estado **guardado** de cada Cartão (não só os desta volta) | — | `completed` / `partial` / `failed` pelas regras de `settle` de hoje: a Frase está no Anki quando todos os Cartões dela estão `added`/`duplicate`, e é duplicada quando todos são `duplicate` | — |
| tentar de novo | o painel: `POST /jobs/retry` (`{ jobId }`) | o estado, sob a mesma tranca do “trabalhar” | a Conexão | de `completed`/`partial`/`failed` para `queued`, guardando o estado de cada Cartão | já `queued` ou `running`: responde o estado atual e nada é gravado |
| a Conexão reinicia | o Anki abre de novo | a fila | a Conexão ao subir | `running` volta a `queued` e continua de onde parou | — |
| ler | o painel: `POST /jobs/list`, `/jobs/get`, `/jobs/debug-bundle`, `/analytics/jobs` | — | a Conexão | nada | — |

**A base observada** é o `jobId`: ele é a chave de idempotência do criar. Não há revisão do lado do painel, porque só a
thread de trabalho da Conexão avança o estado; o painel só cria (idempotente) e pede para tentar de novo (idempotente).

**Atômico:** cada arquivo é escrito num temporário e trocado de uma vez (`os.replace`), sob a tranca da fila. O estado de um
Cartão é gravado logo depois da nota dele. **Entre dois passos que cruzam processos:**

- o painel pediu e a resposta se perdeu: o Tentar de novo do ENV-03 manda o mesmo `jobId`, e a Conexão devolve o Envio que já tem;
- a nota foi gravada e a Conexão parou antes de gravar o estado: na volta, o `guid` do Cartão acha a nota, e ele fica `added` (sem nota dobrada e sem dizer “já estava”);
- a OpenAI respondeu e a Conexão parou antes de gravar o texto: na volta o texto é pedido de novo (pago duas vezes; limite 5.c);
- o Anki fechou com o Envio no meio: a thread morre com ele; o Anki abre, a Conexão sobe e o Envio continua.

**Esperar o Anki:** “sem coleção” é `mw.col` vazio (tela de perfis); “sincronizando” vem dos ganchos `sync_will_start` e
`sync_did_finish` do Anki; “ocupado” é a thread principal sem responder em 10 s. Nos três, a gravação levanta
`ColecaoIndisponivel`, e a thread de trabalho espera e tenta de novo.

**O motor dentro do Anki (Python 3.9).** O motor de texto (`engine/parser.py`, `prompt_loader.py`, `generate_cards.py`,
`cost_tracker.py`, `config_loader.py`, `send_to_anki.py` e o novo `openai_http.py`, mais `config.json` e os prompts) vira, no
`.ankiaddon`, o subpacote `motor` (o `empacotar.py` os copia; no repositório, `complemento/motor/__init__.py` aponta para `engine/`):
importações relativas quando é pacote, absolutas no bridge; a OpenAI por HTTP direto; `config.json` sem PyYAML nem dotenv;
a chave passada pela Conexão (`load_config(openai_api_key=…)`), sem ler ambiente; logger `perpetualminer.motor` no lugar de
`print`, e nenhum `warnings.filterwarnings`. A máquina de estados do bridge (`bridge/envio.py`, que usa `zip(strict=)` do 3.10 e o
`anki_session` do Windows) é reaproveitada **como contrato**: o complemento tem a sua (`complemento/envio.py`), com os mesmos
estados, transições e regras de `settle`, por Cartão.

**Quem pede, na extensão.** Tudo passa por `PedidoAoAnki` (POST com a origem): `criarEnvio`, `listarEnvios`, `verEnvio`,
`tentarEnvioDeNovo`, `pacoteDeDiagnostico` e `custosDosEnvios`; `painel-envio.js` e `painel-anki.js` deixam os `fetch` diretos
(a linha de base da regra `contrato-fechado` desce). A Conexão de hoje ganha as mesmas rotas POST, e os custos dela continuam
onde estão (`<job>/log/costs.jsonl`); os do complemento, em `custos/<jobId>/costs.jsonl`.

**Reverter:** ninguém apaga uma nota gravada nem desfaz um Cartão pronto. Um Cartão que falhou volta pelo Tentar de novo.

## 4. As 8 variantes

| # | variante | o que acontece |
|---|---|---|
| 1 | sem Conexão | `POST /jobs` não tem resposta: ENV-03 “não começou”, como hoje. Nada se afirma |
| 2 | Anki fechado | igual à 1 (ninguém na 8766). Com o Anki aberto na tela de perfis, o Envio entra e espera em `wait_anki` |
| 3 | complemento antigo (≤ 0.2.0) | as rotas do Envio dão `404 not_found`: ENV-03 com a causa `HTTP 404`; a lista dá 404 e o painel diz “sem notícias” (ENV-09). Nada muda no Anki |
| 4 | bridge Flask na 8766 | a Conexão de hoje ganha as mesmas rotas POST (o mesmo contrato) e o criar idempotente pelo `jobId`, e faz o mesmo Cartão com o motor mudado |
| 5 | dois perfis numa Conexão | a nota vai para o perfil aberto na hora de gravar; o perfil fixo é o #149 (limite 5.b) |
| 6 | quem vem da `main` | um Envio acompanhado em `pm_envio` com um `jobId` do bridge, lido de uma Conexão que não o conhece, conta como não concluído (a regra que o painel já tem) e o Continuar envio dele dá 404 (limite 5.f); nada é recriado sozinho. Um `pm_envio` antigo sem `corpo` segue funcionando |
| 7 | resposta perdida ou painel fechado | o criar é idempotente pelo `jobId`; com o painel e o Chrome fechados o Envio continua; ao reabrir, o painel lê o progresso da Conexão |
| 8 | pedido repetido | criar e tentar de novo repetidos respondem igual e não gravam nada: a regra do contrato passa a pedir duas vezes todo `POST` que responde 2xx (não só 200), com a thread de trabalho parada, e compara os arquivos; `MATRIZ` diz `muda: True` nas duas rotas |

## 5. Limites aceitos

- **a. A origem não autentica (#192).** Um processo local que declara a origem da extensão pode criar Envios: gasta a chave da
  pessoa e grava notas no Anki dela. É o mesmo limite das rotas da chave (`complemento/contrato/LEIA-ME.md`, “Quem o complemento
  atende”), agora com custo; o pareamento entra antes da loja.
- **b. Perfil fixo (#149):** a nota vai para o perfil aberto.
- **c. Texto pago duas vezes** na janela entre a resposta da OpenAI e a gravação do texto, se o Anki for morto nela.
- **d. Tipo de nota e campos de hoje (#161):** num Anki sem o tipo “Básico” com “Frente” e “Verso”, cada Cartão falha com `note_type_missing`.
- **e. Só texto:** o Cartão sai sem áudio e sem imagem até o #143 e o #144; a fila os aceita depois sem mudar o contrato.
- **f. Envio que a Conexão não conhece** (veio do bridge, ou a pasta de dados foi apagada): conta como não concluído e o
  Continuar envio dá 404; um estado “a Conexão não conhece este Envio” com Esquecer fica para a retomada (#151).
- **g. Sem limpeza:** `user_files/fila` e `estado` crescem com cada Envio; a regra de retenção fica para a retomada (#151).
- **h. Custos de antes:** o histórico de custos do bridge não passa para o complemento (é a passagem, #115).

## 6. Provas

| o quê | teste | o que não prova |
|---|---|---|
| fila, estado por Cartão, duplicatas, retomada sem refazer, espera com o perfil fechado e na sincronização, custos, chave fora de tudo | `complemento/test_envio.py`: o servidor real, a coleção em memória, a OpenAI de mentira na fronteira HTTP | o Anki de verdade |
| o lado de gravação no Anki só na thread principal, o Baralho criado, o tipo de nota que falta | `complemento/test_no_anki.py` e `test_colecao_em_memoria.py` (o mesmo contrato do adaptador) | as funções do Anki 2.1.50…26.x; é o ensaio do dono |
| cada rota e cada estado tem exemplo; criar e tentar de novo repetidos não mudam nada | `complemento/test_servidor.py` (`MATRIZ`, repetição) e os exemplos de `contrato/exemplos.json` | — |
| o fake do e2e responde os mesmos exemplos; o painel cria, acompanha e reabre lendo da Conexão | `test_fake_anki.js`, `contrato-da-conexao.spec.js`, `painel-envio.spec.js`, `painel-anki.spec.js` | — |
| o motor mudado faz o mesmo Cartão na Conexão de hoje | `engine/test_*.py`, `bridge/test_envio*.py` | o Windows do dono |
| o painel real contra a Conexão real (fora do Anki) | a skill `verify-perpetualminer`, § Driving against the real Conexão | o Anki e a OpenAI de verdade |
| uma Frase vira Cartão de texto no Anki do Mac | ensaio do dono (`complemento/LEIA-ME.md`) | — |
