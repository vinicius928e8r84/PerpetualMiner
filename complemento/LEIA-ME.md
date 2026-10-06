# A Conexão com o Anki, como complemento do Anki

Python só com a biblioteca padrão (o Anki do Mac roda o 3.9, sem Flask, waitress nem requests).
Ela sobe em `127.0.0.1:8766`, numa thread, e responde a saúde
(`GET /health`: `{ ok, versao, perfil }`, aberta a qualquer cliente local) e as leituras da coleção do Anki
(`POST /anki/decks`, `/anki/stats/decks` e `/anki/vocabulary`); o resto exige a origem da extensão e é POST (`contrato/LEIA-ME.md`).
A Conexão de hoje (`bridge/`) só ganhou o mesmo POST nessas três rotas.

| Arquivo | O que faz |
|---|---|
| `__init__.py` | O que o Anki importa. Fora do Anki (nos testes) não há `aqt` e nada acontece |
| `no_anki.py` | A ligação com o `mw` do Anki: `perfil_aberto` (só com a coleção aberta; selecionado na janela de perfis é `null`), `LeitorDaColecaoDoAnki` (o adaptador da coleção: lê na thread principal do Anki, e a lista de perfis também sem coleção aberta) e `ao_carregar` |
| `inicio.py` | Ao carregar: prepara `user_files`, o log e sobe a Conexão. Nunca levanta erro |
| `servidor.py` | O servidor HTTP e as rotas (`ROTAS`); só a extensão é atendida |
| `baralhos.py` | O que se lê da coleção: a lista de Baralhos, os números de cada um e o vocabulário, só pelo lado de leitura de um adaptador da coleção (o contrato do adaptador está no topo do arquivo) |
| `normalizacao.py` | A lógica pura do vocabulário e dos números (a de `bridge/card_normalization.py`, só com a biblioteca padrão) |
| `item_de_login.py` | O item de login de “Abrir o Anki com o computador”: um LaunchAgent no Mac, um atalho na pasta Inicializar no Windows (o `.lnk` escrito byte a byte, sem COM nem PowerShell). Ligar escreve, desligar apaga; desligado por padrão |
| `registro.py` | O logger do complemento: todo erro vai para `user_files/logs/complemento.log` |
| `pasta_de_dados.py` | `user_files/{fila,estado,custos,logs}`, que o Anki preserva nas atualizações |
| `configuracao.py` | Versão, porta e o ID da extensão |
| `contrato/` | Os exemplos que o complemento e o fake do e2e leem, e como uma rota nova entra |
| `empacotar.py` | Monta o `.ankiaddon` (e `conexao/perpetualminer.ankiaddon`, o que a extensão entrega no botão Baixar a Conexão com o Anki) |

## Testes

```bash
python3.9 complemento/test_servidor.py   # o servidor real, o contrato, o processo do Anki intacto
python3.9 complemento/test_inicio.py     # a pasta de dados, a Conexão no ar, a porta ocupada
python3.9 complemento/test_no_anki.py    # o adaptador do Anki (um mw de mentira com sqlite), pelo HTTP
python3.9 complemento/test_colecao_em_memoria.py  # o adaptador em memória dos testes e o contrato que ele divide com o do Anki
python3.9 complemento/test_pacote.py     # o conteúdo do .ankiaddon
python3.9 complemento/test_item_de_login.py  # o item de login escrito e apagado numa pasta temporária, por sistema
```

Rode todos também com `python3.12` e `python3.13`. Sem os interpretadores: `uv python install 3.9 3.13`.

## O arquivo que a extensão entrega

A primeira conexão (passo “Pôr a Conexão no Anki”, #145) é um link de download de `conexao/perpetualminer.ankiaddon`, que vai
dentro do pacote da loja (sem permissão nova). Mudou o código do complemento? Refaça o arquivo:

```bash
python3 complemento/empacotar.py conexao/perpetualminer.ankiaddon
```

`test_pacote.py` falha enquanto o arquivo da extensão estiver para trás do código (o `LEIA-ME.md` e os testes não entram nele).

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
   `estado`, `custos` e `logs` existem, e o log diz “Conexão ouvindo em 127.0.0.1:8766”.
7. Sem resposta em 2 minutos (tente com o Anki fechado), a tela mostra o checklist de 3 itens e Baixar de novo.

O `package` do manifesto (`perpetualminer`) é provisório: vira o id do AnkiWeb quando o complemento for publicado.

### Ensaio do dono: Abrir o Anki com o computador (risco 5)

O item de login **nunca foi testado** num Mac nem num Windows de verdade: os testes só conferem o arquivo escrito. No ensaio:

1. Painel › Configurações › Conexão com o Anki: ligue **Abrir o Anki com o computador**.
2. **Mac:** o arquivo `~/Library/LaunchAgents/com.perpetualminer.abrir-o-anki.plist` existe; o macOS pode avisar “itens de segundo plano adicionados” (Ajustes › Geral › Itens de Início); saia da sessão e entre: o Anki abre sozinho? (`launchctl list | grep perpetualminer` mostra o item.)
3. **Windows:** `Anki (PerpetualMiner).lnk` está em `shell:startup` (Win+R); clique duas vezes nele: o Anki abre? Reinicie o computador: o Anki abre sozinho? O Gerenciador de Tarefas › Inicializar o lista?
4. Desligue o interruptor: o arquivo some. O atalho do Anki que a pessoa mesma pôs na pasta (se houver) fica.
5. Como o Anki é achado: o complemento usa `ANKI_LAUNCHER` (o abridor do Anki novo), depois o programa que roda o complemento, depois onde o instalador o põe; no Mac, `open -a Anki` se nada disso vale. Se o item não abrir o Anki certo, o aviso “não sabe onde o Anki está” (Windows) ou o conteúdo do `.plist` mostram o motivo.
