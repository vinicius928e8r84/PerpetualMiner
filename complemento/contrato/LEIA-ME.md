# O contrato da Conexão com o Anki

`exemplos.json` é o conjunto único de pedidos e respostas entre a extensão e a Conexão
com o Anki (o complemento do Anki, em `127.0.0.1:8766`), junto com os `exemplos-*.json` ao lado (um por assunto, como
`exemplos-do-perfil.json`; `carregar.js` e `test_servidor.py` os somam e recusam nome repetido). Dois lados o leem:

- **o complemento**: `python3 complemento/test_servidor.py` sobe o servidor real e confere
  cada exemplo (rode também no 3.9);
- **a extensão**: o fake da Conexão do e2e (`e2e/fakes/anki.js`) responde pelos exemplos,
  e `contrato-da-conexao.spec.js` confere o fake contra eles.

Mudar só um lado quebra um teste, que diz o exemplo.

O contrato também é **fechado**, nos dois sentidos: nenhum pedido nem resposta fica sem exemplo.

- **Os pedidos da extensão**: todo pedido nasce de um construtor de `PerpetualMiner.PedidoAoAnki` (`lib/pedido-ao-anki.js`:
  `saude`, `comecarOPareamento`, `concluirOPareamento`, `conferirOPareamento`, `baralhos`, `estatisticas`, `vocabulario`, `estadoDoItemDeLogin`, `abrirComOComputador`, `chaveDaOpenAI`, `apagarChaveDaOpenAI`, `estadoDaIA`, `trocarAFrente`, e os do Envio: `criarEnvio`, `ouvirAVoz`, `falarAFrase`, `listarEnvios`, `verEnvio`, `tentarEnvioDeNovo`, `usarAChaveNoEnvio`, `pacoteDeDiagnostico`, `apagarFrasesDosEnvios`, `custosDosEnvios`), e `e2e/variantes-do-pedido-ao-anki.js` os lista. `node test_contrato_fechado.js`
  pede ao construtor cada variante e exige um exemplo `daExtensao`
  de cada uma, que o fake do e2e então responde. O nome do Baralho não conta para achar o exemplo; quantos Baralhos, `refresh` e
  `launch` contam. A regra `contrato-fechado` (`node scripts/regras/verificar.js`) acusa um `fetch` direto a uma rota da Conexão.
- **As respostas do complemento**: `complemento/test_servidor.py` guarda o que o servidor real respondeu a uma rota que ele
  tem (método, caminho, status e `error`) e, no fim, exige um exemplo para cada um. Um estado novo do servidor
  sem exemplo quebra o teste. Quem pede cada rota em cada estado do Anki
  (coleção que quebra, sem coleção, perfil ilegível, corpo inválido) é a matriz `EstadosDeCadaRota`, que não lê os exemplos:
  uma rota nova se declara em `MATRIZ` (corpo mínimo, se lê a coleção, se lê o perfil e as recusas de validação dela; uma
  rota que não lê a coleção, como a chave da IA, responde o mesmo `status` em todos os estados) e sem isso o teste quebra dizendo o que declarar.
- **Repetir e a base velha**: uma rota que muda o que a Conexão guarda (a chave da IA, o item de login) diz `muda: True` em `MATRIZ`
  (e `versao: True` se o corpo traz a base). `RepeticaoDeCadaRotaQueMuda` pede o exemplo de sucesso dela de novo (mesma resposta, o arquivo do
  dono byte a byte igual, também reconfirmando na base atual) e a base velha depois de mudanças mais novas (409, sem mudar nada). Uma rota
  que muda sem dizer `muda: True` quebra; `muda_de_novo: "motivo"` declara que repetir na base atual muda de propósito.

## Um exemplo

```json
{
  "nome": "saúde com um perfil aberto",
  "daExtensao": true,
  "contexto": { "perfil": "Usuário 1" },
  "pedido": { "metodo": "GET", "caminho": "/health", "origem": null },
  "resposta": { "status": 200, "json": { "ok": true, "versao": "0.1.0", "perfil": "Usuário 1" } }
}
```

- `daExtensao`: o pedido é um que a extensão faz de verdade. O e2e confere o fake contra esses; os
  outros (outro site, outra extensão, sem origem) só o lado do complemento confere, porque uma
  página da extensão não consegue pedir como outro cliente.
