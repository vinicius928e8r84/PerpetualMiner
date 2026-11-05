# A página da Conexão com o Anki no AnkiWeb (#176)

`pagina.html` é o corpo da página, pronto para colar. O resto é o formulário de upload em
<https://ankiweb.net/shared/addons/> (“Upload”), campo a campo:

| Campo | Valor |
|---|---|
| Título | `PerpetualMiner · Cartões de frases com IA` (também o nome na lista de Complementos do Anki; PT + EN no corpo) |
| Description | o conteúdo de `pagina.html` |
| Support Page | `https://github.com/vinicius928e8r84/PerpetualMiner/issues` (confira que abre sem login **antes** de a página ir ao ar: risco 13) |
| Tags | `english`, `russian`, `mining` |
| Versions | de 2.1.50 a 26.09; “testado até” (Tested Up To): 26.09 |
| License | AGPL-3.0 (`LICENSE` na raiz) |
| Fotos | Cartão iniciante, Cartão de russo e o painel (Conexão com o Anki). Tire-as do Anki/painel reais, com frases de exemplo (nada pessoal). |
| Arquivo | `conexao/perpetualminer.ankiaddon` |

## Passo do dono (não é feito por agente)

1. Suba `conexao/perpetualminer.ankiaddon` com a conta do dono. O AnkiWeb devolve o **código** (número) da página.
2. No repositório, troque o `package` de `complemento/manifest.json` e o `codigo` de `lib/ankiweb.js` (`{ codigo: '<número>' }`) por esse número,
   e refaça o arquivo: `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon` com `SOURCE_DATE_EPOCH=<hora do upload, em segundos>`
   (o `mod` do arquivo é a hora do upload; o Anki compara com ela para oferecer atualização). Suba esse arquivo de novo em “Update”, se o AnkiWeb pedir.
3. `python3 -m unittest complemento.test_pacote` confere que o `package` do arquivo, o do manifesto e o código do painel são o mesmo número e que o `mod` é de uma hora real;
   o e2e `painel-anki-primeira-conexao` confere o código no Detalhes “O arquivo não abriu?”.

## Riscos que seguem abertos

- **Risco 8:** o piso do Anki 2.1.50 não foi testado no Mac do dono.
- **Risco 13:** o link de suporte precisa funcionar antes de a página ir ao ar.
