import tempfile
import unittest
from pathlib import Path

from prompt_loader import load_prompt


class LoadPromptTests(unittest.TestCase):
    def setUp(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        self.pasta = Path(pasta.name)

    def _prompt(self, nome, texto):
        caminho = self.pasta / nome
        caminho.write_text(texto, encoding="utf-8")
        return str(caminho)

    def test_o_prompt_configurado_volta_sem_os_espacos_das_pontas(self):
        config = {"paths": {"prompts": {"ru_card": self._prompt("ru.txt", "\n  Cartão russo\n\n")}}}

        self.assertEqual(load_prompt(config, "ru_card"), "Cartão russo")

    def test_uma_chave_que_nao_e_de_prompt_e_recusada_mesmo_com_o_caminho_configurado(self):
        config = {"paths": {"prompts": {"de_card": self._prompt("de.txt", "Karte")}}}

        with self.assertRaisesRegex(KeyError, "Unknown prompt key: de_card"):
            load_prompt(config, "de_card")

    def test_uma_chave_que_nao_e_de_prompt_e_sem_caminho_e_recusada_como_desconhecida(self):
        for config in ({}, {"paths": {}}, {"paths": {"prompts": {"de_card": ""}}}):
            with self.subTest(config=config), self.assertRaisesRegex(KeyError, "Unknown prompt key: de_card"):
                load_prompt(config, "de_card")

    def test_uma_chave_sem_caminho_configurado_e_recusada_com_o_nome_dela(self):
        for config in ({}, {"paths": {}}, {"paths": {"prompts": {"en_card": ""}}}):
            with self.subTest(config=config), self.assertRaisesRegex(KeyError, "Prompt path not configured for 'en_card'"):
                load_prompt(config, "en_card")

    def test_um_arquivo_de_prompt_so_com_espacos_e_recusado_com_o_caminho_dele(self):
        caminho = self._prompt("en.txt", " \n\t ")

        with self.assertRaisesRegex(ValueError, "Prompt file is empty: " + caminho):
            load_prompt({"paths": {"prompts": {"en_card": caminho}}}, "en_card")


if __name__ == "__main__":
    unittest.main()