- `contexto`: em que situação o complemento está: o `perfil` aberto (`null` na tela de perfis), `falhaNoPerfil`
  quando ler o perfil quebra, `colecao` (o nome de uma coleção de `colecoes`, a que o Anki tem aberta; `null`: nenhuma,
  e a leitura dos Baralhos responde `503`; um exemplo que não cita `colecao` vale com qualquer uma), `itemDeLogin`, a situação do
  item de “Abrir o Anki com o computador” (`desligado`, `ligado`, `sem_anki`, `falha` ou `indisponivel`), `openai` (como a OpenAI
  responde à conferência de uma chave: `aceita`, `recusa`, `sem_credito`, `org_nao_verificada`, `limite_de_uso`, `limite_so_no_pago` ou
  `fora_do_ar`) e `chaveNaConexao` (os 4 últimos caracteres da chave que a Conexão já guarda, ou `null`). Uma parte do contexto só
  vale para os exemplos que a citam: a saúde não diz do item e o item não diz do perfil. O fake muda de
  contexto por `fakes.anki.*` (`abrirPerfil`, `abrirColecao`, `responderOpenAI`, `guardarChaveNaConexao`…); um exemplo só conta no fake pelos campos que ele diz (a saúde responde igual com qualquer
  chave). Da chave só conta ter ou não ter: a resposta leva os 4 últimos da chave que o teste mandou, não os do exemplo. O teste
  do complemento monta um adaptador de coleção em memória (`test_colecao_em_memoria.py`) com a coleção que o exemplo nomeia.
- `colecoes` (no alto do arquivo): as coleções que os exemplos nomeiam, com os Baralhos, as notas e os Cartões
  (`tipo` e `intervalo` do Anki: 0 novo, 1 aprendendo, 2 revisão, 3 reaprendendo). `"quebra": true` é uma coleção que
  levanta um erro inesperado ao ler: o `500` (`internal_error`) de cada rota de leitura.
- `pedido`: o que chega, com `origem` (o cabeçalho `Origin`; `null` é que ele não veio). Rotas com corpo
  ganham `corpo`, o JSON do pedido (no fake, o exemplo que cita `corpo` só vale para esse corpo), ou `corpoBruto` (os bytes como vierem, para o que não é JSON: o `400` `invalid_json`; a extensão nunca o manda, então esse exemplo não é `daExtensao`).
- `resposta`: o status e o JSON. `"<agora>"` no JSON é o instante em que a Conexão respondeu: o complemento confere
  qualquer instante ISO 8601 em UTC, e o fake escreve o do relógio.
- `fila`: o nome de uma fila de `filas` (no alto do arquivo, ao lado de `colecoes`): os Envios que a Conexão já tinha, cada um
  com o pedido (`job`), o estado (`state`, com o de cada Cartão em `cards`) e os registros de custo (`custos`). O teste do
  complemento a escreve nos arquivos da pasta de dados (`semear_a_fila` em `test_servidor.py`) e o fake a carrega por
  `fakes.anki.definirFila(nome)`; sem `fila`, a Conexão não tem nenhum Envio. Nos exemplos, a thread de trabalho do Envio está
  parada: a fila fica como o exemplo a deixou.
- `repetivel` e `porque`: todo exemplo `POST` com resposta 2xx (o `200`, e o `201` do Envio criado) é pedido **duas vezes**, e a segunda resposta tem que ser igual à primeira
  (salvo `"<agora>"`) sem mudar nada do que a Conexão guardou (os arquivos de `user_files`, menos o log, e a nuvem). O servidor real
  (`test_servidor.py`) e o fake do e2e (`test_fake_anki.js`, que repete os exemplos `daExtensao`) seguem a mesma regra. Repetir de
  propósito muda algo? (O pedido leva uma versão que a primeira vez sobe, ou a segunda já não tem o que fazer.) Declare no exemplo
  `"repetivel": false, "porque": "…"`: sem o `porque` o teste falha, e a exceção que, repetida, dá mesmo resposta e mesmo estado também falha
  (está velha: tire-a). Um `POST` novo que muda a resposta ao repetir é um defeito até prova em contrário.

