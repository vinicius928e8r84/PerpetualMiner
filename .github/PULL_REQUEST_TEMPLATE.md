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
   Risco: <BAIXA, MÉDIA ou ALTA: o risco que o revisor viu, que pode não ser a atenção do corpo>

   Vale o registro mais recente com a linha "Head:" deste head. Um comentário não dispara o check: publique com
   `node scripts/ci/registrar-na-pr.js revisao --risco baixa|media|alta`, que lê o head no GitHub e roda o check de novo.

   Um head novo que é só merge limpo da main sobre o head revisado (cada commit novo da branch é um merge da main, sem
   conflito resolvido à mão nem mudança dentro do merge; scripts/ci/so-merge-da-main.js) não pede revisão nova: vale o
   registro do head anterior. Qualquer outro commit pede. Por isso: atualize a branch com a main só quando houver conflito
   (ou quando a main trouxer algo de que a PR precise); a main andar não é motivo, o check não exige a branch em dia.
   A seção "Prova real" (item 3) continua valendo só para o head exato.

3. Com Atenção ALTA, com o Risco ALTA do registro do /code-review (vale a maior das duas: o corpo MÉDIA com o revisor
   ALTA pede a prova) ou com o rótulo `risco:alto`, o corpo tem também a seção abaixo, com o que foi provado no produto
   de verdade e como. A seção que diz NÃO COBERTO (ou NAO COBERTO) ou BLOQUEADA não vale, mesmo com a frase; a prova que
   não cobriu tudo usa `--cobertura parcial`, que escreve BLOQUEADA-Mac-Windows no lugar da frase:

   ## Prova real

   PROVADO 100% REAL
   Head: <SHA inteiro do head>

   `node scripts/ci/registrar-na-pr.js prova --cobertura total` escreve a seção com o head lido no GitHub.

   Várias PRs na fila podem dividir uma prova: a prova feita num commit de lote (uma branch que junta os heads delas)
   vale para cada PR cujo head o commit contém. No lugar da linha "Head:", a seção diz "Lote: <SHA inteiro do commit
   de lote>" (`prova --lote <SHA>`). O check confere que o commit existe no repositório e contém o head da PR; um commit
   novo na PR tira o head do lote, e a prova se refaz (docs/prova-em-lote.md).

4. O corpo diz a issue da PR, em linhas sozinhas:

   Closes <URL completa da issue>

   Uma linha por issue; a issue fecha sozinha no merge. Só vale a URL completa (https://github.com/<dono>/<repo>/issues/<N>):
   o número solto (#N) não fecha nada. Com a prova real pendente (R10), a issue fecha do mesmo jeito no merge e o corpo diz
   o que falta:

   Closes <URL completa da issue>
   Prova que falta: <o que falta provar>

   Uma PR que é um passo de uma série deixa a issue aberta e diz o que ainda falta:

   Refs <URL completa da issue>
   Prova que falta: <o que ainda falta para fechar a issue>

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

6. Uma PR que muda um arquivo que o usuário vê (a lista é a de .agents/skills/verify-perpetualminer/scripts/mapa-de-features.sh)
   atualiza .agents/skills/verify-perpetualminer/features/ ou diz no corpo, quando o mapa não muda:

   feature map unchanged

Antes de abrir a PR (ou de editar o corpo), confira o corpo sem o GitHub, com o mesmo código dos itens 1, 3, 4, 5 e 6:
`node scripts/ci/corpo-da-pr.js <arquivo do corpo>`.

O SHA é o inteiro, de 40 caracteres (`git rev-parse HEAD`). Um commit novo muda o head: revise e prove de novo.
O que está em comentário de HTML, em bloco de código ou em citação (`>`) não conta.
O check confere o artefato e o SHA, não que a revisão ou a prova aconteceram.
-->
