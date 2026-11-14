# O passo do nível do cartão (#164)

O passo 7 da [Boas-vindas](README.md), depois da mineração automática (é ela que diz quais idiomas estão ligados). Opcional. A cópia é `ONB-20` e `BRG-43` ([`lib/voz/catalogo-nivel.js`](../../../../lib/voz/catalogo-nivel.js), spec em [`catalogo-nivel.md`](../../voz/catalogo-nivel.md)). Fatia fechada: o código é `painel-boas-vindas-nivel.js`, `painel-boas-vindas-quiz.js` e `lib/quiz-de-nivel.js`; esta página guarda só as decisões e os limites.

- **O onboarding só pergunta o nível**: o controle **Estilo do cartão** de Ajustes de envio e a prévia do Cartão; o resto fica em Ajustes de envio (o link **Mais estilos** leva a `#anki/ajustes`).
- **Escolher salva na hora**, em `ankiBridgePresets` (só o `nivel` daquele idioma), pelo mesmo `AjustesDeEnvio.salvar` de Ajustes de envio. Nada é gravado ao entrar no passo.
- **Feito quando** todo idioma ligado tem o nível salvo (`versao` > 0). Sem idioma ligado o passo não se marca: diz “Nenhum idioma está ligado…” e leva a **Ligar a mineração automática** (passo 6).
- **Sem a prévia** (Conexão fora, antiga ou com erro) o controle segue valendo e se salva; a prévia diz o que falta (BRG-43) e tem **Tentar de novo**.

## O quiz de nível (#170)

Para quem não sabe o nível: **Não sei meu nível, quero descobrir** (`ONB-21`), de cerca de 1 minuto, ocupa o lugar do controle. As perguntas vêm prontas por idioma, sem IA e sem custo.

- **A regra dos dois portões** (#134): Intermediário = as 2 de legenda certas; Avançado = também as 2 do verso. A escuta aparece no resultado e não muda o estilo. A parte 1 (o que a pessoa já faz: soma 0 ou 1 aponta o Iniciante, de 2 a 4 o Intermediário ou o Avançado) decide por onde a parte 2 começa. No russo, quem diz “Ainda não” ao alfabeto vai direto ao Iniciante, sem quiz.
- **Sem relógio** (#137): a pessoa responde, vê a certa por ~1 s e a próxima entra sozinha. Errar ou “Não sei” só mostram a certa, sem buzina; “Não sei” pausa a sequência e o chute errado a zera.
- **O áudio** é a voz do Google do Cartão, dita pela Conexão (`POST /voz/falar`, no sotaque da Frase dos Ajustes de envio). Sem a Conexão, ou com uma antiga, a pergunta diz o que falta (`ONB-21.audioSemConexao`, `audioAntiga`) e segue respondível.
- **Usar este estilo** grava o nível pelo mesmo caminho do passo (`ONB-22`); sair do quiz não grava nada.
- **A festa e a Revelação** (#171, #137): som, confete e pontos crescem com a sequência até um teto; a Revelação enche as três portas até o nível. Errar não dá som, confete nem pontos. Quem disse “Ainda não” no alfabeto não tem Revelação.
- **O som** é feito na hora com o WebAudio; o botão **Som** (`ONB-21.som`) liga e desliga tudo, só da tela aberta (nada é guardado), e nada toca antes do primeiro toque.
- **Menos movimento**: só a cor muda, sem pulo, “+10” nem confete; as portas aparecem já no nível. Os tempos e curvas são tokens do Veio (`--veio-mov-*`, `--veio-curva-*`).

## Limites

- Sem protótipo próprio: reusa o card do passo e o controle de Ajustes de envio.
- Fora daqui: o ranking do grupo (#172).
- As referências visuais (`boas-vindas-nivel-visual.spec.js`, `boas-vindas-quiz-visual.spec.js`, `boas-vindas-quiz-festa-visual.spec.js`) são propostas (`test.fixme`) até o dono olhar; ele as compara com os protótipos do #134 e do #137.
