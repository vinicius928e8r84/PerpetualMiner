# Prompt panel

Edit these files directly to change the pipeline prompts:

- `prompts/en_card.txt` - English card generation of the bridge (main and generated cards share it; the user message differs)
- `prompts/ru_card.txt` - Russian card generation of the bridge
- `prompts/en_iniciante.txt`, `prompts/ru_iniciante.txt` - the Beginner Card of the Anki add-on, one prompt per language and level (the
  file each level reads is in `estilos.json`): Portuguese explanations, the colours linked by the Alignment section
- `prompts/en_intermediario.txt`, `prompts/en_avancado.txt` - the English Intermediate (Definition and Gist in Portuguese, Other example in English, no colours) and Advanced (today's card, everything in English) levels of the add-on (#162)

The app loads these files at runtime, so future prompt changes live in one place.
