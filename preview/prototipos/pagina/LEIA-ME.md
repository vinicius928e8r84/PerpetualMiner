# Protótipos da nova landing

Três versões da página inteira, para o dono escolher uma. Saem no preview em `/prototipos/pagina/` e nada do site
as carrega: `/sobre/` continua sendo a landing de produção. Feitas pelo fluxo da skill `emil-prototype`; o movimento,
pelas skills `animate` e `choreograph`.

| Arquivo | O que é |
|---|---|
| `index.html` | O seletor: mostra uma variante por vez num quadro que ocupa a janela, com a pílula do `PICKER.md` da skill copiada como está. A ficha acima da pílula diz qual é a recomendada e por quê. |
| `roteiro.*` | **Roteiro**: rolagem guiada. Um palco preso mostra as telas reais e troca conforme os cinco atos passam. |
| `mosaico.*` | **Mosaico**: a página inteira numa grade de peças, densa, para ler de relance. |
| `abas.*` | **Abas**: uma tela só, do jeito do painel da extensão. A coluna de abas troca o que a ilha mostra. |
| `base.css` | O que as três dividem: o botão, as teclas, o rótulo, as perguntas. |
| `demo.css`, `demo.js` | A demonstração do Alt+S do Mosaico e das Abas, em três passos (o Roteiro encena a dele no palco, em `roteiro.js`). |
| `pior-caso.js` | O teste de pior caso (skill `break-ui`). Só age com `?dados` no endereço do seletor. |

## Rodar

```bash
node preview/montar.mjs --servir   # http://127.0.0.1:4173/prototipos/pagina/
```

Teclas do seletor: `1`, `2`, `3` ou `←` `→` trocam de variante; `R` refaz a entrada. O endereço guarda a escolha
(`?v=2`). Cada variante também abre sozinha (`/prototipos/pagina/roteiro.html`). O pior caso:
`/prototipos/pagina/?v=1&dados=pior`.

## O que vale nas três

- O que elas afirmam é o que `preview/site/sobre.html` afirma, com as mesmas capturas de `preview/site/capturas/`.
  Mudou o texto da landing? Mude aqui também, ou apague a pasta.
- Sem fonte, imagem nem script de fora; os scripts não falam com a rede nem guardam nada.
- Sem script a página está inteira (as telas em fila, as seções uma embaixo da outra). Com "menos movimento" nada
  entra, desliza ou toca sozinho: a demonstração do Alt+S vira passos parados.
- Só `transform` e `opacity` se mexem (as exceções estão escritas no CSS de cada movimento).

## A demonstração do Alt+S

Feita para quem está desatento. Só começa com a tela dela à vista e a página parada, e os passos vêm um de cada vez:

| | Mosaico e Abas (`demo.js`) | Roteiro (`roteiro.js`) |
|---|---|---|
| Começa | 600 ms depois de parar, com 60% da tela à vista e as capturas carregadas | 400 ms depois de parar no ato 2 |
| A legenda na tela | 1,8 s (achar a cena e ler a linha) | o ato 1 inteiro |
| As teclas, grandes sobre o vídeo | 1,2 s | 1,1 s |
| A tela minerada | entra em 320 ms, com o anel de ouro (900 ms) | idem |
| Do começo ao fim | 3,9 s | 2,0 s |

Rolar de novo zera a espera. O Repetir encurta os dois primeiros tempos (quem pediu já sabe para onde olhar).

## Depois da escolha

A variante escolhida vira `preview/site/sobre.html` (com o CSS e o script dela em `preview/site/`), e esta pasta é
apagada, junto com a linha dela em `preview/montar.mjs`, em `preview/README.md` e em `test_preview.js`.
