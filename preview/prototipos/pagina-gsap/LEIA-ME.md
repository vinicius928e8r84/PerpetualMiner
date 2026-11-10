# Protótipos da nova landing, com GSAP

Mais três versões da página inteira, para o dono escolher. Partem do **Roteiro** (`../pagina/roteiro.html`: o mesmo
conteúdo, na mesma ordem) e trocam o movimento, que aqui é feito com o [GSAP](https://gsap.com) e pensado como motion
design: cada variante tem um eixo com nome. Saem no preview em `/prototipos/pagina-gsap/` e nada do site as carrega:
`/sobre/` continua sendo a landing de produção, e a pasta `../pagina/` não foi tocada. Feitas pelo fluxo da skill
`emil-prototype`; o movimento, pelas skills `choreograph`, `animate` e `animation-performance`.

| Variante | Eixo | Quem rege o tempo | O que o GSAP move | Plugins |
|---|---|---|---|---|
| **Palco** (`palco.*`) | Rolagem presa | A rolagem: rolar é andar na linha do tempo | Tudo o que está no palco: a câmera, os atos, o painel e o popup que sobem, o envio que enche | ScrollTrigger |
| **Travessia** (`travessia.*`) | Continuidade | A frase: ela voa quando a estação seguinte chega | Só a frase (palavra por palavra) e, no cartão, as etapas do envio | Flip |
| **Compasso** (`compasso.*`) | Tipografia cinética | O relógio: cada entrada toca uma vez | A letra: versos atrás de máscara, a frase no ritmo da fala, as etapas uma por tempo | SplitText |

| Arquivo | O que é |
|---|---|
| `index.html` | O seletor: uma variante por vez num quadro que ocupa a janela, com a pílula do `PICKER.md` da skill copiada como está. A ficha acima dela traz a tabela das três e a recomendada. |
| `base.css` | A base de `../pagina/base.css`, copiada (esta pasta se basta), com uma troca: a pergunta abre sem animar a altura. |
| `pagina.css` | As seções que as três dividem: o topo (sem vidro), a abertura, os atos, as etapas, a ficha, o fecho. |
| `demo.css` | A demonstração do Alt+S: os passos parados e o filme. O estado de cada passo mora aqui, pelo `data-passo`. |
| `cabeca.js` | Marca a página (`js`, `filme`, e a classe que a variante pede) antes da primeira pintura, e desmarca se o GSAP não chegar em 4 s. |
| `comum.js` | O que as três dividem do movimento: a demonstração do Alt+S (tempos, espera pela página parada, Repetir, limpeza). |
| `pior-caso.js` | O teste de pior caso (skill `break-ui`). Só age com `?dados` no endereço do seletor. |
| `vendor/gsap/` | O GSAP 3.15.1, copiado do npm, com a licença dele ao lado (`LICENCA.txt`, `LEIA-ME.md`). **Não é AGPL.** |

## Rodar

```bash
node preview/montar.mjs --servir   # http://127.0.0.1:4173/prototipos/pagina-gsap/
```

Teclas do seletor: `1`, `2`, `3` ou `←` `→` trocam de variante; `R` refaz a entrada. O endereço guarda a escolha
(`?v=2`). Cada variante também abre sozinha (`/prototipos/pagina-gsap/travessia.html`). O pior caso:
`/prototipos/pagina-gsap/?v=2&dados=pior`.

## As regras do movimento, nas três

- **Só `transform` e `opacity` se animam.** Nada de desfoque, de altura nem de layout. O topo não tem vidro.
- **`will-change` só enquanto a animação dura**, e no fim o GSAP apaga o que escreveu (`clearProps`): parado, o
  elemento depende só do CSS. No Palco, que anda para a frente e para trás, cada alvo tem a janela dele na linha do
  tempo.
- **Com "menos movimento" nada se anima** (`gsap.matchMedia()`): o palco não prende, a frase não viaja, os versos não
  entram. A demonstração do Alt+S vira as duas capturas, antes e depois, com os três passos, e o Repetir continua:
  anda pelos passos em cortes secos.
- **Sem script a página está inteira.** Quem arruma a página para o movimento são as classes de `cabeca.js`; se o
  GSAP não chegar, elas saem.
- O GSAP roda na thread principal (um tique por quadro). Por isso nenhuma timeline começa enquanto a página carrega,
  menos a abertura do Compasso, que espera a fonte.

## A demonstração do Alt+S

Feita para quem está desatento, do jeito que o dono pediu. Só começa com a tela dela à vista (60%), a página parada
há meio segundo, as capturas carregadas **e o Repetir à vista**. Os passos vêm um de cada vez:

| | Primeira vez | Repetir |
|---|---|---|
| 1. A legenda na tela, e nada se mexe | 1,8 s | 0,7 s |
| 2. As teclas, grandes sobre o vídeo; aos 0,45 s afundam (o aperto) | 1,2 s | 1,0 s |
| 3. A tela minerada entra (0,32 s) com o anel de ouro (0,9 s); as teclas saem em 0,16 s | 0,9 s | 0,9 s |
| Do começo ao fim | 3,9 s | 2,6 s |

Rolar de novo zera a espera. No Palco ela só toca no patamar do ato 2; quem passa direto encontra a frase já
minerada, e quem volta ao ato 1 a vê de novo na descida.

## O que cada variante tem de frágil

- **Palco:** o palco preso precisa caber. Se o ato mais comprido não cabe na janela (um celular baixo, um texto
  maior), `palco.js` desiste de prender e a história vira página comum; confere de novo a cada mudança de tamanho.
- **Travessia:** a frase que viaja é HTML por cima das capturas. As vagas (`travessia.css`, `--x --y --w --h --f`)
  foram medidas nas imagens de `preview/site/capturas/`: se `capturar.mjs` refizer uma delas, meça de novo. O cartão
  do ato 4 é um esquema desenhado em CSS, não uma captura do Anki.
- **Compasso:** o título espera a fonte e o SplitText para aparecer. É a que mais depende de o script chegar.

## Depois da escolha

A variante escolhida vira `preview/site/sobre.html` (com o CSS, os scripts e o `vendor/gsap/` que ela usa em
`preview/site/`), e esta pasta é apagada, junto com a linha dela em `preview/montar.mjs`, em `preview/README.md` e em
`test_preview.js`. Leve só os plugins da escolhida: a tabela de pesos está em `vendor/gsap/LEIA-ME.md`.
