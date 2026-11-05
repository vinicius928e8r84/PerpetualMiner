"""“Usar um tipo que já tenho” (#165), visto de fora: o servidor real com a thread de trabalho ligada, a coleção em memória (um tipo de nota da pessoa) e a
OpenAI, a voz e o Openverse de mentira. O teste confere o que fica na coleção (a nota, os campos que ela tem, o tipo de nota intocado) e o que a rota responde.

    python3.9 complemento/test_tipo_proprio.py
"""

import json
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import ID, EnvioNoTeste, pedido  # noqa: E402

FRASE = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"
MEU_TIPO = "Meu Inglês"
CAMPOS = ["Pergunta", "Resposta", "Anotações", "Som"]
COLECAO = {"baralhos": [{"nome": "Default"}, {"nome": "Inglês"}], "tiposDeNota": {MEU_TIPO: CAMPOS, "Só um campo": ["Texto"]}}
MAPA = {"frase": "Pergunta", "audio_da_frase": "Som", "resposta": "Resposta", "palavra": "Anotações"}


def com_o_tipo(**mudancas):
    return dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": MAPA}, **mudancas)


def enviar(corpo, colecao=None):
    colecao = colecao or ColecaoEmMemoria(COLECAO)
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
        status, resposta = conexao.criar(corpo)
        estado = conexao.esperar(ID) if status < 300 else None
    return status, resposta, estado, colecao


def sem_tags(html):
    return re.sub("<[^>]+>", "", html)


class OCartaoVaiNosCamposQueAPessoaEscolheu(unittest.TestCase):
    def test_cada_parte_vai_no_campo_do_mapeamento_e_o_tipo_de_nota_fica_como_estava(self):
        _, _, estado, colecao = enviar(com_o_tipo())
        self.assertEqual((estado["status"], estado["lastError"]), ("completed", None))
        [nota] = colecao.gravadas
        self.assertEqual((nota["baralho"], nota["tipo"]), ("Inglês", MEU_TIPO))
        self.assertEqual(sem_tags(nota["campos"]["Pergunta"]), "She gave up smoking")
        self.assertEqual(sem_tags(nota["campos"]["Resposta"]).count("tradução de mentira"), 1)
        self.assertIn("gave up", nota["campos"]["Anotações"])
        self.assertRegex(nota["campos"]["Som"], r"^\[sound:pm[0-9a-f]+_phrase\.mp3\]$")
        self.assertEqual(colecao.tipo_de_nota(MEU_TIPO), CAMPOS)
        self.assertEqual(sorted(colecao.tipos_de_nota()), sorted([MEU_TIPO, "Só um campo"]))  # nada criado: nem o tipo da Conexão

    def test_varias_partes_podem_ir_no_mesmo_campo_uma_em_cada_linha(self):
        mapa = {"frase": "Pergunta", "resposta": "Resposta", "audio_da_frase": "Resposta", "palavra": "Resposta"}
        corpo = dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": mapa})
        _, _, _, colecao = enviar(corpo)
        [nota] = colecao.gravadas
        resposta = nota["campos"]["Resposta"]
        self.assertEqual(sorted(nota["campos"]), ["Pergunta", "Resposta"])
        self.assertLess(resposta.index("[sound:"), resposta.index("tradução de mentira"))  # o áudio vem antes: a ordem das partes é a da Conexão
        self.assertIn("<br>", resposta)

    def test_o_cartao_nao_escreve_em_campo_que_o_mapeamento_nao_cita(self):
        corpo = dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": {"frase": "Pergunta", "resposta": "Resposta"}})
        _, _, _, colecao = enviar(corpo)
        self.assertEqual(sorted(colecao.gravadas[0]["campos"]), ["Pergunta", "Resposta"])

    def test_uma_frase_que_ja_esta_no_baralho_no_campo_mapeado_conta_como_duplicada(self):
        colecao = ColecaoEmMemoria(COLECAO)
        enviar(com_o_tipo(), colecao)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            outro = "66666666-7777-4888-9999-aaaaaaaaaaaa"
            conexao.criar(dict(com_o_tipo(), jobId=outro))
            estado = conexao.esperar(outro)
        self.assertEqual((estado["status"], len(colecao.gravadas)), ("completed", 1))


