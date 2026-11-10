# Protótipo: a chamada e o Como funciona com GSAP

Mais quatro variantes da chamada (hero) e do bloco "Como funciona" da nova landing, atrás de um seletor, para o dono
escolher olhando e mexendo. Todas partem da variante Produto de `../hero/` (a tela da extensão primeiro, operada por
quem visita, com o Alt+S de verdade) e mudam uma coisa só: o movimento, feito com GSAP e pensado como motion design.
Feito pela skill `emil-prototype`; o seletor é o de `PICKER.md`, copiado sem mexer.

Protótipo não é produção: `/sobre/` não pede nada desta pasta (`node test_preview.js` confere). Escolhida a variante,
ela vai para `preview/site/` nas convenções de lá, e esta pasta é apagada.

## Abrir

```bash
node preview/montar.mjs --servir   # http://127.0.0.1:4173/prototipos/hero-gsap/
```

No Vercel, a capa do preview leva a `/prototipos/hero-gsap/`.

| Tecla | O que faz |
|---|---|
| `1` a `4`, `←` `→` | troca de variante (a escolha fica no endereço, `?v=2`) |
| `R` | remonta a variante, para a demonstração voltar ao repouso |
| `Alt` + `S` | o atalho de verdade: minera a legenda da demonstração, na hora |

O alternador cinza acima do seletor troca os dados (skill `break-ui`): **Demo data** é o texto de hoje da landing,
**Worst case** é o pior caso realista (título reescrito mais longo, atalho de quatro teclas, legenda em russo com
palavras de vinte letras, uma captura em pé e outra que não carrega) e **Short** é o outro extremo. `?data=worst`.
"Sobre esta variante", no canto, diz o eixo de cada uma, o que se mexe, o que não, e o que custa.

## As variantes

Cada uma tem um eixo de motion design e uma linha do tempo com nome. O texto e as telas são os mesmos nas quatro.

| Variante | Eixo | O que é do GSAP | Quando é a certa | Custo |
|---|---|---|---|---|
| Maestro | o tempo na mão de quem vê | a linha do tempo com rótulos: tocar, pausar, arrastar até o quadro (`pm-demo`); as abas levam a linha `pm-como` até o rótulo do passo | a pessoa precisa de tempo: quem não viu, volta o quadro | mais um controle na tela; o Como funciona esconde dois dos três passos |
| Flip | a continuidade: a frase é um objeto só | o plugin Flip: a frase sai da legenda e pousa no histórico; no Como funciona ela vira o cartão sem corte | o que se quer explicar é o caminho da frase, da legenda ao cartão | no Como funciona a frase e o cartão são desenhados, e as telas de verdade ficam pequenas |
| Diretor | a rolagem dirige | o plugin ScrollTrigger: a cena presa (`pin`) e a linha `pm-rolagem` andando com a rolagem (`scrub`), só no Como funciona | a página é lida rolando, sem clicar em nada | a página fica 2,2 telas mais comprida; é a mais pesada das quatro |
| Cinética | a personalidade: a tecla é a personagem | só o núcleo: a mola da Veio nas teclas, a frase chegando palavra por palavra, os títulos dos passos (`pm-passo-1` a `3`) | o Alt+S tem de ficar na memória | a mais expressiva; a mola e a onda de palavras cansam se aparecerem em mais lugares |

A chamada e o Como funciona de cada variante são blocos separados: dá para promover a chamada de uma com o Como
funciona de outra.

## A demonstração do Alt+S

É a linha do tempo `pm-demo`, com três rótulos: `antes` (0 s), `tecla` (2,6 s) e `resultado` (4,0 s). A legenda diz em
que etapa ela está ("2/3 Você aperta Alt+S.") e o Repetir, sempre à vista, leva a mesma linha de volta ao primeiro
quadro. Ela só toca sozinha com a demonstração parada diante da pessoa: 60% dela na tela, nenhuma rolagem há 0,4 s, a
aba à vista, e mais 3,6 s de espera, porque quem opera é o visitante e o convite das teclas tem a vez antes. Saiu da
tela no meio, volta ao começo e espera de novo. Termina no resultado e fica nele.

| Etapa | Dura | Por quê |
|---|---|---|
| 1 · antes: a legenda na tela | 2,6 s | achar a legenda no vídeo (~1 s) e ler as 5 palavras da legenda da etapa (~1,3 s), com folga |
| 2 · tecla: as teclas grandes acesas no meio da captura | 1,4 s | notar o destaque (~0,5 s) e ler "Você aperta Alt+S." (~0,8 s); a tecla desce 0,16 s antes do fim |
| 3 · resultado: a frase minerada, com o anel de ouro (0,9 s) | fica | quem chegar atrasado ainda vê o fim; o Repetir refaz |

