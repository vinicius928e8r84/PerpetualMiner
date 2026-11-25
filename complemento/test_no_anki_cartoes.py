import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import no_anki
from complemento.test_anki_de_mentira import AnkiComColecaoDeMentira


def nota(**campos):
    return {"campos": campos, "cartoes": [{"tipo": 0, "intervalo": 0}]}


class OsCartoesDeUmBaralhoNoAnki(unittest.TestCase):
    def setUp(self):
        self.anki = None
        self.addCleanup(lambda: self.anki and self.anki.encerrar())

    def cartoes(self, baralhos, nome):
        self.anki = AnkiComColecaoDeMentira({"baralhos": baralhos})
        return no_anki.ColecaoDoAnki(self.anki).cartoes_do_baralho(nome)

    def test_um_baralho_que_so_comeca_com_o_mesmo_nome_nao_entra_nos_cartoes(self):
        cartoes = self.cartoes([
            {"nome": "Inglês", "notas": [nota(Frente="raiz", Verso="r")]},
            {"nome": "Inglês::Séries::Novas", "notas": [nota(Frente="neto", Verso="n")]},
            {"nome": "Inglês Avançado", "notas": [nota(Frente="irmão", Verso="i")]},
            {"nome": "Inglês2", "notas": [nota(Frente="outro", Verso="o")]},
        ], "Inglês")
        self.assertEqual(sorted(dict(cartao["campos"])["Frente"] for cartao in cartoes), ["neto", "raiz"])

    def test_um_subbaralho_so_traz_os_cartoes_dele(self):
        cartoes = self.cartoes([
            {"nome": "Inglês", "notas": [nota(Frente="raiz", Verso="r")]},
            {"nome": "Inglês::Séries", "notas": [nota(Frente="filho", Verso="f")]},
        ], "Inglês::Séries")
        self.assertEqual([dict(cartao["campos"])["Frente"] for cartao in cartoes], ["filho"])

    def test_cada_cartao_traz_a_nota_o_tipo_o_intervalo_e_os_campos_em_pares(self):
        cartoes = self.cartoes([{"nome": "Inglês", "notas": [
            {"campos": {"Frente": "a", "Verso": "b"}, "cartoes": [{"tipo": 2, "intervalo": 40}]}]}], "Inglês")
        self.assertEqual(len(cartoes), 1)
        self.assertEqual(sorted(cartoes[0]), ["campos", "intervalo", "nota", "tipo"])
        self.assertEqual((cartoes[0]["campos"], cartoes[0]["tipo"], cartoes[0]["intervalo"]), ([("Frente", "a"), ("Verso", "b")], 2, 40))
        self.assertIsInstance(cartoes[0]["nota"], int)

    def test_as_notas_de_dois_tipos_no_mesmo_baralho_levam_cada_uma_os_nomes_do_seu_tipo(self):
        cartoes = self.cartoes([{"nome": "Inglês", "notas": [
            nota(Frente="a", Verso="b"), nota(Front="c", Back="d", Extra="e"), nota(Frente="f", Verso="g")]}], "Inglês")
        self.assertEqual([cartao["campos"] for cartao in cartoes], [
            [("Frente", "a"), ("Verso", "b")],
            [("Front", "c"), ("Back", "d"), ("Extra", "e")],
            [("Frente", "f"), ("Verso", "g")],
        ])

    def test_uma_nota_com_campos_vazios_traz_um_par_por_campo(self):
        cartoes = self.cartoes([{"nome": "Inglês", "notas": [nota(Frente="", Verso="")]}], "Inglês")
        self.assertEqual(cartoes[0]["campos"], [("Frente", ""), ("Verso", "")])

    def test_uma_nota_com_mais_valores_que_campos_no_tipo_da_nome_vazio_aos_que_sobram(self):
        self.anki = AnkiComColecaoDeMentira({"baralhos": [{"nome": "Inglês", "notas": [nota(Frente="a", Verso="b")]}]})
        self.anki.col._sqlite.execute("update notes set flds = flds || char(31) || 'c'")
        cartoes = no_anki.ColecaoDoAnki(self.anki).cartoes_do_baralho("Inglês")
        self.assertEqual(cartoes[0]["campos"], [("Frente", "a"), ("Verso", "b"), ("", "c")])

    def test_uma_nota_sem_campos_gravados_traz_um_unico_valor_vazio(self):
        self.anki = AnkiComColecaoDeMentira({"baralhos": [{"nome": "Inglês", "notas": [nota(Frente="a", Verso="b")]}]})
        self.anki.col._sqlite.execute("update notes set flds = null")
        cartoes = no_anki.ColecaoDoAnki(self.anki).cartoes_do_baralho("Inglês")
        self.assertEqual(cartoes[0]["campos"], [("Frente", "")])

    def test_um_baralho_com_nome_que_nao_existe_ou_sem_cartoes_devolve_lista_vazia(self):
        cartoes = self.cartoes([{"nome": "Inglês", "notas": [nota(Frente="a", Verso="b")]}, {"nome": "Vazio"}], "Alemão")
        self.assertEqual(cartoes, [])
        self.assertEqual(no_anki.ColecaoDoAnki(self.anki).cartoes_do_baralho("Vazio"), [])


if __name__ == "__main__":
    unittest.main()
