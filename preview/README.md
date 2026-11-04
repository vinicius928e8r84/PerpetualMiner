# Preview do front

O site que o Vercel publica a cada push, para olhar a mudança visual sem instalar nada. A cada
pull request sai uma URL própria, comentada pelo bot do Vercel no PR.

| Arquivo | O que é |
|---|---|
| `montar.mjs` | Monta `preview/dist` a partir do repo: as telas da extensão, a vitrine da Base Veio e os protótipos de `docs/design`. Node puro, sem dependência. |
| `chrome-simulado.js` | O `chrome.*` de mentira que as cópias das telas carregam no preview, com dados de exemplo. |
| `dist/` | A saída. Não vai para o Git. |

## Rodar local

```bash
node preview/montar.mjs            # monta preview/dist
node preview/montar.mjs --servir   # monta e serve em http://127.0.0.1:4173
```

## O que o preview mostra, e o que ele não mostra

As páginas da extensão só rodam dentro do Chrome, com as APIs da extensão. Fora dele elas
quebrariam na primeira chamada de `chrome.*` e não mostrariam nada. Por isso o preview injeta
`chrome-simulado.js` **nas cópias** dentro de `dist/` — os arquivos da extensão não mudam — com
um armazenamento de mentira já semeado: seis frases de exemplo (inglês e russo, com fonte,
palavra-chave e uma já exportada), o Auto Miner com contagem do dia, o atalho `Alt + S` e a
configuração da Boas-vindas pela metade (o lembrete ONB-14 no popup e ONB-15 em Frases).

O preview mostra:

- o visual de verdade das telas, com conteúdo plausível, inclusive as listas e os estados cheios;
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
