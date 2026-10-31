"""O tipo de nota próprio por idioma e o Cartão Iniciante (#161), visto de fora: o servidor real com a thread de trabalho ligada, a
coleção em memória (um Anki em português, um em inglês, um com Cartões antigos) e a OpenAI, a voz e o Openverse de mentira. O teste
confere o que fica guardado na coleção: o tipo de nota, os Baralhos, os campos da nota e a mídia que ela cita.

    python3.9 complemento/test_envio_tipo_de_nota.py
"""

import copy
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.motor import estilos  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_contrato_da_criacao import ANKI_EM_INGLES, SO_O_DEFAULT  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402

FRASE = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"
PERPETUALMINER_INGLES = "PerpetualMiner::Inglês"


def cores_de(html):
    return re.findall(r'<span style="color: (#[0-9a-f]{6});">(.*?)</span>', html)


def enviar(colecao, corpo, id_=ID):
    """Faz o Envio inteiro e devolve o estado e as notas gravadas."""
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
        conexao.criar(dict(corpo, jobId=id_))
        estado = conexao.esperar(id_)
    return estado, colecao.gravadas


class OEnvioNaoFalhaNumAnkiEmIngles(unittest.TestCase):
    def test_um_anki_so_com_o_basic_em_ingles_recebe_o_cartao_no_tipo_de_nota_proprio(self):
        colecao = ColecaoEmMemoria(ANKI_EM_INGLES)
        estado, notas = enviar(colecao, pedido(ID, FRASE, baralho=PERPETUALMINER_INGLES))
        self.assertEqual((estado["status"], estado["lastError"]), ("completed", None))
        self.assertEqual([(nota["baralho"], nota["tipo"]) for nota in notas], [(PERPETUALMINER_INGLES, "PerpetualMiner Inglês")])
        self.assertEqual(colecao.tipo_de_nota("Basic"), ["Front", "Back"])

    def test_um_anki_em_portugues_sem_o_basico_tambem_recebe_o_cartao(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Default"}], "tiposDeNota": {"Cloze": ["Text"]}})
        estado, notas = enviar(colecao, pedido(ID, FRASE))
        self.assertEqual((estado["status"], len(notas)), ("completed", 1))

    def test_o_tipo_de_nota_com_o_nosso_nome_mas_sem_os_nossos_campos_faz_o_cartao_falhar_sem_gravar_nada(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Default"}], "tiposDeNota": {"PerpetualMiner Inglês": ["Frase", "Meu campo"]}})
        estado, notas = enviar(colecao, pedido(ID, FRASE))
        self.assertEqual((estado["status"], estado["lastError"], notas), ("failed", "note_type_missing", []))
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Inglês"), ["Frase", "Meu campo"])


class OCartaoNovoSaiNoIniciante(unittest.TestCase):
    def test_o_cartao_de_ingles_tem_a_frase_e_o_audio_na_frente_e_no_verso_pronuncia_literal_natural_palavra_e_cena(self):
        colecao = ColecaoEmMemoria(ANKI_EM_INGLES)
        _, notas = enviar(colecao, pedido(ID, FRASE))
        campos = notas[0]["campos"]
        self.assertEqual(sorted(campos), sorted([
            "Frase", "Áudio da frase", "Palavra", "Áudio da palavra", "Pronúncia", "Tradução literal", "Tradução natural", "Contexto da cena", "Fonte",
            "Imagem"]))
        self.assertIn("<b>", campos["Frase"])
        self.assertEqual(re.sub("<[^>]+>", "", campos["Frase"]), "She gave up smoking")
        self.assertEqual(campos["Pronúncia"], "pronúncia de mentira")
        self.assertEqual(campos["Tradução natural"], "tradução de mentira")
        self.assertEqual(campos["Palavra"], "gave up - /ipa/")
        self.assertEqual(campos["Fonte"], "Série - The Office - S01E01")
        self.assertRegex(campos["Áudio da frase"], r"^\[sound:pm[0-9a-f]+_phrase\.mp3\]$")
        self.assertRegex(campos["Áudio da palavra"], r"^\[sound:pm[0-9a-f]+_word\.mp3\]$")

    def test_as_cores_ligam_a_palavra_da_frente_ao_pedaco_dela_na_literal(self):
        campos = enviar(ColecaoEmMemoria(SO_O_DEFAULT), pedido(ID, FRASE))[1][0]["campos"]
        self.assertEqual(
            [cor for cor, _ in cores_de(campos["Frase"])], [cor for cor, _ in cores_de(campos["Tradução literal"])])
        self.assertEqual([texto for _, texto in cores_de(campos["Frase"])], ["gave up"])
        self.assertEqual([texto for _, texto in cores_de(campos["Tradução literal"])], ["literal"])

    def test_o_cartao_de_russo_sai_no_tipo_de_nota_russo_com_a_traducao_em_portugues(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        estado, notas = enviar(colecao, pedido(ID, "Я не мальчик! [Context: Série - Episódio 1]", lang="ru", baralho="PerpetualMiner::Russo"))
        campos = notas[0]["campos"]
        self.assertEqual((estado["status"], notas[0]["tipo"], notas[0]["baralho"]), ("completed", "PerpetualMiner Russo", "PerpetualMiner::Russo"))
        self.assertEqual(re.sub("<[^>]+>", "", campos["Frase"]), "Я не мальчик!")
        self.assertEqual((campos["Tradução natural"], campos["Palavra"]), ("tradução de mentira", "Я не"))
        self.assertEqual([texto for _, texto in cores_de(campos["Frase"])], ["Я"])

    def test_a_imagem_do_cartao_vai_no_campo_proprio_e_a_foto_fica_na_midia_da_nota(self):
        _, notas = enviar(ColecaoEmMemoria(SO_O_DEFAULT), pedido(ID, FRASE))
        nome = re.fullmatch(r'<img src="([^"]+)">', notas[0]["campos"]["Imagem"]).group(1)
        self.assertIn(nome, notas[0]["midia"])


class RepetirNaoDobraNemMexeNoQueJaEstaLa(unittest.TestCase):
    def test_dois_envios_nao_criam_tipo_de_nota_nem_baralho_repetido(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        enviar(colecao, pedido(ID, FRASE, baralho=PERPETUALMINER_INGLES))
        antes = sorted(colecao.nomes_dos_baralhos())
        enviar(colecao, pedido(OUTRO_ID, "late : She is late", baralho=PERPETUALMINER_INGLES), OUTRO_ID)
        self.assertEqual(sorted(colecao.nomes_dos_baralhos()), antes)
        self.assertEqual(antes.count(PERPETUALMINER_INGLES), 1)
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Inglês")[0], "Frase")

    def test_o_cartao_antigo_do_basico_do_dono_e_reconhecido_como_duplicata_e_nada_dele_e_mexido(self):
        antiga = {"baralhos": [{"nome": "CIMV", "notas": [{"frente": "She <b>gave up</b> smoking[sound:antigo.mp3]", "verso": "gave up - /x/"}]}]}
        colecao = ColecaoEmMemoria(antiga)
        antes = colecao.cartoes_do_baralho("CIMV")
        estado, notas = enviar(colecao, pedido(ID, FRASE, baralho="CIMV"))
        self.assertEqual((estado["status"], estado["duplicatePhraseIds"], notas), ("completed", [1760000000000], []))
        self.assertEqual(colecao.cartoes_do_baralho("CIMV"), antes)
        self.assertEqual(colecao.tipo_de_nota("Básico"), ["Frente", "Verso"])

    def test_um_cartao_novo_e_um_antigo_convivem_no_mesmo_baralho_e_o_segundo_envio_da_frase_nova_e_duplicata(self):
        antiga = {"baralhos": [{"nome": "CIMV", "notas": [{"frente": "They keep running", "verso": "run"}]}]}
        colecao = ColecaoEmMemoria(antiga)
        enviar(colecao, pedido(ID, FRASE, baralho="CIMV"))
        estado, notas = enviar(colecao, pedido(OUTRO_ID, FRASE, baralho="CIMV"), OUTRO_ID)
        self.assertEqual((estado["duplicatePhraseIds"], len(colecao.gravadas), len(colecao.cartoes_do_baralho("CIMV"))), ([1760000000000], 1, 2))


class UmIdiomaNovoEntraPorDados(unittest.TestCase):
    def test_um_terceiro_idioma_so_nos_dados_ganha_tipo_de_nota_e_cartao_sem_mudar_codigo(self):
        dados = copy.deepcopy(estilos.DADOS)
        dados["idiomas"]["es"] = dict(
            copy.deepcopy(dados["idiomas"]["en"]), nome="Espanhol", tipo_de_nota="PerpetualMiner Espanhol", baralho="PerpetualMiner::Espanhol")
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with mock.patch.object(estilos, "_PADRAO", estilos.Estilos(dados)):
            estado, notas = enviar(colecao, pedido(ID, "dejó : Ella dejó de fumar", lang="es", baralho="PerpetualMiner::Espanhol"))
        self.assertEqual((estado["status"], notas[0]["tipo"]), ("completed", "PerpetualMiner Espanhol"))
        self.assertEqual(colecao.tipo_de_nota("PerpetualMiner Espanhol")[0], "Frase")


if __name__ == "__main__":
    unittest.main()
