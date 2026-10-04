# Overlay in-page (`content.js`): M1 “D com reserva C”

Resolução do ticket [Protótipo: Overlay in-page (content.js)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/8) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Herda a identidade [Veio](../identidade-veio/README.md) e as decisões da [auditoria](../auditoria/README.md) (O1–O9, Q12).

- Protótipo: [`prototipo-overlay.html`](prototipo-overlay.html). Abra direto no navegador. `?variant=M1` é a escolhida; `M2`, `M3`, `C`, `D` e `H` (hoje) ficam de referência. As setas ← → trocam a variante; **▶ Player tocando** simula a legenda trocando e a mineração automática minerando sozinha; **Simular: sem retângulo** força a reserva.
- Rodada 1 (A Doca, B Canto, C Pílula, D Veio) está no commit `9a5c4e8`. O dono gostou de C e D; a rodada 2 misturou as duas.
- **Cópia:** o texto vale pelo catálogo da [Voz](../voz/README.md) (MIN-01…10, ver [Microcopy](#microcopy)). Onde o protótipo mostra texto antigo (“Auto Miner”, `keyword:`, `nova:`), vale esta spec.

## Decisão

**M1 · D com reserva C.** Uma regra só: *o feedback marca o texto onde ele está; quando não dá pra marcar, o botão fala.*

1. **Marca (D):** uma linha ouro de 3 px sob o texto capturado (legenda ou seleção), a **palavra grifada** (faixa `kw-bg` de 50% a 94% da linha, como na identidade) e um chip curto acima: ícone · título · `auto: …` / `palavra: …` em mono · meta (`EN`, `RU 9/15`, `Web`). `auto:` é a palavra detectada; `palavra:` é a que você escolheu. Como Alt+S, seleção e mineração automática detectam a palavra sozinhos, o overlay mostra `auto:` na prática; os rótulos são os mesmos do Painel.
2. **Reserva (C):** se não há retângulo do texto, se a legenda já trocou ou se foi falha, o botão flutuante estica pra esquerda e vira pílula: ícone · título · 1 linha da frase com a palavra grifada · meta. Depois encolhe de volta pro círculo. Sem vídeo (seleção numa página comum), a pílula surge no canto inferior direito e some por inteiro.
3. **Mineração automática:** a mesma linha e o mesmo grifo, **mais apagados**, com o chip `auto: …` e o contador na meta.

## Regras do componente

- **Tokens escuros sempre** e Shadow DOM, porque o overlay vive sobre sites de terceiros. Nada é injetado no DOM do site: a linha e o grifo são elementos do overlay posicionados sobre o texto.
- **Botão:** o azulejo Veio num círculo de 46 px; `<button>` com `aria-label` MIN-07 “Minerar legenda (Alt+S)” (com o atalho gravável atual no lugar de Alt+S) e o rótulo visível ao passar o mouse.
- **Contador da mineração automática:** pílula ouro mono `n/limite` no canto do botão. É o contador **do idioma daquela captura**, não a soma do badge da toolbar (o badge soma os idiomas ligados). No limite vira contorno ouro. Some com a mineração automática desligada para esse idioma.
- **Uma instância por vez:** uma captura nova substitui a anterior. **Sucesso** some em ~3,5 s. ~~**Falha** fica até você fechar (×), apertar Esc ou a próxima captura substituí-la.~~ (revisto no PR #66, abaixo: a falha some sozinha em ~3,5 s; o Esc fecha antes.) Transições ≤ 150 ms. Com `prefers-reduced-motion`, sem animação.
- **A linha só existe enquanto o mesmo texto está na tela.** Se a legenda troca, a linha some na hora; se já tinha trocado quando a resposta chegou, vai direto pra pílula.
- **A pílula nunca corta a palavra grifada:** se a frase é longa, a prévia começa perto dela (“…saying it’s your **responsibility**.”).
- **Falha vira mensagem** (pílula com ícone `danger`), no lugar da borda vermelha muda de hoje. ~~A falha ao salvar (MIN-03) traz o botão “Tentar de novo”.~~ (revisto no PR #66, abaixo: sem “Tentar de novo”.)
- `role="status"` / `aria-live="polite"` no conteúdo do feedback.

## Revisão do dono na construção (PR #66)

O dono comparou as telas lado a lado com o protótipo e pediu a pílula mais mínima e mais perto dele. Isto vale sobre o que está acima:

- **Botão:** 46 px, no canto do protótipo, um pouco mais para cima e para a direita (16 px da direita, 96 px de baixo), meio apagado parado e inteiro com o mouse, o foco ou a pílula aberta. ~~Sem rótulo visível ao passar o mouse~~ — revisto no PR #72: com o mouse ou o foco do teclado, volta a etiqueta do protótipo à esquerda do botão (“Minerar legenda” com o atalho gravado num `kbd` e, com a mineração automática ligada, o contador em palavras, MIN-11). Com a pílula aberta ela não aparece.
- **Pílula do tamanho do protótipo:** 46 px de altura, título e 2ª linha em 12,5 px, ícone de 30 px, texto até 240 px; a prévia de uma frase longa começa perto da Palavra, como no protótipo.
- **Título sem o idioma:** o idioma já está na meta. MIN-02 é a mesma pílula de sucesso, só sem “e copiada”: o que importa é ter minerado.
- **Meta como no protótipo:**
  - `EN`/`RU` na legenda;
  - `Web` na seleção;
  - `RU 5/20` na mineração automática, que tem o título só “Mineração automática”.
- **Seleção sem vídeo:** a pílula livre traz a marca Veio na ponta.
- **Falha como no protótipo:**
  - título e dica (“Nenhuma legenda na tela” / “Esta página não tem vídeo com legenda.”);
  - sem × e sem “Tentar de novo”;
  - some sozinha em ~3,5 s, como o sucesso. O Esc fecha antes.
- **Sem a linha “{Título} · {Detalhe}”** no MIN-01.

## Por que a linha é viável (e onde não é)

Todo caminho de mineração do `content.js` lê a legenda **de um elemento do DOM**: achou o texto, achou o elemento, e o elemento tem retângulo. O grifo por palavra usa `Range.getClientRects()`. Verificado lendo o código, não ao vivo nos sites.

| Caso | Resultado |
|---|---|
| Netflix `.player-timedtext-text-container` · YouTube `.ytp-caption-segment` · Kinopoisk `[data-tid=Subtitles]` · HBO Max (seletores caption/subtitle) · Prime `.atvwebplayersdk-captions-text` | linha + grifo |
| Seleção numa página comum (`getSelection().getRangeAt(0)`) | linha + grifo |
| Tela cheia · player em iframe (`all_frames: true`) | linha + grifo (o overlay vive no container do player, como o botão hoje) |
| Legenda trocou antes do feedback (mineração automática: 650 ms estável + resposta) | reserva: pílula |
| Fallback heurístico (varredura do Prime, `minerarLegendaVisual`) | linha **só** se o texto do elemento bater com o salvo; senão, pílula |
| Seleção em `<input>`/`<textarea>`, visualizador de PDF, Google Docs | reserva: pílula |
| Legenda desenhada como imagem/canvas | o miner já não lê hoje; não é caso novo |

## A palavra grifada é revestimento, não função nova

O dado já chega ao `content.js` (ou está a uma resposta de distância). O overlay só passa a mostrá-lo:

- **Mineração automática:** a resposta de `AUTO_MINER_CANDIDATE` já traz `evaluation.keywords`, as palavras **novas** (i+1) que fizeram a frase ser aceita (`background.js:774`, `:801`, `:809`). Hoje o `content.js` ignora.
- **Alt+S / seleção:** `SALVAR_HISTORICO` já responde `{ok, frase}` com `frase.keywords`, a palavra detectada (`auto:`) que o painel mostra (`background.js:130`, `:179`). Hoje ninguém escuta a resposta.
- O formato é `palavra@índice` (`candidatesToKeywords`, `background.js:389`), com grupos separados por `|`. Isso dá a posição exata na frase e funciona em cirílico.

Escutar a resposta também deixa o feedback **honesto**: hoje ele diz “salvo” antes de saber (a auditoria o marcou como *otimista*).

## Notas para a construção (fora deste mapa)

- O scraping passa a devolver `{texto, elemento}` em vez de só o texto. Muda o retorno, não o comportamento.
- `content.js` passa um callback no `sendMessage` de `SALVAR_HISTORICO` e usa `ok`/`frase.keywords` no feedback. A mineração automática usa o `response` que já recebe.
- O posicionamento é um snapshot do retângulo no momento da resposta, relativo ao container do player. A linha é removida quando o texto do elemento muda (o poll de 700 ms da mineração automática já observa isso).
- Os bugs da auditoria continuam em [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9): o badge soma EN+RU, falta escape no `innerHTML` e o `postMessage` não checa a origem.

## Microcopy

É a do catálogo da [Voz](../voz/README.md), seção “Minerar na página”. Onde aparece “Inglês”, entra o idioma da captura; onde aparece Alt+S, o atalho gravado.

| ID | onde | texto |
|---|---|---|
| MIN-07 | `aria-label` e rótulo do botão flutuante | Minerar legenda (Alt+S) |
| MIN-01 | Alt+S / botão: minerou e copiou | Frase minerada e copiada (2ª linha a frase; meta `EN`) |
| MIN-02 | minerou, mas não copiou | Frase minerada (a mesma pílula de sucesso) |
| MIN-03 | falhou ao salvar | Não deu para minerar / Tente de novo. |
| MIN-04 | nenhuma legenda na tela | Nenhuma legenda na tela / Ligue as legendas do player e tente de novo. |
| MIN-05 | atalho de seleção: minerou | Frase minerada (2ª linha a frase; meta `Web`) |
| MIN-06 | mineração automática minerou uma linha | Mineração automática (2ª linha a frase; meta `EN 12/20`) |
| MIN-10 | Alt+S numa página sem vídeo com legenda | Nenhuma legenda na tela / Esta página não tem vídeo com legenda. |
| `palavra:` / `auto:` | rótulo do chip (mono) | palavra: … (você escolheu) · auto: … (detectada) |

Fora do overlay, na mesma seção do catálogo: MIN-08 (menu de contexto do Chrome, “Minerar com PerpetualMiner”, sem retorno visual) e MIN-09 (tooltip do badge da toolbar, “Mineração automática: N hoje” / “Mineração automática: limite de hoje atingido”).
