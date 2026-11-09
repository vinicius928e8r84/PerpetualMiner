"""O Intermediário e o Avançado do russo (#163), vistos de fora: o servidor real com a thread de trabalho ligada, a coleção em memória e a
OpenAI, a voz e o Openverse de mentira. O teste confere o que fica guardado na coleção: os campos da nota (a morfologia, a raiz, a Palavra que o
Cartão escolheu) e o que a OpenAI e a voz receberam.

    python3.9 complemento/test_envio_russo.py
"""

import json
import re
import sys
import os
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import tipo_de_nota  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_contrato_da_criacao import SO_O_DEFAULT  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_envio_tipo_de_nota import cores_de  # noqa: E402

FRASE_RUSSA = "Она приходила вчера [Context: Série - Episódio 1]"
PALAVRA_DE_MENTIRA = "вчера"  # a última palavra da frase: o Cartão de mentira escolhe essa
CAMPOS_DO_RUSSO_COM_MORFOLOGIA = sorted([
    "Frase", "Áudio da frase", "Palavra", "Áudio da palavra", "Pronúncia", "Sílaba forte", "Definição", "Significado simples", "Explicação das cores", "Outro exemplo",
    "Morfologia", "Raiz", "Imagem", "Frase com lacuna", "Dica"])


def enviar_o_russo(nivel, frase=FRASE_RUSSA, id_=ID):
    """O Envio inteiro do russo no `nivel`: o estado, a nota gravada e o prompt de sistema que a OpenAI recebeu."""
    colecao = ColecaoEmMemoria(SO_O_DEFAULT)
    corpo = dict(pedido(id_, frase, lang="ru", baralho="PerpetualMiner::Russo"), **({"nivel": nivel} if nivel else {}))
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
        conexao.criar(corpo)
        estado = conexao.esperar(id_)
        prompt = " ".join(conexao.openai.chats[0][1]["messages"][0]["content"].split())
    return estado, colecao.gravadas[0]["campos"], prompt


