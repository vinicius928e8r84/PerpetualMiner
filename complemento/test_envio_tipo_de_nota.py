"""O tipo de nota próprio por idioma e o Cartão Iniciante (#161), visto de fora: o servidor real com a thread de trabalho ligada, a
coleção em memória (um Anki em português, um em inglês, um com Cartões antigos) e a OpenAI, a voz e o Openverse de mentira. O teste
confere o que fica guardado na coleção: o tipo de nota, os Baralhos, os campos da nota e a mídia que ela cita.

    python3.9 complemento/test_envio_tipo_de_nota.py
"""

import copy
import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import tipo_de_nota  # noqa: E402
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
            "Imagem", "Frase com lacuna", "Dica"]))
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
        self.assertEqual(campos["Tradução natural"], "tradução de mentira")
        self.assertNotIn("Palavra", campos)  # o Iniciante do russo não mostra a palavra do dicionário
        self.assertEqual([texto for _, texto in cores_de(campos["Frase"])], ["Я"])

    def test_a_imagem_do_cartao_vai_no_campo_proprio_e_a_foto_fica_na_midia_da_nota(self):
        _, notas = enviar(ColecaoEmMemoria(SO_O_DEFAULT), pedido(ID, FRASE))
        nome = re.fullmatch(r'<img src="([^"]+)">', notas[0]["campos"]["Imagem"]).group(1)
        self.assertIn(nome, notas[0]["midia"])


def enviar_no_nivel(nivel, frase=FRASE, id_=ID, **argumentos):
    """O Envio inteiro no `nivel` (None: o pedido sem nível) numa coleção nova: o estado, a nota gravada e o prompt de sistema que a OpenAI recebeu."""
    colecao = ColecaoEmMemoria(SO_O_DEFAULT)
    corpo = dict(pedido(id_, frase, **argumentos), **({"nivel": nivel} if nivel else {}))
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
        conexao.criar(corpo)
        estado = conexao.esperar(id_)
        prompt = " ".join(conexao.openai.chats[0][1]["messages"][0]["content"].split())
    return estado, colecao.gravadas[0]["campos"], prompt


CAMPOS_SEM_CORES = sorted([
    "Frase", "Áudio da frase", "Palavra", "Áudio da palavra", "Definição", "Outro exemplo", "Contexto da cena", "Fonte", "Imagem", "Frase com lacuna", "Dica"])


