# Commit verde

Um commit da `main` é **verde** quando a suíte completa passou nele. O workflow `Commit verde` (`.github/workflows/commit-verde.yml`) o marca com a tag `verde/<AAAA-MM-DD>-<sha7>`; a tag nunca se move, então cada commit que passou guarda o seu registro.

## Quem marca

- `Commit verde` roda depois de cada execução verde da `Noturna` na `main` (e à mão, com `workflow_dispatch` e o SHA inteiro). Uma execução de PR da Noturna não marca nada.
- `node scripts/ci/commit-verde.js marcar <sha> --esperar <minutos>` pergunta ao GitHub os check-runs do commit: marca só se o commit está na `main`, todos os checks de `scripts/ci/checks-obrigatorios.json` (menos `Registro da PR`, que só existe em PR) apareceram e nenhum check do commit falhou ou foi cortado. Com check ainda rodando, espera até o prazo de `--esperar`; vencido o prazo, não marca (o workflow não fica vermelho: o próximo commit verde marca o seu).
- É o único workflow com `contents: write`, só para criar a tag (`POST /git/refs`; marcar duas vezes o mesmo commit não faz nada).
- Enquanto a `main` reprovar `Testes do complemento` pelos dois testes de versão (#514), nenhum commit é marcado.

## Quem confere

`node scripts/empacotar-extensao.mjs` (o zip da loja) e `python3 complemento/empacotar.py` (o `.ankiaddon`) rodam `node scripts/ci/commit-verde.js conferir`: o HEAD precisa ter uma tag `verde/*` e a árvore não pode ter mudança nem arquivo novo fora do commit (o que o `.gitignore` deixa de fora, como `dist/`, não conta). Faça `git fetch origin --tags` antes.

| `PM_COMMIT_VERDE` | O que acontece sem a tag |
|---|---|
| `avisar` (padrão) | avisa no stderr e empacota |
| `exigir` | recusa, antes de escrever o pacote (`conferir --exigir` faz o mesmo) |
| `ignorar` | não confere (os testes de empacotar usam) |

Ao empacotar para a loja ou para o AnkiWeb, use `PM_COMMIT_VERDE=exigir`. Se o dono decidir que a recusa vale sempre, basta trocar o padrão em `modoDoAmbiente` (`scripts/ci/commit-verde.js`).

O commit de versão que `versao_no_merge.py` faz na `main` é um commit novo: só ganha a tag depois da suíte passar nele.
