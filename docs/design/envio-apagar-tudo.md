# O Apagar tudo e o Envio na Conexão com o Anki (#142)

Complemento de [envio-no-complemento.md](envio-no-complemento.md) (§ da tabela de transições, linhas “Apagar tudo” e “a Conexão sobe”). Fatia fechada: o código é `lib/apagar-frases-pendente.js`, `painel-envio-apagar.js` e `complemento/rotas_do_envio.py`; esta página guarda só as decisões e os limites.

As Frases existem em dois lugares, a extensão e a cópia que a Conexão guarda enquanto o Envio precisa dela (C7). O Apagar tudo (CFG-17) tem de tirar as duas, e nenhum Envio pode continuar gastando a chave da OpenAI com Frases apagadas.

## Decisões

- **O painel deixa de acompanhar os Envios.** As Frases deles não existem mais: não há resumo a mostrar nem o que reenviar (o Tentar de novo gastaria a chave com Frases apagadas; o Continuar envio de um Envio que a Conexão parou não faz nada). Em `pm_envio` fica só `{ envios: [], apagarFrases: true }`. As outras abas encerram o acompanhamento pelo `storage.onChanged`, sem gravar nem enviar nada.
- **A Conexão apaga as dela** (`POST /jobs/apagar-frases`): um Envio `queued`/`running` vai a `failed` com `wiped`, e somem as linhas das Frases e os textos gerados. A marca sai de `pm_envio` quando a Conexão confirma. Sem a confirmação, a marca fica e o pedido se repete (o painel, e com todo painel fechado o service worker, a cada 30 s).
- **O Apagar tudo é recusado sempre que a Conexão não responde**, haja Envio ou não (decisão do dono). Antes de apagar qualquer coisa a Zona de perigo confere a Conexão naquele instante; se ela não responde, **nada é apagado e nada fica marcado** (`CFG-17.conexaoNaoResponde`, com Tentar de novo e Detalhes). Enquanto isso a pessoa pode apagar Frases pela seleção na lista (esse apagar não tira a chave da OpenAI).
  O motivo: com a Conexão fora, o Apagar tudo só existiria no navegador (`pm_envio.apagarFrases`), e um Envio parado em disco seguiria sozinho quando o Anki abrisse, gastando a chave com as Frases apagadas. A confirmação vem da Conexão, não da memória do painel: vale para uma aba aberta antes do Enviar, para um Continuar envio feito pela aba Custos e para um Envio “Não começou”.
- **A espera de 60 s depois que a Conexão sobe.** A thread de trabalho espera até 60 s o primeiro pedido de Envio da extensão (`POST /jobs…`; o `/health` não conta) antes de retomar o que ficou parado, para que um `apagar-frases` marcado chegue antes. O pedido solta a espera depois de a rota terminar. Sem nenhum pedido, o Envio retoma sozinho aos 60 s.

## Limites aceitos

- Uma marca pendente com um Envio que a Conexão retomaria só nasce na janela curta entre a conferência e o `POST /jobs/apagar-frases`: a Conexão cai logo depois do clique (fechar a janela do Anki logo depois de confirmar basta).
- **O Anki abre de novo sem nenhum Chrome (decisão do dono, 2026-10-25).** Se depois disso o Anki abre e nenhum Chrome alcança a Conexão nos 60 s (o Chrome fechado, por exemplo no dia seguinte), a Conexão retoma sozinha o Envio das Frases apagadas: chama a OpenAI com a chave e cria no Anki as notas dessas Frases (na prova real, 24 chamadas e 24 notas). Quando um Chrome volta, o alarme apaga o que sobrou na Conexão, mas as notas e o gasto ficam. Se o pedido de apagar a chave também não chegou, ela fica na Conexão até a pessoa apagá-la de novo (o aviso “Falha local” do CFG-17). Fica assim, sem mudança de código.
