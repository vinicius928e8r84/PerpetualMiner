# Anki Bridge

Bridge local residente para integrar o painel do PerpetualMiner com o pipeline do Automatic Anki.

## O que faz

- expoe uma API HTTP local em `http://127.0.0.1:8766`
- recebe jobs do painel
- separa e processa lotes sequencialmente
- abre o Anki Desktop se necessario
- espera o AnkiConnect responder
- preserva os artefatos do job para retry

## Instalacao

1. Crie um ambiente Python com as dependencias deste projeto e do `Automatic Anki`.
2. Instale as dependencias do bridge:

```powershell
pip install -r bridge/requirements.txt
```

3. Ajuste `bridge/config.json` se o caminho do `Automatic Anki` ou do Anki Desktop for diferente.
4. Rode uma vez:

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
