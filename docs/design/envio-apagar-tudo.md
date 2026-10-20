# O Apagar tudo e o Envio na Conexão com o Anki (#142)

Complemento de [envio-no-complemento.md](envio-no-complemento.md) (§ da tabela de transições, linhas “Apagar tudo” e “a Conexão sobe”).
As Frases existem em dois lugares, a extensão e a cópia que a Conexão guarda enquanto o Envio precisa dela (C7). O Apagar tudo (CFG-17)
tem de tirar as duas, e nenhum Envio pode continuar gastando a chave da OpenAI com Frases apagadas.

## No painel

- **O painel deixa de acompanhar os Envios.** As Frases deles não existem mais: não há resumo a mostrar nem o que reenviar (o Tentar de
  novo gastaria a chave com Frases apagadas; o Continuar envio de um Envio que a Conexão parou não faz nada). Em `pm_envio` fica só
  `{ envios: [], apagarFrases: true }`. Um Enviar que ainda criava Envios para antes do próximo `POST /jobs`, e um pedido em voo cuja
  resposta chega depois não traz o Envio de volta.
- **Outras abas.** Quem grava essa marca avisa as outras abas pelo `storage.onChanged`: cada uma encerra o acompanhamento também, sem
  gravar nem enviar nada, e fecha o progresso e o resumo que mostrava.
- **A Conexão apaga as dela** (`POST /jobs/apagar-frases`): um Envio `queued`/`running` vai a `failed` com `wiped`, e somem as linhas
  das Frases e os textos gerados. A marca sai de `pm_envio` quando a Conexão confirma.
- **Sem resposta da Conexão** (o `apagar-frases` falha, mas a Conexão respondeu antes): a marca fica, o painel pede de novo quando a
  Conexão responder, e com todo painel fechado o service worker o pede a cada 30 s enquanto a marca existir
  (`lib/apagar-frases-pendente.js`; sem marca não há alarme). A parte “Falha local” do CFG-17, que fala só da chave, ganha as Frases
  na Conexão: cópia a aprovar.

## A recusa

O Apagar tudo é **recusado sempre que a Conexão não responde**, haja Envio ou não (decisão do dono). Antes de apagar qualquer coisa a
Zona de perigo confere a Conexão naquele instante; se ela não responde, **nada é apagado e nada fica marcado**, e a faixa dá o texto
`CFG-17.conexaoNaoResponde` (“Não deu para apagar agora: a Conexão com o Anki não está respondendo. Abra o Anki e tente de novo.”), com
o Tentar de novo (repete a conferência e, com a Conexão de volta, apaga) e o Detalhes. A faixa some quando a Conexão volta a responder.
O caminho é abrir o Anki: ninguém fica recusado para sempre.

O motivo: com a Conexão fora, o Apagar tudo só existiria no navegador (`pm_envio.apagarFrases`), e um Envio parado em disco seguiria
sozinho quando o Anki abrisse, gastando a chave com as Frases apagadas. A confirmação da recusa vem da Conexão, não da memória do
painel: vale para uma aba aberta antes do Enviar, para um Continuar envio feito pela aba Custos e para um Envio “Não começou”.

## A espera de 60 s depois que a Conexão sobe

Ao subir, a thread de trabalho **espera até 60 s o primeiro pedido de Envio da extensão** (`POST /jobs…`; o `/health` não conta) antes
de retomar o que ficou parado. O pedido solta a espera **depois** de a rota terminar, então um `apagar-frases` já apagou quando a
thread é solta. Com um painel aberto, o `/jobs/list` dele solta a espera na hora; com todo painel fechado e o Chrome aberto, o alarme
de 30 s manda o `apagar-frases` marcado dentro dos 60 s. Sem nenhum pedido, o Envio retoma sozinho quando os 60 s acabam; uma
interrupção comum atrasa a retomada em até 60 s.

## O que sobra

- Uma marca pendente com um Envio que a Conexão retomaria só nasce na janela curta entre a conferência e o `POST /jobs/apagar-frases`:
  a Conexão cai logo depois do clique.
- Se nenhum Chrome alcança a Conexão nos 60 s depois que o Anki abre (o Chrome fechado nessa hora, por exemplo no dia seguinte), o Envio
  retoma como antes e gasta a chave com as Frases apagadas.
