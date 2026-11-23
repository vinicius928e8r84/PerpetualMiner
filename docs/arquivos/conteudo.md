# Arquivos do content script

O papel dos módulos que saíram do `content.js` para `lib/` (o que o content script lê da página). O resto da extensão está em [extensao.md](extensao.md); testes e ferramentas, em [testes-e-ferramentas.md](testes-e-ferramentas.md). Lido sob demanda, não em toda sessão.

| File | Role |
|------|------|
| `lib/contexto-do-site.js` | `ContextoDoSite.ler(host, documento)`: the Contexto of a mined caption, one table row per player; any other site is `web` |
| `lib/legenda-da-amazon.js` | `PerpetualMiner.LegendaDaAmazon.ler()`: the Prime Video caption for `content.js`: the direct selectors of the player first, then the last text in the caption strip (lower half of the video, right of the X-Ray panel) that is not interface text nor inside the player's own container; each of those is a named condition |
