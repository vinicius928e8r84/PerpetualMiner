# A Conexão com o Anki, como complemento do Anki

Python só com a biblioteca padrão (o Anki do Mac roda o 3.9, sem Flask, waitress nem requests).
Ela sobe em `127.0.0.1:8766`, numa thread, e responde a saúde
(`GET /health`: `{ ok, versao, perfil }`, aberta a qualquer cliente local), as leituras da coleção do Anki
(`POST /anki/decks`, `/anki/stats/decks` e `/anki/vocabulary`) e a chave da OpenAI
(`POST /ia/openai/chave` confere a chave na OpenAI e guarda uma cópia; `POST /ia/estado` diz se há cópia e como ela termina); o resto exige a origem da extensão e é POST (`contrato/LEIA-ME.md`).
A Conexão de hoje (`bridge/`) só ganhou o mesmo POST nas três rotas da coleção.

| Arquivo | O que faz |
|---|---|
| `__init__.py` | O que o Anki importa. Fora do Anki (nos testes) não há `aqt` e nada acontece |
| `no_anki.py` | A ligação com o `mw` do Anki: `perfil_aberto` (só com a coleção aberta; selecionado na janela de perfis é `null`), `ColecaoDoAnki` (o adaptador da coleção: lê na thread principal do Anki, e a lista de perfis também sem coleção aberta) e `ao_carregar` |
| `inicio.py` | Ao carregar: prepara `user_files`, o log e sobe a Conexão. Nunca levanta erro |
| `servidor.py` | O servidor HTTP e as rotas (`ROTAS`); só a extensão é atendida |
| `baralhos.py` | O que se lê da coleção: a lista de Baralhos, os números de cada um e o vocabulário, só pelo lado de leitura de um adaptador da coleção (o contrato do adaptador está no topo do arquivo) |
| `normalizacao.py` | A lógica pura do vocabulário e dos números (a de `bridge/card_normalization.py`, só com a biblioteca padrão) |
| `chaves.py` | O cofre das chaves: `user_files/chaves/openai.json`, só do dono (0600), gravado de uma vez; a chave inteira só sai daqui para o pedido que a gasta |
| `openai_api.py` | Conferir uma chave da OpenAI (`GET /v1/models` e um `POST /v1/embeddings` de uma palavra, só com a biblioteca padrão): recusada, sem crédito, organização não verificada ou a OpenAI fora do ar. Nunca copia o que a OpenAI diz ao recusar para o log nem para a resposta |
| `item_de_login.py` | O item de login de “Abrir o Anki com o computador”: um LaunchAgent no Mac, um atalho na pasta Inicializar no Windows (o `.lnk` escrito byte a byte, sem COM nem PowerShell). Ligar escreve, desligar apaga; desligado por padrão |
| `abridor.py` | O abridor de “Abrir o Anki sozinho” (#147): ao carregar e a cada perfil que abre, escreve em `user_files/abridor` o script com o caminho do Anki e o perfil (`.sh` no Mac; no Windows, um `.bat` que chama com o PowerShell do Windows o `.ps1` ao lado) e o registra como host de Native Messaging `com.perpetualminer.abridor`, só para a origem da extensão: no Mac, o manifesto na pasta de hosts do Chrome; no Windows, o valor padrão de `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.perpetualminer.abridor` (Opera GX 136 encontrou e chamou o host só nessa chave HKCU do Chrome num Windows real, ensaio W4 de 2026-10-10; não confirma outros builds do Opera. A ajuda do Opera cita HKLM, não HKCU). O script só responde `conferir` (o Anki está lá?) e `abrir` (abre o Anki com `-p "<perfil>"`), pelos exemplos de `contrato/exemplos.json` › `abridor`. Escrever falhou: vai ao log, a Conexão sobe assim mesmo |
| `registro.py` | O logger do complemento: todo erro vai para `user_files/logs/complemento.log` |
| `pasta_de_dados.py` | `user_files/{fila,estado,custos,logs,chaves}`, que o Anki preserva nas atualizações |
| `configuracao.py` | Versão, porta e o ID da extensão |
| `contrato/` | Os exemplos que o complemento e o fake do e2e leem, e como uma rota nova entra |
| `empacotar.py` | Monta o `.ankiaddon` (e `conexao/perpetualminer.ankiaddon`, o que a extensão entrega no botão Baixar a Conexão com o Anki) |
| `versoes.json` | O hash das fontes do pacote por `VERSAO` (fora do `.ankiaddon`); `test_pacote.py` falha, pedindo para subir a `VERSAO`, se as fontes mudam e a versão não |

## Testes

```bash
python3.9 complemento/test_servidor.py   # o servidor real, o contrato, o processo do Anki intacto
python3.9 complemento/test_inicio.py     # a pasta de dados, a Conexão no ar, a porta ocupada
python3.9 complemento/test_no_anki.py    # o adaptador do Anki (um mw de mentira com sqlite), pelo HTTP
python3.9 complemento/test_colecao_em_memoria.py  # o adaptador em memória dos testes e o contrato que ele divide com o do Anki
python3.9 complemento/test_pacote.py     # o conteúdo do .ankiaddon (sem user_files, nem a chave)
python3.9 complemento/test_item_de_login.py  # o item de login escrito e apagado numa pasta temporária, por sistema
python3.9 complemento/test_abridor.py        # o abridor escrito e registrado numa pasta temporária, por sistema; o script do Mac roda (e o .ps1, onde houver pwsh)
python3.9 complemento/test_chave_da_openai.py  # a chave: o que atravessa o HTTP, o que fica no disco, o que o log guarda
```

Rode todos também com `python3.12` e `python3.13`. Sem os interpretadores: `uv python install 3.9 3.13`.

## O arquivo que a extensão entrega

A primeira conexão (passo “Pôr a Conexão no Anki”, #145) é um link de download de `conexao/perpetualminer.ankiaddon`, que vai
dentro do pacote da loja (sem permissão nova). Mudou o código do complemento? Refaça o arquivo:

```bash
python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon
```

`test_pacote.py` falha enquanto o arquivo da extensão estiver para trás do código (o `LEIA-ME.md` e os testes não entram nele).
Sem mudar o código, refazer o arquivo dá os mesmos bytes (o `mod` do manifest só sobe quando o código muda; `SOURCE_DATE_EPOCH` o fixa).

Mudou o código do pacote (qualquer byte, comentário incluso: é o que o Anki instala)? Suba a `VERSAO` em `configuracao.py` e registre-a em
`versoes.json` com o hash que `test_pacote.py` mostra ao falhar (`python3 -c "from complemento import empacotar; print(empacotar.hash_das_fontes())"`
na raiz do repositório). Depois refaça o arquivo da extensão. Um `VERSAO` que sobe muda a `versao` dos exemplos de saúde de `contrato/exemplos.json`.

## Ensaio do dono, no Mac

1. Com a extensão carregada, abra o painel › Conexão com o Anki (ou a Boas-vindas, passo 4): **Baixar a Conexão com o Anki**.
   (Sem a extensão: `python3 complemento/empacotar.py` gera `dist/perpetualminer.ankiaddon`.)
2. Abra o arquivo baixado, com o Anki **fechado** de propósito: o Anki abre sozinho e pergunta se você quer instalar; responda Sim.
3. Reinicie o Anki. A tela confere sozinha e diz “Achei o Anki · perfil · versão”.
4. Com um perfil aberto, abra o painel › Conexão com o Anki: **Baralhos e termos** e **Vocabulário** mostram os
   números e as palavras dos Baralhos dos Ajustes de envio, e **Ajustes de envio** lista os Baralhos do Anki.
5. Com a Mineração automática ligada, toque uma legenda num vídeo: ela é minerada e aparece em Frases (antes, sem
   o vocabulário do Baralho, não minerava nada).
6. Confira `user_files` do complemento (Ferramentas › Complementos › Ver arquivos): as pastas `fila`,
   `estado`, `custos`, `logs` e `chaves` existem, e o log diz “Conexão ouvindo em 127.0.0.1:8766”.
7. No painel › Configurações › IA dos cartões, cole uma chave da OpenAI de verdade (de preferência de um projeto
   com limite de gasto): a tela deve mostrar “Chave conferida” com `••••••••` e os 4 últimos caracteres. Em
   `user_files/chaves/openai.json` fica a cópia (só você a lê); o log (`user_files/logs/complemento.log`) não pode
   ter a chave. Depois cole uma chave inventada (`sk-proj-` e letras): a faixa deve dizer que a OpenAI a recusou.
   Se o Anki do Mac não achar os certificados do sistema, a conferência volta “Não deu para falar com a OpenAI”:
   anote o texto do Detalhes.
8. Sem resposta em 2 minutos (tente com o Anki fechado), a tela mostra o checklist de 3 itens e Baixar de novo.

`test_openai_de_mentira.py` não é teste: é a OpenAI de mentira (um servidor local) que os testes põem no lugar da de verdade.

O `package` do manifesto (`perpetualminer`) é provisório: vira o id do AnkiWeb quando o complemento for publicado.

### Ensaio do dono: Abrir o Anki com o computador (risco 5)

O item de login **nunca foi testado** num Mac nem num Windows de verdade: os testes só conferem o arquivo escrito. No ensaio:

1. Painel › Configurações › Conexão com o Anki: ligue **Abrir o Anki com o computador**.
2. **Mac:** o arquivo `~/Library/LaunchAgents/com.perpetualminer.abrir-o-anki.plist` existe; o macOS pode avisar “itens de segundo plano adicionados” (Ajustes › Geral › Itens de Início); saia da sessão e entre: o Anki abre sozinho? (`launchctl list | grep perpetualminer` mostra o item.)
3. **Windows:** `Anki (PerpetualMiner).lnk` está em `shell:startup` (Win+R); clique duas vezes nele: o Anki abre? Reinicie o computador: o Anki abre sozinho? O Gerenciador de Tarefas › Inicializar o lista?
4. Desligue o interruptor: o arquivo some. O atalho do Anki que a pessoa mesma pôs na pasta (se houver) fica.
5. Como o Anki é achado: o complemento usa `ANKI_LAUNCHER` (o abridor do Anki novo), depois o programa que roda o complemento, depois onde o instalador o põe; no Mac, `open -a Anki` se nada disso vale. Se o item não abrir o Anki certo, o aviso “não sabe onde o Anki está” (Windows) ou o conteúdo do `.plist` mostram o motivo.

### Ensaio do dono: Abrir o Anki sozinho (riscos 1 e 2 do #138)

O abridor **não foi testado num Mac de verdade**. No Windows real (ensaio de 2026-10-10), o complemento escreveu e registrou o host;
o PowerShell 5.1 respondeu `conferir` e recusou as cinco ações inválidas sem abrir outro Anki. Chrome 153 e Opera GX 136, em perfis separados,
encontraram e chamaram o host registrado só em HKCU do Chrome, com permissão nativa concedida por UI Automation. Isso não prova outros builds
nem o fluxo visual do painel: a porta 8766 estava ocupada, `/health` e os passos do painel não foram exercitados; `abrir` não foi executado.
`test_abridor.py` escreve e registra só em pastas temporárias / registro de mentira;
no Linux, roda o `.sh` com o mesmo parser JavaScript em Node (a CLI do JXA é adaptada), não o `/usr/bin/osascript` real. O e2e usa um abridor de mentira.
`test_inicio.py` e `test_no_anki.py` desativam o abridor explicitamente (`abridor=None`); os ensaios de registro injetam só destinos temporários.
Isso não confirma a aceitação do dono:

| Confirmação exigida antes de fechar #147 | Estado | Prova do dono |
|---|---|---|
| Risco 1 — Opera no Windows encontra e chama o host registrado | **VERIFICADO: Opera GX 136** | W4, Windows real, 2026-10-10: host só em `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts`, `conferirOAnki()` → `achou`. Outros builds e fluxo visual do painel não confirmados; aceitação final (S5) permanece **PENDING OWNER** |
| Risco 2 — Chrome no Mac chama o host e abre o Anki sem pergunta do macOS | **PENDING OWNER** | Ainda não registrada |
| Comparação/aprovação visual do passo 3 e do Pronto (S4) | **PENDING OWNER** | Propostas continuam `test.fixme`, sem PNG aprovado |

Não fechar #147 com base nos testes de Linux, num ✓ de `conferir`, ou na abertura pelo Terminal. Registrar sistema, navegador, resultado,
data e confirmação do dono (ou a mudança explícita do critério de aceitação) antes do fechamento. O que só o ensaio mostra:

1. Com o complemento novo no Anki (refaça o arquivo: `python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`), abra o Anki
   e um perfil. Em `user_files/abridor` (Ferramentas › Complementos › Ver arquivos) aparece o script; o log diz “O abridor não foi escrito”
   só se algo falhou.
2. Painel › Conexão com o Anki (nunca conectada) ou Boas-vindas › passo 4: depois de “Achei o Anki”, **Permitir abrir o Anki**. O Chrome
   mostra o aviso da permissão (“Comunicar-se com aplicativos nativos cooperativos”); responda Permitir. A tela deve dizer
   “O Anki abre sozinho quando um Envio precisar.” e o passo virar ✓. Nada abre nem fecha.
3. **Mac (risco 2):** o manifesto está em `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.perpetualminer.abridor.json`
   e aponta para `…/user_files/abridor/abrir-o-anki.sh`. Para ver o `abrir` (que o Envio vai usar, #150), feche o Anki e rode, no Terminal,
   `printf '\x13\x00\x00\x00{"acao":"abrir"}' | sh "<o caminho do script>" | tail -c +5`: o Anki abre no perfil anotado, **sem pergunta
   do macOS**? A resposta é `{"achou":true,"abriu":true}`. Se o macOS perguntar algo (Gatekeeper, “Terminal quer controlar…”), anote o texto.
   Isto é só uma aproximação: o macOS julga o script que o Terminal roda de um jeito e o que o Chrome roda de outro, e a extensão só
   manda `abrir` a partir do Envio (#150). O risco 2 de verdade (o Chrome chama, o Anki abre sem pergunta) continua **PENDING OWNER**:
   se o ensaio depender do #150, #147 permanece pendente até essa confirmação ou uma mudança explícita do critério pelo dono.
4. **Windows com o Chrome:** `reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.perpetualminer.abridor"` mostra o caminho
   do manifesto em `user_files\abridor`. O passo 2 acima dá ✓? Se a política do computador bloquear o PowerShell (`-ExecutionPolicy Bypass`
   não basta), o passo diz que o abridor não respondeu, com o Detalhes: anote o texto.
5. **Windows com o Opera (risco 1):** instale a extensão no Opera e repita o passo 2. O Opera acha o host registrado na chave do Chrome?
   Se não achar (o passo diz que o abridor não respondeu, “Specified native messaging host not found.”), o conserto é registrar também
   na chave que o Opera lê: uma linha em `ONDE_REGISTRAR_NO_WINDOWS` (`abridor.py`) e a constante do teste.
6. **Agora não:** num perfil novo do Chrome, aperte Agora não: o passo fica “agora não” e o Pronto devolve as abas.
