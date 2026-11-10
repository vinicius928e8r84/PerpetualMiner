# Protótipo: o painel no estilo shadcn

O painel do PerpetualMiner (`painel.html`: Frases, Conexão com o Anki, Configurações e a Boas-vindas) refeito com os
componentes e os tokens do [shadcn/ui](https://ui.shadcn.com), para o dono olhar, mexer e decidir se o caminho vale.

É um protótipo solto. Não é o painel: nada da extensão carrega esta pasta, ela não carrega nada de fora dela, os dados
são de exemplo e nada é gravado (recarregar volta tudo ao começo). `node test_preview.js` confere as duas primeiras
coisas.

## Abrir

```bash
python3 -m http.server 8470 --directory preview/prototipos/painel-shadcn   # http://127.0.0.1:8470/
node preview/montar.mjs --servir                                            # http://127.0.0.1:4173/prototipos/painel-shadcn/
```

No Vercel, a capa do preview leva a `/prototipos/painel-shadcn/`. Não há build nem dependência: é HTML, CSS e
JavaScript escritos à mão.

## As duas direções

A moldura escura embaixo da tela (que não faz parte do painel) troca a direção, o estado, a cor e o tema.

| Direção | O que é | Quando é a certa | Custo |
|---|---|---|---|
| **A · shadcn fiel ★** | As telas e o caminho de hoje, com as peças do shadcn: frases em cartões, lista e detalhe lado a lado, Configurações que abrem no lugar | Quem minera e escolhe a Palavra na própria frase, que é o gesto principal do painel | Cabem menos frases por tela |
| **B · Densa** | Tudo em tabelas (Table), com o detalhe numa gaveta (Sheet); Configurações abertas, com índice ao lado | Quem tem centenas de frases e quer varrer, ordenar e agir em lote | Escolher a Palavra passa para a gaveta: um clique a mais em cada frase |

A recomendada é a **A**: ela ganha o visual e os componentes do shadcn sem tirar do lugar o que a pessoa mais faz
(clicar na palavra da frase). A B serve de prova de que a tabela cabe; dá para levar só a tabela de Custos e a do
Vocabulário para a A.

A cor de destaque tem duas opções: **Neutro** (o tema padrão do shadcn, com o ouro só na marca, na Palavra e nos
gráficos) e **Ouro** (o ouro da Veio no lugar do `--primary`, como um tema do shadcn).

## Endereços, estados e teclas

| Endereço | Tela |
|---|---|
| `#frases` | Frases |
| `#anki/custos`, `#anki/baralhos`, `#anki/vocabulario`, `#anki/ajustes` | Conexão com o Anki |
| `#configuracoes`, `#configuracoes/atalhos` (e `conta`, `ia`, `chave`, `anki`, `aparencia`, `perigo`) | Configurações |
| `#boas-vindas`, `#boas-vindas/1` a `/9`, `#boas-vindas/10` | Boas-vindas |

O que a moldura escolhe fica no endereço: `?d=b` (direção), `?tema=claro`, `?cor=ouro`, `?lateral=trilho`,
`?moldura=0` (sem a moldura, para fotografar) e `?estado=`:

| Estado | O que mostra |
|---|---|
| `normal` | O painel com dados |
| `vazio` | Nenhuma frase, nenhum envio, o Anki ainda sem dados |
| `carregando` | Os esqueletos (Skeleton) de cada tela |
| `erro` | Sem sincronizar em Frases e na conta; custos, baralhos e vocabulário que não carregaram |
| `desligada` | A Conexão com o Anki desligada: o aviso, Enviar ao Anki indisponível, os Ajustes ainda editáveis |
| `primeira` | Nunca houve conexão: os quatro passos de ligar |

| Tecla | O que faz |
|---|---|
| `Ctrl` + `K` | A paleta: buscar uma tela, uma ação ou uma frase |
| `Ctrl` + `B` | Recolhe a lateral ao trilho de ícones (no celular, ela vira gaveta) |
| `1`, `2` | Direção A ou B |
| `T` | Tema claro ou escuro |
| `M` | Esconde ou mostra a moldura |
| `Tab`, setas, `Enter`, `Esc` | Tudo se usa pelo teclado: as abas e as escolhas andam com as setas, as palavras da frase também, os diálogos prendem o foco e o devolvem ao fechar |

## O que funciona de verdade

Clicar na palavra da frase (e o `+` de outro grupo), filtrar, buscar, paginar, selecionar e agir em lote, editar o
texto no lugar, editar o contexto, copiar (vai para a área de transferência), exportar (baixa o `.txt`), apagar,
Minerar frases (colar ou um `.txt` de verdade), o Envio ao Anki com o progresso por idioma e o resumo, os custos
recalculados por período e idioma, o teto do mês, os Ajustes de envio com a prévia do cartão, gravar um atalho (a
combinação que você apertar), as chaves, a conta, a Zona de perigo e a Boas-vindas inteira.

O que depende de fora é de mentira e diz que é: o login, a conferência da chave, o Anki, os downloads da Conexão.

## O que muda em relação ao painel de hoje

- A casca: a lateral do shadcn (variante inset, com trilho de ícones), o cabeçalho da página com a busca e o tema.
- A paleta de comandos (`Ctrl` + `K`) é nova.
- Em Custos, o cartão do alto junta os azulejos de idioma e um gráfico do custo por dia, que o painel não tem
  (os números são os mesmos envios, somados por dia).
- Cada tela ganhou uma linha de descrição sob o título. Esse texto e o da paleta são propostas: não estão no catálogo
  da Voz. Todo o resto do texto veio de `lib/voz/catalogo.js`.
- A letra continua a Manrope da Veio (cópias em `fontes/`, SIL OFL 1.1): a Geist do shadcn viria de fora.

## O que ficou de fora

O quiz de nível e o ranking do passo 7 da Boas-vindas, o Modelo dos cartões, a animação do aviso do Anki, o conserto
sozinho, a atualização da Conexão e os avisos do Envio parado (Anki fechado, limite de uso, teto do mês). Minerar de
uma foto, o popup e o overlay são outras telas, não o painel.

## O que veio do shadcn

Os nomes e os valores dos tokens (o tema Neutral de `ui.shadcn.com/docs/theming`), a escala de raio e as medidas dos
componentes, lidas na página com o navegador: controles de 32 px, raio de 10 px (14 no cartão), letra de 14 px, anel de
foco de 3 px. Um valor foi mexido: o `--muted-foreground` do tema claro (0.556 → 0.51), para o texto cinza passar de
4,5:1 de contraste sobre o fundo `--muted`. O shadcn/ui é MIT (Copyright (c) 2023 shadcn). Nenhum arquivo de lá foi copiado: os componentes de lá são
React com Tailwind, e os daqui são CSS e JavaScript próprios; os ícones foram desenhados para esta pasta.

| Componente do shadcn | Onde aparece |
|---|---|
| Sidebar, Breadcrumb, Avatar, Dropdown Menu | A casca e o menu da conta |
| Command, Dialog | A paleta de `Ctrl` + `K` |
| Button, Badge, Kbd, Tooltip, Separator | Em tudo |
| Card, Item, Empty, Alert, Skeleton | As telas e os estados delas |
| Tabs, Toggle Group, Native Select, Input, Textarea, Checkbox, Switch, Field | As abas da Conexão, os filtros e os formulários |
| Table, Pagination, Sheet | A direção B e a paginação das frases |
| Dialog, Alert Dialog, Progress, Toast | Editar contexto, apagar, Minerar frases, o Envio |
| Chart | O custo por dia, a origem das imagens e a rosca de maturidade |
| Accordion, Collapsible | As Configurações da direção A e os "Avançado" |

## Os arquivos

Nenhum passa de 20.000 bytes (o limite de `scripts/ganchos/`), por isso cada tela está em mais de um.

| Arquivo | O que é |
|---|---|
| `index.html` | A página: carrega as folhas e os scripts, na ordem |
| `tokens.css` | Os tokens do shadcn (claro e escuro), a cor Ouro e os tokens do PerpetualMiner |
| `componentes.css`, `componentes-conteudo.css`, `componentes-camadas.css`, `componentes-casca.css` | Os componentes, um bloco por componente do shadcn: os controles, os de conteúdo, os que abrem por cima da tela e a casca |
| `telas.css`, `tela-frases.css`, `tela-anki.css`, `tela-configuracoes.css`, `tela-boas-vindas.css`, `telas-estreitas.css` | O desenho de cada tela, o que a direção B aperta e as telas estreitas |
| `moldura.css` | A moldura do protótipo |
| `icones.js` | Os ícones e a marca, em SVG |
| `dados.js` | Os dados de exemplo, os mesmos das referências visuais do painel |
| `nucleo.js` | O estado no endereço, as ações por `data-acao`, as setas do teclado e o desenho da tela |
| `camadas.js` | O comportamento de Dialog, Alert Dialog, Sheet, Dropdown Menu, Tooltip e Toast |
| `frases.js`, `frases-lista.js`, `frases-acoes.js`, `frases-minerar.js`, `frases-envio.js` | Frases: a base, a tela, as ações, Minerar frases e o Envio ao Anki |
| `anki.js`, `anki-custos.js`, `anki-baralhos.js`, `anki-ajustes.js`, `anki-primeira.js`, `anki-tela.js` | Conexão com o Anki: as contas, cada aba, os passos de ligar e a tela |
| `cfg-conta.js`, `cfg-chaves.js`, `configuracoes.js` | Configurações: a conta e os atalhos, as chaves e a tela |
| `boas-vindas.js` | A Boas-vindas |
| `casca.js` | A lateral, o cabeçalho, a paleta de comandos e a moldura |
| `fontes/` | A Manrope e a JetBrains Mono da Veio, com as licenças |
