# Voz, tom &amp; catálogo de mensagens/estados

Ticket #4 do mapa Redesign do front-end (#1).

O que está aqui: o **guia de voz e tom** (as regras de qualquer mensagem nova) e as **regras por categoria** (onde cada tipo de mensagem aparece). Só o *conteúdo*: a aparência é da identidade visual, onde cada área mora é do shell do painel e a lógica é da auditoria do front.

O texto de cada estado não está aqui: a fonte é [`lib/voz/catalogo.js`](../../../lib/voz/catalogo.js) e [`catalogo-nivel.js`](../../../lib/voz/catalogo-nivel.js), e texto novo entra primeiro neles. Para ver todos juntos, com o estado, a categoria, o “hoje” e a nota de cada ID (`notas-<área>.json`, que `testes/test_voz.js` exige), abra [`catalogo.html`](catalogo.html), gerado por `node scripts/gerar-catalogo-da-voz.js`.

Os termos seguem [`glossary.md`](../../../glossary.md).

---

## 1. Guia de voz e tom

| # | Regra | Exemplo |
|---|---|---|
| V1 | **Quem fala:** o app não tem “eu” e nunca diz “nós”. Ele fala de forma impessoal sobre o que aconteceu. O usuário é tratado por **você**, quase sempre implícito no imperativo. Nunca “tu”. | “Nenhuma marcação encontrada nesta foto. Marque as frases com /barras/…” |
| V2 | **Temperatura:** calmo e direto, como um colega competente. **Zero exclamação**, zero piada. Sucesso é curto e factual. Se o produto tiver entusiasmo, ele fica na identidade visual. | “Frase minerada · Inglês” |
| V3 | **Anatomia do erro:** (1) o que aconteceu, nos termos do usuário; (2) o que fazer, com um botão quando existe ação. A causa técnica (código HTTP, mensagem crua, jobId) vai para um **“Detalhes”** recolhido e copiável. | “O envio em inglês não começou. A Conexão com o Anki respondeu com erro. [Tentar de novo] · Detalhes” |
| V4 | **Honestidade:** só se afirma o que já aconteceu. Durante a espera, a mensagem diz a ação em andamento. Falha tem cópia própria. Dado ausente aparece como “indisponível”, nunca como zero. | “Salvando…” → “Frase minerada” / “Não deu para minerar a frase.” · “Custo indisponível” (e não “$0.0000”) |
| V5 | **Sem emoji no texto.** Ícones de status vêm do componente, não da cópia. Símbolos tipográficos permitidos: “…”, “·” (separador) e “→”. | — |
| V6 | **Só PT-BR.** Inglês só em nome próprio (Anki, Gemini, Netflix, YouTube). Mensagem de terceiro é traduzida, e o texto original vai para Detalhes. Traduzir a UI para inglês fica fora deste esforço. “keyword” pode continuar como nome técnico no código, nunca na tela: o chip da Palavra diz `palavra: …` quando você a escolheu e `auto: …` quando foi detectada, igual no Painel e no overlay (`keyword:` e `nova:` saem). | “O Gemini está recebendo pedidos demais…” · Detalhes: HTTP 429 |
| V7 | **Convenções de escrita** (checáveis mecanicamente, ver abaixo). | — |
| V8 | **Verbo central: minerar.** Pôr uma frase no histórico é minerar, qualquer que seja a Fonte. “Capturar”, “salvar” e “adicionar” saem. | Atalhos “Minerar legenda” e “Minerar seleção” · botão “Minerar frases” |
| V9 | A página hoje chamada BookReader passa a se chamar **“Minerar de uma foto”**. | — |
| V10 | **As mensagens evitam citar o nome do produto.** Onde é inevitável (manifest, menu de contexto do Chrome, onboarding), a grafia é **PerpetualMiner**. A tela grande se chama só **Painel**. | “Apagar 12 frases?” · “Minerar com PerpetualMiner” · “Abrir painel” |
| D1 | **Cartão**, não card. Coerente com Baralho e com o Anki em PT-BR. | “Criando cartões” |
| D2 | Os nomes de recurso também são traduzidos: **Mineração automática** (era Auto Miner) e **Conexão com o Anki** (era Anki Bridge). | “Mineração automática · Inglês · 12 de 20 hoje” |

### Convenções de escrita (V7)

- **Sentence case** em tudo: títulos, botões, toasts, rótulos. Exemplo: “Editar contexto”, e não “Editar Contexto”.
- **Reticências** são um caractere só (“…”) e aparecem **só em estado em andamento**. Placeholder não leva reticências.
- **Ponto final:** não vai em título, botão, rótulo nem em toast de uma frase só. Vai em texto de corpo com mais de uma frase.
- **Números** vêm sempre com unidade e plural certo: “1 frase”, “12 frases”, “1.284 frases”. Nunca um número solto, “job(s)” ou “frase(s)”.
- **Separador “·”:** quando ele continua o mesmo status ou a mesma frase, o que vem depois começa com minúscula: “Sem conta · só neste computador”, “Frase minerada · não deu para copiar”. Quando separa rótulos independentes (modos, etapas, filtros, o idioma), cada rótulo mantém a caixa própria: “Colar · Arquivo .txt · Foto”, “Frase minerada · Inglês”.
- **Dinheiro:** “US$ 0,42”, com 2 casas por padrão. Com “Mostrar custos com 4 casas” ligado no Avançado, todos os valores passam a 4 casas, em todo lugar. Valor positivo abaixo de 1 centavo aparece como “< US$ 0,01”, nunca “US$ 0,00”.
- **Datas:** relativas na camada principal (“há 5 min”, “ontem”, “há 3 dias”). ISO e hora exata só em Detalhes.
- **Botões** dizem verbo + objeto: “Apagar 12 frases”, “Tentar de novo”, “Limpar filtros”. Nunca “OK”, “Sim” ou “Confirmar” sozinhos. O botão de desistir é sempre “Cancelar”.
- **Acentuação:** completa, sempre. Hoje falta acento em toda a área do Bridge.

---

## 2. Regras por categoria

C1 a C9 e F1 estão em [`regras-por-categoria.md`](regras-por-categoria.md).
