# O primeiro Envio (#173)

O passo 9, o último, da [Boas-vindas](README.md). Não é opcional: a configuração só termina quando o Cartão chega ao Anki (o passo se marca por `pm_boas_vindas.primeiroEnvio.chegou`).
A cópia é `ONB-21` ([`lib/voz/catalogo-nivel.js`](../../../../lib/voz/catalogo-nivel.js), spec em [`catalogo-nivel.md`](../../voz/catalogo-nivel.md)); o código é
[`painel-boas-vindas-envio.js`](../../../../painel-boas-vindas-envio.js).

- **Começa sozinho**, sem clique, ao chegar ao passo, com **1 Cartão**: a Frase minerada mais recente (a de maior `id` do histórico) ou, sem nenhuma, uma **Frase de teste** do
  idioma ligado na mineração automática (o inglês se nenhum ou os dois). As outras Frases não vão: esperam no Envio, como hoje. A Frase minerada não é marcada como enviada
  (o Envio de todo dia a manda de novo e a Conexão a reconhece como duplicata).
- **A tela** mostra só “Enviando…” e depois “Cartão enviado ao Anki” (com o ✓ do Veio), sem etapas, custo nem estimativa. O Cartão pronto aparece como o Anki o desenha (a prévia de uma
  nota gravada, `POST /anki/card-preview` com o `guid`; BRG-43), no estilo salvo da pessoa, com o **chip do Baralho** (o Baralho da nota), **Abrir no Anki** (`POST /anki/browse`: o navegador do
  Anki abre na nota) e **Concluir** (→ Tudo pronto). O `guid` vem do estado do Cartão no Envio (`state.cards[…].guid`, só no Cartão que o Envio gravou). Se o Anki já tinha o Cartão
  (duplicata), vale como enviado: mostra o exemplo do estilo e não oferece Abrir no Anki.
- **A Frase de teste** leva no Anki a etiqueta `perpetualminer-teste` (o pedido do Envio diz `teste: true`), a tela avisa disso (ONB-21.teste), e o custo dela entra nos Custos como o de qualquer Envio.
- **Na falha**: “Este cartão não foi”, o motivo em uma frase (um por código de erro da Conexão), **Tentar de novo** e **Trocar a chave** (→ passo 5, a IA). Trocar a chave não é oferecido
  quando o motivo não é a chave (a Conexão não respondeu, a OpenAI não respondeu agora, o Anki não guardou, o tipo de nota foi alterado). Só a imagem falhar não é falha: o Cartão vai sem ela.
- **Repetir não duplica**: o pedido é congelado em `pm_boas_vindas.primeiroEnvio.corpo` antes de ir, com o `jobId`. Recarregar, voltar ao passo ou Tentar de novo pede o mesmo Envio (a
  Conexão o reconhece e, se ele terminou sem chegar, o refaz só no que falta); o `guid` da nota é do Envio, então nem o Baralho, nem o tipo de nota, nem o Cartão se repetem.
- **Decisão da construção (#100)**: não há aviso “Mais N frases esperando no Envio”. A tela diz só o que a história pede; o aviso, sem custo, pode entrar depois se o dono quiser.
- Sem protótipo próprio: reusa o card do passo, a prévia de Ajustes de envio e o aviso do Veio; as referências visuais são propostas (`boas-vindas-envio-visual.spec.js`, `test.fixme`) até o dono olhar.
