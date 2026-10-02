# Painel: arquitetura de informação e shell “Ilhas”

Resolução do ticket [Painel — arquitetura de informação & shell (sidebar/navegação)](https://github.com/vinicius928e8r84/PerpetualMiner/issues/6) do mapa [Redesign do front-end do PerpetualMiner](https://github.com/vinicius928e8r84/PerpetualMiner/issues/1). Ele herda:
- a identidade [Veio](../../identidade-veio/README.md);
- os reagrupamentos da [auditoria](../../auditoria/README.md);
- os nomes e a cópia do [guia de voz & catálogo](../../voz/README.md).

**Protótipo:** [`prototipo-shell.html`](prototipo-shell.html). Abra direto no navegador.
- `?variant=B` é o tratamento travado. `A` (Plana) e `C` (Editorial) foram as alternativas.
- As setas ← → trocam a variante, e **T** alterna o tema.
- O painel “Estados do protótipo” simula:
  - a Conexão com o Anki ligada, conectando ou desligada;
  - a conta sincronizada, sincronizando, sem sincronizar ou sem conta;
  - a primeira execução;
  - o trilho;
  - o fim de um envio com você em outra área.
- As telas profundas estão só **em esboço**: cada uma tem o próprio ticket.

Decidido em duas rodadas no Lavish e avaliado em 2026-09-14. O dono aceitou todas as recomendações e escolheu o tratamento **B · Ilhas** (“gostei mais da B”).

## Arquitetura de informação

| decisão | escolha |
|---|---|
| Áreas | **Frases** e **Conexão com o Anki** no topo da sidebar; **Configurações** sozinha no pé. O Painel abre em Frases. “Minerar de uma foto” não entra na sidebar: só se chega a ela por “Minerar frases → Foto”. |
| Navegação | **Uma página só** (`painel.html`), trocando só a vista. Cada área tem endereço, e o voltar do navegador funciona. Trocar de área não recarrega: o sync e o acompanhamento de envios não reiniciam. |
| Conexão com o Anki por dentro | **Abas em pílula**, uma sub-área por vez, na ordem **Custos · Baralhos e termos · Vocabulário · Ajustes de envio**. Abre em Custos. |
| Indicadores fixos | Ficam colados na navegação. O total vai no item Frases (`1.284`, PAI-05). O ponto vai no item Conexão com o Anki, com o status no tooltip e no aria (ver o [tratamento comum da Conexão](../boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1)). O **chip de conta** fica no pé: avatar, nome e status de sync. Clicar nele leva a Configurações › Conta & sync. |
| Sidebar | Fixa e sempre expandida. Abaixo de ~1000 px vira **trilho de ícones** sozinha, sem botão de recolher. No trilho, o ponto do Anki e o avatar continuam visíveis. |
| Configurações por dentro | Uma rolagem com 5 cards: **Conta & sync · Atalhos · Chave do Gemini · Aparência · Zona de perigo**. A Zona de perigo vem por último, com borda `danger`. `#configuracoes/<seção>` rola até o card. |
| Camada Avançado | Fica **recolhida no pé de cada aba**, com o que é daquela aba:<br>• Ajustes de envio: sotaque do áudio (TLDs).<br>• Custos: Escolha e Triagem de imagem, IDs dos envios, 4 casas, pacote de diagnóstico.<br>• Baralhos e termos: Reparar Anki. |
| Envios | O modal “Envio ao Anki” abre quando se envia. O histórico continua em Custos, como **Envios recentes**, filtrado pelo período. |
| Cabeçalho de área | O mesmo nas três: título à esquerda e ação principal à direita.<br>• Frases mineradas: **[Minerar frases ▾]** (Colar · Arquivo .txt · Foto).<br>• Conexão com o Anki: **[↻ Atualizar]**.<br>• Configurações: só o título. |

### Endereços

| endereço | abre |
|---|---|
| `#frases` (padrão) | Frases mineradas |
| `#anki/custos` · `#anki/baralhos` · `#anki/vocabulario` · `#anki/ajustes` | a aba correspondente da Conexão com o Anki |
| `#configuracoes` · `#configuracoes/conta` · `#configuracoes/atalhos` · `#configuracoes/chave` · `#configuracoes/perigo` | Configurações, rolando até a seção |
| `#boas-vindas` | a página [Boas-vindas](../boas-vindas/README.md), **sem sidebar**. Abre sozinha na instalação. |

Quem aponta para eles:
- o **“Mudar atalho”** do popup vai para `#configuracoes/atalhos`;
- o **“Definir atalho”**, que aparece onde a cópia supõe o atalho de legenda e não há atalho gravado (PAI-02, ONB-05, rodapé do popup), vai para `#configuracoes/atalhos`;
- o **“Abrir Configurações”** do Minerar de uma foto (FOT-05) vai para `#configuracoes/chave`;
- o chip de conta vai para `#configuracoes/conta`;
- a instalação da extensão e o **“Continuar configuração”** (lembrete do popup e faixa de Frases) vão para `#boas-vindas`.

### Casos de borda

- **Trocar de área e voltar:** filtros, busca, página e seleção continuam como estavam, e a barra contextual de seleção volta aberta. Recarregar a página zera tudo, como hoje.
- **Envio termina com o modal fechado:** o resumo (ENV-10: “Envio concluído — 12 enviadas · 2 já estavam no Anki · 1 falhou [Apagar as 12 enviadas] [Manter]”, com a nota “Manter deixa as frases no histórico, marcadas como enviadas ao Anki.” sob os botões) **abre sozinho, em qualquer área**.
- **Conexão com o Anki desligada:** a área abre normalmente.
  - No topo, a faixa F1 (ENV-01) com **Tentar de novo**, seguindo o [retry comum](../boas-vindas/README.md#conexão-com-o-anki-como-ligar-f1). A faixa continua durante a tentativa e sai quando a resposta é ligada. Se o foco estava no botão e as abas estão à mostra, vai para a aba escolhida; na primeira conexão, segue o [Pronto do card ONB-16](../anki/README.md#estados).
  - Para o conteúdo das abas e o card da primeira conexão, ver [Conexão com o Anki § Estados](../anki/README.md#estados).
  - Os Ajustes de envio continuam editáveis.
  - Em Frases, “Enviar ao Anki” fica indisponível e o tooltip diz por quê.
- **Primeira execução:** o shell não muda. Mostra `Frases 0`, o ponto desligado e o chip “Sem conta · só neste computador”, e o vazio de Frases é o da PAI-02. O guia é a página [Boas-vindas](../boas-vindas/README.md) (`#boas-vindas`, sem sidebar), que abre sozinha na instalação.

## Shell “Ilhas” (variante B)

Três tratamentos foram avaliados sobre a mesma arquitetura:
- **A · Plana:** sidebar colada na borda, abas em pílula ouro.
- **B · Ilhas:** sidebar e conteúdo como painéis flutuantes.
- **C · Editorial:** sidebar sem fundo, só tipografia, item ativo grifado.

Ficou a **B**:

- **Fundo e ilhas:** a página é `bg`, com 12 px de margem e 12 px de vão. A sidebar (248 px) e o conteúdo são duas ilhas `surface`, com borda `border`, raio 20 e sombra suave. A sidebar ocupa a altura da janela e fica fixa ao rolar.
- **Dentro da ilha de conteúdo,** cards e linhas de frase invertem para `bg` (raio 14), para ler como “buracos” na ilha.
- **Marca:** o azulejo grafite de 30 px e o nome com o cursor ouro piscando, no topo da sidebar.
- **Itens da nav:** raio 14, ícone de traço 2 px + rótulo, com o contador em mono ou o ponto de estado à direita. O item **ativo** usa `surface-2` com contorno interno `border-strong` de 1 px. O ouro fica reservado para a ação primária e a seleção.
- **Pé da sidebar:** Configurações e o chip de conta, num bloco `surface-2` de raio 14.
- **Cabeçalho de área:** título 22/700 e ação à direita, com uma divisória `border` embaixo.
- **Abas da Conexão com o Anki:** **controle segmentado**, um trilho `surface-2` em pílula. A aba ativa vira uma pílula `surface` com sombra leve.
- **Trilho (< ~1000 px):** a sidebar cai para 76 px, com os ícones centralizados, o ponto do Anki sobre o ícone e só o avatar no pé. As ilhas continuam.
- **Tema claro:** os mesmos tokens da spec Veio. As ilhas brancas ficam sobre `#F7F4EE`.

## Fica para outros tickets

- **Telas profundas**, cada uma partindo deste shell:
  - [Protótipo: Painel · Frases mineradas](https://github.com/vinicius928e8r84/PerpetualMiner/issues/12);
  - [Protótipo: Painel · Conexão com o Anki](https://github.com/vinicius928e8r84/PerpetualMiner/issues/13);
  - [Protótipo: Painel · Configurações](https://github.com/vinicius928e8r84/PerpetualMiner/issues/14).
- **Contas de IA por pessoa + provedores alternativos** (escolher a chave da OpenAI pela interface; usar Claude, GLM, DeepSeek…) ficam **fora deste mapa**: mexem no motor e no bridge. Viraram o esforço próprio [Contas de IA por pessoa + provedores alternativos](https://github.com/vinicius928e8r84/PerpetualMiner/issues/11). Hoje a chave da OpenAI já é de cada computador (`engine/.env`). O onboarding só ensina a colocar a própria chave. A seção de Configurações continua “Chave do Gemini”.
