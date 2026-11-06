# O passo do nível do cartão (#164)

O passo 7 da [Boas-vindas](README.md), depois da mineração automática (é ela que diz quais idiomas estão ligados). Opcional. A cópia é `ONB-20` e `BRG-43`
([`lib/voz/catalogo-nivel.js`](../../../../lib/voz/catalogo-nivel.js), spec em [`catalogo-nivel.md`](../../voz/catalogo-nivel.md)).

- **O que mostra**: para cada idioma ligado, um grupo com o nome do idioma, o controle **Estilo do cartão** de Ajustes de envio (Iniciante · Intermediário · Avançado, com o
  texto do nível) e a **prévia do Cartão** do nível escolhido (Frente · Verso), desenhada pelo Anki (`POST /anki/card-preview`, o exemplo do estilo). Sob os grupos, o link
  **Mais estilos em Ajustes de envio** (`#anki/ajustes`): o onboarding só pergunta o nível.
- **Escolher salva na hora**, em `ankiBridgePresets` (só o `nivel` daquele idioma; o resto fica como está), pelo mesmo `AjustesDeEnvio.salvar` de Ajustes de envio. A prévia muda
  com a escolha. Nada é gravado ao entrar no passo.
- **Feito quando** todo idioma ligado tem o nível salvo (os Ajustes de envio dele, `versao` > 0). Sem idioma ligado o passo não se marca:
  diz “Nenhum idioma está ligado…” e leva a **Ligar a mineração automática** (passo 6). Tudo pronto mostra “Inglês: Intermediário”.
- **Sem a prévia** (Conexão fora, antiga ou com erro) o controle segue valendo e se salva; a prévia diz o que falta (BRG-43) e tem **Tentar de novo**.
- Sem protótipo próprio: reusa o card do passo e o controle de Ajustes de envio; as referências visuais são propostas (`boas-vindas-nivel-visual.spec.js`, `test.fixme`) até o dono olhar.

## O quiz de nível (#170)

Para quem não sabe o nível, cada idioma ligado traz **Não sei meu nível, quero descobrir** (`ONB-21`) sob o controle. O quiz, de cerca de 1 minuto, ocupa o lugar do controle
(`painel-boas-vindas-quiz.js`; a regra e as perguntas, como dados, são de `lib/quiz-de-nivel.js`); as perguntas vêm prontas por idioma, sem IA e sem custo.

- **No russo** vem antes “Você já lê o alfabeto russo?”: “Ainda não” dá o Iniciante, direto no resultado, sem quiz.
- **Parte 1**: duas perguntas sobre o que a pessoa já faz (séries, uma notícia), de 3 alternativas que valem 0, 1 ou 2; soma 0 ou 1 aponta o Iniciante, de 2 a 4, o Intermediário ou o Avançado.
- **Parte 2**: de 3 a 6 perguntas de 4 alternativas, sempre com “Não sei”: só o áudio (a escuta), a Frase como legenda e o teste do verso (a explicação de uma palavra, no idioma). Duas de cada tipo.
- **A regra dos dois portões** (#134): Intermediário = as 2 de legenda certas; Avançado = também as 2 do verso. A escuta aparece no resultado e não muda o estilo.
  Quem a parte 1 aponta Iniciante começa pela legenda (legenda, escuta, legenda: 3 perguntas; se acertou as duas, entram verso, escuta, verso: 6). Quem aponta Intermediário ou Avançado
  começa pelo verso (3; acertou as duas, é o Avançado; errou uma, entram legenda, escuta, legenda: 6).
- **O ritmo** (#137): sem relógio. A pessoa responde, vê a certa marcada por ~1 s e a próxima entra sozinha; o áudio toca sozinho. Errar ou “Não sei” só mostram a certa, sem buzina.
  A sequência sobe a cada acerto; “Não sei” a pausa e o chute errado a zera.
- **O áudio** é a voz do Google do Cartão, dita pela Conexão (`POST /voz/falar`, no sotaque da Frase dos Ajustes de envio; `complemento/contrato/voz.md`). Sem a Conexão, ou com uma antiga, a pergunta diz o que falta
  (`ONB-21.audioSemConexao`, `audioAntiga`) e segue respondível; **Ouvir de novo** tenta outra vez.
- **O resultado** (`ONB-22`): o nível sugerido com a prévia do Cartão (o mesmo `EstiloDoCartao.campo`), um resumo (acertos, melhor sequência, escuta), **Usar este estilo** ou trocar o nível ali, e a nota de que dá para trocar depois
  em Ajustes de envio › Estilo do cartão. Usar o estilo grava o nível pelo mesmo caminho do passo; sair do quiz não grava nada.
- **Fora daqui**: a festa a cada acerto e a revelação (#171) e o ranking do grupo (#172). As referências visuais são propostas (`boas-vindas-quiz-visual.spec.js`, `test.fixme`) até o dono olhar, e ele as compara com o protótipo do #134.