A saúde (`GET /health`) é lida pela primeira conexão: a extensão mostra “Achei o Anki · perfil · versão” com o `perfil` e a `versao`
que ela diz (`ConexaoAnki.saude()`, `e2e/tests/painel-anki-primeira-conexao.spec.js`, que lê os valores destes exemplos). Sem perfil (a tela de
perfis do Anki) a parte do perfil não aparece.

## Confirmação idempotente e permissões do arquivo

`POST /ia/openai/chave` com chave inteira/conta iguais às já aceitas e revisão atual do dono moderno responde o mesmo 200 sem revalidar OpenAI, regravar arquivo ou avançar revisão/hora/pendência. Três reconfirmações após v1 permanecem v1. Replay da base anterior continua idempotente; bases antigas conflitantes continuam 409. Outra conta ou outro valor inteiro (mesmo com o mesmo sufixo) são mudanças sujeitas a validação/CAS. Legado sem metadados continua exigindo confirmação explícita; não é automaticamente tratado como dono moderno.

**Known limit — ACL no Windows:** o produto NÃO define ACL no arquivo da chave; ele herda a ACL da pasta. Na prova real em `Anki/addons21`: usuário + SYSTEM + Administrators. Numa pasta arbitrária, a herança pode incluir leitura por Users, expondo a chave em texto claro a esses usuários/processos e permitindo uso/custo na OpenAI. Modo 0600/`chmod` não restringe essa ACL no Windows (no-op para essa proteção), embora 0600 seja usado em POSIX. Não há garantia de acesso exclusivo ao usuário nem proteção contra administradores. Nenhuma engenharia de ACL nesta correção; teste POSIX não certifica a prova Windows informada pelo capitão. Revogar na OpenAI é o desligamento de verdade.

## Quem o complemento atende

O complemento gasta a chave da OpenAI, então a regra é a da origem da extensão
(`chrome-extension://<id>`), e o que o Chrome manda de verdade (visto numa extensão real contra o servidor real) decide o resto:

- o **POST** (e o PUT) de uma página da extensão leva `Origin: chrome-extension://<id>`, que o `fetch` de uma página comum não consegue escolher;
- o **GET** de uma página da extensão, com permissão de host, vai **sem** `Origin`, e é igual ao GET de
  qualquer outra extensão com a mesma permissão (credenciais, cabeçalho próprio e `mode: cors` não mudam isso).

Por isso (decisão do dono, opção B):

1. **`GET /health` é aberto**, sem `Origin`: só diz a versão e o perfil, a quem pedir (qualquer cliente local).
   Com um `Origin` que não é o da extensão, até a saúde é recusada.
2. **Todo o resto exige a origem da extensão**, em qualquer método (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS ou um verbo desconhecido: todos passam pela mesma
   autorização). Sem `Origin`, ou com a de outra extensão ou site, é 403
   (`origin_not_allowed`). Por isso rota que gasta a chave ou lê dado da pessoa (a chave, os custos, o
   vocabulário, os Envios) é **POST**, nunca GET.
