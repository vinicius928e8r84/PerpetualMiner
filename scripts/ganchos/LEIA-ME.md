# Ganchos do git

`pre-commit` barra o commit de um arquivo preparado (staged) com mais de **20.000 bytes** (5.000 tokens, a 4 bytes por token). Lê o conteúdo do índice, não da cópia de trabalho, só dos arquivos adicionados, copiados, modificados ou renomeados.

## Ligar

O `npm ci` de `e2e/` liga sozinho (script `prepare`). Num clone que já existe, uma vez:

```
node scripts/ganchos/instalar.mjs
```

Isso é `git config core.hooksPath scripts/ganchos`. O script não troca uma pasta de ganchos que o clone já tenha configurado (local, global ou do sistema), não faz nada no CI e lista os ganchos de `.git/hooks` que deixam de rodar (copie-os para `scripts/ganchos/` se quiser mantê-los).

## O que fica de fora

`limite-de-tokens.json` › `ignorar` (cada item tem o motivo): trava de pacotes (`*.lock`, `package-lock.json`, `pnpm-lock.yaml`), saída gerada (`dist/`, `build/`, `coverage/`, `*.min.*`, `*.map`, `docs/design/voz/catalogo-textos.json` e `catalogo.html`, regravados por `scripts/gerar-catalogo-da-voz.js`), binários (imagem, fonte, pacote compactado, áudio, vídeo, PDF; e qualquer arquivo com byte nulo no começo), código de terceiros (`node_modules/`, `vendor/`, `third_party/`) e arquivo com a marca das ferramentas de geração (`@generated`, `DO NOT EDIT`, `Code generated`, com essas maiúsculas e minúsculas) nas 5 primeiras linhas (`marcasDeGerado`). Um arquivo gerado de outro jeito entra por glob em `ignorar` (uma linha com o motivo), não por comentário.

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

## Dividir um arquivo

A mensagem do gancho traz o passo a passo do tipo do arquivo. Em resumo: um arquivo por responsabilidade (código), por cenário (teste), por seção com um índice (documento), por coleção (dados); constantes, tipos e fixtures no próprio arquivo; cada arquivo novo abaixo do limite; imports e links corrigidos; `git add`.

## Teste

`node scripts/testar.mjs ferramentas`
