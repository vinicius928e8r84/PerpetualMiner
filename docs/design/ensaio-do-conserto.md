# Ensaio do dono: o Consertar sozinho (#152)

O abridor fecha à força o Anki que não responde, liga a Conexão desativada pelo `meta.json` e reinicia o Anki. Os testes do repositório
rodam o script do Mac com programas de mentira (`complemento/test_conserto.py`, `_meta`, `_windows`) e a extensão contra um abridor de
mentira (`e2e/tests/painel-conserto.spec.js`): **nenhum Anki de verdade foi fechado, e o `.ps1` do Windows nunca rodou além de um `conferir`**.
Isto é o que só o ensaio do dono mostra (riscos 3 e 12 do #138). **Custo aceito:** fechar à força pode perder o Cartão que a pessoa editava.

Antes: a Conexão nova no Anki (`python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`, ou o botão Baixar a Conexão com o Anki),
um perfil aberto uma vez (é aí que o script é escrito em `user_files/abridor`), a permissão do abridor dada (passo 4 da primeira conexão) e uma Frase minerada.
Use um perfil de teste do Anki, nunca o principal. Em todos os cenários o painel é o da área Frases, com a Frase marcada e **Enviar ao Anki**.

**O que dispara o conserto.** A extensão só chama o abridor quando o `/health` da Conexão **não** responde (Anki fechado, Conexão desligada, porta
presa). Um Anki com a thread principal travada continua respondendo o `/health`: o Enviar não o conserta, e isso é outra fatia (issue à parte). Por
isso `kill -STOP` (cenário 1) não é o travamento real: ele para o processo inteiro, `/health` incluído.

**A regra de segurança.** O abridor só fecha à força um Anki que é **dono da porta 8766**. Se o Anki está aberto e quem ouve a porta é outro programa (ou
ninguém), o desfecho é `falhou` · `conexao_fora` e **nada é morto** (cenário 3). Se a pessoa fechou o Anki durante a espera, ou ele saiu antes do sinal,
o desfecho é `fechou` e **nada é aberto** (cenários 4 e 5).

## Mac e Windows

| # | Cenário | Como provocar | O que deve acontecer |
|---|---|---|---|
| 1 | **Processo parado (risco 3)** | Mac: `kill -STOP <pid do Anki>`. Windows: suspenda o processo no Process Explorer | A faixa diz “Abrindo o Anki para enviar…” e, depois de ~3 s, “Conferindo a Conexão com o Anki…”. Com ~30 s o Anki fecha sozinho e abre de novo; o toast diz “O Anki travou e foi reiniciado.” e a Frase sai. **Não é o travamento real** (ver acima) |
| 2 | **Travamento real da thread principal** | Console de depuração do Anki (Ctrl+Shift+;): `import time; time.sleep(120)`; aperte Enviar | Hoje **nada acontece** (o `/health` responde e a extensão não chama o abridor). Anote o que a tela diz: é a prova da issue do gatilho. Se, ao contrário, o abridor agir, anote com que desfecho |
| 3 | **Porta ocupada por outro programa** | Antes de abrir o Anki: `python3 -m http.server 8766 --bind 127.0.0.1` (Mac) ou qualquer programa ouvindo na 8766 (Windows); abra o Anki e aperte Enviar | Com ~30 s a faixa diz “O Anki está aberto, mas a Conexão com ele não subiu. Outro programa pode estar usando a porta 8766.” com **Baixar diagnóstico** (`conexao_fora`). **O Anki continua aberto**: confira o pid (`kill -0` / Gerenciador de Tarefas) e que o Cartão em edição está lá |
| 4 | **Anki fechado pela pessoa durante a espera** | Em 1, feche o Anki à força aos ~10 s; repita aos ~29 s | O Anki continua fechado. A faixa diz “Abra o Anki para enviar” e o diagnóstico traz `fechou`. Nada o reabre, nem a extensão (sem `abrir`) |
| 5 | **A corrida: o Anki sai bem na hora do sinal** | Em 1, feche o Anki entre os 29 s e os 34 s (várias vezes) | Sempre `fechou`, nunca “O Anki travou e foi reiniciado.” com um Anki aberto que ninguém mandou abrir |
| 6 | **Anki fechado pela pessoa** | Feche o Anki | Enviar abre o Anki (já era assim, #150). O abridor `consertar` responde `fechado` e a extensão manda `abrir` |
| 7 | **Complemento desativado (risco 3)** | Ferramentas › Complementos › PerpetualMiner › Desativar; reinicie o Anki à mão (a Conexão não sobe) | Enviar: o Anki fecha pelo caminho normal (TERM / `CloseMainWindow`), abre de novo com a Conexão ligada e o toast diz “A Conexão com o Anki foi ligada de novo e o Anki reiniciou.” O `meta.json` tem `"disabled": false` e o resto igual; `user_files/abridor/meta.json.antes` guarda o de antes, byte a byte |
| 8 | **Desativado, em cada estado do Anki** | Como em 7, com: um perfil aberto; a tela de perfis; a janela Adicionar com texto digitado; uma sincronização ao fechar | O Anki fecha antes de o `meta.json` ser mexido (ele não o regrava por cima). Com a janela Adicionar preenchida o Anki pode perguntar e **não fechar**: o abridor espera 30 s, diz `nao_fechou` e o `meta.json` fica intacto. Se o sync ao fechar passa de 30 s, anote (o Anki ainda roda) |
| 9 | **`meta.json` esquisito** | Ilegível (`{isto`); vazio; enorme (alguns MB, mais que o limite de argumentos do `osascript`); um link simbólico; `"disabled": "true"` (texto); `disabled` dentro de `config` | Ilegível/vazio/enorme: “Não deu para consertar…” (`meta_ilegivel`), nada é escrito e o Anki não é tocado. Link simbólico: o arquivo vira comum. `"true"` em texto: no Mac **não** conta como desativado, no Windows PowerShell 5.1 conta (`-eq $true`); anote. `config.disabled` nunca conta |
| 10 | **Complemento sumiu** | Ferramentas › Complementos › PerpetualMiner › Remover; reinicie o Anki | Enviar: “A Conexão com o Anki não está mais no Anki.” com **Instalar de novo**, que leva ao passo da primeira conexão. Anote o recado do Chrome (“Specified native messaging host not found.” ou “Failed to start native messaging host.”) e também com o host presente mas sem permissão de execução |
| 11 | **O conserto falha** | Um Anki que não fecha (processo protegido) | “Não deu para consertar. Feche o Anki e abra de novo.” com **Baixar diagnóstico**: o arquivo diz o desfecho e os passos |
| 12 | **Depois de cada kill** | Em 1, 5 e 7 | Ferramentas › Verificar banco de dados sem erro, e a última revisão feita antes do kill está lá |
| 13 | **Fechar o popup no meio** | Em 1, feche o popup durante o “Abrir o Anki” que conserta | O conserto termina sozinho (é o abridor que age); anote o que ficou aberto |
| 14 | **App Nap (risco 12), só no Mac** | Deixe o Anki em segundo plano, escondido, por mais de 10 min e aperte Enviar | A Conexão responde e nada é fechado. Se aparecer “O Anki travou…” com o Anki só dormindo, é falso positivo: anote quanto tempo ele ficou em segundo plano |

### Só no Mac

| # | Cenário | Como provocar | O que deve acontecer |
|---|---|---|---|
| M1 | **O programa que o Anki roda** | `ps -x -U $(id -u) -ww -o pid=,command= \| grep -i anki` com o Anki aberto | A linha do Anki começa com o mesmo caminho que está em `EXECUTAVEL=` de `user_files/abridor/abrir-o-anki.sh` (no Anki novo, o Python do `AnkiProgramFiles`; no antigo, `Anki.app/Contents/MacOS/anki`). Se diferir (um link simbólico, `/private`…), o abridor responde `fechado` e **não fecha nada**: seguro, mas o conserto não age |
| M2 | **Quem ouve a porta** | `lsof -nP -iTCP:8766 -sTCP:LISTEN -t` com o Anki aberto | Imprime o pid de uma das linhas do M1. Se imprimir outro pid, o abridor não mata (cenário 3) |
| M3 | **Anki de outra conta** | Troca rápida de usuário, com o Anki aberto na outra conta | O `ps -x -U` só vê os processos da própria pessoa: o abridor responde `fechado`, sem esperar 30 s nem tentar `kill` |

## Só no Windows (o `.ps1` nunca rodou: leia-o linha a linha neste ensaio)

Rode o `abrir-o-anki.bat` pelo Chrome (ou o `.ps1` com `powershell -ExecutionPolicy Bypass`) e confira, na ordem do `Consertar`:

| # | O que o `.ps1` faz | O que conferir |
|---|---|---|
| W1 | `ProcessosDoAnki`: `Get-Process \| ? { $_.Path -ieq $programaDoAnki }` | `Get-Process \| ? Path -ieq '<$programaDoAnki>'` lista **só** o Anki, com `MainWindowHandle` ≠ 0 na janela principal. No Anki 25 com launcher, o `python.exe` do venv pode ser só um redirecionador e o Anki de verdade um processo filho: se for assim, a lista não o acha e o abridor responde `fechado` (seguro, mas não age) |
| W2 | `ConexaoResponde`: `Invoke-WebRequest -Method Post` em `/anki/profiles`, `-TimeoutSec 3` | Responde 200 com o Anki vivo e dá erro com a thread principal travada |
| W3 | `ConexaoEDoAnki`: `Get-NetTCPConnection -LocalPort 8766 -State Listen` › `OwningProcess` | O pid é um dos de W1. Com um programa qualquer na 8766 o abridor diz `conexao_fora` e não mata (cenário 3). Num Windows sem `Get-NetTCPConnection` também cai em `conexao_fora` |
| W4 | `Stop-Process -Id … -Force` por processo, contando `$recebeu` | Só os de W1 morrem. Se o Anki sai antes do sinal, `$recebeu` fica 0 e a resposta é `fechou` (cenário 5), nunca `reiniciado` |
| W5 | Desativado: `CloseMainWindow()` em cada processo | Fecha o Anki **com janela**; sem janela devolve `false` e o abridor espera 30 s e diz `nao_fechou` |
| W6 | `ConvertFrom-Json` / `ConvertTo-Json -Depth 32` do Windows PowerShell 5.1 | O `meta.json` volta com o resto igual (ordem das chaves, números, acentos), sem BOM; compare com `meta.json.antes` |
| W7 | `[IO.File]::Copy` para `meta.json.antes`, `WriteAllText` em `meta.json.novo` e `Move-Item -Force` | Nenhum `.novo` sobra; um `meta.json` aberto por outro programa dá `meta_nao_gravou` |
| W8 | `Start-Process` do Anki no perfil marcado | O Anki aberto pelo host **continua aberto** depois que o host sai (o Chrome roda o host num job object) |
| W9 | O `.bat` chama o PowerShell com `-ExecutionPolicy Bypass` | Uma política do computador que bloqueie o PowerShell faz o passo dizer que o abridor não respondeu |

Anote para cada cenário: sistema, navegador, versão do Anki, o que a tela disse e o que o Anki fez. Os cenários 1, 3, 4, 5, 7 e 10 no Windows são os
primeiros em que o `.ps1` fecha e abre o Anki de verdade.
