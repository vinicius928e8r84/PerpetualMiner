# CLAUDE.md – Automatic Anki (PerpetualMiner)

Python pipeline: keyword:phrase → multimedia Anki flashcards via OpenAI (chat.completions over plain HTTP, image model from `openai.image_model`), Google audio, Openverse/GPT-vision images. It runs only inside the Anki add-on (`complemento/motor`), which writes the notes through the collection.

The text half (`parser.py`, `prompt_loader.py`, `generate_cards.py`, `generate_audio.py`'s `voices()` (what a card says and with which accent; the add-on asks Google for it in `complemento/voz.py`), `openai_http.py`, `cost_tracker.py`, `config_loader.py`, `send_to_anki.py`'s card formatting, `config.json`, `prompts/`) also runs **inside the Anki add-on** (`complemento/motor`, Python 3.9, standard library only): no OpenAI SDK, no PyYAML, no dotenv there; sibling imports are relative when `__package__` is set; progress goes to the `perpetualminer.motor` logger, never to stdout; nothing touches `warnings`. `complemento/empacotar.py` lists those files (`ARQUIVOS_DO_MOTOR`): a change in them changes the add-on (its version is given at the merge by `complemento/versao_no_merge.py`).

The image half (`google_images.py`, `image_guard.py`, `image_judge.py`, `generate_images.py`, `image_pipeline.py` with `image_real_first.py` and `image_queries.py`, `image_utils.py`, `extract_prompts.py`) runs there too, by the same rules, and `image_pipeline.build()` picks each card's picture: urllib only, no `openai`, `requests` or Pillow. Only converting a photo to PNG needs an imaging library, so it goes through `image_utils.usar_adaptador` (Anki's Qt in the add-on, Pillow by default). `config["openai_base"]` / `["openverse_base"]` redirect the requests (the add-on's tests), and `config["image_records_by_card"]` keeps the Palavra and the search text out of the cost records, which outlive the Frases.

## Setup & Test

```bash
pip install -r requirements.txt
python -m unittest discover -p "test_*.py"   # from engine/
```

The key (`OPENAI_API_KEY`) is read from the environment or the `.env` next to the engine; the add-on passes the Conexão's key instead.

## Architecture

The Envio (`complemento/envio.py`, `complemento/motor_do_envio.py`) orchestrates the stages for each mining line:

```
mining line
├─ generate_cards.py    → the card text (chat.completions; the model is the add-on's `modelo_do_texto` when it sets one (#157), else `openai.chat_model`)
├─ extract_prompts.py   → the Image: field
├─ generate_audio.py    → what the card says and with which accent (`voices()`); the add-on fetches the MP3 (`complemento/voz.py`)
├─ image_guard.py       → skip/real/generate decision (heuristics + GPT-4o-mini)
├─ google_images.py     → Openverse candidates (free, no key)
├─ image_judge.py       → GPT-vision rank candidates vs card context
├─ generate_images.py   → the picture (`openai.image_model` if needed)
└─ send_to_anki.py      → the note fields; the add-on writes the note into the collection
```

## Key Modules

| File | Role |
|---|---|
| `parser.py` | `MiningEntry`, `CardJob`, `parse_mining_file()`, `safe_filename()` |
| `config_loader.py` | `config.json` (`base_config()`) + the key: `load_config(openai_api_key=…)` from the Conexão, else `OPENAI_API_KEY` from the environment or the `.env` next to the engine |
| `openai_http.py` | `completar()`: POST /v1/chat/completions, `gerar_imagem()`: POST /v1/images/generations, with urllib; `responder()`: the ChatGPT plan's POST /v1/responses (stream, `instructions`, no `temperature`; `generate_cards` uses it when the config has `plano_do_chatgpt`, #155; with `formato_json` and `input_image` parts it is the image judge's, #156). A refusal is `ErroDaOpenAI(codigo)` (the add-on's codes), never OpenAI's text. The base URL is passed by code |
| `estilos.json`, `estilos.py` | The Card style as data (#161): language × level (the language of the explanation, the back parts, colours on or off, the prompt file) plus, per language, its note type, deck, how a mining line reads (`entrada`) and **all** its fields (changing a note type's fields later forces a full sync in Anki). A new language is a new entry and a prompt file; `prompts/en_iniciante.txt` and `ru_iniciante.txt` are the Beginner level (Portuguese explanations, colours from the Alignment section); `en_intermediario.txt` (definition and gist in Portuguese, other example in English, no colours) and `en_avancado.txt` (today's English Card, monolingual) are the English Intermediate and Advanced (#162); `ru_intermediario.txt` and `ru_avancado.txt` are the Russian ones (#163: the Word, Stress, Definition and Other example in English, a `Morphology:` section whose pieces colour the Phrase in four colours, a `Colors:` section with one explanation per colour, and the Advanced adds `Same root:`; the level has `morfologia`, `guarda` (fields written but not shown) and `repete_a_frase: false`). `ordem_do_verso` is the order of every back part of a language: the note type has one back template for all levels, each level's `verso` is a subsequence of it. Only the add-on uses it: the bridge keeps `en_card`/`ru_card` and the `Básico` note type |
| `nota_do_cartao.py` | The note a card text becomes, field by field, in the style of its language and level (`campos_da_nota`): the Phrase without the audio tag, the colours linking the Phrase and the Literal line (or, at the Russian levels with `morfologia`, the four colours of prefix, root, suffix and ending from the `Morphology:` section; a word whose pieces do not spell it is left uncoloured), the audios and the image in their own fields |
| `corrigir_frase.py` | `corrigir()`: the correction of a sentence the person wrote in the Criação front (#169), one request per sentence (the key's chat completions, or the plan's Responses API); the cost goes to `cost_tracker.record_correction` (apart from the cards'), never the word or the sentences. Prompt: `prompts/correcao_da_criacao.txt` |
| `prompt_loader.py` | System prompts from `prompts/` (keys: `en_card`, `ru_card`) |
| `image_guard.py` | Classify keyword (concrete/abstract) before image API; skip abstract, ambiguous → GPT-4o-mini (~$0.0001) |
| `google_images.py` | `search_candidates()` / `download_candidate()` from Openverse API (free), urllib |
| `image_judge.py` | `rank_candidates()` — GPT-vision score real photos; keep if `real_min_score` hit, else generate |
| `image_pipeline.py` | `build()`: the choice of a card's picture (real photo first, judge, generated fallback, or generated only); `image_real_first.py` is its "real photo first" half, `image_queries.py` the pure query helpers |
| `image_utils.py` | Image format sniffing; converting to PNG goes through an adapter (`usar_adaptador`): Pillow by default, the add-on installs Anki's Qt (`complemento/imagem_qt.py`) |
| `cost_tracker.py` | Log to `log/costs.jsonl`; `summary()` returns today/week/month/alltime spend |

## mining.txt Format

```
keyword : phrase
kw1 | kw2 | kw3 : phrase [Context: Source - Title - Detail]
```
- `|` → one card per keyword
- `keywords[0]`: original phrase (`en_card` prompt)
- `keywords[1..N]`: invented sentence (same `en_card` prompt; `_build_message` adds the secondary-keyword rules)
- `[Context: ...]` optional, parsed into `entry.context_source` / `entry.context_str`

## Card Format & Filenames

Cards: `Front: / Back: / Image:` fields (RU may add `Google Image Search Queries:` block).
`send_to_anki.py` parses with regex; all stages must use `safe_filename(keyword)` stem or files won't be found.

## Image Generation

`config.json` › `openai.image_model` is `gpt-image-2.5-flare` (`gpt-image-1` is removed on 2026-10-23; see the OpenAI deprecations page). `anki.deck_name`/`note_type` there are overridden at runtime (the add-on); the field names match the owner's PT-BR Anki (`Frente`/`Verso`) and are never hard-coded.

**User choice at start:** Google Images (real photos, default) or an AI image (`openai.image_model`).

**Flow:**
1. `image_guard.should_generate_image()` → skip abstract, GPT-4o-mini ambiguous
2. **Google mode:** `google_images.search_candidates()` → Openverse (multiple queries), `image_judge.rank_candidates()` → GPT-vision score. Keep real if `real_min_score` threshold hit; else fallback to `openai.image_model`
3. **DALL-E mode:** always `openai.image_model` (returns base64, decoded directly)

**Failures:** `generate_images.generate_one()` never raises. A retired/unavailable model or any other generation error returns `False`, so the card goes on without a generated image (or with the real photo already picked); the reason (`model_unavailable` / `generation_error`) is logged and appended to `log/image_generation_failures.jsonl`.

**Russian:** `image_guard` skipped (Cyril
