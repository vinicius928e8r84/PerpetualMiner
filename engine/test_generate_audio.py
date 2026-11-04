"""What a card says, seen from outside: which text is spoken, in which language and accent. `voices()` answers it with the
standard library only; the Anki add-on asks Google for the MP3 (`complemento/voz.py`)."""

import unittest

import config_loader
import generate_audio
import parser as mining_parser


def falado(linha, ru=False, card_text=None, profiles=None):
    """The (text, language, accent) of the word and of the phrase of a mining line's first card."""
    config = config_loader.base_config()
    if profiles:
        config["tts"]["profiles"].update(profiles)
    entrada = (mining_parser.parse_mining_line_ru if ru else mining_parser.parse_mining_line)(linha)
    palavra, frase = generate_audio.voices(mining_parser.get_card_jobs(entrada)[0], card_text, config)
    return [palavra, frase]


class WhatACardSays(unittest.TestCase):
    def test_a_card_speaks_its_word_and_the_phrase_of_its_card_file_with_the_accents_of_the_config(self):
        texto = "Front: She *gave up* smoking [Phrase with keyword highlighted:]\n\nBack: give up\n"
        self.assertEqual(falado("give up : She gave up smoking", card_text=texto),
                         [("give up", "en", "com"), ("She gave up smoking", "en", "co.uk")])

    def test_the_accents_of_a_job_override_the_profile_of_its_language(self):
        profiles = {"en": {"word": {"lang": "en", "tld": "com.au"}, "phrase": {"lang": "en", "tld": "ca"}}}
        self.assertEqual(falado("give up : She gave up smoking", profiles=profiles),
                         [("give up", "en", "com.au"), ("She gave up smoking", "en", "ca")])

    def test_cyrillic_text_is_spoken_with_the_russian_profile(self):
        self.assertEqual(falado("Я не мальчик!", ru=True), [("Я не", "ru", "ru"), ("Я не мальчик!", "ru", "ru")])

    def test_the_brackets_of_the_mining_line_are_not_spoken(self):
        dito = falado("give up : She gave up smoking [Context: Série - The Office - S01E01]")
        self.assertEqual([texto for texto, _, _ in dito], ["give up", "She gave up smoking"])


if __name__ == "__main__":
    unittest.main()
