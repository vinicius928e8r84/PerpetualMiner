# Página de desenho: o Envio acompanhado (C3)

Fatia ALTA pelo [modelo](modelo-fatia-alta.md): o estado do Envio vive na Conexão com o Anki e o painel o acompanha. Três telas
tentavam o Envio de novo, cada uma com o seu tratamento do 409 (o modal do Envio, a aba Custos e o passo do primeiro Envio da
Boas-vindas), e só o modal acompanhava o Envio depois de retomá-lo. O que as três têm em comum é **um Envio**, não a Remessa: nasce
`EnvioAcompanhado.acompanhar({ jobId })`, e cada tela passa a ele, uma por PR. A Remessa continua no modal até o último passo, por cima
dele. Ele mora em `painel-envio-estado.js`, ao lado da `SituacaoDoEnvio` que acompanha: as três telas são do painel, e `painel.html` está
na linha de base de tamanho (uma tag a mais tem de sair de outro lugar). O Continuar envio da aba Custos sai de `painel-anki.js` para
`painel-anki-continuar.js`.

| passo | quem usa | o que muda para a pessoa |
|---|---|---|
| 1 (esta página) | o Continuar envio da aba Custos | o detalhe do Envio retomado anda sozinho até o fim (Na fila → a Etapa → Concluído), sem Atualizar |
| 2 | o passo do primeiro Envio da Boas-vindas | nada: o laço dela (criar, repetir, ler a cada 1 s) passa ao módulo, que ganha `criar` |
| 3 | o modal do Envio (a Remessa) | nada: o Tentar de novo e o Usar a minha chave de cada Envio do modal passam pelo módulo, que ganha `usarAChave`; a causa em Detalhes de um Tentar de novo recusado sai no formato do módulo (`POST /jobs/retry <id> · HTTP 500 · internal_error`, antes `… → HTTP 500`) |

## A interface

`EnvioAcompanhado.acompanhar({ jobId }, { conversa, esperar, intervaloMs, lerSozinho })` devolve:

- `tentarDeNovo()`: `POST /jobs/retry`. Dá `{ ok: true }`, `{ apagado: true }` (409 `job_wiped`) ou `{ falha: '<pedido> · <causa>' }`.
  Dois cliques antes da resposta são um pedido só. Com o `ok`, o módulo passa a ler o Envio.
- `usarAChave()` (passo 3): `POST /jobs/usar-a-chave`. Dá `{ ok: true }`, `{ semChave: true }` (409 `openai_key_missing`) ou
  `{ falha: '<pedido> · <causa>' }` (o 409 `job_finished` de um Envio que terminou entra aqui). Dois cliques antes da resposta são um
  pedido só. Com o `ok`, o módulo passa a ler o Envio.
- `lerSozinho` (passo 3, padrão `true`): com `false`, o `ok` não faz o módulo ler; quem lê é a tela. É o caso do modal, que lê todos os
  Envios da Remessa num `POST /jobs/list` só a cada 2 s (o resumo e o “sem notícia” dependem dessa leitura); assim nenhum Envio é lido duas
  vezes.
- `situacao()`: a `SituacaoDoEnvio` da última leitura (`painel-envio-estado.js`), ou `null` antes dela.
- `aoMudar(ouvinte)`: chamado quando a situação muda (estado, Etapa, feitos, total); devolve a função que tira o ouvinte.
- `largar()`: para de ler; uma resposta que chega depois é ignorada.

## 1. Dono único de cada dado

| dado | dono | quem mais guarda | o que a cópia nunca é |
|---|---|---|---|
| o estado do Envio (`state`) | a Conexão (`user_files`, `envio.py`) | o módulo guarda a última leitura, só em memória | gravado: o módulo não escreve no `chrome.storage` |
| a linha de custos do Envio | a Conexão (`POST /analytics/jobs`) | `pm_anki_custos`, o retrato da última leitura da aba Custos | decidido pela tela: a aba relê a Conexão quando a situação muda |
| a Remessa (`pm_envio`) | o modal do Envio (`EnvioGravado`) | nenhum | escrita pelo módulo: no passo 3 o modal guarda um módulo por `jobId` só em memória |
| o `usingKey` do Envio | a Conexão (`limite_do_plano.usar_a_chave`) | ninguém: o cartão do modal lê o `waiting` na próxima leitura | gravado pelo painel |

## 2. Estados

Os da `SituacaoDoEnvio`, sem nenhum novo. O módulo acompanha até um dos finais (`terminou`): Concluído, Concluído em parte, Não
concluído, Apagado (as Frases foram apagadas na Conexão) ou Desconhecido (`404 job_not_found`: a Conexão não conhece o Envio). A aba
Custos diz o que já dizia em cada um (BRG-31, ENV-07, ENV-24); o que muda é que ela relê os custos a cada mudança.

## 3. Transições

