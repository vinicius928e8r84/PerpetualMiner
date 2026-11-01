# A passagem do Windows do dono (#178)

Fatia do mapa [#138](https://github.com/vinicius928e8r84/PerpetualMiner/issues/138), histórias 115 a 121. Na primeira vez que o Anki abre com a Conexão nova, ela
acha a Conexão de hoje (`bridge/`) na porta 8766 e faz a passagem **sem perguntar nada**. A pessoa só vê o fim: a de hoje sai e a nova ocupa a porta.
O código só serve ao PC do dono e pode sair numa versão seguinte (`inicio.iniciar(passagem=None)` o desliga; só o Windows o liga).

## A ordem

1. **Acha a de hoje.** `GET /health` na porta diz `bridge: "running"`, o processo (`runtime.pid`), a pasta do projeto, o motor, a fila e os Envios dela. Outro programa na
   porta, a porta livre, ou a Conexão nova mesma não são a de hoje. Feita a passagem, `user_files/passagem.json` evita outra.
2. **Espera o Envio de agora terminar** (a fila de hoje, `queue.json`, com um Envio `running`): a janela de dentro do Anki diz “Esperando o Envio de agora terminar”
   (`ANK-04.esperando`, no lugar de Ligada). Nada é copiado enquanto ele anda. Fechar o Anki cancela a espera.
3. **Copia, sem mover** (a origem fica byte a byte como estava):
   - a chave: o `OPENAI_API_KEY` do `.env` do motor de hoje vai para o cofre daqui, sem conferir na OpenAI e **sem conta** (uma chave que o cofre já tem fica);
   - o histórico de custos: `<Envio>/log/costs.jsonl` vira `custos/<Envio>/costs.jsonl`, **sem a Palavra** (a de hoje a leva em `keyword`; só ficam as marcas
     `[image_judge]` e `[image_guard]`, que a aba Custos separa) e cada Envio que terminou entra na fila daqui como histórico, só para a aba Custos (sem as Frases);
   - só os prompts editados: os `prompts/*.txt` de hoje que diferem dos padrões do complemento vão para `user_files/prompts` com o mesmo nome (a quebra de linha não conta);
   - o perfil do Anki: da configuração de hoje só o `anki_profile` é aproveitado, como o perfil marcado (se o Anki tem esse perfil; o caminho do Anki vem do próprio Anki);
   - a fila: o Envio `queued` ou `running` de hoje entra aqui `queued`, **sem as Frases que já chegaram ao Anki** (um Cartão pronto não é refeito). A fila de hoje é relida até
     uma leitura sem Envio novo, porque a de hoje liga o Envio seguinte logo que um termina.
4. **Apaga o início automático** (a Tarefa Agendada `PerpetualMinerAnkiBridge`, o valor `PerpetualMinerAnkiBridge` em HKCU Run, os lançadores `.cmd`/`.vbs` da pasta Inicializar e a
   Tarefa `PerpetualMinerAnkiBridgeWatchdog`, que religaria a de hoje a cada 3 minutos). Cada entrada é conferida antes e **só some se o Windows disse que apagou**: uma recusa
   para a passagem **antes** de tocar no processo.
5. **Encerra o processo de hoje** (`taskkill /PID <o pid que ela mesma disse> /F`, nunca por nome) **e espera a porta ficar livre**. Só então a Conexão nova sobe nela.

A porta só é liberada depois de tudo copiado. Qualquer falha deixa a de hoje no ar, vai ao registro (“A passagem não terminou…”), e a passagem tenta de novo na próxima vez que o Anki abrir
(o que já foi copiado não é duplicado: o mesmo Envio de hoje é o mesmo Envio aqui).

## Os Cartões antigos

Nada na coleção é tocado. Os Cartões do “Básico” nos Baralhos CIMV e RUSSIAN continuam como estão, e o Envio passado os reconhece como duplicata (a busca lê a frente do “Básico” de antes).

## A chave também sobe para a nuvem da conta (#94)?

Leitura da spec, não decisão escrita: a passagem **só copia**. A Conexão não tem o token da conta Google, então ela não consegue subir nada sozinha, e uma chave sem conta
(`conta: ""`, `naoEnviada: true`) já é, na regra de hoje do cofre (`chaves.py`), uma chave colada sem Google: a extensão pede que a pessoa a confirme na conta antes de
sincronizá-la. A construção não precisou da resposta; se o dono quiser que a chave copiada suba sozinha, é uma decisão nova (e um token que a Conexão não tem).

## Os prompts do dono

O complemento traz os prompts padrão (`motor/prompts/*.txt`). Um arquivo de **mesmo nome** em `user_files/prompts` (a pasta existe, vazia, desde que o complemento carrega) vale no lugar
do padrão no Envio seguinte; apagar o arquivo volta ao padrão; um arquivo vazio é como se não existisse. Isto é permanente (não é código da passagem). O Cartão Iniciante lê
`en_iniciante.txt` e `ru_iniciante.txt`: um `en_card.txt` ou `ru_card.txt` copiado da Conexão de hoje fica guardado, mas esses dois prompts só valem para quem os usa (o Cartão do bridge).

## Provado e não provado

- **Provado pelo `unittest`** (`test_passagem.py`, `test_passagem_cartoes.py`, `test_passagem_do_windows.py`, `test_prompts_do_dono.py`): uma Conexão de hoje de mentira (a pasta do projeto e o `/health`), a Conexão nova de verdade, a coleção
  em memória, a OpenAI de mentira e um Windows de mentira (os comandos entram por um executor que só anota; a pasta Inicializar é temporária). A espera, a fila, as cópias, a origem intacta, o perfil, a ordem
  (a porta só depois de tudo copiado), a falha que deixa a de hoje no ar, os Cartões do “Básico” como duplicata e os prompts do dono.
- **Não provado aqui (PENDENTE, do dono):** a passagem real no Windows do dono (`schtasks`, `reg`, `taskkill` e a pasta Inicializar de verdade, o processo de hoje de verdade, o Anki de verdade). Ensaio: feche o Envio
  de agora ou deixe-o terminar, instale a Conexão nova, abra o Anki e confira: a janela diz “Esperando o Envio de agora terminar”; depois a Conexão de hoje sumiu (`GET /health` sem `bridge`), a Tarefa Agendada, o Run e
  os lançadores sumiram, `user_files/passagem.json` existe, a aba Custos mostra o histórico, a chave está no card da IA (`••••` + 4 últimos), o perfil marcado é o de sempre e a pasta do projeto antiga está intacta.

## A cópia

Só `ANK-04.esperando` (em `dentro-do-anki.md`, por ID). A passagem não tem tela própria nem rota nova entre a extensão e a Conexão: enquanto ela acontece a porta ainda é da de hoje, que a extensão
continua usando, então o contrato (`complemento/contrato/`) não muda.
