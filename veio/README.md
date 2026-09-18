# Base Veio

A identidade compartilhada por todas as páginas da extensão. A spec travada está em
[`docs/design/identidade-veio/`](../docs/design/identidade-veio/README.md), variante F.

| Caminho | O que é |
|---|---|
| `tokens.css` | O único arquivo de tokens: cor, tipo, raio e movimento, mais as fontes empacotadas, a marca (cristal, nome e cursor) e a base de acessibilidade (foco visível e movimento reduzido). Toda página o inclui antes do CSS dela. |
| `fontes/*.woff2` | Manrope e JetBrains Mono, subsets latin + cyrillic. Nada vem do Google Fonts em runtime. |
| `icones/` | A marca: `icone.svg` e os PNG 16/32/48/128 que o manifest usa na toolbar. |

## Como usar

```html
<link rel="stylesheet" href="veio/tokens.css">
<link rel="stylesheet" href="painel.css">
```

- **Cor nova não se escreve fora daqui.** Se falta um valor, ele entra como token, com o nome da
  tabela da spec. As exceções são duas, as duas por não haver CSS para ler:
  - `icones/icone.svg`: um SVG servido como imagem não lê variáveis CSS, então as cores do
    cristal ficam escritas nele, iguais às do asset da spec.
  - `BADGE_COR_DE_FUNDO` / `BADGE_COR_DO_TEXTO` em `background.js`: o badge da toolbar é
    desenhado pelo Chrome, e `chrome.action.setBadgeBackgroundColor` / `setBadgeTextColor` só
    aceitam a cor escrita. São cópias de `--veio-accent` e `--veio-accent-ink`, e andam juntas:
    mudar um dos dois tokens aqui pede mudar a cópia lá, senão o contraste de 10,4:1 se perde.
- **Tamanho, raio e duração novos também entram como token.** A exceção é a imitação do badge
  da toolbar na vitrine (`.icone-com-badge b`): o tamanho da letra e o raio dela são os que o
  Chrome desenha, não da Veio, e ficam escritos lá.
- **Tema:** o escuro é o padrão. O claro entra com `data-tema="claro"`, no `<html>` ou num trecho
  qualquer (é assim que a vitrine mostra os dois lado a lado). O seletor de tema é outro ticket.
- **Marca:** `<img class="veio-marca" src="veio/icones/icone.svg" alt="PerpetualMiner">` e
  `<span class="veio-nome">Perpetual<b>Miner</b><span class="veio-cursor"></span></span>`.
  O cursor ouro pisca a cada 1,1 s e fica parado com `prefers-reduced-motion: reduce`.
- **Fontes:** `var(--veio-fonte-ui)` para interface e frases, `var(--veio-fonte-mono)` para número,
  contador, atalho e custo. As duas cobrem cirílico.

## Vitrine

A página que mostra os tokens, a escala de tipo, os raios e uma frase em russo nos dois temas fica
na pasta de testes, em [`e2e/vitrine/vitrine.html`](../e2e/vitrine/vitrine.html), e é servida pelo
próprio seam (`cd e2e && npm test`, ou o servidor de fixtures) para carregar os mesmos tokens e as
mesmas fontes que a extensão carrega.

## Fontes: licença

Manrope e JetBrains Mono são SIL Open Font License 1.1. Os textos das licenças estão em
`fontes/OFL-Manrope.txt` e `fontes/OFL-JetBrainsMono.txt`. Os arquivos são os subsets latin e
cyrillic publicados pelo Google Fonts (Manrope v20, JetBrains Mono v24), em formato variável: um
arquivo por subset cobre toda a escala de pesos.
