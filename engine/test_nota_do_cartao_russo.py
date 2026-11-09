"""O Cartão do russo no Intermediário (a palavra-chave destacada e a morfologia depois do outro exemplo) e no Avançado (monolingue)."""

import re
import unittest

import nota_do_cartao

CORES_DA_MORFOLOGIA = {"prefix": "#a855f7", "root": "#22c55e", "suffix": "#f59e0b", "ending": "#ef4444"}
FRASE = "Она приходила вчера, но меня не было дома."
DESTAQUE = '<span style="color: #f59e0b; font-weight: bold;">приходила</span>'
MARCA = "font-weight: bold; border-bottom: 3px solid #f59e0b;"


def pedacos(*tipos_e_textos):
    return "".join('<span style="color: %s;">%s</span>' % (CORES_DA_MORFOLOGIA[tipo], texto) for tipo, texto in tipos_e_textos)


CHAVE_PINTADA = '<span style="%s">%s</span>' % (MARCA, pedacos(("prefix", "при"), ("root", "ход"), ("suffix", "и"), ("suffix", "л"), ("ending", "а")))

RUSSO_INTERMEDIARIO = """## Anki Card

Front
Она приходила вчера, но меня не было дома.

Back
Word: приходила

Stress: приходи\u0301ла

Pronunciation: pri-ha-DI-la

Definition: To come or to arrive on foot; here it is the habitual or repeated past, "she used to come".

Simple meaning: It is when a person walks to a place to be there, again and again.

Other example: Мама приходила домой поздно.

Morphology:
приходила | prefix:при | root:ход | suffix:и | suffix:л | ending:а
вчера | root:вчер | ending:а
дома | root:дом | ending:а
Мама | root:мам | ending:а

Colors:
prefix | при- | arrival, movement towards a place
suffix | -и-л- | verb stem and past tense; imperfective aspect
root | ход | the idea of walking, going
ending | -а | feminine singular: she (3rd person, past tense)

Root: ход

Google Image Search Queries:
1. person arriving home
2. front door open

Image: A woman arriving at a door, no text.
"""

RUSSO_AVANCADO = """## Anki Card

Front
Она приходила вчера, но меня не было дома.

Back
Word: приходила

Stress: приходи\u0301ла

Definition: Приходить, то есть прибывать пешком; здесь это привычное действие в прошлом: «она приходила обычно».

Simple meaning: Это когда человек идёт к кому-то и бывает там, и так много раз.

Other example: Мама приходила домой поздно.

Root: ход

Same root: ходить (идти пешком), вход (место, где входят), выход (место, где выходят)

Google Image Search Queries:
1. person arriving home
2. front door open

Image: A woman arriving at a door, no text.
"""


def nota(conteudo, **argumentos):
    return nota_do_cartao.campos_da_nota(conteudo, "ru", **argumentos)["campos"]


def cores_de(html):
    return re.findall(r'<span style="color: (#[0-9a-f]{6});">(.*?)</span>', html)


