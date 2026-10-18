# Ganchos do git

`pre-commit` barra o commit de um arquivo preparado (staged) com mais de **20.000 bytes** (5.000 tokens, a 4 bytes por token). Lê o conteúdo do índice, não da cópia de trabalho, só dos arquivos adicionados, copiados, modificados ou renomeados.

## Ligar

O `npm ci` de `e2e/` liga sozinho (script `prepare`). Num clone que já existe, uma vez:

```
node scripts/ganchos/instalar.mjs
```

Isso é `git config core.hooksPath scripts/ganchos`; o script não troca uma pasta de ganchos que o clone já tenha configurado.

## O que fica de fora

`limite-de-tokens.json` › `ignorar` (cada item tem o motivo): trava de pacotes (`*.lock`, `package-lock.json`, `pnpm-lock.yaml`), saída gerada (`dist/`, `build/`, `coverage/`, `*.min.*`, `*.map`, `docs/design/voz/catalogo-textos.json`), binários (imagem, fonte, pacote compactado, áudio, vídeo, PDF; e qualquer arquivo com byte nulo no começo), código de terceiros (`node_modules/`, `vendor/`, `third_party/`) e arquivo com marca de gerado (`@generated`, `DO NOT EDIT`...) nas primeiras linhas (`marcasDeGerado`). Para incluir outro caso, acrescente uma linha ali.

## Arquivos que já eram grandes: a linha de base

`linha-de-base-de-tamanho.json` lista cada arquivo que já passava do limite quando o gancho entrou, com o tamanho de então. Um arquivo da lista pode ser editado, mas não pode crescer além do tamanho da lista; qualquer outro arquivo tem de caber no limite.

Depois de dividir um arquivo da lista (ou encolhê-lo):

```
node scripts/ganchos/limite-de-tokens.js --atualizar-linha-de-base
git add scripts/ganchos/linha-de-base-de-tamanho.json
```

O comando lê o índice, baixa cada entrada para o tamanho atual e tira a que voltou ao limite ou foi apagada; nunca sobe um tamanho nem acrescenta arquivo. Renomear um arquivo da lista é um arquivo novo para o gancho: mova a entrada à mão, com o mesmo tamanho.

**Modo estrito:** apague `linha-de-base-de-tamanho.json`. Sem ele, tudo acima do limite barra o commit.

## Dividir um arquivo

A mensagem do gancho traz o passo a passo do tipo do arquivo. Em resumo: um arquivo por responsabilidade (código), por cenário (teste), por seção com um índice (documento), por coleção (dados); constantes, tipos e fixtures no próprio arquivo; cada arquivo novo abaixo do limite; imports e links corrigidos; `git add`.

## Teste

`node scripts/testar.mjs ferramentas`
