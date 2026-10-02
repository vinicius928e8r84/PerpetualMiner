# Painel · Frases mineradas: layout “Cartões”

Resolução do ticket [Protótipo: Painel · Frases mineradas](https://github.com/vinicius928e8r84/PerpetualMiner/issues/12) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ele herda:
- o shell [Ilhas](../shell/README.md): sidebar, cabeçalho de área e endereços;
- a identidade [Veio](../../identidade-veio/README.md), com a “linha de frase” e a barra contextual já desenhadas lá;
- os reagrupamentos da [auditoria](../../auditoria/README.md) (“Painel · shell” e “Painel · Frases & modais”). Onde a auditoria foi refinada depois, valem os nomes e lugares desta spec: **Minerar frases** (não “Adicionar frases”), **Foto** (não “Foto de livro”), **Minerar seleção** (não “Capturar seleção”) e **Exportar na barra contextual de seleção** (não no menu “Arquivo .txt”);
- a cópia do [guia de voz & catálogo](../../voz/README.md) (PAI-01…22, ADD-01…10, ENV-01…14 e ONB-15).

**Protótipo:** [`prototipo-frases.html`](prototipo-frases.html). Abra direto no navegador.
- `?variant=A` é o layout travado. `B` (Planilha) e `C` (Leitor) foram as alternativas e ficam só como registro.
- As setas ← → trocam a variante, e **T** alterna o tema.
- O painel “⚙ Estados do protótipo” simula:
  - a lista carregando e o primeiro uso;
  - a Conexão com o Anki desligada;
  - a conta ou a falta dela;
  - o envio concluído, em parte ou que não começa;
  - o arquivo .txt ilegível, vazio ou sem nada novo;
  - a nuvem falhando;
  - o trilho.

Decidido numa rodada no Lavish em 2026-09-15. O dono aceitou as 5 recomendações, sem observações.

## Decisões

| decisão | escolha |
|---|---|
| Layout | **A · Cartões.** Um cartão por frase, sob cabeçalhos de data (hoje · ontem · há 3 dias). É a “linha de frase” da spec Veio. |
| Ações por frase | **Editar texto · Editar contexto · Copiar · Apagar**, só-ícone e com tooltip. Aparecem ao passar o mouse **ou ao focar a linha** (Tab), e ficam escondidas no resto do tempo. |
| Barra contextual de seleção | Aparece só com seleção, **abaixo dos filtros**, e **gruda no topo** ao rolar. Os filtros continuam à vista. |
| Selecionar página / todas | Checkbox **“Selecionar página”** acima da lista, que mostra o estado misto quando só parte da página está marcada. Com a página inteira marcada, a barra oferece **“Selecionar todas as N frases”**, que são as dos filtros atuais. Isso substitui os botões “Pág.” e “Todas”. |
| Minerar frases | O **[Minerar frases ▾]** abre um menu com Colar · Arquivo .txt · Foto. Colar e Arquivo .txt abrem **um só modal “Minerar frases”** com abas (controle segmentado), já na aba certa. Foto abre “Minerar de uma foto” numa aba nova. |

## A área, de cima para baixo

1. **Cabeçalho** (do shell): “Frases mineradas” à esquerda e **[Minerar frases ▾]** à direita. O menu mostra cada modo com uma linha de explicação:
   - Colar: “Uma frase por linha”;
   - Arquivo .txt: “Importar um .txt com uma frase por linha”;
   - Foto: “Abre Minerar de uma foto numa aba nova”.
2. **Lembrete da configuração** (ONB-15), enquanto a [Boas-vindas](../boas-vindas/README.md) não chegou a Tudo pronto e o lembrete não foi ocultado (ver §Retomada de lá). É uma faixa **ouro** no topo: “A configuração ficou pela metade: 2 de 6 passos.”, com os botões **Ocultar** e **Continuar configuração**.
   - “Continuar configuração” abre `#boas-vindas` no primeiro passo que falta.
   - “Ocultar” esconde o lembrete de vez, aqui e no popup.
   - É o item 9 da lista fechada (lembrete “Configuração pela metade” ocultável).
3. **Avisos persistentes** (C1), quando existem. Ficam numa faixa `danger` suave com **Tentar de novo**, **Detalhes** recolhido e ×:
   - ADD-06: “12 frases mineradas neste computador, mas não foram para a nuvem.”
   - PAI-15: “As frases foram apagadas deste computador, mas não da nuvem. Elas podem voltar na próxima sincronização.”
4. **Filtros**, numa linha que quebra:
   - os selects em pílula **Todas as fontes · Todos os idiomas · Mais novas primeiro**;
   - a **busca** “Buscar nas frases”, com × para limpar quando tem texto (lista fechada), que procura no texto da frase e no Título;
   - o toggle **“Ocultar enviadas e exportadas”**;
   - sem bandeiras e sem o mini-painel da Mineração automática (T6 cortado).
5. **Linha de seleção**: sem seleção, o checkbox “Selecionar página”. Com seleção, a **barra contextual** em pílula (raio 22, borda ouro a 45%), grudada em `top: 12px`:
   - **× Desmarcar todas** e a contagem “12 selecionadas” (PAI-06);
   - o link **“Selecionar todas as 30 frases”**, quando cabe;
   - Editar contexto · Exportar .txt · Apagar (texto `danger`) · **Enviar ao Anki** (primário).
6. **Lista**: cabeçalho de data em maiúsculas com filete, depois os cartões. Um cartão tem, da esquerda para a direita:
   - **checkbox**;
   - o **texto** 15/400, com as palavras clicáveis: clicar grifa ou desgrifa a palavra. As grifadas usam o marca-texto `kw-bg`;
   - o **chip** `palavra:` (escolhida por você) ou `auto:` (detectada), com o rótulo em mono, × para remover e **+** (“Adicionar outro grupo”);
   - a **linha de Contexto**: badge neutro de Fonte com ícone (Netflix, YouTube, Web, PDF, Livro, Manual), Título · Detalhe e o selo **Enviada ao Anki** (`success`) ou **Exportada** (`info`);
   - as **4 ações** à direita, no hover ou no foco.

   Seleções novas, mineradas pelo atalho ou pelo menu do Chrome, aparecem com Fonte **Web** ou **PDF**, conforme o endereço da página. Frases já guardadas com Fonte **Seleção** não são alteradas.

   O cartão é `bg` dentro da ilha `surface`, com raio 14. Selecionado, ganha borda ouro a 45% e fundo com 5% de acento, sem barra lateral. **Editar texto** troca o texto por uma textarea no lugar: Enter salva, Esc cancela, e os botões são “Cancelar” e “Salvar texto”. Não há toast, porque a mudança está na tela (PAI-16).
7. **Paginação**: 10 por página, com “1–10 de 1.284” em mono à esquerda (PAI-07) e **« ‹ 1 de 129 › »** à direita, só-ícone e com tooltip.

### Estados da lista

| estado | o que aparece |
|---|---|
| Carregando (PAI-01) | 5 cartões-esqueleto, sem texto. |
| Primeiro uso (PAI-02) | “Nenhuma frase ainda. Minere de um vídeo com `Alt+S` ou use Minerar frases para colar, importar ou ler uma foto.” + **[Minerar frases]**. O `Alt+S` é o atalho de legenda que estiver gravado. Sem atalho gravado, no lugar da tecla aparece “Sem atalho” + a ação **Definir atalho**, que leva a `#configuracoes/atalhos`. |
| Filtros esconderam tudo (PAI-03) | “Nenhuma frase com estes filtros.” + **[Limpar filtros]**. |
| Busca sem resultado (PAI-04) | “Nenhuma frase com “{termo}”.” + **[Limpar busca]** e, se houver filtro ligado, **[Limpar filtros]**. |
| Conexão desligada | **Enviar ao Anki** fica com `aria-disabled` (não `disabled`, para o tooltip funcionar). O tooltip diz: “Indisponível: a conexão com o Anki está desligada. Ligue-a neste computador para enviar.” |

## Modais

Todos seguem o modal Veio: `surface`, raio 20, × no canto, Esc e clique fora fecham, e o botão de desistir é sempre “Cancelar”.

- **Editar contexto** (PAI-20…22):
  - Campos: **Fonte** (dica “De onde a frase veio (netflix, youtube, livro…)”), **Título** e **Detalhe** (dica “Episódio, capítulo ou canal”).
  - Com 1 frase, o subtítulo é o texto da frase e não há toast.
  - Com N frases, o subtítulo é “Editar contexto de 12 frases · campos em branco ficam como estão”, e o toast é “Contexto de 12 frases atualizado”.
  - O botão é **Salvar contexto**. Abre pela ação da linha (1 frase) ou pela barra (seleção).
- **Minerar frases** (ADD-01…10, C7): as abas **Colar | Arquivo .txt | Foto ↗**.
  - **Colar:**
    - textarea “Cole as frases, uma por linha” + Fonte e Título em duas colunas;
    - a contagem ao vivo em mono (“3 frases”) e o botão **“Minerar 3 frases”**;
    - vazio: o erro inline “Cole pelo menos uma frase.”;
    - durante o progresso, “Minerando 3 de 12…” com barra, no próprio modal;
    - no fim, o toast “12 frases mineradas”, ou o aviso persistente ADD-06 se a nuvem falhar.
  - **Arquivo .txt:**
    - uma área “Escolha um arquivo .txt”, com a nota “Uma frase por linha. O .txt exportado daqui volta com o contexto. Frases que já estão no histórico ficam de fora.”;
    - importa ao escolher, com o mesmo progresso;
    - no fim, o toast “12 frases mineradas · 3 já existiam”, ou inline ADD-07 (ilegível), ADD-08 (vazio) ou ADD-09 (nada novo, com o botão “Fechar”).
  - **Foto ↗:** fecha o modal e abre Minerar de uma foto numa aba nova.
- **Apagar** (PAI-12, PAI-13, C5–C6): um só modal para 1 frase e para a seleção.
  - O título é “Apagar esta frase?” ou “Apagar 12 frases?”.
  - O corpo diz “Ela some / Elas somem também dos outros computadores conectados à sua conta. Não dá para desfazer.” Sem conta, fica só “Não dá para desfazer.”
  - Os botões são **Cancelar** e **Apagar frase** / **Apagar 12 frases** (perigo, preenchido).
  - Para 1 frase não há toast (a linha some). Para a seleção, o toast é “12 frases apagadas” (PAI-14).
- **Envio ao Anki** (ENV-05…14): abre na hora (ENV-05 fica sem toast).
  - **Progresso:**
    - título “Enviando ao Anki…” e subtítulo “2 envios · inglês e russo”;
    - um cartão por envio: “Envio em inglês · 12 frases”, a etapa com nome de gente (Na fila · Criando cartões · Preparando imagens · Gerando áudio · Escolhendo imagens · Esperando o Anki · Enviando ao Anki), as 7 etapas em segmentos (as feitas cheias, a atual enchendo), “etapa 4 de 7 · atualizado há 1 min” e **Detalhes** recolhido com jobId, stage cru e ISO;
    - quando o cartão precisa da pessoa, nada de caixa de erro: a etapa e os segmentos ficam em tom calmo, o motivo vem numa frase curta e a ação é um link dourado logo embaixo (variante A da rodada 3 do PR #64):
      - não começou (ENV-03): “A conexão com o Anki respondeu com erro.” + **Tentar de novo →**;
      - o Windows não deixou fechar o Anki (BRG-18) ou um Continuar que não deu (ENV-14): o motivo + **Continuar envio →**;
      - terminou em parte: só **Continuar envio →** (a etapa já diz “Concluído em parte”);
    - no pé: “Pode fechar: o resumo abre quando o envio terminar.”;
    - sai o “Atualizar status” (M3.7).
  - **Resumo** (ENV-10), que abre sozinho em qualquer área e espera outro modal aberto fechar:
    - título “Envio concluído” ou “Envio concluído em parte”;
    - subtítulo “20 frases · 2 baralhos”;
    - um bloco por idioma, lado a lado: “Inglês”, **+11 cartões**, “no baralho CIMV” (sem o `::` do Anki: níveis separados por ›), “1 já estava lá” e, com falha, “1 não entrou” + **Tentar de novo**, que refaz só aquele idioma;
    - depois dos blocos, a pergunta “Tirar as 11 enviadas do histórico?” com “Elas já estão no Anki. Manter deixa no histórico, marcadas como enviadas.”;
    - os botões **Manter** e **Tirar do histórico** (primário, com a lixeira);
    - se alguma enviada foi apagada no meio: “1 enviada você já tinha apagado.”; se não sobrou nenhuma: “Nada para tirar do histórico.” e o botão **Pronto**;
    - Manter (e fechar) marca as enviadas e as já existentes como Enviada ao Anki, sem toast (ENV-12);
    - Tirar do histórico dá o toast “11 frases apagadas” (ENV-11);
    - desenho decidido pelo dono no protótipo `prototipo-envio.html` (rodada 3 do PR #64, branch `prototipo/envio-anki-rodada3`): o topo da variante B (um bloco por baralho) com o fim da A (a pergunta do histórico).

**Toasts** (C1): pílula em `text`/`bg` (invertida), centrada acima do rodapé, com um ícone de sucesso. Só para sucesso curto. Duração de no mínimo 2,6 s, crescendo com o texto.

## Notas para a construção

- **Nada de função nova além da lista fechada.** Os itens novos desta área são a busca na lista de frases (item 1, PAI-04) e a confirmação ao apagar 1 frase (item 2, PAI-12). A faixa ONB-15 é o item 9 (lembrete “Configuração pela metade” ocultável), que vem da Boas-vindas. Selecionar página ou todas, exportar, editar contexto e o fluxo do envio são as funções de hoje com outro desenho.
- **O “Selecionar todas as N frases” segue os filtros atuais**, como o “Todas” de hoje (frases visíveis). A contagem da barra conta a seleção inteira, inclusive o que está em outras páginas.
- **Os bugs continuam na issue própria:** o selo “No Anki” no .txt, a barra de progresso falsa, o overlay de importação que nunca pinta, o duplo clique que duplica o envio e o re-salvar dos presets estão em [Bugs encontrados na auditoria do front](https://github.com/vinicius928e8r84/PerpetualMiner/issues/9). O protótipo mostra o estado certo, não conserta a lógica.
- **Acessibilidade:**
  - as ações só-ícone têm `aria-label` e aparecem com `:focus-within`;
  - o checkbox mestre usa `indeterminate`;
  - o Enviar ao Anki desligado usa `aria-disabled` + tooltip;
  - os modais são `role=dialog` + `aria-modal`.

## Alternativas avaliadas

- **B · Planilha:** uma linha densa por frase em colunas (Frase · Contexto · Quando · Estado), ações num menu ⋯ e a barra de seleção no lugar dos filtros. Perdeu porque, com 10 frases por página, a densidade rende pouco, o contexto espremido perde leitura e o menu custa um clique a mais no Copiar.
- **C · Leitor:** uma lista compacta mais a frase aberta num painel, com a seleção numa doca flutuante. Perdeu porque cria duas noções (aberta e selecionada), deixa metade da tela parada durante o fluxo “selecionar → enviar”, e a doca cobre a paginação.
