"""The audio the bridge makes today (gTTS), seen from outside: which text is spoken, in which language and accent, and
which files are written. gTTS is replaced at its import, so the test needs neither the library nor the network."""

import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import config_loader
import parser as mining_parser


class GTTSDeMentira:
    pedidos = []

    def __init__(self, text, lang, tld):
        self.pedido = (text, lang, tld)

    def save(self, caminho):
        GTTSDeMentira.pedidos.append(self.pedido)
        Path(caminho).write_bytes(b"mp3:" + "|".join(self.pedido).encode("utf-8"))


def gerar(pasta, linha, ru=False, profiles=None):
    config = config_loader.base_config()
    config["paths"]["output_dir"] = pasta
    if profiles:
        config["tts"]["profiles"].update(profiles)
    entrada = (mining_parser.parse_mining_line_ru if ru else mining_parser.parse_mining_line)(linha)
    GTTSDeMentira.pedidos = []
    with mock.patch.dict(sys.modules, {"gtts": types.SimpleNamespace(gTTS=GTTSDeMentira)}):
        import generate_audio

        generated = generate_audio.run([entrada], config)
    return generated, list(GTTSDeMentira.pedidos), mining_parser.get_card_jobs(entrada)


class ABridgeAudio(unittest.TestCase):
    def test_a_card_speaks_its_word_and_the_phrase_of_its_card_file_with_the_accents_of_the_config(self):
        with TemporaryDirectory() as pasta:
            stem = mining_parser.get_card_jobs(mining_parser.parse_mining_line("give up : She gave up smoking"))[0].filename_stem
            Path(pasta, stem + ".txt").write_text("Front: She *gave up* smoking [Phrase with keyword highlighted:]\n\nBack: give up\n", encoding="utf-8")
            generated, pedidos, jobs = gerar(pasta, "give up : She gave up smoking")
            files = sorted(p.name for p in Path(pasta).glob("*.mp3"))
        self.assertEqual(pedidos, [("give up", "en", "com"), ("She gave up smoking", "en", "co.uk")])
        self.assertEqual(generated, [stem + "_word.mp3", stem + "_phrase.mp3"])
        self.assertEqual(files, sorted(generated))

    def test_the_accents_of_a_job_override_the_profile_of_its_language(self):
        with TemporaryDirectory() as pasta:
            profiles = {"en": {"word": {"lang": "en", "tld": "com.au"}, "phrase": {"lang": "en", "tld": "ca"}}}
            _, pedidos, _ = gerar(pasta, "give up : She gave up smoking", profiles=profiles)
        self.assertEqual(pedidos, [("give up", "en", "com.au"), ("She gave up smoking", "en", "ca")])

    def test_cyrillic_text_is_spoken_with_the_russian_profile(self):
        with TemporaryDirectory() as pasta:
            _, pedidos, _ = gerar(pasta, "Я не мальчик!", ru=True)
        self.assertEqual(pedidos, [("Я не", "ru", "ru"), ("Я не мальчик!", "ru", "ru")])

    def test_the_brackets_of_the_mining_line_are_not_spoken(self):
        with TemporaryDirectory() as pasta:
            _, pedidos, _ = gerar(pasta, "give up : She gave up smoking [Context: Série - The Office - S01E01]")
        self.assertEqual([texto for texto, _, _ in pedidos], ["give up", "She gave up smoking"])


if __name__ == "__main__":
    unittest.main()
