# CLAUDE.md – Automatic Anki (PerpetualMiner)

Python pipeline: keyword:phrase → multimedia Anki flashcards via OpenAI (chat.completions, image model from `openai.image_model`), gTTS audio, Openverse/GPT-vision images, AnkiConnect.

## Setup & Run

```bash
pip install -r requirements.txt
# .env: OPENAI_API_KEY=sk-...
python start.py  # Full pipeline with menu
# Or individual: generate_cards.py, extract_prompts.py, generate_audio.py, generate_images.py, send_to_anki.py
```

## Architecture

`start.py` → menu (deck, language, image-source) → orchestrates stages:

```
mining.txt
├─ generate_cards.py    → Output/{stem}.txt (chat.completions)
├─ extract_prompts.py   → prompts.txt (Image: field)
├─ generate_audio.py    → Output/{stem}_{word,phrase}.mp3 (gTTS)
├─ image_guard.py       → skip/real/generate decision (heuristics + GPT-4o-mini)
├─ google_images.py     → Openverse candidates (free, no key)
├─ image_judge.py       → GPT-vision rank candidates vs card context
├─ generate_images.py   → Output/{stem}.png (`openai.image_model` if needed)
└─ send_to_anki.py      → AnkiConnect, clean Output/ on success
```

## Key Modules

| File | Role |
|---|---|
| `parser.py` | `MiningEntry`, `CardJob`, `parse_mining_file()`, `safe_filename()` |
| `config_loader.py` | `config.yaml` + `.env` injection |
| `prompt_loader.py` | System prompts from `prompts/` (keys: `en_main_card`, `en_additional_card`, `ru_card`) |
| `image_guard.py` | Classify keyword (concrete/abstract) before image API; skip abstract, ambiguous → GPT-4o-mini (~$0.0001) |
| `google_images.py` | `search_candidates()` / `download_candidate()` from Openverse API (free) |
| `image_judge.py` | `rank_candidates()` — GPT-vision score real photos; keep if `real_min_score` hit, else generate |
| `tts_accents.py` | gTTS TLD→label mapping, language defaults for menu |
| `cost_tracker.py` | Log to `log/costs.jsonl`; `summary()` returns today/week/month/alltime spend |

## mining.txt Format

```
keyword : phrase
kw1 | kw2 | kw3 : phrase [Context: Source - Title - Detail]
```
- `|` → one card per keyword
- `keywords[0]`: original phrase (`en_main_card` prompt)
- `keywords[1..N]`: invented sentence (`en_additional_card` + context)
- `[Context: ...]` optional, parsed into `entry.context_source` / `entry.context_str`

## Card Format & Filenames

Cards: `Front: / Back: / Image:` fields (RU may add `Google Image Search Queries:` block).
`send_to_anki.py` parses with regex; all stages must use `safe_filename(keyword)` stem or files won't be found.

## Image Generation

**User choice at start:** Google Images (real photos, default) or DALL-E.

**Flow:**
1. `image_guard.should_generate_image()` → skip abstract, GPT-4o-mini ambiguous
2. **Google mode:** `google_images.search_candidates()` → Openverse (multiple queries), `image_judge.rank_candidates()` → GPT-vision score. Keep real if `real_min_score` threshold hit; else fallback to `openai.image_model`
3. **DALL-E mode:** always `openai.image_model` (returns base64, decoded directly)

**Failures:** `generate_images.generate_one()` never raises. A retired/unavailable model or any other generation error returns `False`, so the card goes on without a generated image (or with the real photo already picked); the reason (`model_unavailable` / `generation_error`) is printed and appended to `log/image_generation_failures.jsonl`.

**Russian:** `image_guard` skipped (Cyril
