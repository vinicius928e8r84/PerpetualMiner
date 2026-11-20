---
name: verificar-historico
description: Use when a change touches how `frases` is read or written (lib/historico.js, salvarFrase or handleAutoMinerCandidate in background.js, carregar/juntarMarcas in lib/sincronizacao.js, the Historico calls in painel/painel.js) or the Web Lock `pm-historico`. Runs an exhaustive interleaving explorer over the real code and checks that every Histórico operation behaves as if it ran whole and alone (no lost Frase, edit or deletion; no duplicate; unique ids).
---

# Verificar o Histórico

## A propriedade

**Atomicidade do Histórico:** quando várias operações mexem em `frases` ao mesmo tempo (o service worker e as páginas da extensão), o `frases` que fica é o que alguma ordem em série das mesmas operações daria, cada uma inteira e sozinha.

**O dano quando quebra:** uma Frase minerada some, uma Palavra/marca Enviada/Exportada some, uma Frase apagada volta, a mesma legenda entra duas vezes, ou duas Frases ganham o mesmo id (e o tombstone de uma apaga a outra).

## Como funciona

`explorar.js` carrega o código real num `vm` (o `background.js` como o service worker; `lib/historico.js` e `lib/sincronizacao.js` como a página), com um `chrome.storage.local` e uma `navigator.locks` falsos. Cada leitura e gravação de `frases` e cada pedido da tranca vira um passo que o explorador escolhe; ele tenta toda ordem desses passos (busca em profundidade, reexecutando do zero) e, no fim de cada ordem, compara o `frases` com todas as ordens em série das operações descritas em `OPS` (a especificação: a operação inteira e sozinha). Também confere ids repetidos, ator que falhou e ator parado (impasse).

Hipóteses (o que o falso faz como o Chrome): cada `get`/`set` do `chrome.storage.local` é atômico; o efeito de um pedido pode cair em qualquer momento depois de feito (por isso a leitura de um contexto pode chegar depois da gravação de outro); a Web Lock `pm-historico` é exclusiva, na ordem dos pedidos e a mesma no service worker e nas páginas (provado no Chromium por `e2e/tests/historico-trancado.spec.js`). O relógio está parado: toda Frase nova nasce no mesmo milissegundo.

## Quando usar

Rode se a mudança toca qualquer linha da tabela de cobertura, ou cria um lugar novo que lê `frases` e decide gravar com base no que leu.

## Rodar

```
node .agents/skills/verificar-historico/explorar.js            # todos os cenários, ~7 s
node .agents/skills/verificar-historico/explorar.js --um       # para no primeiro contraexemplo de cada cenário
node .agents/skills/verificar-historico/explorar.js --cenario carregar-com-conta
python3 -I .agents/skills/verificar-historico/variantes.py /tmp/variantes-historico   # prova que ainda pega as quebras (~30 s)
```

Saída 0: todo cenário `PASSOU`, ou `FALHOU SÓ COMO O ACHADO CONHECIDO` (hoje não há nenhum). Saída 1: qualquer outra falha.

Resultado esperado no commit de sincronia:

```
foto-e-painel: 1320 ordens, 0 contraexemplos → PASSOU
carregar-com-conta: 994 ordens, 0 contraexemplos → PASSOU
legenda-e-painel: 72 ordens, 0 contraexemplos → PASSOU
legenda-repetida: 6 ordens, 0 contraexemplos → PASSOU
```

`variantes.py` quebra o código real de 6 jeitos, roda o explorador com `--um` e devolve cada arquivo (confira `git status` no fim):

| Variante | A quebra | Tem de |
|---|---|---|
| `sem-tranca` | `lib/historico.js` `mudar` sem `locks.request` | falhar (perda) em 3 cenários |
| `le-fora-da-tranca` | o `get` de `frases` antes de pedir a tranca | falhar (perda) em 3 cenários |
| `grava-depois-de-soltar` | o `set` de `frases` roda depois de a tranca ser solta | falhar (perda) em 3 cenários |
| `sync-grava-a-copia` | `juntarMarcas` grava a lista lida em `lib/sincronizacao.js:374` (o código de antes da C2 passo 4) | falhar em `carregar-com-conta` |
| `id-so-pelo-relogio` | `proximoId` devolve só `Date.now()` | falhar (ids repetidos) em `legenda-e-painel` |
| `duplicata-sem-conferir` | `acrescentarSe` em `lib/historico.js` acrescenta sem conferir `jaTem` | falhar (duplicata) em `legenda-repetida` |