3. **O `Origin` não é autenticação, e o pareamento (#192) é.** Uma extensão com `webRequest` e `extraHeaders` pode pôr esse cabeçalho, e um programa local também. Por isso o `Origin` continua exigido
   (barra as páginas), mas **toda rota que não é a saúde nem o pareamento exige a assinatura de um navegador pareado** (`servidor._pedido_aceito`, o porteiro, antes de escolher a rota; sem ela, `401`), e toda
   resposta volta com a prova de quem tem o segredo: uma Conexão impostora na porta não a dá e não recebe nenhum pedido privado. O segredo nasce na Conexão e chega à extensão uma vez, depois que a pessoa
   digita no Painel o código que só o Anki dela mostrou. O desenho, as rotas e os cabeçalhos: [`o-pareamento.md`](o-pareamento.md). Nenhuma resposta HTTP devolve a chave inteira da OpenAI; a migração exige prova
   exata do valor já guardado; uma chave sem conta (inclusive `conta: ''`) não é vinculada/exportada só por pedir sync. A sincronização recebe UID e bearer transitórios e fala com o Firestore, cujas regras devem
   restringir cada UID (P6). **Limites:** um programa que roda como a própria pessoa lê `user_files` e o perfil do navegador (nenhum pareamento local fecha isso), a ACL do Windows é a da pasta, e o legado não migrado
   reenvia a chave antiga (a Conexão vazia ou divergente) enquanto o Painel está aberto, agora só depois de provar a Conexão.
4. A primeira rota de leitura sensível (os Baralhos, os números e o vocabulário) seguiu a regra do 2: são POST com a origem da extensão, e agora com a assinatura do 3.

Rota nova que deva responder sem origem entra em `ROTAS_ABERTAS` (`servidor.py`) só com essa decisão.

## As rotas de leitura da coleção

Todas POST, com `Content-Type: application/json`, e só a extensão é atendida. Um corpo que não é um objeto JSON,
ou maior que 64 KB, é `400` (`invalid_json`). Sem coleção aberta (o Anki na tela de perfis) ou com o Anki
sem responder, é `503` com o `error` da rota e o `detail` (`collection_not_open`, `anki_busy`).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /anki/decks` | `{}` | `{ decks: [nome, …] }`: os Baralhos, com `::` entre os níveis, em ordem alfabética, sem o “Default”. `error`: `anki_decks_unavailable` |
| `POST /anki/stats/decks` | `{ decks: [{ deckName, lang }, …], refresh?, launch? }` | `{ generatedAt, decks: [linha por Baralho, na ordem pedida], totals, source }`. Um Baralho que o Anki não tem volta com `missing: true` e tudo zerado. Sem `decks`, `400` (`decks_required`). `refresh` e `launch` são aceitos e ignorados: a Conexão lê sempre ao vivo e nunca abre o Anki. `error`: `anki_stats_unavailable` |
| `POST /anki/vocabulary` | `{ deck, lang, status?, type?, q?, limit?, offset? }` | `{ generatedAt, deckName, lang, source, totalCards, filters, totalWords, words }`. Um Baralho que o Anki não tem tem `words: []`. `400`: `deck_required`, `invalid_lang` (só `en` e `ru`). `error`: `anki_vocabulary_unavailable` |

`source` é `"colecao"` (lida do Anki aberto): o complemento só existe com o Anki aberto e nunca lê o arquivo da coleção.

## Como uma rota nova entra

1. Escreva os exemplos dela aqui (o caso feliz, cada erro que a extensão trata e, se muda
   com a situação do Anki, um por `contexto`), **antes** de escrever a rota. Se a extensão a pede, dê-lhe um construtor em
   `lib/pedido-ao-anki.js` (e as variantes dele em `e2e/variantes-do-pedido-ao-anki.js`): `node test_contrato_fechado.js` exige um exemplo de cada.
2. Rode `python3 complemento/test_servidor.py`: o exemplo novo falha até a rota existir
   (`ROTAS` em `servidor.py`).
3. Rode `cd e2e && npx playwright test contrato-da-conexao`: ele falha até o fake responder.
   O fake responde pelo exemplo (`respostaDoContrato` em `e2e/fakes/anki.js`); só estados novos
   (um `contexto` novo, uma fila) pedem código no fake; `node test_fake_anki.js` o confere.

## As rotas do Envio (#142)

Todas POST, com a origem da extensão (levam as Frases e os custos da pessoa); o desenho é `docs/design/envio-no-complemento.md`.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /jobs` | `{ jobId, lang, deckName, imageSource, tts, teste?, entries: [{ phraseId, line }] }` (até 4 MB e 500 Frases; `jobId` é o `id` do Envio no painel, um UUID; `teste: true`, o Envio da Frase de teste do primeiro Cartão (#173): a nota leva a etiqueta `perpetualminer-teste`) | `201 { jobId, status }`. O mesmo corpo de novo é o mesmo Envio (`201`); outro corpo com o mesmo `jobId`, `409 job_conflict`. `400`: `invalid_job_id`, `invalid_lang`, `invalid_request`, `entries_required`; `413 too_many_entries` |
| `POST /jobs/list` | `{}` | `{ jobs: [{ jobId, lang, status, createdAt, updatedAt, state }] }`; `state` tem o estado de cada Cartão em `cards` (`pending` · `text` · `added` · `duplicate` · `failed`, com o `error`; o `added` leva o `guid` da nota) |
| `POST /jobs/get` | `{ jobId }` | `{ job, state }`; `404 job_not_found` |
| `POST /jobs/retry` | `{ jobId }` | `{ jobId, status }`: um Envio terminado volta à fila guardando os Cartões prontos; na fila ou andando, só diz o estado (nada gravado). `404 job_not_found` |
| `POST /jobs/debug-bundle` | `{ jobId }` | o pedido, o estado, os custos, os arquivos do Envio e as linhas do log que o citam; nunca a chave. `404 job_not_found` |
| `POST /analytics/jobs` | `{ lang: 'all', from?, to? }` | `{ jobs: [linha por Envio] }` (`custos.py`); com Cartão do plano do ChatGPT, `plan: { cards, wouldCostUsd }` (#159) |

`lastError` e o `error` de cada Cartão são códigos (`openai_key_missing`, `openai_key_rejected`, `openai_no_credit`,
`openai_rate_limited`, `openai_unreachable`, `note_type_missing`, `anki_write_failed`…), nunca o texto da OpenAI.

O login do ChatGPT (#155): [`entrar-com-o-chatgpt.md`](entrar-com-o-chatgpt.md). O modelo dos cartões (#157): [`o-modelo-dos-cartoes.md`](o-modelo-dos-cartoes.md). A voz, o Ouvir (#174) e a fala do quiz de nível (#170): [`voz.md`](voz.md). A prévia do Cartão (#164): [`previa-do-cartao.md`](previa-do-cartao.md). A atualização da Conexão pelo AnkiWeb (#177): [`a-atualizacao.md`](a-atualizacao.md). O pareamento, quem pode pedir (#192): [`o-pareamento.md`](o-pareamento.md).

## As rotas do perfil fixo (#149)

Todas POST, com a origem da extensão. O perfil marcado é o aberto na primeira vez que a Conexão viu um (`user_files/perfil.json`).

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /anki/profiles` | `{}` | `{ profiles, marked, open }`: os perfis do Anki, o marcado (`null`: nenhum ainda) e o aberto (`null`: a tela de perfis). `503 anki_profiles_unavailable` |
| `POST /anki/profile` | `{ profile }` | `{ ok, marked }`: marca outro perfil (e o abridor passa a abrir o Anki nele). `400 invalid_request`; `404 profile_not_found` |
| `POST /anki/profile/open` | `{}` | `{ ok, profile }`: “Abrir <perfil>”, fecha o perfil aberto pelo caminho normal do Anki e abre o marcado. `404 profile_not_found` (sem marcado, ou ele sumiu) |

O Envio que espera por causa do perfil diz o motivo no `state` (`waiting: { reason: other_profile | profile_missing, profile, marked }`).

## O abridor (Native Messaging)

O abridor (#147, `complemento/abridor.py`) não fala HTTP: a extensão o chama por `chrome.runtime.sendNativeMessage`
(`com.perpetualminer.abridor`), com a permissão opcional `nativeMessaging`. O contrato é o mesmo arquivo, na seção `abridor`:
cada exemplo tem o `contexto` (`anki`: `no_lugar` ou `sumiu`, o Anki no lugar que a Conexão anotou ou não; `nao_abre`, o Anki no lugar e o sistema sem conseguir abri-lo), a `mensagem` que o
Chrome entrega e a `resposta` do script. Os três lados leem os mesmos exemplos:

- **o script de verdade**: `complemento/test_abridor.py` roda o `.sh` do Mac com cada exemplo (no Linux, só a CLI do JXA é adaptada para Node, executando o mesmo parser JavaScript; no Mac, `/usr/bin/osascript`), e o `.ps1` do Windows onde houver `pwsh`. A ação é a string principal exata `conferir` ou `abrir`: espaços internos, maiúsculas, ação aninhada e listas voltam `acao_desconhecida` sem abrir nada; os exemplos inválidos são compartilhados entre os dois sistemas;
- **o fake do e2e**: `e2e/fakes/abridor.js` responde pelos exemplos (`node test_fake_abridor.js` o confere);
- **a extensão**: cada mensagem nasce de `PerpetualMiner.Abridor` (`lib/abridor.js`), e `node test_contrato_fechado.js` exige um exemplo
  `daExtensao` de cada uma de `Abridor.variantes()`. A extensão manda `conferir` (o passo Abrir o Anki sozinho, #147) e `abrir` (o passo Ter o Anki, #146; o Envio com o Anki fechado e o botão Abrir o Anki, #150).
