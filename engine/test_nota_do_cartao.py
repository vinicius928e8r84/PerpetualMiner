"""A nota que o texto de um Cartão vira, campo por campo, no estilo do idioma e do nível: o que a Conexão grava no tipo de nota."""

import copy
import re
import unittest
from unittest import mock

import estilos
import nota_do_cartao

INGLES = """## Anki Card

Source Context: Série - The Office - S01E01

Front: She *gave up* smoking last year.

Back: gave up \u2013 /\u0261e\u026av \u028cp/

Pronunciation: shi GUÊIV âp SMÔU-kin lést iâr

Literal: Ela desistiu fumando último ano

Natural: Ela parou de fumar ano passado.

Gist: Alguém conta que largou o cigarro.

Image: A person breaking a cigarette, no text.
Google Image Search Queries:
1. broken cigarette
2. no smoking sign
3. person refusing cigarette
4. quit smoking

Alignment:
1 | She | Ela
2 | gave up | desistiu
3 | smoking | fumando
"""

INTERMEDIARIO = """## Anki Card

Source Context: Série - The Office - S01E01

Front: She *gave up* smoking last year.

Back: gave up \u2013 /\u0261e\u026av \u028cp/

Definition: Desistir de fazer algo, parar de tentar.

Other example: Michael never gives up on a bad joke.

Gist: Alguém conta que largou o cigarro no ano passado.

Image: A person breaking a cigarette, no text.
Google Image Search Queries:
1. broken cigarette
2. no smoking sign
3. person refusing cigarette
4. quit smoking
"""

AVANCADO = """## Anki Card

Source Context: Série - The Office - S01E01

Front: She *gave up* smoking last year.

Back: gave up \u2013 /\u0261e\u026av \u028cp/

Definition: To stop doing or trying something, usually a habit, because it has become pointless or too hard.

Other example: Pam never gave up on her dream of becoming an artist.

Gist: A coworker explains how she quit smoking, and why the habit had to go.

Image: A person breaking a cigarette, no text.
Google Image Search Queries:
1. broken cigarette
2. no smoking sign
3. person refusing cigarette
4. quit smoking
"""

RUSSO = """## Anki Card

Front
Я не мальчик!

Back
Pronunciation: ia ni MAL-tchik

Literal: Eu não menino

Natural: Eu não sou um menino!

Gist: Alguém corrige uma suposição errada sobre si.

Google Image Search Queries:
1. girl
2. young girl portrait
3. confident girl
4. female child portrait

Image: A confident girl, no text.

Alignment:
1 | Я | Eu
2 | не | não
3 | мальчик | menino
"""

def cores_de(html):
    """Os textos que levam cor, na ordem, com a cor: [(cor, texto)]."""
    return re.findall(r'<span style="color: (#[0-9a-f]{6});">(.*?)</span>', html)


def nota(conteudo, lang, **argumentos):
    return nota_do_cartao.campos_da_nota(conteudo, lang, **argumentos)


