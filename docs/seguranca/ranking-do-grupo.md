# O ranking do grupo: modelo da coleção e regras do Firestore

Issue #172 (a spec é a #138). **MÉDIA.** O código só escreve e lê a coleção; **as regras ficam para o dono publicar** (`ranking-do-grupo.rules`) e nada foi publicado nem gravado no Firebase real. Os testes usam um Firestore falso (`e2e/fakes/google.js`), que faz em memória as mesmas conferências das regras.

## O modelo

Uma coleção comum, `ranking`, com um documento por pessoa e idioma, `ranking/{idioma}_{uid}` (`en_…`, `ru_…`), **só de quem topou aparecer**:

| Campo | Para quê |
|---|---|
| `nome`, `foto`, `nivel`, `melhorSequencia` | o que o ranking mostra, e só isso |
| `uid`, `idioma`, `topou` (sempre `true`) | de quem é, de qual idioma e a prova de que topou |
| `nota` (nível × 1000 + parte de acertos, 0 a 100), `acertos`, `perguntas` | o “melhor que X%” de hoje e a média de depois |
| `grupos` (lista, hoje vazia) | os recortes por grupos de depois |
| `em` | quando, para o recorte global no tempo |

Topar (caixa “Aparecer no ranking do grupo”, desmarcada de início) grava o documento; desmarcar o apaga. **Quem não topa não grava nada**, e sem conta Google a tela nem pede nada ao Firestore. O “melhor que X%” conta quem topou, sem a própria pessoa, e se ninguém mais topou a tela diz que ela é a primeira (nunca “0%”). O ranking “meio multiplayer” (global, por grupos e com a média) fica fora: o registro só nasce pronto para ele.

## As regras (`ranking-do-grupo.rules`)

- **Ler:** conta logada, só documento com `topou == true`. A consulta da extensão pede `topou == true` e o idioma; sem o filtro de `topou` o Firestore recusa a consulta inteira.
- **Gravar:** só o próprio documento (`docId == idioma_uid`, `uid == request.auth.uid`), `topou == true`, exatamente os campos acima, com idioma, nível, tamanhos e tipos conferidos.
- **Apagar:** só o próprio documento.

## Limites

- As regras limitam *quem* lê e *qual documento*, não *quais campos*: por isso o documento só tem o que o ranking mostra e o que os recortes pedem. `nota`, `acertos`, `perguntas`, `em` e `uid` também são legíveis por quem está logado, para quem topou; só aparecem na tela nome, foto, nível e melhor sequência.
- Quem topou é visto por **toda** conta logada do projeto, não só por amigos: o “grupo” é quem usa a extensão. Os grupos de verdade são do ranking futuro.
- Nome e foto vêm da conta Google na hora de topar; mudar o nome no Google não atualiza o ranking até desmarcar e marcar de novo. A foto só é mostrada se for um endereço `https`.
- As regras acima são **P6-like, PENDING OWNER**: sem publicá-las, a coleção `ranking` é recusada (403) e a tela diz “Não deu para carregar o ranking”. Falta ao dono publicá-las e provar com a conta real: topar grava, desmarcar apaga, outra conta não grava o documento alheio, sem login nada se lê.
