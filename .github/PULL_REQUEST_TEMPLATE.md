## Summary

## Evidence

## Merge Danger

**Door:**

**Blast Radius:**

**Atenção:**

**Política:**

<!--
O check "Registro da PR" (.github/workflows/registro-da-pr.yml, scripts/ci/registro-da-pr.js) confere, no head exato da PR:

1. O corpo segue o modelo do /pr: as seções Summary, Evidence e Merge Danger, as linhas "Door:", "Blast Radius:"
   e "Política:" preenchidas, e a linha "Atenção:" só com BAIXA, MÉDIA ou ALTA (o porquê vai na linha de baixo).

2. Um comentário (ou revisão) da PR, de quem pode escrever no repositório, é o registro do /code-review deste head:

   Veredito: CLEAN
   Head: <SHA inteiro do head>
   Autor: <quem escreveu a mudança>
   Revisor: <quem revisou, que não é o autor>

   Vale o registro mais recente com a linha "Head:" deste head. Um comentário não dispara o check: publique com
   `node scripts/ci/registrar-na-pr.js revisao`, que lê o head no GitHub e roda o check de novo.

   Um head novo que é só merge limpo da main sobre o head revisado (cada commit novo da branch é um merge da main, sem
   conflito resolvido à mão nem mudança dentro do merge; scripts/ci/so-merge-da-main.js) não pede revisão nova: vale o
   registro do head anterior. Qualquer outro commit pede. Por isso: atualize a branch com a main só quando houver conflito
   (ou quando a main trouxer algo de que a PR precise); a main andar não é motivo, o check não exige a branch em dia.
   A seção "Prova real" (item 3) continua valendo só para o head exato.

3. Com Atenção ALTA (ou o rótulo `risco:alto`), o corpo tem também a seção abaixo, com o que foi provado no produto
   de verdade e como:

   ## Prova real

   PROVADO 100% REAL
   Head: <SHA inteiro do head>

   `node scripts/ci/registrar-na-pr.js prova` escreve a seção com o head lido no GitHub.

4. O corpo diz a issue da PR, em linhas sozinhas:

   Closes <URL completa da issue>

   Uma linha por issue; a issue fecha sozinha no merge. Só vale a URL completa (https://github.com/<dono>/<repo>/issues/<N>):
   o número solto (#N) não fecha nada. Com a prova real pendente (R10), a issue fica aberta e o corpo diz o que falta:

   Refs <URL completa da issue>
   Prova que falta: <o que falta provar>

   Uma PR sem issue diz, sozinha na linha:

   Sem issue

5. A linha "Política:" diz o que a PR faz com a política de privacidade, que mora em vinicius928e8r84/perpetualminer-site.
   O check "Política do site" (scripts/ci/politica-do-site.js) exige, quando a PR muda um sinal de dados (as permissões, os
   hosts ou os sites dos scripts de conteúdo do manifest.json; um endereço de fora que entrou ou saiu; uso novo de
   chrome.storage.sync, chrome.identity, chrome.cookies, chrome.history ou chrome.webRequest; ou um arquivo de regra ou de
   dados da lista do script), um destes valores, no corpo e não em comentário:

   Política: https://github.com/vinicius928e8r84/perpetualminer-site/pull/<N>
   Política: sem mudança: <motivo>

   Nas outras PRs basta "Política: sem mudança" (ou com o motivo). A PR da política não precisa estar mesclada, mas a
   política tem de estar no ar antes de a versão ir para a loja ou para o AnkiWeb (docs/publicar-chrome-web-store.md).

O SHA é o inteiro, de 40 caracteres (`git rev-parse HEAD`). Um commit novo muda o head: revise e prove de novo.
O que está em comentário de HTML, em bloco de código ou em citação (`>`) não conta.
O check confere o artefato e o SHA, não que a revisão ou a prova aconteceram.
-->
