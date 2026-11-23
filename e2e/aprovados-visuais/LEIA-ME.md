# Referências visuais aprovadas

O livro das referências visuais que o dono aprovou. Um arquivo por spec (`<spec sem .spec.js>.json`, o mesmo nome de `e2e/tests/<spec>.spec.js`), com uma entrada por PNG de `e2e/tests/<spec>-snapshots/`, `"<nome>.png": { "data": "AAAA-MM-DD", "resposta": "onde ele respondeu" }`.

A regra `aprovacao-visual` (`scripts/regras/`) falha para um PNG sem entrada, fora de um `test.fixme`. Quem aprova é o dono olhando a tela; o livro só deixa um `--update-snapshots` sem aprovação visível no diff.

O livro é dividido por spec para cada arquivo caber no limite de tamanho dos ganchos (`scripts/ganchos/limite-de-tokens.json`).