class OIntermediarioEOAvancadoDoIngles(unittest.TestCase):
    def test_o_intermediario_pede_o_prompt_dele_e_grava_definicao_outro_exemplo_e_contexto_sem_pronuncia_nem_traducao_nem_cor(self):
        estado, campos, prompt = enviar_no_nivel("intermediario")
        self.assertEqual((estado["status"], sorted(campos)), ("completed", CAMPOS_SEM_CORES))
        self.assertIn("INTERMEDIATE learner", prompt)
        self.assertEqual(
            (campos["Definição"], campos["Outro exemplo"], campos["Contexto da cena"], campos["Palavra"]),
            ("definição de mentira", "outro exemplo de mentira", "cena de mentira.", "gave up - /ipa/"))
        self.assertEqual(re.sub("<[^>]+>", "", campos["Frase"]), "She gave up smoking")
        self.assertEqual(cores_de(campos["Frase"]), [])

    def test_o_avancado_pede_o_prompt_monolingue_e_grava_as_mesmas_partes(self):
        estado, campos, prompt = enviar_no_nivel("avancado")
        self.assertEqual((estado["status"], sorted(campos)), ("completed", CAMPOS_SEM_CORES))
        self.assertIn("must be 100% in ENGLISH", prompt)
        self.assertNotIn("Brazilian Portuguese", prompt)
        self.assertEqual(cores_de(campos["Frase"]), [])

    def test_sem_nivel_no_pedido_e_com_o_iniciante_o_cartao_e_o_mesmo(self):
        sem_nivel, com_iniciante = enviar_no_nivel(None), enviar_no_nivel("iniciante")
        self.assertEqual(sem_nivel[1:], com_iniciante[1:])
        self.assertIn("BEGINNER learner", sem_nivel[2])
        self.assertNotIn("Definição", sem_nivel[1])

    def test_o_audio_da_frase_e_da_palavra_e_a_imagem_continuam_nos_cartoes_dos_outros_niveis(self):
        for nivel in ("intermediario", "avancado"):
            with self.subTest(nivel=nivel):
                campos = enviar_no_nivel(nivel)[1]
                self.assertRegex(campos["Áudio da frase"], r"^\[sound:pm[0-9a-f]+_phrase\.mp3\]$")
                self.assertRegex(campos["Áudio da palavra"], r"^\[sound:pm[0-9a-f]+_word\.mp3\]$")
                self.assertRegex(campos["Imagem"], r'^<img src="[^"]+">$')

    def test_envios_de_niveis_diferentes_convivem_no_mesmo_tipo_de_nota_do_idioma(self):
        colecao = ColecaoEmMemoria(SO_O_DEFAULT)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, FRASE))
            conexao.esperar(ID)
            conexao.criar(dict(pedido(OUTRO_ID, "late : She is always late for work"), nivel="avancado"))
            estado = conexao.esperar(OUTRO_ID)
        self.assertEqual(estado["status"], "completed")
        self.assertEqual([nota["tipo"] for nota in colecao.gravadas], ["PerpetualMiner Inglês"] * 2)
        self.assertIn("Tradução natural", colecao.gravadas[0]["campos"])
        self.assertIn("Definição", colecao.gravadas[1]["campos"])

    def test_um_nivel_que_o_idioma_nao_tem_e_recusado_sem_criar_o_envio(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            for lang, nivel in (("ru", "mestre"), ("ru", None), ("en", "mestre"), ("en", None), ("en", 2)):
                with self.subTest(lang=lang, nivel=nivel):
                    status, resposta = conexao.criar(dict(pedido(ID, FRASE, lang=lang), nivel=nivel))
                    self.assertEqual((status, resposta), (400, {"error": "invalid_level"}))
            self.assertEqual(conexao.pedir("POST", "/jobs/list", corpo={})[0], 200)
            self.assertEqual(json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"], [])

    def test_o_mesmo_id_com_outro_nivel_e_outro_pedido(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            self.assertEqual(conexao.criar(dict(pedido(ID, FRASE), nivel="avancado"))[0], 201)
            self.assertEqual(conexao.criar(dict(pedido(ID, FRASE), nivel="avancado"))[0], 201)
            self.assertEqual(conexao.criar(dict(pedido(ID, FRASE), nivel="intermediario")), (409, {"error": "job_conflict"}))

    def test_o_envio_guarda_o_nivel_e_o_mostra_de_volta(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(dict(pedido(ID, FRASE), nivel="intermediario"))
            conexao.esperar(ID)
            visto = json.loads(conexao.pedir("POST", "/jobs/get", corpo={"jobId": ID})[2])
        self.assertEqual(visto["job"]["nivel"], "intermediario")


class OModeloDoCartaoServeATodosOsNiveis(unittest.TestCase):
    def test_o_verso_do_tipo_de_nota_tem_todas_as_partes_de_todos_os_niveis_na_ordem_do_idioma(self):
        verso = tipo_de_nota.definicao("en")["modelos"][0]["verso"]
        posicoes = [verso.index("{{#%s}}" % campo) for campo in (
            "Pronúncia", "Tradução literal", "Tradução natural", "Contexto da cena", "Palavra", "Definição", "Outro exemplo", "Imagem")]
        self.assertEqual(posicoes, sorted(posicoes))

    def test_o_modelo_e_o_mesmo_em_qualquer_nivel_e_so_os_campos_que_o_envio_grava_mudam(self):
        iniciante, avancado = tipo_de_nota.definicao("en"), tipo_de_nota.definicao("en", "avancado")
        self.assertEqual((iniciante["modelos"], iniciante["campos"]), (avancado["modelos"], avancado["campos"]))
        self.assertIn("Tradução literal", iniciante["campos_do_cartao"])
        self.assertNotIn("Tradução literal", avancado["campos_do_cartao"])
        self.assertIn("Definição", avancado["campos_do_cartao"])
        self.assertNotIn("Definição", iniciante["campos_do_cartao"])

    def test_o_verso_do_russo_so_traz_a_frente_quando_o_cartao_repete_a_frase(self):
        verso = tipo_de_nota.definicao("ru")["modelos"][0]["verso"]
        self.assertTrue(verso.startswith("{{^Sílaba forte}}{{FrontSide}}\n<hr id=answer>{{/Sílaba forte}}"))
        self.assertNotIn("FrontSide", verso.split("{{/Sílaba forte}}", 1)[1])

    def test_o_verso_do_ingles_traz_sempre_a_frente_porque_nenhum_nivel_dele_tira_a_frase(self):
        self.assertTrue(tipo_de_nota.definicao("en")["modelos"][0]["verso"].startswith("{{FrontSide}}\n<hr id=answer>\n"))

    def test_o_verso_do_russo_tem_as_partes_dos_tres_niveis_na_ordem_do_idioma(self):
        verso = tipo_de_nota.definicao("ru")["modelos"][0]["verso"]
        posicoes = [verso.index("{{#%s}}" % campo) for campo in (
            "Pronúncia", "Tradução literal", "Tradução natural", "Contexto da cena", "Palavra", "Sílaba forte", "Definição", "Significado simples",
            "Outro exemplo", "Explicação das cores", "Mesma raiz", "Imagem")]
        self.assertEqual(posicoes, sorted(posicoes))

    def test_o_envio_do_russo_grava_a_morfologia_e_a_raiz_que_o_verso_nao_mostra(self):
        com_o_nivel = tipo_de_nota.definicao("ru", "intermediario")["campos_do_cartao"]
        self.assertTrue({"Morfologia", "Raiz", "Sílaba forte", "Explicação das cores"} <= set(com_o_nivel))
        self.assertNotIn("Mesma raiz", com_o_nivel)
        self.assertIn("Mesma raiz", tipo_de_nota.definicao("ru", "avancado")["campos_do_cartao"])
        verso = tipo_de_nota.definicao("ru")["modelos"][0]["verso"]
        self.assertFalse({"{{Morfologia}}", "{{Raiz}}"} & set(re.findall(r"\{\{[^#/^}]+\}\}", verso)))


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
