# Ganchos do git

`pre-commit` barra o commit de um arquivo preparado (staged) com mais de **20.000 bytes** (5.000 tokens, a 4 bytes por token). Lê o conteúdo do índice, não da cópia de trabalho, só dos arquivos adicionados, copiados, modificados ou renomeados.

`pre-push` barra o push de uma branch que o CI barraria: roda `node scripts/regras/verificar.js --base origin/main` e `node scripts/ci/autoria.js origin/main <ponta>`, os mesmos comandos do workflow Regras (8 das 12 falhas de `Regras` numa semana eram de autoria ou do verificador, cada uma custando um ciclo de CI). Leva uns 2 segundos. Não confere o mapa de features (depende do corpo da PR) nem o limite de tamanho (é o `pre-commit`). Detalhes:

- Compara com `<remoto>/main`, senão `origin/main`, como estiver no clone (`git fetch origin main` para ficar em dia); sem nenhum dos dois, avisa e deixa passar. Com a base velha, os commits que a `main` ganhou depois entram na conta como se fossem da branch, e os mais antigos dela trazem autor ou co-autor que a autoria barra: se a lista do erro tem commit que já está na `main`, é a base.
- As regras leem a cópia de trabalho, então só rodam quando a ponta empurrada é o `HEAD` (senão avisa e confere só a autoria). Mudança não commitada entra na conta.
- A autoria é de cada commit da branch: autor e committer com o e-mail do dono, e nenhuma linha `Co-authored-by:` abaixo do assunto com outro e-mail (a de um agente, por exemplo). Para citar uma linha dessas numa mensagem, recue-a: no começo da linha ela conta, mesmo dentro de um bloco de código. A mensagem do erro traz o comando que refaz a autoria e tira essas linhas; ele usa `scripts/ci/sem-coautor.js`, e numa base que ainda não o tem o rebase para sem mudar nada (`git rebase --abort`, `git fetch origin main` e de novo).
- Apagar branch, tag e `main` não conferem nada. Para pular de propósito: `git push --no-verify` (o CI confere igual).

## Ligar

O `npm ci` de `e2e/` liga sozinho (script `prepare`). Num clone que já existe, uma vez:

```
node scripts/ganchos/instalar.mjs
```

Isso é `git config core.hooksPath scripts/ganchos`, e vale para os dois ganchos. O script não troca uma pasta de ganchos que o clone já tenha configurado (local, global ou do sistema), não faz nada no CI e lista os ganchos de `.git/hooks` que deixam de rodar (copie-os para `scripts/ganchos/` se quiser mantê-los).

## O que fica de fora

`limite-de-tokens.json` › `ignorar` (cada item tem o motivo): trava de pacotes (`*.lock`, `package-lock.json`, `pnpm-lock.yaml`), saída gerada (`dist/`, `build/`, `coverage/`, `*.min.*`, `*.map`, `docs/design/voz/catalogo-textos.json` e `catalogo.html`, regravados por `scripts/gerar-catalogo-da-voz.js`), binários (imagem, fonte, pacote compactado, áudio, vídeo, PDF; e qualquer arquivo com byte nulo no começo), código de terceiros (`node_modules/`, `vendor/`, `third_party/`) e arquivo com a marca das ferramentas de geração (`@generated`, `DO NOT EDIT`, `Code generated`, com essas maiúsculas e minúsculas) nas 5 primeiras linhas (`marcasDeGerado`). Um arquivo gerado de outro jeito entra por glob em `ignorar` (uma linha com o motivo), não por comentário.

## A configuração também só aperta

`limite-de-tokens.json` é lido do índice (o que será commitado), nunca da cópia de trabalho: uma edição não preparada não vale para o commit. E, como a linha de base, só aperta em relação ao `HEAD`: o gancho barra a configuração preparada que sobe `limiteDeBytes` ou `linhasDoCabecalho`, muda `linhaDeBase`, acrescenta glob em `ignorar` ou acrescenta marca em `marcasDeGerado`. Baixar o limite, tirar entrada e mudar só o `motivo` passam; um JSON quebrado no índice também barra. Afrouxar a configuração é decisão do dono, em PR próprio e revisado. Código em `configuracao-do-indice.js`.

## Arquivos que já eram grandes: a linha de base

`linha-de-base-de-tamanho.json` lista cada arquivo que já passava do limite quando o gancho entrou, com o tamanho de então. Um arquivo da lista pode ser editado, mas não pode crescer: o teto dele é o menor entre o tamanho da lista e o tamanho que ele tem no último commit (`HEAD`). Qualquer outro arquivo tem de caber no limite.

A lista só desce, e o gancho confere isso a cada commit: lê a lista do índice (o que será commitado, nunca a cópia de trabalho) e barra entrada nova ou com tamanho maior que o da lista no `HEAD`. Só o que o `HEAD` já tinha acima do limite pode entrar numa lista nova. `--gerar-linha-de-base` só cria a lista quando ela ainda não existe (modo estrito → lista).

Depois de dividir um arquivo da lista (ou encolhê-lo):

```
node scripts/ganchos/limite-de-tokens.js --atualizar-linha-de-base
git add scripts/ganchos/linha-de-base-de-tamanho.json
```

O comando lê o índice, baixa cada entrada para o tamanho atual e tira a que voltou ao limite, foi apagada ou passou a ser ignorada; nunca sobe um tamanho nem acrescenta arquivo. Renomear um arquivo da lista não é aceito: o gancho o vê como arquivo novo e ele precisa caber no limite. Divida-o no mesmo commit da mudança de nome.

Arquivos grandes que as regras do projeto mantêm inteiros (`CLAUDE.md`, `complemento/contrato/exemplos.json`, o README e o catálogo da Voz) estão na lista e não podem crescer: divida-os antes de acrescentar.

**Modo estrito:** apague `linha-de-base-de-tamanho.json`. Sem ele, tudo acima do limite barra o commit.

## No CI

O gancho só vale para quem o ligou, então `.github/workflows/regras.yml` roda a mesma conferência sobre o que o PR mudou: `node scripts/ganchos/limite-de-tokens.js --base <ref>` (a mesma base das regras: a ponta da branch-alvo no PR, o commit anterior no push). A versão nova é o `HEAD` da branch e a velha é `<ref>`: o limite, o que fica de fora, a linha de base que só desce e a configuração que só aperta valem do mesmo jeito. Uma `<ref>` que não existe, ou uma pane do ambiente, reprova (o gancho local deixa passar). Num primeiro push (base de zeros) não há com o que comparar: avisa e passa, como as regras.

## Dividir um arquivo

A mensagem do gancho traz o passo a passo do tipo do arquivo. Em resumo: um arquivo por responsabilidade (código), por cenário (teste), por seção com um índice (documento), por coleção (dados); constantes, tipos e fixtures no próprio arquivo; cada arquivo novo abaixo do limite; imports e links corrigidos; `git add`.

## Teste

`node scripts/testar.mjs ferramentas`

## Entrada inválida e falha do ambiente

Se a linha de base preparada ou `limite-de-tokens.json` estiver ilegível, com JSON quebrado ou no formato errado (`arquivos` que não é um objeto de números, por exemplo), o gancho **barra o commit** e diz o arquivo e a linha (`Commit barrado: ...`); não deixa passar sem conferência. Uma linha de base quebrada que já está no `HEAD` vale como ausente, para o commit que a conserta passar. Só a falha do ambiente (`node` ausente, `git` indisponível) deixa o commit passar, com a linha `aviso: ...` no `stderr`.
