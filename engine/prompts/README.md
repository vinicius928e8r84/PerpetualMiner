# Prompt panel

Edit these files directly to change the pipeline prompts:

- `prompts/en_card.txt` - English card generation (main and generated cards share it; the user message differs)
- `prompts/ru_card.txt` - Russian card generation
- `prompts/en_iniciante.txt`, `prompts/ru_iniciante.txt` - the Beginner Card of the Anki add-on, one prompt per language and level (the
  file each level reads is in `estilos.json`): Portuguese explanations, the colours linked by the Alignment section

The app loads these files at runtime, so future prompt changes live in one place.