class SemOCampoDaFraseOuDaRespostaNadaEGravado(unittest.TestCase):
    def assertRecusado(self, corpo):
        status, resposta, _, colecao = enviar(corpo)
        self.assertEqual((status, resposta, colecao.gravadas), (400, {"error": "invalid_mapping"}, []))
        self.assertEqual(colecao.tipo_de_nota(MEU_TIPO), CAMPOS)

    def test_o_pedido_sem_campo_para_a_frase_e_recusado(self):
        self.assertRecusado(dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": {"resposta": "Resposta"}}))

    def test_o_pedido_sem_campo_para_a_resposta_e_recusado(self):
        self.assertRecusado(dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": {"frase": "Pergunta"}}))

    def test_o_pedido_com_a_frase_e_a_resposta_no_mesmo_campo_e_recusado(self):
        self.assertRecusado(dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": {"frase": "Pergunta", "resposta": "Pergunta"}}))

    def test_o_pedido_com_uma_parte_que_a_conexao_nao_conhece_e_recusado(self):
        self.assertRecusado(dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": dict(MAPA, segredo="Pergunta")}))

    def test_um_campo_que_o_tipo_nao_tem_faz_o_cartao_falhar_sem_gravar_nada(self):
        corpo = dict(pedido(ID, FRASE), tipoProprio={"nome": MEU_TIPO, "mapa": {"frase": "Pergunta", "resposta": "Verso"}})
        _, _, estado, colecao = enviar(corpo)
        self.assertEqual((estado["status"], estado["lastError"], colecao.gravadas), ("failed", "note_type_missing", []))
        self.assertEqual(sorted(colecao.tipos_de_nota()), sorted([MEU_TIPO, "Só um campo"]))

    def test_um_tipo_que_a_pessoa_apagou_faz_o_envio_falhar_e_a_conexao_nao_o_recria(self):
        corpo = dict(pedido(ID, FRASE), tipoProprio={"nome": "Apagado", "mapa": {"frase": "Pergunta", "resposta": "Resposta"}})
        _, _, estado, colecao = enviar(corpo)
        self.assertEqual((estado["status"], estado["lastError"], colecao.gravadas), ("failed", "note_type_missing", []))
        self.assertNotIn("Apagado", colecao.tipos_de_nota())


def pedir(conexao, caminho, corpo):
    status, _, resposta = conexao.pedir("POST", caminho, corpo=corpo)
    return status, json.loads(resposta)


class OsTiposDaPessoa(unittest.TestCase):
    def test_a_lista_traz_os_tipos_da_pessoa_com_os_campos_e_sem_os_que_a_conexao_cria(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Default"}], "tiposDeNota": {MEU_TIPO: CAMPOS, "PerpetualMiner Inglês": ["Frase"]}})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            self.assertEqual(pedir(conexao, "/anki/note-types", {}), (200, {"noteTypes": [{"name": MEU_TIPO, "fields": CAMPOS}]}))

    def test_com_o_anki_na_tela_de_perfis_a_lista_nao_vem(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=ColecaoEmMemoria.fechada()) as conexao:
            status, corpo = pedir(conexao, "/anki/note-types", {})
        self.assertEqual((status, corpo["error"]), (503, "anki_note_types_unavailable"))


class APreviaNoTipoDaPessoa(unittest.TestCase):
    def previa(self, tipo_proprio, colecao=None):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao or ColecaoEmMemoria(COLECAO)) as conexao:
            resposta = pedir(conexao, "/anki/card-preview", {"lang": "en", "nivel": "iniciante", "tipoProprio": tipo_proprio})
            return resposta, sorted(conexao.conexao.colecao.tipos_de_nota())

    def test_a_previa_mostra_o_cartao_no_tipo_da_pessoa_sem_criar_nada(self):
        (status, previa), tipos = self.previa({"nome": MEU_TIPO, "mapa": MAPA})
        self.assertEqual((status, previa["noteType"]), (200, MEU_TIPO))
        self.assertIn("She gave up smoking", sem_tags(previa["front"]) + sem_tags(previa["back"]))
        self.assertEqual(tipos, sorted([MEU_TIPO, "Só um campo"]))

    def test_a_previa_de_um_mapeamento_sem_a_resposta_diz_que_o_mapeamento_nao_serve(self):
        (status, corpo), _ = self.previa({"nome": MEU_TIPO, "mapa": {"frase": "Pergunta"}})
        self.assertEqual((status, corpo), (400, {"error": "invalid_mapping"}))

    def test_a_previa_de_um_campo_que_o_tipo_nao_tem_diz_que_o_mapeamento_nao_serve(self):
        (status, corpo), _ = self.previa({"nome": MEU_TIPO, "mapa": {"frase": "Pergunta", "resposta": "Verso"}})
        self.assertEqual((status, corpo), (409, {"error": "invalid_mapping"}))

    def test_a_previa_de_um_tipo_que_nao_existe_diz_que_o_tipo_sumiu(self):
        (status, corpo), _ = self.previa({"nome": "Apagado", "mapa": {"frase": "Pergunta", "resposta": "Resposta"}})
        self.assertEqual((status, corpo), (404, {"error": "note_type_missing"}))


if __name__ == "__main__":
    unittest.main()
