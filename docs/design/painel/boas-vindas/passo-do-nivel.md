# O passo do nível do cartão (#164)

O passo 7 da [Boas-vindas](README.md), depois da mineração automática (é ela que diz quais idiomas estão ligados). Opcional. A cópia é `ONB-20` e `BRG-43`
([`lib/voz/catalogo-nivel.js`](../../../../lib/voz/catalogo-nivel.js), spec em [`catalogo-nivel.md`](../../voz/catalogo-nivel.md)).

- **O que mostra**: para cada idioma ligado, um grupo com o nome do idioma, o controle **Estilo do cartão** de Ajustes de envio (Iniciante · Intermediário · Avançado, com o
  texto do nível) e a **prévia do Cartão** do nível escolhido (Frente · Verso), desenhada pelo Anki (`POST /anki/card-preview`, o exemplo do estilo). Sob os grupos, o link
  **Mais estilos em Ajustes de envio** (`#anki/ajustes`): o onboarding só pergunta o nível. O russo só escolhe o Iniciante até o #163.
- **Escolher salva na hora**, em `ankiBridgePresets` (só o `nivel` daquele idioma; o resto fica como está), pelo mesmo `AjustesDeEnvio.salvar` de Ajustes de envio. A prévia muda
  com a escolha. Nada é gravado ao entrar no passo.
- **Feito quando** todo idioma ligado tem o nível resolvido: os Ajustes de envio dele salvos (`versao` > 0) ou um idioma que só tem um nível. Sem idioma ligado o passo não se marca:
  diz “Nenhum idioma está ligado…” e leva a **Ligar a mineração automática** (passo 6). Tudo pronto mostra “Inglês: Intermediário”.
- **Sem a prévia** (Conexão fora, antiga ou com erro) o controle segue valendo e se salva; a prévia diz o que falta (BRG-43) e tem **Tentar de novo**.
- Sem protótipo próprio: reusa o card do passo e o controle de Ajustes de envio; as referências visuais são propostas (`boas-vindas-nivel-visual.spec.js`, `test.fixme`) até o dono olhar.
