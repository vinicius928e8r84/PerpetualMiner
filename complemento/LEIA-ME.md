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
| `no_anki.py` | A ligação com o `mw` do Anki: `perfil_aberto` (só com a coleção aberta; selecionado na janela de perfis é `null`), `LeitorDaColecaoDoAnki` (o adaptador da coleção: lê na thread principal do Anki, e a lista de perfis também sem coleção aberta) e `ao_carregar` |
| `inicio.py` | Ao carregar: prepara `user_files`, o log e sobe a Conexão. Nunca levanta erro |
| `servidor.py` | O servidor HTTP e as rotas (`ROTAS`); só a extensão é atendida |
| `baralhos.py` | O que se lê da coleção: a lista de Baralhos, os números de cada um e o vocabulário, só pelo lado de leitura de um adaptador da coleção (o contrato do adaptador está no topo do arquivo) |
| `normalizacao.py` | A lógica pura do vocabulário e dos números (a de `bridge/card_normalization.py`, só com a biblioteca padrão) |
| `chaves.py` | O cofre das chaves: `user_files/chaves/openai.json`, só do dono (0600), gravado de uma vez; a chave inteira só sai daqui para o pedido que a gasta |
| `openai_api.py` | Conferir uma chave da OpenAI (`GET /v1/models` e um `POST /v1/embeddings` de uma palavra, só com a biblioteca padrão): recusada, sem crédito, organização não verificada ou a OpenAI fora do ar. Nunca copia o que a OpenAI diz ao recusar para o log nem para a resposta |
| `registro.py` | O logger do complemento: todo erro vai para `user_files/logs/complemento.log` |
| `pasta_de_dados.py` | `user_files/{fila,estado,custos,logs,chaves}`, que o Anki preserva nas atualizações |
| `configuracao.py` | Versão, porta e o ID da extensão |
| `contrato/` | Os exemplos que o complemento e o fake do e2e leem, e como uma rota nova entra |
| `empacotar.py` | Monta o `.ankiaddon` |

## Testes

```bash
python3.9 complemento/test_servidor.py   # o servidor real, o contrato, o processo do Anki intacto
python3.9 complemento/test_inicio.py     # a pasta de dados, a Conexão no ar, a porta ocupada
python3.9 complemento/test_no_anki.py    # o adaptador do Anki (um mw de mentira com sqlite), pelo HTTP
python3.9 complemento/test_colecao_em_memoria.py  # o adaptador em memória dos testes e o contrato que ele divide com o do Anki
python3.9 complemento/test_pacote.py     # o conteúdo do .ankiaddon (sem user_files, nem a chave)
python3.9 complemento/test_chave_da_openai.py  # a chave: o que atravessa o HTTP, o que fica no disco, o que o log guarda
```

Rode todos também com `python3.12` e `python3.13`. Sem os interpretadores: `uv python install 3.9 3.13`.

## Ensaio do dono, no Mac

1. `python3 complemento/empacotar.py` gera `dist/perpetualminer.ankiaddon`.
2. Abra o arquivo (o Anki mostra o aviso de complementos; Sim) e reinicie o Anki.
3. Com a extensão carregada, abra o painel › Conexão com o Anki: a área aparece ligada.
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

`test_openai_de_mentira.py` não é teste: é a OpenAI de mentira (um servidor local) que os testes põem no lugar da de verdade.

O `package` do manifesto (`perpetualminer`) é provisório: vira o id do AnkiWeb quando o complemento for publicado.
