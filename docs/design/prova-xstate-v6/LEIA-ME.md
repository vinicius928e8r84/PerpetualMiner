# Prova de conceito: o ciclo da Remessa no XState v6 beta

**Prova para medir, não para mesclar.** Nada daqui entra no pacote da extensão nem no `.ankiaddon`: a pasta fica em `docs/`, que `scripts/arquivos-do-pacote.js` deixa de fora, e `painel-envio.js` segue como está.

A pergunta que ela responde: o [XState v6 beta](https://stately.ai/blog/2026-11-05-xstate-v6-beta) ajuda no ciclo da Remessa, que hoje mora em `painel-envio.js` com o estado espalhado em variáveis mutáveis e só é exercido pelas specs de tela?

## O que tem aqui

| arquivo | o que é |
|---|---|
| `vendor/xstate.umd.min.js`, `vendor/xstate-fsm.umd.min.js` | os dois arquivos UMD do `xstate@6.0.0-beta.3`, byte a byte como saem do npm (`node conferir-vendor.mjs` compara), com a licença MIT ao lado. É assim que uma extensão sem build os carregaria: por `<script>`. |
| `fase-da-remessa-fsm.js` | a `FaseDaRemessa` de `painel-envio-estado.js` refeita com `xstate/fsm`, com a mesma interface (`FASE`, `EVENTO`, `proxima`, `aceita`). |
| `remessa.js` | o ciclo inteiro como um módulo sem tela: criar os Envios, acompanhar de 2 em 2 segundos, abrir o resumo, responder, tentar de novo, continuar, esquecer e Apagar tudo. Recebe a Conexão, os ajustes e o armazenamento como portas. Reusa `SituacaoDoEnvio` do produto. |
| `test_fase_da_remessa_fsm.js` | compara a fase feita à mão com a do `xstate/fsm` em toda fase × evento × dado. |
| `test_remessa.js`, `test_remessa_falhas.js`, `apoio-da-remessa.js` | os cenários do ciclo em Node, com a Conexão de mentira e o relógio simulado do XState (`apoio-da-remessa.js` monta os dois). Os nomes seguem os das specs `e2e/tests/painel-envio*.spec.js` que cobrem o mesmo comportamento na tela. |
| `tipos/` | o que o TypeScript acusa numa máquina do v6, em `.ts` e em `.js` com JSDoc (o caso do PerpetualMiner). Cada `@ts-expect-error` é um erro que o compilador tem de dar. |
| `medir-complexidade.mjs` | a complexidade ciclomática (regra `complexity` do ESLint) de `painel-envio.js` e `painel-envio-estado.js` contra os arquivos da prova, por recorte. |
| `ligar-no-painel.mjs` | liga a prova no painel de uma **cópia descartável** do repositório, para rodar as specs de tela e medir o pacote. Recusa rodar sem `PM_PROVA_DESCARTAVEL=1`. |

## Como rodar

Os testes rodam sem instalar nada, pelo grupo `node` do portão:

```bash
node docs/design/prova-xstate-v6/test_fase_da_remessa_fsm.js
node docs/design/prova-xstate-v6/test_remessa.js
node docs/design/prova-xstate-v6/test_remessa_falhas.js
```

As medições pedem as ferramentas (`xstate`, `typescript` e `eslint`, fixadas no `package.json` desta pasta):

```bash
cd docs/design/prova-xstate-v6
npm ci --ignore-scripts
npm run tipos          # o compilador confere cada erro esperado
npm run complexidade   # a tabela por recorte
npm run vendor         # os arquivos de vendor/ são os do npm
```

Para ver a prova dentro da extensão, numa cópia:

```bash
git archive HEAD | tar -x -C /tmp/copia
PM_PROVA_DESCARTAVEL=1 node docs/design/prova-xstate-v6/ligar-no-painel.mjs /tmp/copia inteira
```

`fsm` troca só a `FaseDaRemessa` do painel pela do `xstate/fsm`; `inteira` carrega também o XState inteiro e `remessa.js`, sem ligá-lo à tela, e escreve `e2e/tests/prova-xstate.spec.js`, que roda a máquina dentro da página da extensão e confere que a CSP do Manifest V3 não acusa nada.

## O que a prova não refaz

- O desenho do progresso e do resumo (`desenharProgresso`, o corpo de `tentarAbrirResumo`), que seguiria lendo o estado da máquina.
- A conversa com o abridor quando o Anki está fechado (`aoLigarOAnki`, `pedirOAnkiFechado`).
- O Envio novo só com as Frases que ficaram de fora (`CartaoDoEnvio.recriar`).
- O encerramento por outra aba (`chrome.storage.onChanged`), que viraria um `apagarTudo` enviado de fora.

Onde ela decide diferente do produto: quando guardar o corpo do Envio falha, a máquina marca o Envio como “não começou”; hoje a criação para no meio com a promessa rejeitada. E o resumo abre assim que a condição vale, sem esperar a volta seguinte do relógio.
