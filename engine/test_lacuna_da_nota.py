"""A frente Lacuna (#166) lê dois campos que o Envio grava: a Frase sem a Palavra e a Dica (sem IA: sai do texto do próprio Cartão)."""

import copy
import unittest
from unittest import mock

import estilos
from test_nota_do_cartao import AVANCADO, INGLES, INTERMEDIARIO, RUSSO, cores_de, nota


class ACacaDaLacuna(unittest.TestCase):
    """A frente Lacuna (#166) lê dois campos que o Envio grava: a Frase sem a Palavra e a Dica (sem IA: sai do texto do próprio Cartão)."""

    def test_a_lacuna_do_ingles_e_a_frase_sem_a_palavra_em_negrito_e_sem_nenhuma_cor(self):
        campos = nota(INGLES, "en")["campos"]
        self.assertEqual(campos["Frase com lacuna"], 'She <b class="lacuna">[\u2026]</b> smoking last year.')
        self.assertEqual(cores_de(campos["Frase com lacuna"]), [])
        self.assertNotIn("gave up", campos["Frase com lacuna"])

    def test_a_dica_do_iniciante_e_a_traducao_natural_e_a_dos_outros_niveis_e_a_definicao_na_lingua_do_nivel(self):
        self.assertEqual(nota(INGLES, "en")["campos"]["Dica"], "Ela parou de fumar ano passado.")
        self.assertEqual(nota(INTERMEDIARIO, "en", nivel="intermediario")["campos"]["Dica"], "Desistir de fazer algo, parar de tentar.")
        self.assertTrue(nota(AVANCADO, "en", nivel="avancado")["campos"]["Dica"].startswith("To stop doing or trying something"))

    def test_o_russo_nao_marca_a_palavra_e_a_lacuna_sai_do_texto_da_palavra_que_o_pedido_deu(self):
        campos = nota(RUSSO, "ru", palavra="Я не")["campos"]
        self.assertEqual(campos["Frase com lacuna"], '<b class="lacuna">[\u2026]</b> мальчик!')
        self.assertEqual(campos["Dica"], "Eu não sou um menino!")

    def test_sem_a_palavra_na_frase_nao_ha_lacuna_nem_dica_e_a_frente_cai_na_frase(self):
        for argumentos in ({}, {"palavra": "нет"}):
            with self.subTest(argumentos=argumentos):
                self.assertFalse({"Frase com lacuna", "Dica"} & set(nota(RUSSO, "ru", **argumentos)["campos"]))

    def test_a_frase_continua_inteira_no_campo_dela_e_a_busca_de_duplicatas_nao_muda(self):
        pronta = nota(INGLES, "en")
        self.assertIn("gave up", pronta["campos"]["Frase"])
        self.assertEqual(pronta["frente_normalizada"], "she gave up smoking last year.")

    def test_a_ordem_das_partes_da_dica_e_dado(self):
        dados = copy.deepcopy(estilos.DADOS)
        dados["dica_da_lacuna"] = ["cena"]
        with mock.patch.object(estilos, "_PADRAO", estilos.Estilos(dados)):
            self.assertEqual(nota(INGLES, "en")["campos"]["Dica"], "Alguém conta que largou o cigarro.")



if __name__ == "__main__":
    unittest.main()