class OCartaoDosOutrosNiveisDoIngles(unittest.TestCase):
    def test_o_intermediario_grava_a_definicao_em_portugues_outro_exemplo_contexto_e_palavra_sem_nenhuma_cor(self):
        campos = nota(INTERMEDIARIO, "en", nivel="intermediario")["campos"]
        self.assertEqual(
            campos,
            {
                "Frase": "She <b>gave up</b> smoking last year.",
                "Palavra": "gave up \u2013 /\u0261e\u026av \u028cp/",
                "Definição": "Desistir de fazer algo, parar de tentar.",
                "Outro exemplo": "Michael never gives up on a bad joke.",
                "Contexto da cena": "Alguém conta que largou o cigarro no ano passado.",
                "Fonte": "Série - The Office - S01E01",
                "Frase com lacuna": 'She <b class="lacuna">[\u2026]</b> smoking last year.',
                "Dica": "Desistir de fazer algo, parar de tentar.",
            },
        )
        self.assertEqual(cores_de(campos["Frase"]), [])

    def test_o_avancado_grava_as_mesmas_partes_todas_em_ingles(self):
        campos = nota(AVANCADO, "en", nivel="avancado")["campos"]
        self.assertEqual(
            sorted(campos), sorted(["Frase", "Palavra", "Definição", "Outro exemplo", "Contexto da cena", "Fonte", "Frase com lacuna", "Dica"]))
        self.assertTrue(campos["Definição"].startswith("To stop doing"))
        self.assertEqual(campos["Contexto da cena"], "A coworker explains how she quit smoking, and why the habit had to go.")
        self.assertEqual(cores_de(campos["Frase"]), [])

    def test_os_outros_niveis_nao_gravam_pronuncia_nem_traducoes_mesmo_que_o_texto_as_traga(self):
        campos = nota(INGLES, "en", nivel="intermediario")["campos"]
        self.assertFalse({"Pronúncia", "Tradução literal", "Tradução natural"} & set(campos))
        self.assertEqual(cores_de(campos["Frase"]), [])

    def test_a_imagem_e_os_audios_vao_nos_campos_deles_em_qualquer_nivel(self):
        campos = nota(AVANCADO, "en", nivel="avancado", audio_da_frase="f.mp3", audio_da_palavra="p.mp3", imagem="a.png")["campos"]
        self.assertEqual(
            (campos["Áudio da frase"], campos["Áudio da palavra"], campos["Imagem"]), ("[sound:f.mp3]", "[sound:p.mp3]", '<img src="a.png">'))

    def test_a_frase_que_a_busca_de_duplicatas_compara_e_a_mesma_em_todos_os_niveis(self):
        frentes = {nivel: nota(texto, "en", nivel=nivel)["frente_normalizada"] for nivel, texto in
                   (("iniciante", INGLES), ("intermediario", INTERMEDIARIO), ("avancado", AVANCADO))}
        self.assertEqual(set(frentes.values()), {"she gave up smoking last year."})

    def test_o_nivel_que_o_idioma_nao_tem_nao_gera_nota(self):
        with self.assertRaises(KeyError):
            nota(RUSSO, "ru", nivel="nativo")


class OCartaoDoRussoIniciante(unittest.TestCase):
    def test_o_iniciante_do_russo_segue_com_o_alinhamento_e_sem_a_morfologia(self):
        campos = nota(RUSSO, "ru")["campos"]
        self.assertFalse({"Morfologia", "Explicação das cores", "Raiz", "Sílaba forte", "Mesma raiz", "Significado simples"} & set(campos))
        self.assertEqual(len({cor for cor, _ in cores_de(campos["Frase"])}), 3)