class OIntermediarioDoRusso(unittest.TestCase):
    def test_nas_duas_frases_a_palavra_chave_e_destacada_e_os_pedacos_de_todas_as_palavras_levam_a_cor_do_tipo(self):
        campos = nota(RUSSO_INTERMEDIARIO, nivel="intermediario")
        self.assertEqual(
            campos["Frase"],
            "Она %s %s, но меня не было %s." % (
                CHAVE_PINTADA, pedacos(("root", "вчер"), ("ending", "а")), pedacos(("root", "дом"), ("ending", "а"))))
        self.assertEqual(campos["Outro exemplo"], "%s %s домой поздно." % (pedacos(("root", "Мам"), ("ending", "а")), CHAVE_PINTADA))
        self.assertNotIn("\u0301", campos["Frase"])

    def test_a_morfologia_vem_depois_do_outro_exemplo_e_antes_da_imagem_no_verso_do_modelo(self):
        import estilos
        ordem = estilos.DADOS["idiomas"]["ru"]["ordem_do_verso"]
        self.assertLess(ordem.index("outro_exemplo"), ordem.index("explicacao_das_cores"))
        self.assertLess(ordem.index("explicacao_das_cores"), ordem.index("imagem"))

    def test_a_palavra_aparece_uma_vez_no_verso_e_so_na_silaba_forte_e_o_resto_e_o_dicionario_e_o_simples(self):
        campos = nota(RUSSO_INTERMEDIARIO, nivel="intermediario", audio_da_palavra="p.mp3")
        self.assertEqual((campos["Sílaba forte"], campos["Pronúncia"], campos["Áudio da palavra"]), ("приходи́ла", "pri-ha-DI-la", "[sound:p.mp3]"))
        self.assertNotIn("Palavra", campos)
        self.assertTrue(campos["Definição"].startswith("To come or to arrive"))
        self.assertTrue(campos["Significado simples"].startswith("It is when a person walks"))
        self.assertFalse({"Tradução literal", "Tradução natural", "Contexto da cena", "Mesma raiz"} & set(campos))

    def test_a_explicacao_tem_uma_linha_por_tipo_de_pedaco_na_ordem_prefixo_raiz_sufixo_terminacao(self):
        linhas = nota(RUSSO_INTERMEDIARIO, nivel="intermediario")["Explicação das cores"].split("<br>")
        self.assertEqual(
            [(cores_de(linha)[0][0], re.sub("<[^>]+>", "", linha)) for linha in linhas],
            [(CORES_DA_MORFOLOGIA["prefix"], "при- – arrival, movement towards a place"),
             (CORES_DA_MORFOLOGIA["root"], "ход – the idea of walking, going"),
             (CORES_DA_MORFOLOGIA["suffix"], "-и-л- – verb stem and past tense; imperfective aspect"),
             (CORES_DA_MORFOLOGIA["ending"], "-а – feminine singular: she (3rd person, past tense)")])

    def test_os_campos_da_morfologia_que_a_criacao_vai_usar_ficam_gravados(self):
        campos = nota(RUSSO_INTERMEDIARIO, nivel="intermediario")
        self.assertEqual(campos["Raiz"], "ход")
        self.assertEqual(campos["Morfologia"], "приходила = при + ход + и + л + а<br>вчера = вчер + а<br>дома = дом + а<br>Мама = мам + а")

    def test_um_pedaco_que_nao_soma_a_palavra_deixa_a_palavra_fora_da_morfologia_e_o_resto_segue(self):
        errada = RUSSO_INTERMEDIARIO.replace("вчера | root:вчер | ending:а", "вчера | root:вче | ending:а")
        campos = nota(errada, nivel="intermediario")
        self.assertNotIn("вчера = ", campos["Morfologia"])
        self.assertIn("дома = дом + а", campos["Morfologia"])

    def test_sem_a_secao_da_morfologia_nada_e_adivinhado_e_a_palavra_chave_segue_destacada(self):
        sem = RUSSO_INTERMEDIARIO.split("Morphology:")[0] + "Google Image Search Queries:\n1. door\n"
        campos = nota(sem, nivel="intermediario")
        self.assertFalse({"Morfologia", "Explicação das cores", "Raiz"} & set(campos))
        self.assertEqual(campos["Frase"], FRASE.replace("приходила", DESTAQUE))

    def test_a_palavra_chave_fora_da_morfologia_e_destacada_inteira_e_as_outras_palavras_levam_as_cores(self):
        sem_a_chave = RUSSO_INTERMEDIARIO.replace("приходила | prefix:при | root:ход | suffix:и | suffix:л | ending:а\n", "")
        frase = nota(sem_a_chave, nivel="intermediario")["Frase"]
        self.assertIn(DESTAQUE, frase)
        self.assertIn(pedacos(("root", "вчер"), ("ending", "а")), frase)

    def test_a_palavra_com_maiuscula_na_frase_guarda_a_caixa_da_frase(self):
        campos = nota(RUSSO_INTERMEDIARIO.replace("Она приходила", "Приходила она"), nivel="intermediario")
        self.assertTrue(campos["Frase"].startswith('<span style="%s">%s' % (MARCA, pedacos(("prefix", "При")))))

    def test_a_palavra_do_cartao_vale_mais_que_a_do_pedido_que_so_leva_as_duas_primeiras_palavras_da_frase(self):
        campos = nota(RUSSO_INTERMEDIARIO, nivel="intermediario", palavra="Она приходила")
        self.assertIn(CHAVE_PINTADA, campos["Frase"])

    def test_a_palavra_do_pedido_serve_quando_o_texto_nao_traz_a_dele(self):
        sem_palavra = RUSSO_INTERMEDIARIO.replace("Word: приходила\n\n", "")
        self.assertIn(CHAVE_PINTADA, nota(sem_palavra, nivel="intermediario", palavra="приходила")["Frase"])

    def test_a_frase_que_a_busca_de_duplicatas_compara_e_a_inteira_e_sem_o_destaque(self):
        pronta = nota_do_cartao.campos_da_nota(RUSSO_INTERMEDIARIO, "ru", nivel="intermediario")
        self.assertEqual(pronta["frente_normalizada"], FRASE)


class OAvancadoDoRusso(unittest.TestCase):
    def test_so_a_palavra_chave_e_destacada_na_frase_e_no_outro_exemplo(self):
        campos = nota(RUSSO_AVANCADO, nivel="avancado")
        self.assertEqual(campos["Frase"], FRASE.replace("приходила", DESTAQUE))
        self.assertEqual(campos["Outro exemplo"], "Мама %s домой поздно." % DESTAQUE)

    def test_o_verso_e_so_russo_com_o_significado_de_dicionario_a_frase_simples_e_o_outro_exemplo_sem_a_morfologia(self):
        campos = nota(RUSSO_AVANCADO, nivel="avancado")
        self.assertEqual(campos["Sílaba forte"], "приходи́ла")
        self.assertNotIn("Palavra", campos)
        self.assertTrue(campos["Definição"].startswith("Приходить"))
        self.assertTrue(campos["Significado simples"].startswith("Это когда человек"))
        self.assertFalse({"Morfologia", "Explicação das cores", "Pronúncia"} & set(campos))
        self.assertEqual(
            campos["Mesma raiz"], "ходить (идти пешком), вход (место, где входят), выход (место, где выходят)")

    def test_a_imagem_e_os_audios_vao_nos_campos_deles(self):
        campos = nota(RUSSO_AVANCADO, nivel="avancado", audio_da_frase="f.mp3", audio_da_palavra="p.mp3", imagem="a.png")
        self.assertEqual((campos["Áudio da frase"], campos["Áudio da palavra"], campos["Imagem"]), ("[sound:f.mp3]", "[sound:p.mp3]", '<img src="a.png">'))


if __name__ == "__main__":
    unittest.main()
