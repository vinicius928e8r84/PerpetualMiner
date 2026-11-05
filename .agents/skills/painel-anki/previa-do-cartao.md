# Estilo do cartão and the Cartão preview (Ajustes de envio)

Notes for `painel-anki-estilo.js` and `painel-anki-previa.js`, moved out of `SKILL.md` (size limit). Also the Boas-vindas level step (`boas-vindas` skill).

**Estilo do cartão** (`painel-anki-estilo.js`, BRG-42, #162): a segmented control with the level (Iniciante · Intermediário · Avançado) and its text; the draft is `rascunho.nivel`, written only by Salvar ajustes. Under it
is the **Cartão preview** (`painel-anki-previa.js`, BRG-43, #164): the example Cartão of the level on screen (the draft, not only the saved one), drawn by the Anki. `PedidoAoAnki.previaDoCartao(lang, nivel)` is
`POST /anki/card-preview`; the Conexão renders the example text of `engine/estilos.json` (the same text-to-note step as the Envio) with the note type the collection has, and answers `{ front, back, css, … }` (the audio is a ▶, the
image is inside the HTML as `data:`). The page shows it in an `iframe` with `sandbox="allow-same-origin"` (no scripts) and a `Content-Security-Policy` that only lets `data:` in; Frente · Verso is the face (Verso carries the
front on top, as the Anki after “Mostrar resposta”). One request per style per page (`lidas`), shared by the Ajustes card and the Boas-vindas step; only a good answer stays cached. 503 or no answer is “a prévia aparece
com a Conexão com o Anki ligada” (Tentar de novo), 404 is an older Conexão (“Atualize a Conexão com o Anki…”, no retry), anything else “Não deu para montar a prévia”. The same component and the same control are the
Boas-vindas level step (see the `boas-vindas` skill). Tests: `painel-ajustes-estilo.spec.js`, `boas-vindas-nivel.spec.js`; visual proposals (`test.fixme`): `painel-ajustes-estilo-visual.spec.js`, `boas-vindas-nivel-visual.spec.js`.