class OCartaoIniciante(unittest.TestCase):
    def test_a_frase_do_ingles_leva_a_palavra_em_negrito_e_cada_pedaco_alinhado_na_sua_cor(self):
        campos = nota(INGLES, "en")["campos"]
        self.assertIn("<b>", campos["Frase"])
        self.assertEqual([texto for _, texto in cores_de(campos["Frase"])], ["She", "gave up", "smoking"])
        self.assertNotIn("[sound:", campos["Frase"])

    def test_a_cor_de_cada_pedaco_da_frase_e_a_do_pedaco_da_literal_que_ele_traduz(self):
        for conteudo, lang in ((INGLES, "en"), (RUSSO, "ru")):
            with self.subTest(lang=lang):
                campos = nota(conteudo, lang)["campos"]
                da_frase, da_literal = cores_de(campos["Frase"]), cores_de(campos["Tradução literal"])
                self.assertEqual([cor for cor, _ in da_frase], [cor for cor, _ in da_literal])
                self.assertEqual(len({cor for cor, _ in da_frase}), 3)

    def test_o_verso_do_ingles_tem_pronuncia_literal_natural_cena_palavra_e_fonte_em_portugues(self):
        campos = nota(INGLES, "en")["campos"]
        self.assertEqual(campos["Pronúncia"], "shi GUÊIV âp SMÔU-kin lést iâr")
        self.assertEqual(re.sub("<[^>]+>", "", campos["Tradução literal"]), "Ela desistiu fumando último ano")
        self.assertEqual(campos["Tradução natural"], "Ela parou de fumar ano passado.")
        self.assertEqual(campos["Contexto da cena"], "Alguém conta que largou o cigarro.")
        self.assertEqual(campos["Palavra"], "gave up \u2013 /\u0261e\u026av \u028cp/")
        self.assertEqual(campos["Fonte"], "Série - The Office - S01E01")

    def test_o_russo_leva_a_frase_inteira_e_a_palavra_que_o_pedido_deu(self):
        campos = nota(RUSSO, "ru", palavra="Я не")["campos"]
        self.assertEqual(re.sub("<[^>]+>", "", campos["Frase"]), "Я не мальчик!")
        self.assertNotIn("Palavra", campos)  # o Iniciante do russo não mostra a palavra do dicionário (a pessoa não busca i+1)
        self.assertEqual(campos["Tradução natural"], "Eu não sou um menino!")

    def test_o_audio_da_frase_e_o_da_palavra_e_a_imagem_vao_cada_um_no_seu_campo(self):
        campos = nota(INGLES, "en", audio_da_frase="a_phrase.mp3", audio_da_palavra="a_word.mp3", imagem="a.png")["campos"]
        self.assertEqual(
            (campos["Áudio da frase"], campos["Áudio da palavra"], campos["Imagem"]),
            ("[sound:a_phrase.mp3]", "[sound:a_word.mp3]", '<img src="a.png">'),
        )

    def test_sem_audio_e_sem_imagem_esses_campos_nem_aparecem(self):
        campos = nota(INGLES, "en")["campos"]
        self.assertFalse({"Áudio da frase", "Áudio da palavra", "Imagem"} & set(campos))

    def test_so_os_campos_do_iniciante_vem_preenchidos_e_o_resto_fica_para_os_outros_niveis(self):
        campos = nota(INGLES, "en")["campos"]
        self.assertEqual(
            sorted(campos), sorted(["Frase", "Palavra", "Pronúncia", "Tradução literal", "Tradução natural", "Contexto da cena", "Fonte", "Frase com lacuna", "Dica"]))

    def test_a_frase_do_cartao_e_o_que_a_busca_de_duplicatas_compara_sem_cor_nem_negrito(self):
        pronta = nota(INGLES, "en")
        self.assertEqual((pronta["campo_da_frente"], pronta["frente_normalizada"]), ("Frase", "she gave up smoking last year."))

    def test_a_frase_russa_normaliza_o_e_com_trema_como_a_conexao_de_antes(self):
        pronta = nota(RUSSO.replace("Я не мальчик!", "Всё хорошо!").replace("1 | Я | Eu", "1 | Всё | Eu"), "ru")
        self.assertEqual(pronta["frente_normalizada"], "Все хорошо!")

    def test_as_etiquetas_saem_da_fonte_como_antes(self):
        self.assertEqual(nota(INGLES, "en")["etiquetas"], ["perpetual_miner", "série", "the_office", "s01e01"])

    def test_sem_o_alinhamento_nao_ha_cor_nenhuma_e_nada_e_adivinhado(self):
        campos = nota(INGLES.split("Alignment:")[0], "en")["campos"]
        self.assertEqual(cores_de(campos["Frase"]) + cores_de(campos["Tradução literal"]), [])

    def test_um_nivel_com_as_cores_desligadas_nao_pinta_nem_com_o_alinhamento_no_texto(self):
        dados = copy.deepcopy(estilos.DADOS)
        dados["idiomas"]["en"]["niveis"]["iniciante"]["cores"] = False
        with mock.patch.object(estilos, "_PADRAO", estilos.Estilos(dados)):
            campos = nota(INGLES, "en")["campos"]
        self.assertEqual(cores_de(campos["Frase"]) + cores_de(campos["Tradução literal"]), [])
        self.assertIn("<b>gave up</b>", campos["Frase"])

    def test_um_nivel_so_preenche_as_partes_do_verso_que_ele_diz(self):
        dados = copy.deepcopy(estilos.DADOS)
        dados["idiomas"]["en"]["niveis"]["iniciante"]["verso"] = ["natural", "palavra"]
        with mock.patch.object(estilos, "_PADRAO", estilos.Estilos(dados)):
            campos = nota(INGLES, "en")["campos"]
        self.assertEqual(sorted(campos), sorted(["Frase", "Palavra", "Tradução natural", "Fonte", "Frase com lacuna", "Dica"]))

    def test_um_idioma_novo_entra_so_por_dados_e_o_cartao_dele_sai_no_tipo_de_nota_dele(self):
        dados = copy.deepcopy(estilos.DADOS)
        dados["idiomas"]["es"] = dict(copy.deepcopy(dados["idiomas"]["en"]), tipo_de_nota="PerpetualMiner Espanhol", baralho="PerpetualMiner::Espanhol")
        with mock.patch.object(estilos, "_PADRAO", estilos.Estilos(dados)):
            pronta = nota(INGLES.replace("She *gave up*", "Ella *dejó*"), "es")
        self.assertEqual(pronta["campo_da_frente"], "Frase")
        self.assertEqual(re.sub("<[^>]+>", "", pronta["campos"]["Frase"]), "Ella dejó smoking last year.")


if __name__ == "__main__":
    unittest.main()
