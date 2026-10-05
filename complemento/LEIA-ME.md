# A Conexão com o Anki, como complemento do Anki

Python só com a biblioteca padrão (o Anki do Mac roda o 3.9, sem Flask, waitress nem requests).
Nesta fatia ela sobe em `127.0.0.1:8766`, numa thread, e responde só a saúde
(`GET /health`: `{ ok, versao, perfil }`, aberta a qualquer cliente local; o resto exige a origem da extensão e será POST: `contrato/LEIA-ME.md`). A Conexão de hoje (`bridge/`) não é tocada.

| Arquivo | O que faz |
|---|---|
| `__init__.py` | O que o Anki importa. Fora do Anki (nos testes) não há `aqt` e nada acontece |
| `no_anki.py` | A ligação com o `mw` do Anki: `perfil_aberto` (só com a coleção aberta; selecionado na janela de perfis é `null`) e `ao_carregar` |
| `inicio.py` | Ao carregar: prepara `user_files`, o log e sobe a Conexão. Nunca levanta erro |
| `servidor.py` | O servidor HTTP e as rotas (`ROTAS`); só a extensão é atendida |
| `registro.py` | O logger do complemento: todo erro vai para `user_files/logs/complemento.log` |
| `pasta_de_dados.py` | `user_files/{fila,estado,custos,logs}`, que o Anki preserva nas atualizações |
| `configuracao.py` | Versão, porta e o ID da extensão |
| `contrato/` | Os exemplos que o complemento e o fake do e2e leem, e como uma rota nova entra |
| `empacotar.py` | Monta o `.ankiaddon` (e `conexao/perpetualminer.ankiaddon`, o que a extensão entrega no botão Baixar a Conexão com o Anki) |

## Testes

```bash
python3.9 complemento/test_servidor.py   # o servidor real, o contrato, o processo do Anki intacto
python3.9 complemento/test_inicio.py     # a pasta de dados, a Conexão no ar, a porta ocupada
python3.9 complemento/test_no_anki.py    # o adaptador do Anki (um mw de mentira), pelo HTTP
python3.9 complemento/test_pacote.py     # o conteúdo do .ankiaddon
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
4. Confira `user_files` do complemento (Ferramentas › Complementos › Ver arquivos): as pastas `fila`,
   `estado`, `custos` e `logs` existem, e o log diz “Conexão ouvindo em 127.0.0.1:8766”.
5. Sem resposta em 2 minutos, a tela mostra o checklist de 3 itens e Baixar de novo.

O `package` do manifesto (`perpetualminer`) é provisório: vira o id do AnkiWeb quando o complemento for publicado.
