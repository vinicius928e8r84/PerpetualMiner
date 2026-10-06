# O contrato da Conexão com o Anki

`exemplos.json` é o conjunto único de pedidos e respostas entre a extensão e a Conexão
com o Anki (o complemento do Anki, em `127.0.0.1:8766`). Dois lados leem o mesmo arquivo:

- **o complemento**: `python3 complemento/test_servidor.py` sobe o servidor real e confere
  cada exemplo (rode também no 3.9, o Python do Anki do Mac);
- **a extensão**: o fake da Conexão do e2e (`e2e/fakes/anki.js`) responde pelos exemplos,
  e `e2e/tests/contrato-da-conexao.spec.js` confere o fake contra eles.

Mudar só um lado quebra um teste, e a mensagem diz o exemplo e os dois arquivos.

O contrato também é **fechado**, nos dois sentidos: nada que a extensão pede nem que o complemento responde fica sem exemplo.

- **Os pedidos da extensão**: todo pedido nasce de um construtor de `PerpetualMiner.PedidoAoAnki` (`lib/pedido-ao-anki.js`:
  `saude`, `baralhos`, `estatisticas`, `vocabulario`, `estadoDoItemDeLogin`, `abrirComOComputador`), e `PedidoAoAnki.variantes` os lista. `node test_contrato_fechado.js`
  pede ao construtor cada variante (com os dois Baralhos, as três leituras dos números…) e exige um exemplo `daExtensao`
  de cada uma, que o fake do e2e então responde. O nome do Baralho não conta para achar o exemplo; quantos Baralhos, `refresh` e
  `launch` contam. A regra `contrato-fechado` (`node scripts/regras/verificar.js`) acusa um `fetch` direto a uma rota da Conexão.
- **As respostas do complemento**: `complemento/test_servidor.py` guarda o que o servidor real respondeu a uma rota que ele
  tem (método, caminho, status e `error`) e, no fim, exige um exemplo para cada um. Um estado novo do servidor
  sem exemplo (foi o `500` da saúde, no #185) quebra o teste dizendo qual. Quem pede cada rota em cada estado do Anki
  (coleção que quebra, sem coleção, perfil ilegível, corpo inválido) é a matriz `EstadosDeCadaRota`, que não lê os exemplos:
  uma rota nova se declara em `MATRIZ` (corpo mínimo, se lê a coleção, se lê o perfil e as recusas de validação dela; uma
  rota que não lê a coleção, como a chave da IA, responde o mesmo `status` em todos os estados) e sem isso o teste quebra dizendo o que declarar.

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
  quando ler o perfil quebra e `colecao`, o nome de uma coleção de `colecoes` (a que o Anki tem aberta; `null`: nenhuma,
  e a leitura dos Baralhos responde `503`) e `itemDeLogin`, a situação do item de “Abrir o Anki com o computador” (`desligado`,
  `ligado`, `sem_anki`, `falha` ou `indisponivel`). Uma parte do contexto só vale para os exemplos que a citam: um exemplo que não cita
  `colecao` vale com qualquer uma, a saúde não diz do item e o item não diz do perfil. O fake muda de contexto por
  `fakes.anki.abrirPerfil(...)`, `falharLeituraDoPerfil()`, `abrirColecao(nome)` e `definirItemDeLogin(...)`; o teste do complemento monta
  um adaptador de coleção em memória (`test_colecao_em_memoria.py`) com a coleção que o exemplo nomeia.
- `colecoes` (no alto do arquivo): as coleções que os exemplos nomeiam, com os Baralhos, as notas e os Cartões
  (`tipo` e `intervalo` do Anki: 0 novo, 1 aprendendo, 2 revisão, 3 reaprendendo). `"quebra": true` é uma coleção que
  levanta um erro inesperado ao ler: o `500` (`internal_error`) de cada rota de leitura.
- `pedido`: o que chega, com `origem` (o cabeçalho `Origin`; `null` é que ele não veio). Rotas com corpo
  ganham `corpo`, o JSON do pedido; no fake, o exemplo que cita `corpo` só vale para esse corpo. `corpoBruto` é o corpo
  como texto, para o que não é um objeto JSON (o `400` `invalid_json`; a extensão nunca o manda, então não é `daExtensao`).
- `resposta`: o status e o JSON. `"<agora>"` no JSON é o instante em que a Conexão respondeu: o complemento confere
  qualquer instante ISO 8601 em UTC, e o fake escreve o do relógio dele.

A saúde (`GET /health`) é lida pela primeira conexão: a extensão mostra “Achei o Anki · perfil · versão” com o `perfil` e a `versao`
que ela diz (`ConexaoAnki.saude()`, `e2e/tests/painel-anki-primeira-conexao.spec.js`, que lê os valores destes exemplos). Sem perfil (a tela de
perfis do Anki) a parte do perfil não aparece.

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
3. **O `Origin` não é autenticação.** Uma extensão com a permissão `webRequest` e `extraHeaders` pode pôr esse
   cabeçalho, e um programa local também. **Limite aceito pelo dono no PR #190, a ser reforçado pelo ticket #192
   (credencial de pareamento, confirmada no Anki) antes do lançamento:** hoje um processo local que declara a
   origem da extensão lê o vocabulário pelas rotas privadas. `test_servidor.py` mostra isso com um cliente fora do navegador
   e passa a exigir a credencial quando o #192 entrar.
4. A primeira rota de leitura sensível (os Baralhos, os números e o vocabulário) seguiu a regra do 2: são POST
   com a origem da extensão, e o limite do 3 está nomeado em um teste. O reforço com um token de pareamento (a
   extensão o recebe por um POST e o manda nos pedidos) é o #192 e não foi feito.

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

`source` é `"colecao"` (lida do Anki aberto). `"collection.anki2"` é só da Conexão de hoje, lendo o arquivo com o Anki fechado:
o complemento só existe com o Anki aberto. A Conexão de hoje (`bridge/`) atende o mesmo POST, além do GET que já tinha.

## Como uma rota nova entra

1. Escreva os exemplos dela aqui (o caso feliz, cada erro que a extensão trata e, se muda
   com a situação do Anki, um por `contexto`), **antes** de escrever a rota. Se a extensão a pede, dê-lhe um construtor em
   `lib/pedido-ao-anki.js` (e as variantes dele em `variantes`): `node test_contrato_fechado.js` exige um exemplo de cada.
2. Rode `python3 complemento/test_servidor.py`: o exemplo novo falha até a rota existir
   (`ROTAS` em `servidor.py`).
3. Rode `cd e2e && npx playwright test contrato-da-conexao`: ele falha até o fake responder.
   O fake responde pelo exemplo (`respostaDoContrato` em `e2e/fakes/anki.js`); só estados novos
   (um `contexto` novo, uma fila) pedem código no fake.
4. Uma rota que já existe na Conexão de hoje (`bridge/server.py`) entra com o formato que a
   extensão já lê; a regra é a de “o mesmo contrato HTTP”, e o exemplo é a prova.
