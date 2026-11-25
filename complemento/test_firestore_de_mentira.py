import json
import unittest
import urllib.error
import urllib.request

from complemento.test_openai_de_mentira import FirestoreDeMentira

AUTORIZACAO = "Bearer token-de-mentira"
ERRO_DE_FORA = {"error": {"code": 500, "message": "falha externa fictícia"}}


class FirestoreDeMentiraPorMetodo(unittest.TestCase):
    def servidor(self):
        servidor = FirestoreDeMentira()
        servidor.__enter__()
        self.addCleanup(servidor.__exit__, None, None, None)
        return servidor

    def pedir(self, servidor, metodo, uid, campos=None):
        dados = None if campos is None else json.dumps({"fields": campos}).encode("utf-8")
        pedido = urllib.request.Request("%s/usuarios/%s/dados" % (servidor.base, uid), data=dados, method=metodo)
        pedido.add_header("Authorization", AUTORIZACAO)
        try:
            with urllib.request.urlopen(pedido, timeout=5) as resposta:
                return resposta.status, resposta.headers.get("Content-Type"), json.loads(resposta.read())
        except urllib.error.HTTPError as erro:
            return erro.code, erro.headers.get("Content-Type"), json.loads(erro.read())

    def test_ler_um_documento_que_nao_existe_diz_404_com_o_erro_de_fora(self):
        status, tipo, corpo = self.pedir(self.servidor(), "GET", "ana")
        self.assertEqual((status, tipo), (404, "application/json"))
        self.assertEqual(corpo, {"error": {"code": 404, "message": "falha externa fictícia"}})

    def test_gravar_guarda_o_documento_do_usuario_e_ler_devolve_o_que_foi_gravado(self):
        servidor = self.servidor()
        campos = {"frases": {"arrayValue": {}}}
        self.assertEqual(self.pedir(servidor, "PATCH", "ana", campos), (200, "application/json", {"fields": campos}))
        self.assertEqual(servidor.documentos, {"ana": campos})
        self.assertEqual(self.pedir(servidor, "GET", "ana"), (200, "application/json", {"fields": campos}))
        self.assertEqual(self.pedir(servidor, "GET", "beto")[0], 404)

    def test_com_as_escritas_recusadas_o_patch_diz_503_e_nada_e_guardado(self):
        servidor = self.servidor()
        servidor.recusar_escritas = True
        status, _, corpo = self.pedir(servidor, "PATCH", "ana", {"a": 1})
        self.assertEqual((status, corpo), (503, {"error": {"code": 503, "message": "falha externa fictícia"}}))
        self.assertEqual(servidor.documentos, {})

    def test_com_a_falha_ligada_todo_pedido_volta_o_status_dela_sem_ler_nem_gravar(self):
        servidor = self.servidor()
        servidor.documentos["ana"] = {"a": 1}
        servidor.falha = 500
        self.assertEqual(self.pedir(servidor, "GET", "ana")[::2], (500, ERRO_DE_FORA))
        self.assertEqual(self.pedir(servidor, "PATCH", "ana", {"b": 2})[::2], (500, ERRO_DE_FORA))
        self.assertEqual(servidor.documentos, {"ana": {"a": 1}})

    def test_cada_pedido_fica_anotado_com_o_metodo_o_usuario_e_a_autorizacao(self):
        servidor = self.servidor()
        self.pedir(servidor, "GET", "ana")
        self.pedir(servidor, "PATCH", "beto", {"a": 1})
        self.assertEqual(servidor.pedidos, [("GET", "ana", AUTORIZACAO), ("PATCH", "beto", AUTORIZACAO)])


if __name__ == "__main__":
    unittest.main()
