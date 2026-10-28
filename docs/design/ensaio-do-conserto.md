# Ensaio do dono: o Consertar sozinho (#152)

O abridor fecha à força o Anki que não responde, liga a Conexão desativada pelo `meta.json` e reinicia o Anki. Os testes do repositório
rodam o script do Mac com programas de mentira (`complemento/test_conserto.py`) e a extensão contra um abridor de mentira
(`e2e/tests/painel-conserto.spec.js`): **nenhum Anki de verdade foi fechado**. Isto é o que só o ensaio do dono mostra (riscos 3 e 12 do #138).
**Custo aceito:** fechar à força pode perder o Cartão que a pessoa editava no Anki.

Antes: a Conexão nova no Anki (`python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon`, ou o botão Baixar a Conexão com o Anki),
um perfil aberto uma vez (é aí que o script é escrito em `user_files/abridor`), a permissão do abridor dada (passo 4 da primeira conexão) e uma Frase minerada.
Use um perfil de teste do Anki, nunca o principal. Em todos os cenários o painel é o da área Frases, com a Frase marcada e **Enviar ao Anki**.

| # | Cenário | Como provocar | O que deve acontecer |
|---|---|---|---|
| 1 | **Anki travado (risco 3)** | Mac: `kill -STOP <pid do Anki>`. Windows: suspenda o processo no Process Explorer | A faixa diz “Abrindo o Anki para enviar…” e, depois de ~3 s, “Conferindo a Conexão com o Anki…”. Com ~30 s o Anki fecha sozinho e abre de novo; o toast diz “O Anki travou e foi reiniciado.” e a Frase sai |
| 2 | **Complemento desativado (risco 3)** | Ferramentas › Complementos › PerpetualMiner › Desativar; reinicie o Anki à mão (a Conexão não sobe) | Enviar: o Anki fecha pelo caminho normal, abre de novo com a Conexão ligada e o toast diz “A Conexão com o Anki foi ligada de novo e o Anki reiniciou.” O `meta.json` do complemento tem `"disabled": false` e o resto igual; `user_files/abridor/meta.json.antes` guarda o de antes |
| 3 | **Anki fechado pela pessoa** | Feche o Anki | Enviar abre o Anki (já era assim, #150). Nenhum conserto o fecha nem o abre por si: abridor `consertar` responde `fechado` |
| 4 | **Anki fechado durante a espera** | Em 1, feche o Anki (retome e feche) antes dos 30 s | O Anki continua fechado: nada o reabre |
| 5 | **Complemento sumiu** | Ferramentas › Complementos › PerpetualMiner › Remover; reinicie o Anki | Enviar: “A Conexão com o Anki não está mais no Anki.” com **Instalar de novo**, que leva ao passo da primeira conexão. Anote o recado do Chrome (“Specified native messaging host not found.” ou “Failed to start native messaging host.”) |
| 6 | **O conserto falha** | Um Anki que não fecha (processo protegido), ou `meta.json` ilegível | “Não deu para consertar. Feche o Anki e abra de novo.” com **Baixar diagnóstico**: o arquivo diz o desfecho e os passos |
| 7 | **App Nap (risco 12), só no Mac** | Deixe o Anki em segundo plano, escondido, por mais de 10 min e aperte Enviar | A Conexão responde (a lista de perfis volta em poucos segundos) e nada é fechado. Se aparecer “O Anki travou…” com o Anki só dormindo, é falso positivo: anote quanto tempo ele ficou em segundo plano. O App Nap não apareceu no protótipo do #111; só o ensaio diz |
| 8 | **O programa que o Anki roda** | Mac: `ps -axww -o pid=,command= \| grep -i anki` com o Anki aberto | A linha do Anki começa com o mesmo caminho que está em `EXECUTAVEL=` de `user_files/abridor/abrir-o-anki.sh` (no Anki novo, o Python do `AnkiProgramFiles`; no antigo, `Anki.app/Contents/MacOS/anki`). Se diferir (um link simbólico, `/private`…), o abridor responde `fechado` e **não fecha nada**: seguro, mas o conserto não age |

Anote para cada cenário: sistema, navegador, versão do Anki, o que a tela disse e o que o Anki fez. O `.ps1` do Windows nunca rodou além de
uma conferência (`conferir`): os cenários 1, 2, 5 e 6 no Windows são os primeiros em que ele fecha e abre o Anki.
