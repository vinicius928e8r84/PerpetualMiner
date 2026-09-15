# Overlay in-page (`content.js`): M1 “D com reserva C”

Resolução do ticket [Protótipo: Overlay in-page (content.js)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/8) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Herda a identidade [Veio](../identidade-veio/README.md) e as decisões da [auditoria](../auditoria/README.md) (O1–O9, Q12).

- Protótipo: [`prototipo-overlay.html`](prototipo-overlay.html). Abra direto no navegador. `?variant=M1` é a escolhida; `M2`, `M3`, `C`, `D` e `H` (hoje) ficam de referência. As setas ← → trocam a variante; **▶ Player tocando** simula a legenda trocando e o Auto Miner minerando sozinho; **Simular: sem retângulo** força a reserva.
- Rodada 1 (A Doca, B Canto, C Pílula, D Veio) está no commit `9a5c4e8`. O dono gostou de C e D; a rodada 2 misturou as duas.

## Decisão

**M1 · D com reserva C.** Uma regra só: *o feedback marca o texto onde ele está; quando não dá pra marcar, o botão fala.*

1. **Marca (D):** uma linha ouro de 3 px sob o texto capturado (legenda ou seleção), a **keyword grifada** por cima da palavra (faixa `kw-bg` de 50% a 94% da linha, como na identidade) e um chip curto acima: ícone · título · `keyword: …` / `nova: …` em mono · meta (`EN`, `RU 9/15`, `Web`).
2. **Reserva (C):** se não há retângulo do texto, se a legenda já trocou ou se foi falha, o botão flutuante estica pra esquerda e vira pílula: ícone · título · 1 linha da frase com a keyword grifada · meta. Depois encolhe de volta pro círculo. Sem vídeo (seleção numa página comum), a pílula surge no canto inferior direito e some por inteiro.
3. **Auto Miner:** a mesma linha e o mesmo grifo, **mais apagados**, com o chip `nova: …` e o contador na meta.

## Regras do componente

- **Tokens escuros sempre** e Shadow DOM, porque o overlay vive sobre sites de terceiros. Nada é injetado no DOM do site: a linha e o grifo são elementos do overlay posicionados sobre o texto.
- **Botão:** o azulejo Veio num círculo de 46 px; `<button>` com `aria-label` “Minerar legenda (Alt+S)” (o atalho gravável atual) e o rótulo visível ao passar o mouse.
- **Contador do Auto Miner:** pílula ouro mono `n/limite` no canto do botão. No limite vira contorno ouro. Some com o Auto Miner desligado. É o mesmo número do badge da toolbar.
- **Uma instância por vez:** uma captura nova substitui a anterior. Duração de ~3,5 s. Transições ≤ 150 ms. Com `prefers-reduced-motion`, sem animação.
- **A linha só existe enquanto o mesmo texto está na tela.** Se a legenda troca, a linha some na hora; se já tinha trocado quando a resposta chegou, vai direto pra pílula.
- **A pílula nunca corta a keyword:** se a frase é longa, a prévia começa perto dela (“…saying it’s your **responsibility**.”).
- **Falha vira mensagem** (pílula com ícone `danger`), no lugar da borda vermelha muda de hoje.
- `role="status"` / `aria-live="polite"` no conteúdo do feedback.

## Por que a linha é viável (e onde não é)

Todo caminho de mineração do `content.js` lê a legenda **de um elemento do DOM**: achou o texto, achou o elemento, e o elemento tem retângulo. O grifo por palavra usa `Range.getClientRects()`. Verificado lendo o código, não ao vivo nos sites.

| Caso | Resultado |
|---|---|
| Netflix `.player-timedtext-text-container` · YouTube `.ytp-caption-segment` · Kinopoisk `[data-tid=Subtitles]` · HBO Max (seletores caption/subtitle) · Prime `.atvwebplayersdk-captions-text` | linha + grifo |
| Seleção numa página comum (`getSelection().getRangeAt(0)`) | linha + grifo |
| Tela cheia · player em iframe (`all_frames: true`) | linha + grifo (o overlay vive no container do player, como o botão hoje) |
| Legenda trocou antes do feedback (Auto Miner: 650 ms estável + resposta) | reserva: pílula |
| Fallback heurístico (varredura do Prime, `minerarLegendaVisual`) | linha **só** se o texto do elemento bater com o salvo; senão, pílula |
| Seleção em `<input>`/`<textarea>`, visualizador de PDF, Google Docs | reserva: pílula |
| Legenda desenhada como imagem/canvas | o miner já não lê hoje; não é caso novo |

## A keyword é revestimento, não função nova

O dado já chega ao `content.js` (ou está a uma resposta de distância). O overlay só passa a mostrá-lo:

- **Auto Miner:** a resposta de `AUTO_MINER_CANDIDATE` já traz `evaluation.keywords`, as palavras **novas** (i+1) que fizeram a frase ser aceita (`background.js:774`, `:801`, `:809`). Hoje o `content.js` ignora.
- **Alt+S / seleção:** `SALVAR_HISTORICO` já responde `{ok, frase}` com `frase.keywords`, a keyword automática que o painel mostra (`background.js:130`, `:179`). Hoje ninguém escuta a resposta.
- O formato é `palavra@índice` (`candidatesToKeywords`, `background.js:389`), com grupos separados por `|`. Isso dá a posição exata na frase e funciona em cirílico.

Escutar a resposta também deixa o feedback **honesto**: hoje ele diz “salvo” antes de saber (a auditoria o marcou como *otimista*).

## Notas para a construção (fora deste mapa)

- O scraping passa a devolver `{texto, elemento}` em vez de só o texto. Muda o retorno, não o comportamento.
- `content.js` passa um callback no `sendMessage` de `SALVAR_HISTORICO` e usa `ok`/`frase.keywords` no feedback. O Auto Miner usa o `response` que já recebe.
- O posicionamento é um snapshot do retângulo no momento da resposta, relativo ao container do player. A linha é removida quando o texto do elemento muda (o poll de 700 ms do Auto Miner já observa isso).
- Os bugs da auditoria continuam em [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9): o badge soma EN+RU, falta escape no `innerHTML` e o `postMessage` não checa a origem.

## Microcopy

É provisória, e a redação final é de [Voz, tom & catálogo de mensagens/estados](https://github.com/vinicius928e8r84/PerpetualMiner/issues/4). O dono não mudou nada da proposta:

| chave | proposta |
|---|---|
| `fab_label` | Minerar legenda (+ `Alt+S`) |
| `legenda_title` | Frase minerada e copiada |
| `selecao_title` | Seleção capturada |
| `auto_title` | Auto Miner minerou |
| `kw_new` / `kw_manual` | nova / keyword |
| `erro_title` | Nenhuma legenda na tela |
| `erro_body` | Ligue as legendas do player e tente de novo. |
| `erro_web` | Esta página não tem vídeo com legenda. |
| `cnt_tip` | Auto Miner: {n} de {limite} hoje |
| `cnt_lim_tip` | Auto Miner: limite de hoje atingido ({n}/{limite}) |
