# Preview do front

O site que o Vercel publica a cada push, para olhar a mudança visual sem instalar nada. A cada
pull request sai uma URL própria, comentada pelo bot do Vercel no PR.

| Arquivo | O que é |
|---|---|
| `montar.mjs` | Monta `preview/dist` a partir do repo: as telas da extensão, o vídeo simulado, a vitrine da Base Veio e os protótipos de `docs/design`. Node puro, sem dependência. |
| `chrome-simulado.js` | O `chrome.*` de mentira que as cópias das telas carregam no preview, com dados de exemplo. |
| `video-simulado.html` | Um player de mentira com uma legenda. `montar.mjs` põe nele os scripts de conteúdo do manifest, como o Chrome põe em toda página: é onde o preview mostra o overlay (o botão flutuante e, com `Alt + S`, o aviso de frase minerada). |
| `site/` | As páginas públicas do app: `sobre.html` (a landing, em `/sobre/`), `privacidade.html` (a política de privacidade, em `/privacidade/` e `/privacy/`), `site.css` e `capturas/` (as telas que a landing mostra). HTML estático da Veio, sem script, fonte nem imagem de fora. É o que a tela de consentimento OAuth do Google pede como "página inicial" e "link da política de privacidade". Mudou o que a extensão ou a Conexão fazem? Mude o texto de `sobre.html` na mesma PR; se mudou o que fazem com os dados, também `privacidade.html` e a data de "Última atualização". |
| `capturar.mjs` | Tira as imagens de `site/capturas/` das telas do preview, no Chromium do Playwright de `e2e/`. Elas vão para o Git, porque o Vercel monta o site sem navegador. |
| `dist/` | A saída. Não vai para o Git. |

## Rodar local

```bash
node preview/montar.mjs            # monta preview/dist
node preview/montar.mjs --servir   # monta e serve em http://127.0.0.1:4173
node preview/capturar.mjs          # refaz as capturas da landing (precisa de `cd e2e && npm ci && npm run setup`)
```

## As capturas da landing

A landing não desenha tela nenhuma: mostra fotos das telas de verdade, como o preview as monta. `capturar.mjs` monta o
preview numa pasta temporária, abre o vídeo simulado, o painel e o popup no Chromium e grava as imagens em
`site/capturas/`. As frases são de exemplo (nada pessoal, nenhuma série nem marca de streaming), a configuração aparece
terminada e a Conexão com o Anki aparece ligada: a saúde dela é respondida pelo exemplo de
`complemento/contrato/exemplos.json`, e nenhum outro pedido sai. Rode de novo quando uma dessas telas mudar e confira
as imagens antes do commit; `node test_preview.js` falha se a landing pedir uma imagem que não existe ou deixar uma sem uso.

## O que o preview mostra, e o que ele não mostra

As páginas da extensão só rodam dentro do Chrome, com as APIs da extensão. Fora dele elas
quebrariam na primeira chamada de `chrome.*` e não mostrariam nada. Por isso o preview injeta
`chrome-simulado.js` **nas cópias** dentro de `dist/` — os arquivos da extensão não mudam — com
um armazenamento de mentira já semeado: seis frases de exemplo (inglês e russo, com fonte,
palavra-chave e uma já exportada), o Auto Miner com contagem do dia, o atalho `Alt + S` e a
configuração da Boas-vindas pela metade (o lembrete ONB-14 no popup e ONB-15 em Frases).

O preview mostra:

- o visual de verdade das telas, com conteúdo plausível, inclusive as listas e os estados cheios;
- o overlay sobre um vídeo simulado: o botão flutuante e o aviso de frase minerada (a frase não fica guardada);
- a vitrine da Base Veio e os protótipos travados, que são páginas comuns.

O preview **não** mostra:

- o ícone na barra do Chrome (só a extensão carregada no navegador mostra);
- login, sincronização, envio ao Anki, gravação de atalho e a Conexão com o Anki:
  tudo isso depende do Chrome ou de um serviço na máquina, e aparece desligado ou offline;
- o preview começa **deslogado** de propósito: logado, o painel buscaria as frases no Firestore
  e ficaria em "Carregando…".

Uma faixa no rodapé avisa que aquilo é preview com dados de exemplo.

## Como o Vercel monta

`vercel.json` na raiz: `node preview/montar.mjs`, saída em `preview/dist`, sem instalação de
dependências. Se uma branch não tiver `veio/` ou a vitrine, a capa se adapta e mostra só o que
existe naquela branch.
