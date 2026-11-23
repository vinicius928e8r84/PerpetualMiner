"""O prompt de imagem de um Cartão (`extract_prompts.py`), gravado com o código de antes da refatoração do CodeScene.

Cada linha é o texto de um Cartão e o prompt que sai dele: a linha `Image:`, senão a primeira consulta de busca, senão vazio.
"""

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import extract_prompts

CASOS_DE_PROMPT = [
    ("a linha Image vence a consulta de busca", "Image: a red door\nImage Search Query: door", "a red door"),
    ("a linha Image em negrito perde os asteriscos", "**Image:** a red door**", "a red door"),
    ("Image none cai para a consulta", "Image: None.\nImage Search Query: door", "door"),
    ("Image n/a cai para a consulta", "Image: N/A\nGoogle Image Search: door", "door"),
    ("sem Image e sem consulta sai vazio", "Front: oi\nBack: hi", ""),
    ("o bloco de consultas devolve a primeira", "Image: none\nGoogle Image Search Queries:\n1. eye\n2. person looking", "eye"),
    ("o título do bloco aceita negrito e caixa", "**image search queries:**\n- first\n- second", "first"),
    ("a lista com letra perde o marcador", "Image search queries:\nb) witness\nc) other", "witness"),
    ("a lista com parêntese perde o marcador", "Image search queries:\n2) eye", "eye"),
    ("a linha sem marcador vale inteira", "Image search queries:\n**plain words**", "plain words"),
    ("o bloco pula a linha que só tem asteriscos e vale a de um traço", "Image search queries:\n**\n- \nreal", "-"),
    ("o bloco acaba na linha em branco", "Image search queries:\n\nafter blank\nImage Search Query: single", "single"),
    ("o bloco acaba no próximo rótulo", "Image search queries:\nNotes: x\nGoogle Image Search: single", "single"),
    ("o bloco vazio cai para a linha única", "Image search queries:\nImage Search Query: single", "single"),
    ("só o primeiro título de bloco conta", "Image search queries:\n\nGoogle image search queries:\nsecond", ""),
    ("a linha única em negrito perde os asteriscos", "**Google Image Search:** door**", "door"),
    ("a linha única none é descartada", "Image Search Query: none", ""),
    ("a linha única n/a é descartada", "Image Search Query: n/a", ""),
    ("o título do bloco sem dois pontos não conta", "Image search queries\n- eye", ""),
]


class PromptDeUmCartao(unittest.TestCase):
    def test_cada_texto_de_cartao_gera_o_prompt_esperado(self):
        for nome, texto, esperado in CASOS_DE_PROMPT:
            with self.subTest(nome):
                self.assertEqual(extract_prompts.card_prompt(texto), esperado)


class PromptsDeUmEnvio(unittest.TestCase):
    def test_so_os_cartoes_do_envio_entram_no_arquivo_de_prompts(self):
        with tempfile.TemporaryDirectory() as pasta:
            saida = Path(pasta) / "Output"
            saida.mkdir()
            (saida / "Casa.txt").write_text("Image: a house", encoding="utf-8")
            (saida / "ANTIGO.txt").write_text("Image: old", encoding="utf-8")
            (saida / "gato.txt").write_text("Front: x", encoding="utf-8")
            (saida / "gato.md").write_text("Image: skip", encoding="utf-8")
            prompts = Path(pasta) / "prompts.txt"
            config = {"paths": {"output_dir": str(saida), "prompts_file": str(prompts)}}
            trabalhos = [SimpleNamespace(filename_stem="casa"), SimpleNamespace(filename_stem="GATO")]
            with mock.patch.object(extract_prompts, "get_card_jobs", return_value=trabalhos):
                total = extract_prompts.run(["entrada"], config)
            linhas = sorted(prompts.read_text(encoding="utf-8").split("\n"))
        self.assertEqual((total, linhas), (2, ["Casa:a house", "gato:"]))


if __name__ == "__main__":
    unittest.main()