| transição | quem pede | o que lê antes | quem aceita | o que muda |
|---|---|---|---|---|
| tentar de novo | a tela (Continuar envio) | nada | a Conexão (`tentar_de_novo`) | o Envio volta à fila; já na fila ou andando, nada |
| ler o Envio | o módulo, a cada 2 s depois do `ok` | — | a Conexão (`POST /jobs/get`) | só a memória do módulo; a tela é avisada se a situação mudou |
| usar a chave (passo 3) | a tela (Usar a minha chave, no modal) | nada | a Conexão (`usar_a_chave`) | o Envio marca `usingKey` e acorda; terminado ou apagado, 409 `job_finished`; sem chave, 409 `openai_key_missing`; repetido, nada é regravado |
| largar | a tela, ou o módulo num estado final | — | o módulo | nada na Conexão |

- **Pedido repetido:** o `POST /jobs/retry` é idempotente na Conexão (já na fila ou andando, “só diz o estado”), o `POST /jobs/usar-a-chave`
  também (com o `usingKey` já marcado, nada é regravado), e o módulo não repete nenhum dos dois enquanto o primeiro não respondeu.
- **Resposta perdida:** do `retry` ou do `usar-a-chave`, a tela mostra a falha (ENV-14) e o Envio fica como a Conexão o deixou; a próxima leitura da aba diz
  o estado verdadeiro, e um novo Continuar envio é o mesmo pedido. De uma leitura, nada muda e a próxima, 2 s depois, lê de novo.
- **Atômico:** cada transição é um pedido à Conexão; o módulo não tem passo entre dois processos.
- **Reverter:** ninguém; tentar de novo não tem desfazer, como antes.

## 4. As 8 variantes

| # | variante | o que acontece |
|---|---|---|
| 1 | sem Conexão | o Continuar envio já fica indisponível (`aria-disabled`); nada é pedido |
| 2 | Anki fechado no meio | a leitura não responde: o módulo segue tentando a cada 2 s e não avisa mudança; a aba mostra o que leu por último |
| 3 | complemento antigo | o `/jobs/get` e o `/jobs/retry` são do mesmo contrato do Envio (#142); sem mudança de rota |
| 4 | bridge Flask na 8766 | não há Envio para retomar (a lista de custos não vem); nada é pedido |
| 5 | dois perfis numa Conexão | o Envio é da Conexão, que é uma só; o `jobId` é o mesmo nos dois |
| 6 | quem vem da `main` | o Envio criado antes é lido como qualquer outro |
| 7 | resposta perdida ou painel fechado | seção 3; com o painel fechado ninguém acompanha, e a aba relê a Conexão ao abrir |
| 8 | pedido repetido | seção 3 |

## 5. Limites

- A aba Custos acompanha só o Envio que ela mesma retomou, e só enquanto o painel está aberto; o que andou com ela fechada aparece na
  próxima leitura, como antes.
- No passo 3 o modal usa o módulo para pedir, não para ler: a leitura do modal continua um `/jobs/list` para todos os seus Envios (as specs
  de tela e o resumo dependem dela). Passar a leitura do modal ao módulo (`/jobs/get` por Envio) é um passo à parte, que muda essas specs.
- O pedido do modal pelo módulo leva o prazo da Remessa (`FaseDaRemessa.PRAZO_DO_PEDIDO_MS`, 10 s); o `usar-a-chave` ia antes com o prazo
  padrão da conversa (15 s).
- Duas abas que retomam o mesmo Envio leem cada uma por conta própria (um pedido a cada 2 s por aba); a Conexão é quem guarda o Envio.
- Não fazer (C3, decisão do dono): levar o acompanhamento ao service worker, criar rota de Remessa na Conexão, fazer a Boas-vindas
  caber na Remessa por opções, cortar arquivo pelo tamanho, apagar specs na mesma PR da troca.

## 6. Provas

O módulo em Node, com uma Conexão de mentira em memória que segue o `tentar_de_novo` do `envio.py`: `test_envio_acompanhado.js` (dois
cliques são um pedido; o 409 vira apagado; a falha diz o pedido; acompanha até o fim e para; o 404 é desconhecido; a leitura sem
resposta não muda nada; largar ignora a resposta tardia). A tela: `e2e/tests/painel-anki-continuar.spec.js` (o detalhe vai de
Concluído em parte a Concluído sozinho, e `pm_anki_custos` guarda o Concluído); os Continuar envio de `painel-anki.spec.js` seguem
sem mudar. Passo 3: `test_envio_acompanhado.js` ganha o `usarAChave` (segue pela chave e lê até o fim; dois cliques são um pedido; sem
chave dá `semChave` e ninguém lê; o `job_finished` e a falta de resposta dizem o pedido; largar com o pedido no ar não lê; com
`lerSozinho: false` ninguém lê); na tela, `painel-envio-limite.spec.js` (Usar a minha chave e Tentar de novo no limite, agora também sem
nenhum `/jobs/get`) e `painel-envio-estados.spec.js` (a causa no formato do módulo). Não provam o Anki real nem a Conexão real.
