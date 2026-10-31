"""O estilo do Cartão como dado: idioma × nível. O que a Conexão e o motor leem do `estilos.json`, visto de fora."""

import copy
import json
import unittest
from pathlib import Path

import estilos

PARTES_DO_INICIANTE = ["pronuncia", "literal", "natural", "cena", "palavra", "imagem"]


class OEstiloVemDosDados(unittest.TestCase):
    def test_os_cartoes_novos_saem_no_iniciante(self):
        self.assertEqual(estilos.NIVEL_PADRAO, "iniciante")
        for lang in ("en", "ru"):
            self.assertEqual(estilos.estilo(lang), estilos.estilo(lang, "iniciante"))

    def test_o_iniciante_dos_dois_idiomas_explica_em_portugues_com_cores_e_as_partes_do_verso(self):
        for lang in ("en", "ru"):
            with self.subTest(lang=lang):
                estilo = estilos.estilo(lang)
                self.assertEqual((estilo["explicacao"], estilo["cores"], estilo["verso"]), ("pt", True, PARTES_DO_INICIANTE))

    def test_cada_idioma_tem_o_tipo_de_nota_e_o_baralho_proprios(self):
        self.assertEqual(estilos.idiomas(), ("en", "ru"))
        self.assertEqual(
            [(estilos.idioma(lang)["tipo_de_nota"], estilos.idioma(lang)["baralho"]) for lang in estilos.idiomas()],
            [("PerpetualMiner Inglês", "PerpetualMiner::Inglês"), ("PerpetualMiner Russo", "PerpetualMiner::Russo")],
        )

    def test_a_frente_antiga_do_basico_tem_os_nomes_do_anki_em_portugues_e_em_ingles(self):
        self.assertEqual(estilos.nomes_da_frente_de_antes(), ("Frente", "Front"))

    def test_um_idioma_novo_entra_so_por_dados_e_o_resto_do_motor_o_conhece(self):
        dados = copy.deepcopy(estilos.DADOS)
        dados["idiomas"]["es"] = dict(
            copy.deepcopy(dados["idiomas"]["en"]), nome="Espanhol", tipo_de_nota="PerpetualMiner Espanhol", baralho="PerpetualMiner::Espanhol")
        novos = estilos.Estilos(dados)
        self.assertEqual(novos.idiomas(), ("en", "ru", "es"))
        self.assertEqual(novos.idioma("es")["campos"]["frase"], "Frase")
        self.assertEqual(novos.estilo("es")["explicacao"], "pt")

    def test_um_idioma_que_os_dados_nao_tem_nao_existe(self):
        with self.assertRaises(KeyError):
            estilos.idioma("fr")

    def test_os_nomes_dos_campos_de_um_idioma_nao_se_repetem_e_a_frase_vem_primeiro(self):
        for lang in estilos.idiomas():
            nomes = list(estilos.idioma(lang)["campos"].values())
            self.assertEqual(len(nomes), len(set(nomes)), lang)
            self.assertEqual(nomes[0], "Frase", lang)

    def test_o_arquivo_de_dados_e_json_de_verdade_que_se_le_sem_o_modulo(self):
        dados = json.loads((Path(__file__).parent / "estilos.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted(dados["idiomas"]), ["en", "ru"])


if __name__ == "__main__":
    unittest.main()
