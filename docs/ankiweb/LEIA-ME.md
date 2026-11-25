# A página da Conexão com o Anki no AnkiWeb

`pagina.html` é o corpo da página, pronto para colar. O resto é o formulário de upload em <https://ankiweb.net/shared/addons/>, campo a campo:

| Campo | Valor |
|---|---|
| Título | `PerpetualMiner · Cartões de frases com IA` |
| Description | o conteúdo de `pagina.html` |
| Support Page | `https://github.com/vinicius928e8r84/PerpetualMiner/issues` (confira que abre sem login antes de a página ir ao ar) |
| Tags | `english`, `russian`, `mining` |
| Versions | de 2.1.50 a 26.09; Tested Up To: 26.09 |
| License | AGPL-3.0 |
| Fotos | o Cartão iniciante, o Cartão de russo e o painel, tiradas do Anki e do painel reais, com frases de exemplo |
| Arquivo | `conexao/perpetualminer.ankiaddon`, de um commit verde |

Depois de cada upload, refaça o arquivo com o `mod` que o AnkiWeb deu à página, sem subir de novo, e commite direto na main:

```bash
python3 complemento/empacotar.py --mod-do-ankiweb conexao/perpetualminer.ankiaddon
```

O porquê e o resto da decisão estão no ADR 0018 (`docs/adr/0018-ankiweb-com-atualizacao-automatica-ligada.md`).
