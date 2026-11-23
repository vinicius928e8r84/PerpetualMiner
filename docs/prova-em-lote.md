# Prova real em lote

Uma PR de atenção ALTA só mescla com a seção “Prova real” em `PROVADO 100% REAL` (`.github/PULL_REQUEST_TEMPLATE.md`, item 3). Quando várias PRs ALTA esperam na fila, fazer a prova real de cada uma com as mãos do dono custa a mesma sessão no Mac e no Windows várias vezes. A prova em lote faz uma sessão só: a prova real é feita num **commit de lote**, e vale para cada PR cujo head esse commit contém.

## O que o check “Registro da PR” confere

Na seção “Prova real” do corpo da PR, no lugar da linha `Head:`:

```
## Prova real

PROVADO 100% REAL
Lote: <SHA inteiro, de 40 caracteres, do commit de lote>
```

O check (`scripts/ci/registro-da-pr.js`) aceita a seção quando:

1. a frase `PROVADO 100% REAL` está sozinha na linha, e nenhuma linha da seção diz “não coberto” ou “bloqueada” (as mesmas regras da prova de um head só);
2. o commit de lote existe no repositório (ele precisa estar numa branch enviada ao GitHub) e **contém o head exato da PR** (`git merge-base --is-ancestor <head> <lote>`).

O que isso garante: o produto provado de verdade foi o commit que tem o código da PR cujo head ele contém. O que não garante, como em toda prova: que a prova aconteceu (o check lê o artefato e o SHA).

Um commit novo na PR muda o head, e o head novo não está no lote: o check barra, e a prova se refaz num lote novo ou no head. Um lote vale só para os heads que ele contém; uma PR de fora do lote continua pedindo a sua própria prova.

## Como o lote se monta

Uma branch nova (nunca uma branch das PRs) que parte da `main` e junta os heads por merge, um a um:

```sh
git fetch origin
git switch -c prova/lote-<assunto> origin/main
git merge --no-ff <head da PR 1>      # um merge por PR, na ordem em que elas vão mesclar
git merge --no-ff <head da PR 2>
git push -u origin prova/lote-<assunto>
git rev-parse HEAD                    # o SHA do commit de lote
```

Conflito só se resolve quando é mecânico (o mesmo trecho mudado de formas que não se tocam, a linha de base das regras). Um conflito que muda comportamento pede decisão do dono, e as PRs em conflito não entram no mesmo lote.

## Como a prova se registra

Depois da prova real no commit de lote, para **cada** PR do lote:

```sh
node scripts/ci/registrar-na-pr.js prova --pr <N> --lote <SHA do commit de lote> --cobertura total --nota <arquivo com o que foi provado e como>            # ensaio
node scripts/ci/registrar-na-pr.js prova --pr <N> --lote <SHA do commit de lote> --cobertura total --nota <arquivo com o que foi provado e como> --publicar
```

O comando troca a seção “Prova real” inteira: uma linha que estava debaixo desse título (um `Closes <URL>` ou um `Prova que falta:`) some junto, então essas linhas ficam fora da seção antes de rodar o comando. Sem `--publicar` é um ensaio: mostra o texto e o que o check diria.

O comando recusa, sem escrever nada, o lote que não contém o head da PR (e diz para baixar o lote com `git fetch origin`). A edição do corpo roda o check de novo.

A prova que não cobriu tudo usa `--cobertura parcial`, que escreve `BLOQUEADA-Mac-Windows` e não passa.
