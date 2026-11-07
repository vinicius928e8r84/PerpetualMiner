"""Uma linha de mineração vira a mesma entrada lida sozinha ou dentro do arquivo (o complemento lê linha a linha)."""

import tempfile
import unittest
from pathlib import Path

from parser import parse_mining_file, parse_mining_file_ru, parse_mining_line, parse_mining_line_ru

LINHAS_EN = [
    "exerts himself | brands : He exerts himself on brands of his own. [Context: Livro - Scientific Advertising - Chapter 8]",
    "give up: She gave up smoking",
    "sem dois pontos",
    "",
]
LINHAS_RU = ["Я не мальчик! [Context: Série - Episódio 1]", "Ёлка стоит", ""]


class LinhaDeMineracao(unittest.TestCase):
    def arquivo(self, pasta, linhas):
        caminho = Path(pasta) / "mining.txt"
        caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8")
        return caminho

    def test_cada_linha_lida_sozinha_e_a_mesma_entrada_do_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta:
            do_arquivo = parse_mining_file(self.arquivo(pasta, LINHAS_EN))
            do_arquivo_ru = parse_mining_file_ru(self.arquivo(pasta, LINHAS_RU))
        self.assertEqual(do_arquivo, [e for e in map(parse_mining_line, LINHAS_EN) if e])
        self.assertEqual(do_arquivo_ru, [e for e in map(parse_mining_line_ru, LINHAS_RU) if e])

    def test_a_linha_traz_as_palavras_a_frase_e_o_contexto(self):
        entrada = parse_mining_line(LINHAS_EN[0])
        self.assertEqual(
            (entrada.keywords, entrada.phrase, entrada.context_str),
            (["exerts himself", "brands"], "He exerts himself on brands of his own.", "Livro - Scientific Advertising - Chapter 8"),
        )
        self.assertIsNone(parse_mining_line("sem dois pontos"))

    def test_a_linha_russa_e_a_frase_inteira_sem_o_contexto(self):
        entrada = parse_mining_line_ru(LINHAS_RU[0])
        self.assertEqual((entrada.phrase, entrada.context_source, entrada.keywords), ("Я не мальчик!", "Série", ["Я не"]))
        self.assertTrue(entrada.file_stem.startswith("я_не_мальчик!__"))

    def test_a_palavra_antes_dos_dois_pontos_nao_entra_na_frase_russa(self):
        entrada = parse_mining_line_ru("опоздали : Мы опоздали на последний автобус. [Contexto: Série - Episódio 1 - ]")
        self.assertEqual((entrada.phrase, entrada.keywords, entrada.context_source), ("Мы опоздали на последний автобус.", ["опоздали"], "Série"))
        sem_palavra = parse_mining_line_ru("Мы опоздали на последний автобус.")
        self.assertEqual(entrada.file_stem, sem_palavra.file_stem)

    def test_dois_pontos_dentro_da_frase_russa_sem_palavra_ficam_na_frase(self):
        entrada = parse_mining_line_ru("Он сказал : привет всем")
        self.assertEqual(entrada.phrase, "Он сказал : привет всем")


if __name__ == "__main__":
    unittest.main()
