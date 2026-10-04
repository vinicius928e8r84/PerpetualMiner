# Anki Bridge

Bridge local residente para integrar o painel do PerpetualMiner com o pipeline de cards em `engine/` (o Automatic Anki, que vive neste repositorio).

## O que faz

- expoe uma API HTTP local em `http://127.0.0.1:8766`
- recebe jobs do painel
- separa e processa lotes sequencialmente
- abre o Anki Desktop se necessario
- espera o AnkiConnect responder
- preserva os artefatos do job para retry

## Instalacao

1. Instale as dependencias do bridge e do engine (o pipeline de cards e a pasta `engine/` deste repo):

```powershell
pip install -r bridge/requirements.txt -r engine/requirements.txt
```

2. Ajuste `bridge/config.json` se o caminho do Anki Desktop for diferente (`automatic_anki_path` ja aponta para `engine`).
3. Rode uma vez:

```powershell
python bridge/install_autostart.py
```

Isso registra o autostart `PerpetualMinerAnkiBridge` no Windows. O instalador tenta usar uma Tarefa Agendada no logon; se o Windows negar permissao, usa a chave `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; se o registro tambem estiver bloqueado, usa a pasta Startup do usuario. A partir dai, o bridge sobe automaticamente quando o usuario entra no Windows, sem precisar abrir terminal nem iniciar o bridge manualmente todos os dias.

O instalador e idempotente: rodar de novo atualiza o autostart existente, remove launchers antigos quando possivel e inicia o bridge imediatamente.

## Desinstalacao do autostart

```powershell
python bridge/uninstall_autostart.py
```

## Execucao manual

Use apenas para debug:

```powershell
python bridge/server.py
```

## Ambiente Python e testes (Linux e macOS)

Os testes do bridge e do engine rodam em Linux e macOS, sem Anki e sem Windows. Na raiz do repositorio:

```bash
scripts/preparar-python.sh
```

O script cria o venv `.venv` e instala `bridge/requirements.txt` e `engine/requirements.txt`. Sem sudo, e sem alterar o Python do sistema: as dependencias ficam so no venv (o pip mantem o cache dele fora do repositorio, em `~/.cache/pip`). Em hosts Debian/Ubuntu sem `python3-venv`, o `python3 -m venv` nao traz o pip; o script cria o venv com `--without-pip` e instala o pip com o `get-pip.py` oficial. A mao, o equivalente e:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r bridge/requirements.txt -r engine/requirements.txt
```

Os testes (rode da raiz; o `python` nao existe em todo host, use `python3` ou o do venv):

```bash
.venv/bin/python -m unittest discover -s bridge -p "test_*.py"
.venv/bin/python -m unittest discover -s engine -p "test_*.py"
```

Para um arquivo so, use o venv: `.venv/bin/python bridge/test_envio.py`. Esse arquivo nao precisa do Flask, mas importa `requests` (via `envio` e `anki_session`); com `python3` do sistema ele so roda se o `requests` ja estiver instalado la. `test_anki_launcher.py` e `test_envio_api.py` precisam do Flask.

## Logs

- `bridge/runtime/bridge.log`: log principal do servidor.
- `bridge/runtime/bridge-autostart.log`: log curto do launcher automatico.

## API

- `GET /health`
- `GET /jobs`
- `GET /jobs/<job_id>`
- `POST /jobs`
- `POST /jobs/<job_id>/retry`
- `GET /analytics/summary`
- `GET /analytics/jobs`
- `GET /anki/status`
- `POST /anki/repair`
- `GET /anki/stats/decks`
- `GET /anki/deck-stats` (alias legado)

`/anki/stats/decks` tenta usar AnkiConnect primeiro. Se o Anki estiver fechado, invisivel ou sem
AnkiConnect, o bridge calcula cards/termos em modo somente leitura a partir do `collection.anki2`
do perfil configurado. Esse fallback serve para o painel de progresso; criar cards ainda exige
Anki Desktop + AnkiConnect funcionando.

`uniqueTerms` conta termos alvo minerados no deck. Em ingles, o bridge extrai o alvo do verso
gerado ou do trecho em negrito da frente; em russo, a frase da frente e tratada como alvo. O
retorno tambem inclui `vocabulary.phraseVocabulary` para palavras uteis presentes nas frases e
`vocabulary.avgNewPhraseVocabularyPerCard` para a media incremental de palavras novas por card.
`uniqueFronts` e `uniqueTermTokens` continuam existindo por compatibilidade.