class OIntermediarioEOAvancadoDoRusso(unittest.TestCase):
    def test_o_intermediario_pede_o_prompt_dele_e_grava_a_palavra_a_silaba_forte_a_definicao_em_ingles_a_explicacao_das_cores_e_a_morfologia(self):
        estado, campos, prompt = enviar_o_russo("intermediario")
        self.assertEqual((estado["status"], sorted(campos)), ("completed", CAMPOS_DO_RUSSO_COM_MORFOLOGIA))
        self.assertIn("Morphology:", prompt)
        self.assertNotIn("Same root: [", prompt)
        self.assertEqual((campos["Sílaba forte"], campos["Raiz"]), ("в\u0301чера", "вч"))
        self.assertEqual(campos["Palavra"], PALAVRA_DE_MENTIRA)
        self.assertEqual((campos["Definição"], campos["Outro exemplo"]), ("definição de mentira", "outro exemplo de mentira"))
        self.assertEqual(campos["Morfologia"], "вчера = вч + ера")
        self.assertEqual([texto for _, texto in cores_de(campos["Explicação das cores"])], ["вч", "-ера"])

    def test_a_frente_destaca_a_palavra_chave_e_pinta_os_pedacos_da_morfologia(self):
        _, campos, _ = enviar_o_russo("intermediario")
        self.assertIn('<span style="font-weight: bold; border-bottom: 3px solid #f59e0b;">', campos["Frase"])
        self.assertEqual([texto for _, texto in cores_de(campos["Frase"])], ["вч", "ера"])
        self.assertEqual(re.sub("<[^>]+>", "", campos["Frase"]), "Она приходила вчера")
        self.assertEqual(campos["Significado simples"], "significado simples de mentira")

    def test_o_avancado_e_monolingue_e_grava_as_palavras_da_mesma_raiz_sem_a_morfologia_nem_as_cores(self):
        estado, campos, prompt = enviar_o_russo("avancado")
        self.assertEqual(estado["status"], "completed")
        self.assertFalse({"Morfologia", "Explicação das cores", "Pronúncia"} & set(campos))
        self.assertNotIn("Morphology:", prompt)
        self.assertIn("Same root: [Three to five Russian words", prompt)
        self.assertEqual((campos["Definição"], campos["Mesma raiz"]), ("определение палки", "палочка (однокоренное слово)"))
        self.assertEqual(campos["Significado simples"], "простое объяснение")

    def test_o_audio_da_palavra_e_o_da_palavra_do_cartao_e_nao_o_das_duas_primeiras_palavras_da_linha(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(dict(pedido(ID, FRASE_RUSSA, lang="ru", baralho="PerpetualMiner::Russo"), nivel="intermediario"))
            conexao.esperar(ID)
            falado = [texto for _, _, texto in conexao.voz.pedidos]
        self.assertIn(PALAVRA_DE_MENTIRA, falado)
        self.assertNotIn("Она приходила", falado)

    def test_o_iniciante_do_russo_segue_igual_com_o_alinhamento_e_sem_os_campos_da_morfologia(self):
        estado, campos, prompt = enviar_o_russo(None)
        self.assertEqual(estado["status"], "completed")
        self.assertIn("Alignment: 1 |", prompt)
        self.assertFalse({"Morfologia", "Raiz", "Sílaba forte", "Explicação das cores", "Mesma raiz", "Definição"} & set(campos))
        self.assertEqual(campos["Palavra"], "Она приходила")

    def test_o_pedido_do_russo_com_nivel_e_aceito_e_o_envio_guarda_o_nivel(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            for nivel, id_ in (("intermediario", ID), ("avancado", OUTRO_ID)):
                with self.subTest(nivel=nivel):
                    self.assertEqual(conexao.criar(dict(pedido(id_, FRASE_RUSSA, lang="ru", baralho="PerpetualMiner::Russo"), nivel=nivel))[0], 201)
                    conexao.esperar(id_)
                    visto = json.loads(conexao.pedir("POST", "/jobs/get", corpo={"jobId": id_})[2])
                    self.assertEqual(visto["job"]["nivel"], nivel)


class APalavraDoRusso(unittest.TestCase):
    """A Palavra é gravada nos três níveis (a frente Criação e o tipo que a pessoa já tem a usam), mas o verso do tipo novo a mostra uma vez só."""

    def test_a_criacao_do_russo_mostra_a_palavra_nos_tres_niveis(self):
        self.assertIn("{{Palavra}}", tipo_de_nota.definicao("ru", frente="criacao")["modelos"][0]["frente"])
        for nivel in (None, "intermediario", "avancado"):
            with self.subTest(nivel=nivel):
                _, campos, _ = enviar_o_russo(nivel)
                self.assertTrue(campos["Palavra"])
                self.assertTrue(set(tipo_de_nota.definicao("ru", nivel)["campos_do_cartao"]) >= {"Palavra"})

    def test_o_verso_do_russo_mostra_a_palavra_uma_vez_so_na_silaba_forte_com_o_audio(self):
        verso = tipo_de_nota.definicao("ru")["modelos"][0]["verso"]
        self.assertNotIn("{{Palavra}}", verso)
        self.assertEqual(verso.count("{{Áudio da palavra}}"), 1)
        self.assertIn("{{#Sílaba forte}}<div class=\"silaba\">{{Sílaba forte}} {{Áudio da palavra}}</div>{{/Sílaba forte}}", verso)


class UmTipoDeNotaDoRussoDeAntesDoSignificadoSimples(unittest.TestCase):
    """O tipo "PerpetualMiner Russo" das Conexões anteriores não tem o campo "Significado simples", e a Conexão nunca muda um tipo que já existe."""

    def enviar(self, nivel):
        antigo = tipo_de_nota.definicao("ru")
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        colecao.criar_tipo_de_nota(dict(antigo, campos=[campo for campo in antigo["campos"] if campo != "Significado simples"]))
        corpo = dict(pedido(ID, FRASE_RUSSA, lang="ru", baralho="PerpetualMiner::Russo"), nivel=nivel)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(corpo)
            estado = conexao.esperar(ID)
        return estado, colecao.gravadas[0]["campos"] if colecao.gravadas else None

    def test_o_intermediario_e_o_avancado_gravam_e_o_significado_simples_vai_para_o_fim_da_definicao(self):
        for nivel, simples in (("intermediario", "significado simples de mentira"), ("avancado", "простое объяснение")):
            with self.subTest(nivel=nivel):
                estado, campos = self.enviar(nivel)
                self.assertEqual((estado["status"], estado["lastError"]), ("completed", None))
                self.assertNotIn("Significado simples", campos)
                self.assertTrue(campos["Definição"].endswith("<br>" + simples), campos["Definição"])

    def test_trocar_a_frente_de_um_tipo_antigo_nao_cita_o_campo_que_ele_nao_tem(self):
        antigo = tipo_de_nota.definicao("ru")
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        colecao.criar_tipo_de_nota(dict(antigo, campos=[campo for campo in antigo["campos"] if campo != "Significado simples"]))
        tipo_de_nota.trocar_a_frente(colecao, "ru", "ouvir_primeiro")
        self.assertNotIn("Significado simples", colecao._cartoes_dos_tipos[antigo["nome"]]["verso"])


if __name__ == "__main__":
    unittest.main()
