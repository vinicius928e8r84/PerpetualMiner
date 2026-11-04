# Prompt panel

Edit these files directly to change the pipeline prompts:

- `prompts/en_card.txt` - English card generation (main and generated cards share it; the user message differs)
- `prompts/ru_card.txt` - Russian card generation
- `prompts/en_iniciante.txt`, `prompts/ru_iniciante.txt` - the Beginner Card of the Anki add-on, one prompt per language and level (the
  file each level reads is in `estilos.json`): Portuguese explanations, the colours linked by the Alignment section
- `prompts/en_intermediario.txt`, `prompts/en_avancado.txt` - the English Intermediate (Definition and Gist in Portuguese, Other example in English, no colours) and Advanced (today's card, everything in English) levels of the add-on (#162)
- `prompts/ru_intermediario.txt`, `prompts/ru_avancado.txt` - the Russian Intermediate and Advanced levels (#163): the Word the model picks, its Stress, Pronunciation, a Definition in English and an Other example; a `Morphology:` section (the pieces of each word that has something to explain) that colours the Front and a `Colors:` section with one explanation per colour; the Advanced adds the `Same root:` words. No Alignment section

The app loads these files at runtime, so future prompt changes live in one place.
