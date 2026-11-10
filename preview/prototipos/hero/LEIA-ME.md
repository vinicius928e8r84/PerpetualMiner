# Protótipo: a chamada e o Como funciona da landing

Quatro variantes de verdade da chamada (hero) e do bloco "Como funciona" da nova landing, atrás de um seletor, para o
dono escolher olhando e mexendo. Feito pela skill `emil-prototype`; o seletor é o de `PICKER.md`, copiado sem mexer.

Protótipo não é produção: `/sobre/` não pede nada desta pasta (`node test_preview.js` confere). Escolhida a variante,
ela vai para `preview/site/` nas convenções de lá, e esta pasta é apagada.

## Abrir

```bash
node preview/montar.mjs --servir   # http://127.0.0.1:4173/prototipos/hero/
```

No Vercel, a capa do preview leva a `/prototipos/hero/`.

| Tecla | O que faz |
|---|---|
| `1` a `4`, `←` `→` | troca de variante (a escolha fica no endereço, `?v=2`) |
| `R` | remonta a variante, para a entrada dela rodar de novo |
| `Alt` + `S` | o atalho de verdade: minera a legenda da demonstração |

O alternador cinza acima do seletor troca os dados (skill `break-ui`): **Demo data** é o texto de hoje da landing,
**Worst case** é o pior caso realista (título reescrito mais longo, atalho de quatro teclas, legenda em russo com
palavras de vinte letras, uma captura em pé e outra que não carrega) e **Short** é o outro extremo. `?data=worst`.
"Sobre esta variante", no canto, diz o eixo de cada uma, o que se mexe, o que não, e por que a ★ é a recomendada.

## As variantes

| Variante | Eixo | Quando é a certa | Custo |
|---|---|---|---|
| Silenciosa | o movimento, quase zero: três quadros parados | a página é lida com pressa, como ferramenta | a menos memorável; o produto não acontece na frente de quem olha |
| Editorial | a tipografia: a frase minerada é a imagem | o que vende é a frase e a língua, não a tela | come altura; as telas do produto ficam pequenas |
| Cinema (Cinematográfica) | a narrativa em movimento: a tela de cinema e a câmera | a primeira impressão tem de ficar na memória | a mais movimentada e a mais cara de manter; rolagem longa |
| Produto (Produto-primeiro) | o modelo de interação: o visitante opera | o produto é um gesto e a melhor explicação é fazê-lo | no telefone, o botão de instalar vem depois da demonstração |

A chamada e o Como funciona de cada variante são blocos separados: dá para promover a chamada de uma com o Como
funciona de outra.

## A demonstração do Alt+S

Três etapas, uma de cada vez, com a legenda de cada uma ("2/3 Você aperta Alt+S.") e o Repetir à vista. Ela só toca
sozinha com a demonstração parada diante da pessoa: 60% dela na tela, nenhuma rolagem há 400 ms, a aba à vista e a
entrada da página terminada. Saiu da tela no meio, volta ao começo e espera de novo. Termina no resultado e fica nele.

| Etapa | Dura | Por quê |
|---|---|---|
| 1 · antes: a legenda na tela | 2,6 s | achar a legenda no vídeo (~1 s) e ler as 5 palavras da legenda da etapa (~1,3 s), com folga |
| 2 · tecla: as teclas acesas, grandes, no meio da captura | 1,4 s | notar o destaque (~0,5 s) e ler "Você aperta Alt+S." (~0,8 s) |
| 3 · resultado: a frase minerada, com o anel de ouro (0,9 s) | fica | quem chegar atrasado ainda vê o fim; o Repetir refaz |

Na Produto a sequência espera mais 3,6 s (4 s parada ao todo): quem opera é o visitante, e o convite das teclas tem a
vez antes. Na Silenciosa não há sequência: as três etapas estão sempre na tela. Os tempos são `TEMPOS`, em `comum.js`.

O atalho de verdade não anima nada: a tecla da página acende enquanto a do teclado está embaixo e o resultado troca na
hora (ação de teclado não ganha animação). Com "menos movimento" não há sequência em variante nenhuma: a tela grande
mostra o resultado e as três etapas aparecem paradas, lado a lado.

## Os arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página: o topo da landing, o palco, a seção vizinha (para julgar com a página em volta), o seletor, o alternador de dados e a ficha. |
| `seletor.css`, `seletor.js` | O seletor de `PICKER.md`, sem mexer, mais o alternador de dados e a ficha. Não usam os tokens da Veio de propósito: são moldura. |
| `conteudo.js` | Os dados que as variantes escrevem: os três conjuntos e os planos da câmera de cada captura. |
| `comum.js`, `base.css` | O que as quatro dividem: escrever os dados, a demonstração em etapas, os quadros parados, o comando. |
| `silenciosa.*`, `editorial.*`, `cinema.*`, `produto.*` | Uma variante por par de arquivos. O comentário no alto de cada `.css` diz o que nela se mexe. |