O atalho de verdade não anima nada: a tecla da página acende enquanto a do teclado está embaixo e a linha vai para o
fim na hora (ação de teclado não ganha animação). O toque nas teclas toca só o trecho do resultado. Os tempos são
`TEMPOS`, em `variante.js`; o quadro a quadro de cada variante está no relatório do protótipo.

## As regras do movimento

- **Só `transform` e `opacity` se mexem.** Nada de desfoque, de altura, de layout. O GSAP escreve `visibility` junto
  com a opacidade zero, e mais nada. A janela de ouro das abas e as máscaras das palavras são recortes parados.
- **`will-change` só enquanto toca.** Entra quando a linha começa e sai no fim, com
  `gsap.set(…, { clearProps: 'willChange' })`. As entradas de uma vez só (os passos da Cinética, os voos do Flip) não
  deixam nada escrito no elemento.
- **Com "menos movimento" nada anima.** Tudo nasce dentro de `gsap.matchMedia()`: a linha fica com os rótulos e
  nenhum movimento, as três etapas aparecem paradas e legíveis, lado a lado, e o Repetir passa por elas em cortes
  secos, no mesmo tempo. Nada fica preso, nada toca sozinho, e o Alt+S continua minerando.
- **Nada do GSAP toca enquanto a página carrega.** Ele roda na thread da página, que na carga está ocupada: tudo
  começa com a página parada diante da pessoa, com um toque, ou com a rolagem. A resposta ao toque (150 ms) e o
  convite das teclas continuam em CSS, fora da thread da página.
- **As curvas e os tempos são os tokens.** `--veio-curva-saida` para o que entra, `--site-curva-vaivem` para o que
  já está na tela e se move, `--veio-curva-mola` para a tecla da Cinética. `variante.js` lê a curva do CSS e a entrega
  ao GSAP: não há curva nova, nem o plugin CustomEase.

## O GSAP

Está copiado em `gsap/`, sem mudar um byte, com o texto da licença ao lado (`gsap/LICENCA-GSAP.txt`). A página não
pede nada de fora do site.

| Arquivo | Versão | Tamanho | Com gzip | Quem usa |
|---|---|---|---|---|
| `gsap.min.js` | 3.15.1 | 73,4 KB | 28,5 KB | as quatro |
| `ScrollTrigger.min.js` | 3.15.1 | 44,7 KB | 18,0 KB | só a Diretor |
| `Flip.min.js` | 3.15.1 | 25,6 KB | 9,7 KB | só a Flip |

Promovida sozinha, cada variante leva o núcleo e só o plugin dela: Maestro e Cinética 28,5 KB, Flip 38,2 KB, Diretor
46,5 KB (com gzip). A licença ("Standard no charge", da Webflow) permite uso comercial gratuito; a obrigação é não
remover os avisos de autoria dos arquivos, e é proibido usar o GSAP numa ferramenta de construir animações sem código
que concorra com a da Webflow. O resumo e o texto inteiro estão em `gsap/LICENCA-GSAP.txt`.

## Os arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página: o topo da landing, o palco, a seção vizinha (para julgar com a página em volta), o seletor, o alternador de dados e a ficha. |
| `gsap/` | O GSAP copiado (o núcleo e os dois plugins) e a licença. |
| `seletor.css`, `seletor.js` | O seletor de `PICKER.md`, sem mexer, mais o alternador de dados e a ficha. Não usam os tokens da Veio de propósito: são moldura. |
| `conteudo.js` | Os dados que as variantes escrevem: os três conjuntos e os planos da câmera de cada captura. São os de `../hero/`, sem mudar um texto. |
| `comum.js`, `base.css` | O que as quatro escrevem do mesmo jeito: os dados como HTML e a chamada, com a demonstração. |
| `variante.js`, `como.css` | O que as quatro movem do mesmo jeito (a linha `pm-demo`, as curvas dos tokens, as abas) e o que dividem no Como funciona (as abas, os passos empilhados, a janela de cada passo). |
| `maestro.*`, `flip.*`, `diretor.*`, `cinetica.*` | Uma variante por par de arquivos. O comentário no alto de cada um diz o que nela se mexe. |
