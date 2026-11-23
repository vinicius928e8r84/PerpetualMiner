# Arquivos do content script

O papel dos módulos que saíram do `content.js` para `lib/` (o que o content script lê da página). O resto da extensão está em [extensao.md](extensao.md); testes e ferramentas, em [testes-e-ferramentas.md](testes-e-ferramentas.md). Lido sob demanda, não em toda sessão.

| File | Role |
|------|------|
| `lib/contexto-do-site.js` | `ContextoDoSite.ler(host, documento)`: the Contexto of a mined caption, one table row per player; any other site is `web` |
| `lib/legenda-da-pagina.js` | `PerpetualMiner.LegendaDaPagina`: finds the active video and reads the caption on screen: `criar({ amazon }).lerLegenda()` goes through a table of site to reader (YouTube, Netflix, Kinopoisk, Max; the Prime Video reader still lives in `content.js` and comes in as `amazon`), then the generic selectors, then the visual reader (“is it over the bottom half of the video” apart from “what is this candidate worth”). A site reader answers `SEGUE` when the page has none of that site's markup, and the reading goes on; any other answer, even null, ends it (Max never falls to the generic selectors, which would match the episode name). Loaded before `content.js` |
