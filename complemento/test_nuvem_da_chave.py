import io
import json
import os
import sys
import unittest
from unittest import mock
from urllib.error import HTTPError, URLError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.nuvem_da_chave import NuvemDaChave, NuvemIndisponivel

BASE = "https://nuvem.exemplo/documentos/"
CHAVE = "sk-proj-ChaveSecretaDeTeste0123456789-abcd"
ENDERECO = "https://nuvem.exemplo/documentos/usuarios/ana%2Fbeto/segredos/openai"


class Resposta(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *saida):
        return False


def documento(chave=CHAVE, em="1700", apagada=False):
    campos = {"em": {"integerValue": em}}
    if chave is not None:
        campos["chave"] = {"stringValue": chave}
    if apagada:
        campos["apagada"] = {"booleanValue": True}
    return json.dumps({"fields": campos}).encode("utf-8")


def erro_http(codigo):
    return HTTPError(ENDERECO, codigo, "falha", {}, io.BytesIO(b"{}"))


def nuvem():
    return NuvemDaChave(BASE, "ana/beto", "token-de-mentira")


def lendo(resposta):
    efeito = resposta if isinstance(resposta, BaseException) else None
    retorno = None if efeito else Resposta(resposta)
    with mock.patch("complemento.nuvem_da_chave.urlopen", side_effect=efeito, return_value=retorno):
        return nuvem().ler()


def falhou_com(teste, chamada):
    with teste.assertRaises(NuvemIndisponivel) as visto:
        chamada()
    return visto.exception.status


def gravando(resposta):
    efeito = resposta if isinstance(resposta, BaseException) else None
    retorno = None if efeito else Resposta(resposta)
    with mock.patch("complemento.nuvem_da_chave.urlopen", side_effect=efeito, return_value=retorno):
        nuvem().gravar(CHAVE, 1700)


class OPedidoAANuvemDaChave(unittest.TestCase):
    def test_o_pedido_leva_o_endereco_da_conta_o_metodo_e_o_token(self):
        with mock.patch("complemento.nuvem_da_chave.urlopen", return_value=Resposta(documento())) as urlopen:
            nuvem().ler()
        pedido = urlopen.call_args[0][0]
        self.assertEqual((pedido.full_url, pedido.get_method(), pedido.data, urlopen.call_args[1]), (ENDERECO, "GET", None, {"timeout": 10}))
        self.assertEqual(dict(pedido.header_items()), {"Authorization": "Bearer token-de-mentira", "Content-type": "application/json"})

    def test_gravar_manda_a_chave_e_a_hora_num_patch(self):
        with mock.patch("complemento.nuvem_da_chave.urlopen", return_value=Resposta(b"{}")) as urlopen:
            nuvem().gravar(CHAVE, 1700)
        pedido = urlopen.call_args[0][0]
        self.assertEqual((pedido.full_url, pedido.get_method()), (ENDERECO, "PATCH"))
        self.assertEqual(json.loads(pedido.data), {"fields": {"chave": {"stringValue": CHAVE}, "em": {"integerValue": "1700"}}})


class ARespostaDaNuvemDaChave(unittest.TestCase):
    def test_cada_documento_lido_vira_a_chave_e_a_hora_ou_um_erro_da_nuvem(self):
        casos = [
            ("chave e hora", documento(), {"chave": CHAVE, "em": 1700}),
            ("sem hora, a chave vale 1", documento(em="0"), {"chave": CHAVE, "em": 1}),
            ("sem chave e sem hora", documento(chave="", em="0"), {"chave": "", "em": 0}),
            ("apagada", documento(apagada=True), {"chave": "", "em": 1700}),
            ("sem o campo da chave", documento(chave=None), {"chave": "", "em": 1700}),
        ]
        for nome, bruto, esperado in casos:
            with self.subTest(nome):
                self.assertEqual(lendo(bruto), esperado)

    def test_o_documento_que_nao_existe_e_ausente_so_na_leitura(self):
        self.assertIsNone(lendo(erro_http(404)))
        self.assertEqual(falhou_com(self, lambda: gravando(erro_http(404))), 503)

    def test_cada_recusa_da_nuvem_vira_o_status_que_a_conexao_conhece(self):
        casos = [(401, 401), (403, 403), (409, 409), (500, 500), (502, 502), (503, 503), (400, 503), (418, 503), (429, 503)]
        for recebido, dito in casos:
            with self.subTest(recebido):
                self.assertEqual(falhou_com(self, lambda: lendo(erro_http(recebido))), dito)
                self.assertEqual(falhou_com(self, lambda: gravando(erro_http(recebido))), dito)

    def test_a_nuvem_fora_do_ar_e_503(self):
        for fora in (URLError("sem rede"), TimeoutError(), ConnectionResetError()):
            with self.subTest(type(fora).__name__):
                self.assertEqual(falhou_com(self, lambda: lendo(fora)), 503)
                self.assertEqual(falhou_com(self, lambda: gravando(fora)), 503)

    def test_resposta_que_nao_e_json_ou_e_grande_demais_e_502(self):
        for nome, bruto in (("texto", b"nao e json"), ("bytes invalidos", b"\xff\xfe"), ("vazia", b""), ("grande demais", b" " * 65537)):
            with self.subTest(nome):
                self.assertEqual(falhou_com(self, lambda: lendo(bruto)), 502)
                self.assertEqual(falhou_com(self, lambda: gravando(bruto)), 502)

    def test_documento_fora_da_forma_e_502(self):
        casos = [
            ("lista", b"[]"),
            ("sem fields", b"{}"),
            ("fields que nao e objeto", b'{"fields": 3}'),
            ("chave fora do formato", documento(chave="curta")),
            ("hora negativa", documento(em="-1")),
            ("hora que nao e numero", documento(em="ontem")),
            ("chave que nao e texto", json.dumps({"fields": {"chave": {"stringValue": 7}}}).encode("utf-8")),
        ]
        for nome, bruto in casos:
            with self.subTest(nome):
                self.assertEqual(falhou_com(self, lambda: lendo(bruto)), 502)

    def test_o_documento_no_limite_do_tamanho_ainda_e_lido(self):
        enchimento = b" " * (65536 - len(documento()))
        self.assertEqual(lendo(documento() + enchimento), {"chave": CHAVE, "em": 1700})


if __name__ == "__main__":
    unittest.main()
