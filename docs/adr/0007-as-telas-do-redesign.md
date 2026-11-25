# The screens of the redesign: the variant chosen for each, the ones dropped, and the rules the code does not say

Each screen was prototyped in several variants (the prototypes stay in `docs/design/`, opened with `?variant=`) and the owner chose one. This record keeps the choice, what lost, and the rules that no code or test confesses.

| Screen | Chosen | Dropped |
|---|---|---|
| Popup | A, Cockpit: everything in one stack | B, Abas; C, Feed |
| Overlay | M1, a mix of the two round-one favorites: a gold line under the captured text (D, Veio), with the floating pill as the reserve (C, Pílula) | A, Doca; B, Canto; the other round-two mixes M2 and M3 |
| Minerar de uma foto | C, Fotos × frases: the queue of photos beside the Frases grouped by photo | A, Fiel (the old page with a sidebar); B, Fluxo (one column) |
| Painel shell | B, Ilhas: sidebar and content as two floating panels | A, Plana; C, Editorial |
| Frases | A, Cartões: one card per Frase under date headers | B, Planilha (dense rows lose the Contexto, and the actions menu costs a click on Copiar); C, Leitor (two notions, open and selected, and a dock that covers the pagination) |
| Conexão com o Anki | C, Por idioma: the Idioma is the axis, with a list × detail layout; the image-source card of the period comes from A | A, Quadro; B, Relatório |
| Configurações | C, resumo primeiro: each card closed on a one-line state, opening in place | A, Pilha; B, Rótulo à esquerda |
| Boas-vindas | C, a page of its own, one step at a time, value first | A, empty states that teach; B, a checklist on top of Frases |

**Rules that stay with the choices.**

- The Painel is a single page. Changing area swaps the view and never reloads, so the sync and the follow-up of an Envio do not restart. Minerar de uma foto is not in the sidebar: it is reached from Minerar frases → Foto.
- The popup has no subtitle (the descriptive sentence belongs to Boas-vindas and to the store), and a successful mining in the popup shows no toast: the Frase appears at the top of the list, so the change is already on screen. A failure keeps the text in the field.
- The Mineração automática switch lives in two places on purpose, the popup and a step of Boas-vindas. In both, with the Conexão com o Anki off, it can be turned on with an honest status: it says nothing is mined that way, because the automatic miner needs the Vocabulário to know which word is new.
- The "Configuração pela metade" reminder is hidden for good by Ocultar, in both places it shows, and Configurações has no entry to reopen Boas-vindas, since everything the page configures already lives there.
- The Frase mined for the first Envio of Boas-vindas is not marked as sent: the daily Envio sends it again and the Conexão recognizes the duplicate. A duplicate counts as sent and offers no Abrir no Anki.
- The overlay failure disappears by itself after about 3.5 s, like the success, and Esc closes it earlier. It has no × and no Tentar de novo (the owner reviewed the first build side by side with the prototype and asked for the slimmer pill).
- In Minerar de uma foto, Cancelar keeps the Frases of the photos already read; Recomeçar joins Trocar Foto and Limpar Lista and asks to confirm when there are Frases not yet mined; the retry is only for the photo that failed (the owner's request); the Gemini key leaves the page and lives in Configurações.
- In the Frases list the actions of a card show only on hover or focus, and Selecionar página replaces the old Pág. and Todas buttons; Selecionar todas follows the active filters.
- In Configurações, a repeated shortcut is refused with a warning on its row, and one Restaurar atalhos padrão returns every shortcut to the factory default (there is no reset per shortcut). A saved Gemini key shows as a masked summary with Trocar chave. A sync problem shows in the Conta & sync card and on the sidebar chip, with no banner in the other areas.
- In the Conexão com o Anki area, entering never asks the Conexão to open the Anki; with the Conexão off the tabs show the last data, marked as such.
