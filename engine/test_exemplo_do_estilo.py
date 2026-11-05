"""O exemplo de Cartão de cada estilo (`estilos.json`, #164): o texto que a prévia mostra, visto de fora: a nota que o Envio gravaria dele."""

import unittest

import estilos
from test_nota_do_cartao import cores_de, nota


class OCartaoDeExemploDeCadaEstilo(unittest.TestCase):
    """O exemplo que a prévia mostra (`estilos.json`) é um texto de Cartão como o modelo o escreve: vira a nota que o Envio gravaria."""

    def exemplos(self):
        for lang in estilos.idiomas():
            for nivel in estilos.niveis(lang):
                exemplo = estilos.exemplo(lang, nivel)
                yield lang, nivel, nota(exemplo["texto"], lang, nivel=nivel, palavra=exemplo["palavra"], audio_da_frase="a.mp3", audio_da_palavra="b.mp3", imagem="c.jpg")["campos"]

    def test_cada_nivel_de_cada_idioma_tem_o_exemplo_dele(self):
        for lang in estilos.idiomas():
            for nivel in estilos.niveis(lang):
                with self.subTest(lang=lang, nivel=nivel):
                    self.assertIn("Front", estilos.exemplo(lang, nivel)["texto"])

    def test_o_exemplo_preenche_todas_as_partes_do_verso_do_nivel_e_nenhuma_de_outro_nivel(self):
        for lang, nivel, campos in self.exemplos():
            with self.subTest(lang=lang, nivel=nivel):
                nomes = estilos.idioma(lang)["campos"]
                estilo = estilos.estilo(lang, nivel)
                guardados = {nomes[parte] for parte in estilo.get("guarda", [])}  # o que o Envio grava e o verso não mostra (a Morfologia e a Raiz do russo)
                esperados = {nomes[parte] for parte in estilo["verso"]} | guardados | {nomes["frase"], nomes["audio_da_frase"], nomes["audio_da_palavra"], nomes["lacuna"], nomes["dica"]}  # a lacuna e a Dica da frente Lacuna (#166)
                self.assertEqual(set(campos) - {nomes["fonte"]}, esperados)

    def test_o_exemplo_leva_as_cores_do_alinhamento_ou_da_morfologia_so_nos_niveis_que_as_tem(self):
        for lang, nivel, campos in self.exemplos():
            with self.subTest(lang=lang, nivel=nivel):
                estilo = estilos.estilo(lang, nivel)
                self.assertEqual(bool(cores_de(campos["Frase"])), bool(estilo["cores"] or estilo.get("morfologia")))


if __name__ == "__main__":
    unittest.main()
