"""As bordas da linha de mineração `kw | kw : frase [Context: ...]`: o que vira entrada e o que é descartado."""

import unittest

from parser import MiningEntry, get_card_jobs, parse_mining_line


class BordasDaLinhaDeMineracao(unittest.TestCase):
    def test_a_linha_so_com_contexto_ou_so_com_espacos_nao_e_entrada(self):
        for linha in ("", "   ", "\t\n", "[Context: Livro - Capítulo]", "  [Contexto: Livro]  "):
            with self.subTest(linha=linha):
                self.assertIsNone(parse_mining_line(linha))

    def test_sem_dois_pontos_depois_de_tirar_o_contexto_nao_e_entrada(self):
        self.assertIsNone(parse_mining_line("frase sem separador [Context: Livro]"))

    def test_sem_palavra_ou_sem_frase_nao_e_entrada(self):
        for linha in (": a frase", " | : a frase", "palavra:", "palavra :   ", "palavra : [Context: Livro]"):
            with self.subTest(linha=linha):
                self.assertIsNone(parse_mining_line(linha))

    def test_so_o_primeiro_dois_pontos_separa_e_as_palavras_vazias_somem(self):
        entrada = parse_mining_line("  a | | b |  : uma hora: 10h  ")
        self.assertEqual(entrada, MiningEntry(keywords=["a", "b"], phrase="uma hora: 10h"))

    def test_o_contexto_pode_ter_uma_duas_ou_tres_partes(self):
        um = parse_mining_line("w: frase [Context: Livro]")
        dois = parse_mining_line("w: frase [Contexto: Livro - Título]")
        tres = parse_mining_line("w: frase [context: Livro - Título - Detalhe]")
        self.assertEqual((um.context_source, um.context_title, um.context_detail), ("Livro", None, None))
        self.assertEqual((dois.context_source, dois.context_title, dois.context_detail), ("Livro", "Título", None))
        self.assertEqual((tres.context_source, tres.context_title, tres.context_detail), ("Livro", "Título", "Detalhe"))
        self.assertEqual(tres.phrase, "frase")

    def test_a_entrada_nao_traz_o_stem_do_arquivo_e_cada_palavra_vira_um_cartao(self):
        entrada = parse_mining_line("a | b: frase [Context: Série - Episódio]")
        self.assertIsNone(entrada.file_stem)
        trabalhos = get_card_jobs(entrada)
        self.assertEqual([t.keyword for t in trabalhos], ["a", "b"])
        self.assertEqual([t.is_generated for t in trabalhos], [False, True])
        self.assertIn("Context: Série - Episódio.", trabalhos[1].phrase)


if __name__ == "__main__":
    unittest.main()