Os cenários: `foto-e-painel` (foto, Palavra, Apagar, marca Enviada), `carregar-com-conta` (carregar, foto, Palavra), `legenda-e-painel` (legenda automática, foto, Apagar), `legenda-repetida` (a mesma legenda duas vezes).

## Ler um contraexemplo

Cada linha é um passo: o ator, o que fez e onde no código (a pilha real, não um rótulo escrito à mão). Exemplo, da duplicata antes de a conferência entrar na tranca (`acrescentarSe`), reproduzível com a variante `duplicata-sem-conferir`:

```
 1. SW legenda 1   lê frases     lib/historico.js      confere a duplicata: não tem
 2. SW legenda 2   lê frases     lib/historico.js      confere a duplicata: não tem
 3..8. cada uma grava (lib/historico.js)
 → duplicata: a mesma Frase entrou duas vezes
```

Bug real ou erro do modelo? Erro do modelo quando: um ator falha com `TypeError`/`ReferenceError` vindo do falso (`chrome.*` que falta em `contexto()`; acrescente o stub); um ator fica parado porque o código passou a esperar um `setTimeout` (os relógios do falso nunca disparam); a especificação em `OPS` ou nas `ops` do cenário não diz mais o que a operação promete (mudou de propósito). Bug real quando o rastro só tem passos do código do produto e a ordem é possível no Chrome. Nunca enfraqueça `OPS` nem tire um cenário para passar; um achado novo vira `conhecido` só com a decisão de quem cuida do Histórico, e vai para o relatório.

## Cobertura (sincronia: `cc8e121724ae8de50ca9a727820548c847597c65`)

| Código | O que o explorador usa |
|---|---|
| `lib/historico.js` inteiro (`mudar`, `OPERACOES` com `acrescentarSe`, `proximoId`, `criar`) | rodado como está, no SW e na página |
| `background.js` `salvarFrase` | cenários com `SW foto` |
| `lib/mineracao-automatica-decisao.js` `candidata`, e `background.js` `handleAutoMinerCandidate` e `salvarFrase` (`soSe`) | `SW legenda`; `getAutoKeywordVocabulary` é trocado por um que devolve o Vocabulário com `barely`; a duplicata é conferida em `Historico.acrescentarSe`, sob a tranca |
| `background.js` `chromeGet`/`chromeSet` 487-495 | rodado como está |
| `lib/sincronizacao.js` `carregar` 349-406, `juntarMarcas` 320-347 | `Sync carregar`, com uma nuvem falsa imediata |
| `painel.js` 838 (`Historico.editar`), 1005 (`Historico.apagar`), 1148 (`Historico.marcarEnviadas`) | os atores do Painel chamam a mesma biblioteca; o `painel.js` não é carregado |

Fora: o `painel.js` em si (a lista da tela, `todasFrases`), as outras chamadas do Painel (1080, 1112, 1212: as mesmas operações), a nuvem (Firestore) e os tombstones dela, `apagarTudo`, o contador do dia da Mineração automática e qualquer chave que não seja `frases`, a ordem do array (a comparação é por conjunto), o valor que cada operação devolve.

Limites: 2 a 4 atores por cenário, uma operação cada (o carregar faz duas), 1 ou 2 Frases no início. A garantia vale para essas combinações; mais atores entram como cenário novo.

## Manter em dia

1. `git diff -M cc8e121724ae8de50ca9a727820548c847597c65 -- lib/historico.js background.js lib/sincronizacao.js ':(glob)**/painel.js'` e compare com a tabela.
2. Operação nova em `OPERACOES` ou nome novo no `Historico`: acrescente o caso em `OPS` (o que ela promete, inteira) e um ator que a use num cenário.
3. Um lugar novo que lê `frases` e grava com base nisso (como a duplicata em `Historico.acrescentarSe`): um cenário com ele e outro ator.
4. Mudou um número de linha da tabela: atualize-o.
5. Rode `explorar.js` e `variantes.py`. Só depois de ver os dois como o esperado, e a tabela descrevendo o código, mova o commit de sincronia para o novo `HEAD` da main.

## No CI

Fica manual: não está em `scripts/testes.json`. O CI roda só arquivos `test_*.js` por grupo, e o explorador leva ~7 s (e `variantes.py` ~30 s). Rode à mão quando a mudança tocar a tabela de cobertura.
