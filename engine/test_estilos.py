"""O estilo do Cartão como dado: idioma × nível. O que a Conexão e o motor leem do `estilos.json`, visto de fora."""

import copy
import json
import unittest
from pathlib import Path

import estilos

PARTES_DO_INICIANTE = ["pronuncia", "literal", "natural", "cena", "palavra", "imagem"]
PARTES_DO_RUSSO_COM_MORFOLOGIA = ["pronuncia", "palavra", "silaba_forte", "definicao", "explicacao_das_cores", "outro_exemplo", "imagem"]
PARTES_SEM_CORES = ["cena", "palavra", "definicao", "outro_exemplo", "imagem"]  # o Intermediário e o Avançado do inglês


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

    def test_os_dois_idiomas_tem_o_iniciante_o_intermediario_e_o_avancado(self):
        for lang in ("en", "ru"):
            self.assertEqual(estilos.niveis(lang), ("iniciante", "intermediario", "avancado"))

    def test_o_intermediario_do_ingles_explica_em_portugues_sem_cores_e_o_avancado_e_monolingue(self):
        intermediario, avancado = estilos.estilo("en", "intermediario"), estilos.estilo("en", "avancado")
        self.assertEqual((intermediario["explicacao"], intermediario["cores"], intermediario["verso"]), ("pt", False, PARTES_SEM_CORES))
        self.assertEqual((avancado["explicacao"], avancado["cores"], avancado["verso"]), ("en", False, PARTES_SEM_CORES))

    def test_um_nivel_que_o_idioma_nao_tem_nao_existe(self):
        with self.assertRaises(KeyError):
            estilos.estilo("ru", "nativo")

    def test_o_intermediario_e_o_avancado_do_russo_explicam_em_ingles_com_a_morfologia_sem_repetir_a_frase_no_verso(self):
        intermediario, avancado = estilos.estilo("ru", "intermediario"), estilos.estilo("ru", "avancado")
        for estilo in (intermediario, avancado):
            self.assertEqual((estilo["explicacao"], estilo["cores"], estilo["morfologia"], estilo["repete_a_frase"]), ("en", False, True, False))
            self.assertEqual(estilo["guarda"], ["morfologia", "raiz"])
        self.assertEqual(intermediario["verso"], PARTES_DO_RUSSO_COM_MORFOLOGIA)
        self.assertEqual(avancado["verso"], PARTES_DO_RUSSO_COM_MORFOLOGIA[:-1] + ["mesma_raiz", "imagem"])

    def test_so_o_avancado_do_russo_traz_as_palavras_da_mesma_raiz(self):
        self.assertNotIn("mesma_raiz", estilos.estilo("ru", "intermediario")["verso"])
        self.assertIn("mesma_raiz", estilos.estilo("ru", "avancado")["verso"])

    def test_o_iniciante_do_russo_segue_com_a_frase_no_verso_e_sem_morfologia(self):
        iniciante = estilos.estilo("ru")
        self.assertFalse(iniciante.get("morfologia", False))
        self.assertTrue(iniciante.get("repete_a_frase", True))

    def test_o_verso_de_cada_nivel_segue_a_ordem_do_modelo_de_cartao_do_idioma(self):
        for lang in estilos.idiomas():
            ordem = estilos.DADOS["idiomas"][lang]["ordem_do_verso"]
            for nivel in estilos.niveis(lang):
                with self.subTest(lang=lang, nivel=nivel):
                    verso = estilos.estilo(lang, nivel)["verso"]
                    self.assertEqual(verso, [parte for parte in ordem if parte in verso])

    def test_cada_parte_do_verso_e_cada_campo_guardado_de_cada_nivel_tem_o_campo_dele_no_idioma(self):
        for lang in estilos.idiomas():
            campos = estilos.idioma(lang)["campos"]
            for nivel in estilos.niveis(lang):
                with self.subTest(lang=lang, nivel=nivel):
                    estilo = estilos.estilo(lang, nivel)
                    self.assertTrue(set(estilo["verso"]) | set(estilo.get("guarda", [])) <= set(campos))

    def test_cada_idioma_tem_o_tipo_de_nota_e_o_baralho_proprios(self):
        self.assertEqual(estilos.idiomas(), ("en", "ru"))
        self.assertEqual(
            [(estilos.idioma(lang)["tipo_de_nota"], estilos.idioma(lang)["baralho"]) for lang in estilos.idiomas()],
            [("PerpetualMiner Inglês", "PerpetualMiner::Inglês"), ("PerpetualMiner Russo", "PerpetualMiner::Russo")],
        )

    def test_a_frente_antiga_do_basico_tem_os_nomes_do_anki_em_portugues_e_em_ingles(self):
        self.assertEqual(estilos.nomes_da_frente_de_antes(), ("Frente", "Front"))

    def test_a_dica_da_lacuna_sai_da_definicao_e_na_falta_dela_da_traducao_natural_e_do_contexto(self):
        self.assertEqual(estilos.partes_da_dica(), ("definicao", "natural", "cena"))

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
