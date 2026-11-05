"""A prévia do Cartão (#164) como qualquer adaptador de coleção a cumpre: o Cartão como o Anki o desenha, de um exemplo do estilo ou de
uma nota gravada. Uma parte do contrato do adaptador (`test_colecao_em_memoria.ContratoDoAdaptadorDaColecao`, de onde vêm `adaptador` e
`adaptador_fechado`): o adaptador em memória e o do Anki herdam esta parte e passam pelos mesmos testes.
"""

import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, previa_do_cartao  # noqa: E402
from complemento.motor import estilos  # noqa: E402
from complemento.test_contrato_da_criacao import ANKI_EM_INGLES, SO_O_DEFAULT  # noqa: E402

ESTILOS = [(lang, nivel) for lang in ("en", "ru") for nivel in estilos.niveis(lang)]


def texto_de(cartao_html):
    """O que a pessoa lê num HTML do Cartão: sem tags e com as entidades desfeitas."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", cartao_html))).strip()


class ContratoDaPrevia:
    def test_a_previa_de_cada_estilo_mostra_a_frase_com_o_botao_de_audio_na_frente(self):
        for lang, nivel in ESTILOS:
            with self.subTest(lang=lang, nivel=nivel):
                previa = previa_do_cartao.previa_do_exemplo(self.adaptador(SO_O_DEFAULT), lang, nivel)
                frase = texto_de(previa_do_cartao.campos_do_exemplo(lang, nivel)["Frase"])
                self.assertIn(frase, texto_de(previa["front"]))
                self.assertIn("pm-tocar", previa["front"])
                # O verso repete a Frase, salvo o nível que diz que não (o Intermediário e o Avançado do russo, #163).
                self.assertEqual(frase in texto_de(previa["back"]), estilos.estilo(lang, nivel).get("repete_a_frase", True), "a Frase no verso")

    def test_a_previa_de_cada_estilo_mostra_no_verso_as_partes_do_nivel_e_so_elas(self):
        for lang, nivel in ESTILOS:
            with self.subTest(lang=lang, nivel=nivel):
                previa = previa_do_cartao.previa_do_exemplo(self.adaptador(SO_O_DEFAULT), lang, nivel)
                verso = texto_de(previa["back"].split("<hr id=answer>")[-1])
                campos, nomes = previa_do_cartao.campos_do_exemplo(lang, nivel), estilos.idioma(lang)["campos"]
                for parte in estilos.estilo(lang, nivel)["verso"]:
                    if parte not in ("imagem", "palavra"):
                        self.assertIn(texto_de(campos[nomes[parte]]), verso, parte)
                for parte in estilos.DADOS["idiomas"][lang]["ordem_do_verso"]:
                    if parte not in estilos.estilo(lang, nivel)["verso"]:
                        self.assertNotIn(parte, [chave for chave in nomes if nomes[chave] in campos], parte)

    def test_o_iniciante_do_ingles_explica_em_portugues_o_intermediario_define_e_o_avancado_define_em_ingles(self):
        versos = {nivel: texto_de(previa_do_cartao.previa_do_exemplo(self.adaptador(SO_O_DEFAULT), "en", nivel)["back"].split("<hr id=answer>")[1])
                  for nivel in estilos.niveis("en")}
        self.assertIn("Ela parou de fumar ano passado.", versos["iniciante"])
        self.assertNotIn("Desistir de fazer algo", versos["iniciante"])
        self.assertIn("Desistir de fazer algo, parar de tentar.", versos["intermediario"])
        self.assertNotIn("Ela parou de fumar", versos["intermediario"])
        self.assertIn("To stop doing or trying something", versos["avancado"])
        self.assertIn("Pam never gave up on her dream", versos["avancado"])

    def test_o_verso_do_exemplo_traz_o_espaco_da_imagem_e_nunca_o_nome_de_um_arquivo_que_nao_existe(self):
        previa = previa_do_cartao.previa_do_exemplo(self.adaptador(SO_O_DEFAULT), "en", "iniciante")
        self.assertIn('<img src="data:image/svg+xml;base64,', previa["back"])
        for lado in (previa["front"], previa["back"]):
            self.assertNotIn("[sound:", lado)
            self.assertNotIn("[anki:play", lado)
            self.assertNotIn("exemplo.jpg", lado)

    def test_a_previa_diz_de_onde_vem_o_baralho_e_o_tipo_de_nota_do_idioma(self):
        previa = previa_do_cartao.previa_do_exemplo(self.adaptador(SO_O_DEFAULT), "ru", "iniciante")
        self.assertEqual((previa["source"], previa["lang"], previa["nivel"]), ("example", "ru", "iniciante"))
        self.assertEqual((previa["deck"], previa["noteType"]), ("PerpetualMiner::Russo", "PerpetualMiner Russo"))
        self.assertIn(".card", previa["css"])

    def test_a_previa_cria_o_tipo_de_nota_do_idioma_se_falta_e_nao_grava_nenhuma_nota(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        self.assertIsNone(colecao.tipo_de_nota("PerpetualMiner Inglês"))
        primeira = previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante")
        self.assertIsNotNone(colecao.tipo_de_nota("PerpetualMiner Inglês"))
        self.assertEqual(previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante"), primeira)
        self.assertEqual(colecao.guids_existentes(["x"]), set())
        self.assertEqual(colecao.cartoes_do_baralho("PerpetualMiner"), [])

    def test_a_previa_num_anki_em_ingles_sai_igual(self):
        em_ingles = previa_do_cartao.previa_do_exemplo(self.adaptador(ANKI_EM_INGLES), "en", "avancado")
        self.assertEqual(em_ingles, previa_do_cartao.previa_do_exemplo(self.adaptador(SO_O_DEFAULT), "en", "avancado"))

    def test_a_previa_mostra_o_verso_que_o_tipo_de_nota_da_coleção_tem_de_verdade(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        colecao.criar_tipo_de_nota({"nome": "PerpetualMiner Inglês", "campos": ["Frase", "Palavra"], "css": ".card { color: red; }", "modelos": [
            {"nome": "Frase com áudio", "frente": "<b>{{Frase}}</b>", "verso": "{{FrontSide}}<hr id=answer>{{Palavra}}"}]})
        previa = previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante")
        self.assertEqual(previa["css"].count("color: red"), 1)
        self.assertEqual(texto_de(previa["back"]), "She gave up smoking last year.gave up – /ɡeɪv ʌp/")

    def gravar(self, colecao, guid, tipo, campos, baralho="Inglês", midia=None):
        colecao.adicionar_nota(baralho, tipo, campos, [], guid, midia)

    def test_a_previa_de_uma_nota_gravada_mostra_o_cartao_dela_no_baralho_dela(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante")
        self.gravar(colecao, "guid-1", "PerpetualMiner Inglês", {"Frase": "I <b>keep</b> trying", "Palavra": "keep"}, "PerpetualMiner::Inglês")
        previa = previa_do_cartao.previa_da_nota(colecao, "guid-1")
        self.assertEqual((previa["source"], previa["deck"], previa["noteType"]), ("note", "PerpetualMiner::Inglês", "PerpetualMiner Inglês"))
        self.assertEqual(texto_de(previa["front"]), "I keep trying")
        self.assertIn("keep", texto_de(previa["back"]))

    def test_a_previa_de_uma_nota_do_basico_de_antes_mostra_a_frente_e_o_verso(self):
        colecao = self.adaptador({"baralhos": [{"nome": "CIMV"}], "tiposDeNota": {"Básico": ["Frente", "Verso"]}})
        self.gravar(colecao, "guid-1", "Básico", {"Frente": "She <b>gave up</b>", "Verso": "give up"}, "CIMV")
        previa = previa_do_cartao.previa_da_nota(colecao, "guid-1")
        self.assertEqual((texto_de(previa["front"]), texto_de(previa["back"])), ("She gave up", "She gave up give up"))
        self.assertEqual(previa["deck"], "CIMV")

    def test_a_previa_de_uma_nota_que_a_colecao_nao_tem_e_nenhuma(self):
        self.assertIsNone(previa_do_cartao.previa_da_nota(self.adaptador(SO_O_DEFAULT), "nao-existe"))

    def test_o_audio_da_nota_vira_o_botao_e_a_imagem_dela_vai_dentro_do_html(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante")
        campos = {"Frase": "I keep trying", "Áudio da frase": "[sound:pm_frase.mp3]", "Imagem": '<img src="pm_foto.png">'}
        self.gravar(colecao, "guid-1", "PerpetualMiner Inglês", campos, "PerpetualMiner::Inglês", {"pm_frase.mp3": b"mp3", "pm_foto.png": b"\x89PNG"})
        previa = previa_do_cartao.previa_da_nota(colecao, "guid-1")
        self.assertIn("pm-tocar", previa["front"])
        self.assertNotIn("[sound:", previa["front"] + previa["back"])
        self.assertIn('<img src="data:image/png;base64,iVBORw==">', previa["back"])

    def test_a_imagem_que_nao_esta_na_pasta_de_midia_ou_nao_e_imagem_vira_o_espaco_da_imagem(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        previa_do_cartao.previa_do_exemplo(colecao, "en", "iniciante")
        self.gravar(colecao, "guid-1", "PerpetualMiner Inglês", {"Frase": "a", "Imagem": '<img src="sumiu.jpg"><img src="nota.txt">'}, midia={"nota.txt": b"oi"})
        self.assertEqual(previa_do_cartao.previa_da_nota(colecao, "guid-1")["back"].count("data:image/svg+xml;base64,"), 2)

    def test_um_nome_de_arquivo_com_caminho_nunca_le_a_pasta_de_midia(self):
        colecao = self.adaptador(SO_O_DEFAULT)
        colecao.adicionar_nota("Inglês", "Básico", {"Frente": "a", "Verso": "b"}, [], "guid-1", {"foto.jpg": b"x"})
        self.assertEqual(colecao.arquivo_de_midia("foto.jpg", 10), b"x")
        for nome in ("../foto.jpg", "/foto.jpg", "pasta/foto.jpg", ""):
            self.assertIsNone(colecao.arquivo_de_midia(nome, 10), nome)

    def test_sem_colecao_aberta_a_previa_nao_se_faz(self):
        fechada = self.adaptador_fechado()
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            previa_do_cartao.previa_do_exemplo(fechada, "en", "iniciante")
        with self.assertRaises(baralhos.ColecaoIndisponivel):
            previa_do_cartao.previa_da_nota(fechada, "guid-1")
