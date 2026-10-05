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
| `item_de_login.py` | O item de login de “Abrir o Anki com o computador”: um LaunchAgent no Mac, um atalho na pasta Inicializar no Windows (o `.lnk` escrito byte a byte, sem COM nem PowerShell). Ligar escreve, desligar apaga; desligado por padrão |
| `registro.py` | O logger do complemento: todo erro vai para `user_files/logs/complemento.log` |
| `pasta_de_dados.py` | `user_files/{fila,estado,custos,logs}`, que o Anki preserva nas atualizações |
| `configuracao.py` | Versão, porta e o ID da extensão |
| `contrato/` | Os exemplos que o complemento e o fake do e2e leem, e como uma rota nova entra |
| `empacotar.py` | Monta o `.ankiaddon` |

## Testes

```bash
python3.9 complemento/test_servidor.py   # o servidor real, o contrato, o processo do Anki intacto
python3.9 complemento/test_inicio.py     # a pasta de dados, a Conexão no ar, a porta ocupada
python3.9 complemento/test_no_anki.py    # o adaptador do Anki (um mw de mentira), pelo HTTP
python3.9 complemento/test_pacote.py     # o conteúdo do .ankiaddon
python3.9 complemento/test_item_de_login.py  # o item de login escrito e apagado numa pasta temporária, por sistema
```

Rode todos também com `python3.12` e `python3.13`. Sem os interpretadores: `uv python install 3.9 3.13`.

## Ensaio do dono, no Mac

1. `python3 complemento/empacotar.py` gera `dist/perpetualminer.ankiaddon`.
2. Abra o arquivo (o Anki mostra o aviso de complementos; Sim) e reinicie o Anki.
3. Com a extensão carregada, abra o painel › Conexão com o Anki: a área aparece ligada.
4. Confira `user_files` do complemento (Ferramentas › Complementos › Ver arquivos): as pastas `fila`,
   `estado`, `custos` e `logs` existem, e o log diz “Conexão ouvindo em 127.0.0.1:8766”.

O `package` do manifesto (`perpetualminer`) é provisório: vira o id do AnkiWeb quando o complemento for publicado.

### Ensaio do dono: Abrir o Anki com o computador (risco 5)

O item de login **nunca foi testado** num Mac nem num Windows de verdade: os testes só conferem o arquivo escrito. No ensaio:

1. Painel › Configurações › Conexão com o Anki: ligue **Abrir o Anki com o computador**.
2. **Mac:** o arquivo `~/Library/LaunchAgents/com.perpetualminer.abrir-o-anki.plist` existe; o macOS pode avisar “itens de segundo plano adicionados” (Ajustes › Geral › Itens de Início); saia da sessão e entre: o Anki abre sozinho? (`launchctl list | grep perpetualminer` mostra o item.)
3. **Windows:** `Anki (PerpetualMiner).lnk` está em `shell:startup` (Win+R); clique duas vezes nele: o Anki abre? Reinicie o computador: o Anki abre sozinho? O Gerenciador de Tarefas › Inicializar o lista?
4. Desligue o interruptor: o arquivo some. O atalho do Anki que a pessoa mesma pôs na pasta (se houver) fica.
5. Como o Anki é achado: o complemento usa `ANKI_LAUNCHER` (o abridor do Anki novo), depois o programa que roda o complemento, depois onde o instalador o põe; no Mac, `open -a Anki` se nada disso vale. Se o item não abrir o Anki certo, o aviso “não sabe onde o Anki está” (Windows) ou o conteúdo do `.plist` mostram o motivo.
