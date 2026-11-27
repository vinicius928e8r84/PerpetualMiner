# Preview do front

O site que o Vercel publica, para olhar a mudança visual sem instalar nada. O Vercel publica a `main`
e as branches `vitrine/*`; a pull request de uma branch `vitrine/<nome>` recebe uma URL própria,
comentada pelo bot do Vercel no PR. As outras branches não criam deployment (veja Limite, abaixo).

| Arquivo | O que é |
|---|---|
| `montar.mjs` | Monta `preview/dist` a partir do repo: as telas da extensão, a vitrine da Base Veio e os protótipos de `docs/design`. Node puro, sem dependência. |
| `chrome-simulado.js` | O `chrome.*` de mentira que as cópias das telas carregam no preview, com dados de exemplo. |
| `site/` | A página pública do app: `sobre.html` (a página inicial, em `/sobre/`) e `site.css`. HTML estático da Veio, sem script nem fonte de fora. É o que a tela de consentimento OAuth do Google pede como "página inicial"; o "link da política de privacidade" é o de `perpetualminer.com/privacidade/`, que mora em `vinicius928e8r84/perpetualminer-site`. Mudou o que a extensão ou a Conexão fazem com os dados? Abra a PR da política naquele repositório e ponha o link na linha `Política:` do corpo da PR daqui (ou `sem mudança: <motivo>`); o passo "Política do site" de `.github/workflows/regras.yml` cobra quando a PR muda um sinal de dados. |
| `ignorar-build.sh` | O `ignoreCommand` do `vercel.json`: o Vercel pula o build quando o diff não toca nada do que o preview mostra. |
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
palavra-chave e duas já enviadas ao Anki), o Auto Miner com contagem do dia, o atalho `Alt + S` e a
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

O `ignoreCommand` do `vercel.json` roda `preview/ignorar-build.sh`: compara o commit com o último
deploy bem-sucedido da branch (`VERCEL_GIT_PREVIOUS_SHA`) ou, no primeiro deploy da branch, com o
ancestral comum com a main, e pula o build quando nada mudou nos caminhos que o preview mostra (as
telas da raiz, `manifest.json`, `lib/`, `veio/`, `popup/`, `painel/`, `conexao/`, `docs/design/`, `e2e/vitrine/`, `preview/` e
`vercel.json`). Qualquer dúvida (sem a main, commit fora do clone raso) constrói. A integração Git
continua ligada e não há segredo nenhum. `scripts/ci/test_ignorar_build_da_vitrine.js` falha quando o
preview passa a mostrar um arquivo que a lista do script não pega.

Limite: a documentação do Vercel diz que o build cancelado pelo `ignoreCommand` ainda conta como
deployment para o limite de 100 por dia do plano Hobby, e passado o limite o status `Vercel` de cada
PR fica vermelho (`Deployment rate limited`). Por isso o `git.deploymentEnabled` do `vercel.json`
só deixa criar deployment na `main` e nas branches `vitrine/**`; nas outras o Vercel nem começa, e
o `ignoreCommand` só decide, nessas duas, se vale construir. Quer o preview de uma mudança visual?
Abra a PR de uma branch `vitrine/<nome>`.
