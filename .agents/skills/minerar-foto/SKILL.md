---
name: minerar-foto
description: "Use when changing or reviewing Minerar de uma foto (`bookreader.html/js/css`). Reviewers: open it when the PR touches that surface. It holds the architecture notes moved out of CLAUDE.md for it (what it shows, the IDs it implements, its storage and its tests)."
---

# Minerar de uma foto

Notes moved unchanged from `CLAUDE.md` § Architecture. `CLAUDE.md` keeps the file table and the rules that cross surfaces.

### Minerar de uma foto (`bookreader.*`, docs/design/foto/, variant C)

Two columns under a top bar (Veio mark, FOT-01 name, the **Livro** field and “Voltar ao painel”). Left, the photo
queue: the drop area (the whole page takes a drop; “Escolher” opens the picker), the progress (FOT-20, counting
neither the preview nor the cancelled photos) and Cancelar while reading,
and one card per photo with its thumbnail and status (FOT-19: Pronta · Na fila · Lendo… · N frases · Sem marcações ·
Falhou + the cause and Tentar de novo · Cancelada), with the “Marcações que o Gemini lê” legend (FOT-24) at the foot. Right, the phrases grouped by
photo (“Foto N · name”), with the single “Selecionar todas” checkbox (mixed with part marked), the count (FOT-09) and
the sticky “Minerar N frases” (FOT-12; nothing marked → disabled with FOT-13). One photo stops at the preview
(FOT-03, “Ler marcações”); several go straight to reading, one at a time, in order. Each phrase is editable in place
(a `role="textbox"` named PAI-33.campo); its checkbox is named by the phrase.

The page only states what it confirmed. A reading that worked with nothing marked is “Sem marcações” and the FOT-10
empty state; a failed API call is “Falhou” with FOT-11's cause (429 → limit, 401/403/“API key” → key, with “Abrir
Configurações”, no network → network, else GLB-01) — it never blames the markings. As in the prototype, failures are
said once: with phrases on screen, one aviso for all failed photos (the danger icon, “Não deu para ler a foto 2.” or
“…3 fotos.” in bold and the first one's cause on one line), rebuilt only when another photo fails, so once closed it
does not come back with a photo that was read; with no phrase, the phrases column itself is the failure
(FOT-11.titulo “Não deu para ler a foto / as fotos”, the cause, “Abrir Configurações” for a refused key) and there is
no aviso. By the owner's call on this page, a reading failure has no “Detalhes” (an exception to V3): the cause is
already in the person's terms. A 200 with no text (a blocked request, a cut-off answer) is a failure too: only the
`NENHUM_TRECHO` sentinel means “Sem marcações”, and FOT-10 (its title singular or plural by the photos read, in bold
over the how-to-mark text) shows only when no photo failed. The formats (FOT-02) sit at the end of the “Fotos” title
row until the first photo, so the drop area keeps its height. A mined phrase shows the `--ok` selo “Minerada”, its checkbox is disabled and it leaves the button, so a second
click or a new photo never saves it twice; the click is ignored while a save is in flight. All saved → toast FOT-14;
part or none → aviso FOT-15/16 whose “Tentar de novo” mines again exactly the phrases that failed. Photo status changes are announced (the queue is a polite live region).

Formats: the picker's `accept` and the check take JPG, PNG, WEBP and HEIC — exactly what FOT-02 announces — by type or, with no type (HEIC on
Windows), by extension, and send Gemini the real MIME type; a file that is not a photo gets the FOT-04 aviso. A HEIC
thumbnail Chrome cannot draw falls back to the photo icon. The key lives only in Configurações: with none, the FOT-05
card, whose button (like the key-refused aviso) opens `painel.html#configuracoes/chave`, and a key saved there frees
the page through `chrome.storage.onChanged`. “Voltar ao painel” and that button focus the panel tab already open
(any hash), moving it to the address when there is one, and only open a new tab when there is none. A panel already
at that address gets no `hashchange`, so the page sends `PAINEL_REAPLICAR_ENDERECO` and `painel-shell.js` applies the
address again (focusing the key field).

**Cancelar** (FOT-06, in the “Fotos” title row while a photo is being read or waits in the queue) abandons the
Gemini request in flight (`AbortController`, and whatever still arrives is dropped), marks the photo being read
and the queued ones **Cancelada** and keeps the phrases of the photos already read; FOT-21 says so as an info
aviso over the phrases (with the Base's `info` icon), or, when no photo was read, the phrases column itself says
“Leitura cancelada” (`FOT-21.titulo`, no period, as in the prototype) and “Nenhuma foto chegou a ser lida.”
(`FOT-21.nenhumaLida`, the prototype's copy). Focus goes to Escolher.
**Recomeçar** (FOT-17: in the list header, the preview and the failed / no-marking / cancelled empties) clears
the photos, the phrases and the avisos — and abandons the reading in flight, so no phantom phrase arrives later
(bug of #9); the Livro stays. With phrases not yet mined (checked or not) it first asks in the Veio modal FOT-18
(Cancelar is the safe focus; by the owner's call its Descartar is the outline `--perigo`, as in the prototype —
the one exception to the danger rule in the `veio-componentes` skill, through `confirmarComContorno`). A failed photo's card has **Tentar de novo** (FOT-19), which puts only that photo
back in the queue; focus stays on its card. Below 820 px, “Minerar N frases” becomes a bar at the foot of the
phrases column (the page background, a top border), so it never floats over the phrase cards.
