# Arquivos do content script

O papel dos módulos que saíram do `content.js` para `lib/` (o que o content script lê da página). O resto da extensão está em [extensao.md](extensao.md); testes e ferramentas, em [testes-e-ferramentas.md](testes-e-ferramentas.md). Lido sob demanda, não em toda sessão.

| File | Role |
|------|------|
| `lib/legenda-da-pagina.js` | `LegendaDaPagina.lerLegenda({ amazon })`: the caption on screen of the active video; a table from site to reader (YouTube, Netflix, Kinopoisk, Max, Prime Video), the selector reader and the visual reader, plus `obterVideoAtivo` and `lugarDaLegenda` |
| `lib/legenda-da-amazon.js` | `LegendaDaAmazon.ler`: the Prime Video reader: the direct caption selectors, then the position on screen (lower half of the video, right of the X-Ray, no interface text); `content.js` hands it to `LegendaDaPagina.lerLegenda({ amazon })` |
| `lib/contexto-do-site.js` | `ContextoDoSite.ler(host, documento)`: the Contexto of a mined caption, one table row per player; any other site is `web` |
