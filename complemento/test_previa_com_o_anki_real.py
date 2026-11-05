"""A prévia do Cartão (#164) com a biblioteca de verdade do Anki (`pip install anki`, o motor em Rust): o Cartão desenhado pelo renderizador do
Anki, numa coleção em pasta temporária. Sem a biblioteca instalada, o teste não roda (o CI da Conexão não a instala); a prova é de quem a tem:

    pip install anki && python3 complemento/test_previa_com_o_anki_real.py
"""

import os
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from anki.collection import Collection
except ImportError:
    Collection = None

from complemento import no_anki, previa_do_cartao  # noqa: E402
from complemento.motor import estilos  # noqa: E402
from complemento.test_contrato_da_previa import texto_de  # noqa: E402


@unittest.skipIf(Collection is None, "a biblioteca `anki` não está instalada")
class PreviaNaColecaoDeVerdade(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.colecao = Collection(os.path.join(self.pasta.name, "colecao.anki2"))
        self.addCleanup(self.pasta.cleanup)
        self.addCleanup(self.colecao.close)
        mw = types.SimpleNamespace(
            col=self.colecao, taskman=types.SimpleNamespace(run_on_main=lambda funcao: funcao()),
            pm=types.SimpleNamespace(name="Usuário 1", profiles=lambda: ["Usuário 1"]))
        self.adaptador = no_anki.ColecaoDoAnki(mw)

    def test_o_anki_desenha_o_cartao_de_exemplo_de_cada_estilo(self):
        for lang in estilos.idiomas():
            for nivel in estilos.niveis(lang):
                with self.subTest(lang=lang, nivel=nivel):
                    previa = previa_do_cartao.previa_do_exemplo(self.adaptador, lang, nivel)
                    campos = previa_do_cartao.campos_do_exemplo(lang, nivel)
                    self.assertIn(texto_de(campos["Frase"]), texto_de(previa["front"]))
                    self.assertIn("pm-tocar", previa["front"])
                    # O verso repete a Frase, salvo o nível que diz que não (o Intermediário e o Avançado do russo).
                    self.assertEqual(texto_de(campos["Frase"]) in texto_de(previa["back"]), estilos.estilo(lang, nivel).get("repete_a_frase", True))
                    self.assertIn(".card", previa["css"])
                    self.assertIn('<img src="data:image/svg+xml;base64,', previa["back"])
                    self.assertNotIn("[anki:play", previa["front"] + previa["back"])

    def test_o_anki_desenha_o_cartao_da_nota_gravada_com_a_imagem_da_pasta_de_midia(self):
        previa_do_cartao.previa_do_exemplo(self.adaptador, "en", "intermediario")
        self.adaptador.adicionar_nota(
            "PerpetualMiner::Inglês", "PerpetualMiner Inglês",
            {"Frase": "I <b>keep</b> trying", "Definição": "Continuar", "Imagem": '<img src="foto.png">', "Áudio da frase": "[sound:frase.mp3]"},
            [], "guid-1", {"foto.png": b"\x89PNG", "frase.mp3": b"mp3"})
        previa = previa_do_cartao.previa_da_nota(self.adaptador, "guid-1")
        self.assertEqual(texto_de(previa["front"]), "I keep trying ▶")
        self.assertIn("Continuar", texto_de(previa["back"]))
        self.assertIn("data:image/png;base64,iVBORw==", previa["back"])
        self.assertEqual(previa["deck"], "PerpetualMiner::Inglês")

    def test_um_nome_de_arquivo_com_caminho_nunca_sai_da_pasta_de_midia(self):
        with open(os.path.join(self.pasta.name, "segredo.png"), "wb") as arquivo:
            arquivo.write(b"x")
        self.assertIsNone(self.adaptador.arquivo_de_midia("../segredo.png", 10))


if __name__ == "__main__":
    unittest.main()
