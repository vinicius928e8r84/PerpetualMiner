## Summary

## Evidence

## Merge Danger

**Door:**

**Blast Radius:**

**Atenção:**

<!--
O check "Registro da PR" (.github/workflows/registro-da-pr.yml, scripts/ci/registro-da-pr.js) confere, no head exato da PR:

1. O corpo segue o modelo do /pr: as seções Summary, Evidence e Merge Danger, as linhas "Door:" e "Blast Radius:"
   preenchidas, e a linha "Atenção:" só com BAIXA, MÉDIA ou ALTA (o porquê vai na linha de baixo).

2. Um comentário (ou revisão) da PR, de quem pode escrever no repositório, é o registro do /code-review deste head:

   Veredito: CLEAN
   Head: <SHA inteiro do head>
   Autor: <quem escreveu a mudança>
   Revisor: <quem revisou, que não é o autor>

   Vale o registro mais recente com a linha "Head:" deste head. Um comentário não dispara o check: depois de publicar, rode-o de
   novo (`gh run rerun <id> --failed`).

3. Com Atenção ALTA (ou o rótulo `risco:alto`), o corpo tem também a seção abaixo, com o que foi provado no produto
   de verdade e como:

   ## Prova real

   PROVADO 100% REAL
   Head: <SHA inteiro do head>

O SHA é o inteiro, de 40 caracteres (`git rev-parse HEAD`). Um commit novo muda o head: revise e prove de novo.
O que está em comentário de HTML, em bloco de código ou em citação (`>`) não conta.
O check confere o artefato e o SHA, não que a revisão ou a prova aconteceram.
-->
