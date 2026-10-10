"""A chave da OpenAI vista de fora: o que atravessa o HTTP, o que fica no disco e o que o log guarda.

Roda no Python 3.9 (o do Anki do Mac) e no 3.13:
    python3.9 complemento/test_chave_da_openai.py
"""

import json
import http.client
import time
import os
import socket
import stat
import sys
import tempfile
import unittest
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_servidor import ORIGEM, ConexaoNoTeste  # noqa: E402

CHAVE = "sk-proj-ChaveSecretaDeTeste0123456789-abcd"
OUTRA_CHAVE = "sk-proj-OutraChaveSecreta9876543210-wxyz"
OUTRA_ORIGEM = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def enviar(conexao, chave=CHAVE, **opcoes):
    revisao = json.loads(conexao.pedir('POST', '/ia/estado')[2])['openai']['versao']
    return conexao.pedir("POST", "/ia/openai/chave", corpo={"chave": chave, "versao": revisao}, **opcoes)


def estado(conexao):
    status, _, corpo = conexao.pedir("POST", "/ia/estado")
    # Estes testes anteriores verificam só máscara/ausência. AutoridadeVersionada
    # verifica a revisão/conta/flag pelo HTTP completo, sem essa projeção.
    dono = json.loads(corpo)['openai']
    return status, {'openai': {k: v for k, v in dono.items() if k in ('configurada', 'ultimos4')}}


def tudo_em_disco(raiz):
    """(caminho relativo, bytes) de cada arquivo embaixo de `raiz`."""
    achados = []
    for pasta, _, arquivos in os.walk(raiz):
        for nome in arquivos:
            caminho = os.path.join(pasta, nome)
            with open(caminho, "rb") as arquivo:
                achados.append((os.path.relpath(caminho, raiz), arquivo.read()))
    return achados


class ChaveRecebida(unittest.TestCase):
    def test_chave_aceita_responde_so_os_4_ultimos_caracteres_e_a_conexao_passa_a_te_la(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = enviar(conexao)
            depois = estado(conexao)
        self.assertEqual((status, json.loads(corpo)), (200, {"ok": True, "ultimos4": "abcd"}))
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "abcd"}}))

    def test_a_chave_inteira_nao_volta_em_resposta_nenhuma(self):
        with tempfile.TemporaryDirectory() as pasta:
            for comportamento in ("aceita", "recusa", "sem_credito", "org_nao_verificada", "fora_do_ar"):
                with self.subTest(comportamento), ConexaoNoTeste(pasta, openai=comportamento, chave_na_conexao="wxyz") as conexao:
                    respostas = [
                        enviar(conexao),
                        conexao.pedir("POST", "/ia/estado"),
                        conexao.pedir("POST", "/ia/openai/chave", corpo_bruto=CHAVE),
                        conexao.pedir("POST", "/ia/openai/chave", corpo={"chave": CHAVE}, origem=OUTRA_ORIGEM),
                        conexao.pedir("GET", "/health"),
                    ]
                    for status, cabecalhos, corpo in respostas:
                        visto = corpo + json.dumps(cabecalhos).encode("utf-8")
                        self.assertNotIn(CHAVE.encode(), visto)
                        self.assertNotIn(CHAVE[:-4].encode(), visto)

    def test_chave_recusada_nao_e_guardada_e_nao_troca_a_que_ja_estava(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai="recusa", chave_na_conexao="wxyz") as conexao:
            status, _, _ = enviar(conexao, OUTRA_CHAVE)
            depois = estado(conexao)
        self.assertEqual(status, 401)
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))

    def test_cada_erro_da_chave_tem_o_seu_codigo(self):
        esperado = {
            "recusa": (401, "openai_key_rejected"),
            "sem_credito": (402, "openai_no_credit"),
            "org_nao_verificada": (403, "openai_org_not_verified"),
            "fora_do_ar": (502, "openai_unreachable"),
            "limite_de_uso": (402, "openai_no_credit"),
            "limite_so_no_pago": (402, "openai_no_credit"),
            "pagamento_402_nos_modelos": (402, "openai_no_credit"),
            "pagamento_402_no_pago": (402, "openai_no_credit"),
        }
        for comportamento, (status_esperado, erro) in esperado.items():
            with self.subTest(comportamento), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai=comportamento) as conexao:
                status, _, corpo = enviar(conexao)
                sem_chave = estado(conexao)
            self.assertEqual((status, json.loads(corpo)), (status_esperado, {"error": erro}))
            self.assertEqual(sem_chave, (200, {"openai": {"configurada": False}}))

    def test_limite_de_uso_e_pagamento_recusado_nos_dois_pedidos_sao_sem_credito_e_nada_e_guardado(self):
        for comportamento in ("limite_de_uso", "limite_so_no_pago", "pagamento_402_nos_modelos", "pagamento_402_no_pago"):
            with self.subTest(comportamento), tempfile.TemporaryDirectory() as pasta:
                with ConexaoNoTeste(pasta, openai=comportamento, chave_na_conexao="wxyz") as conexao:
                    status, _, corpo = enviar(conexao, OUTRA_CHAVE)
                    depois = estado(conexao)
                    arquivos = tudo_em_disco(conexao.chaves)
                self.assertEqual((status, json.loads(corpo)), (402, {"error": "openai_no_credit"}))
                self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))
                self.assertFalse([nome for nome, dados in arquivos if OUTRA_CHAVE.encode() in dados])

    def test_limite_de_uso_sem_chave_antes_nao_deixa_chave_nenhuma(self):
        for comportamento in ("limite_de_uso", "limite_so_no_pago", "pagamento_402_nos_modelos", "pagamento_402_no_pago"):
            with self.subTest(comportamento), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai=comportamento) as conexao:
                enviar(conexao)
                depois = estado(conexao)
                arquivos = tudo_em_disco(conexao.chaves)
            self.assertEqual(depois, (200, {"openai": {"configurada": False}}))
            self.assertEqual(arquivos, [])

    def test_trocar_a_chave_guarda_a_nova(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao, CHAVE)
            enviar(conexao, OUTRA_CHAVE)
            depois = estado(conexao)
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))

    def test_a_chave_vai_a_openai_so_como_credencial_do_pedido_de_conferencia(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            pedidos = list(conexao.openai.pedidos)
        self.assertTrue(pedidos)
        for metodo, caminho, autorizacao in pedidos:
            self.assertEqual(autorizacao, "Bearer " + CHAVE, "%s %s" % (metodo, caminho))

    def test_espaco_em_volta_da_chave_colada_nao_vira_parte_dela(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = enviar(conexao, "  " + CHAVE + "\n")
        self.assertEqual((status, json.loads(corpo)["ultimos4"]), (200, "abcd"))

    def test_a_chave_guardada_sobrevive_a_reiniciar_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as primeira:
                enviar(primeira)
            with ConexaoNoTeste(pasta) as segunda:
                depois = estado(segunda)
        self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "abcd"}}))

    def test_corpo_grande_demais_e_recusado_sem_ir_a_openai(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = enviar(conexao, "sk-" + "a" * 100000)
            pedidos = list(conexao.openai.pedidos)
        self.assertEqual((status, pedidos), (400, []))


def apagar(conexao, **opcoes):
    revisao = json.loads(conexao.pedir('POST', '/ia/estado')[2])['openai']['versao']
    return conexao.pedir("POST", "/ia/openai/chave/apagar", corpo={'versao': revisao}, **opcoes)


class ChaveApagada(unittest.TestCase):
    """Apagar chave e Apagar tudo na extensão (#154): a cópia da Conexão também sai, e do disco."""

    def test_apagar_tira_o_segredo_do_disco_e_mantem_o_valor_vazio_versionado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            status, _, corpo = apagar(conexao)
            depois = estado(conexao)
            arquivos = tudo_em_disco(pasta)
        self.assertEqual((status, json.loads(corpo)), (200, {"ok": True}))
        self.assertEqual(depois, (200, {"openai": {"configurada": False}}))
        self.assertFalse([nome for nome, dados in arquivos if CHAVE.encode() in dados])

    def test_apagar_sem_chave_guardada_tambem_responde_que_esta_apagada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = apagar(conexao)
            depois = estado(conexao)
        self.assertEqual((status, json.loads(corpo)), (200, {"ok": True}))
        self.assertEqual(depois, (200, {"openai": {"configurada": False}}))

    def test_a_chave_apagada_nao_volta_ao_reiniciar_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as primeira:
                enviar(primeira)
                apagar(primeira)
            with ConexaoNoTeste(pasta) as segunda:
                depois = estado(segunda)
        self.assertEqual(depois, (200, {"openai": {"configurada": False}}))

    def test_so_a_extensao_apaga_a_copia(self):
        for origem in ("https://exemplo.com", OUTRA_ORIGEM, None):
            with self.subTest(origem), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, chave_na_conexao="wxyz") as conexao:
                status, _, _ = apagar(conexao, origem=origem)
                depois = estado(conexao)
            self.assertEqual(status, 403)
            self.assertEqual(depois, (200, {"openai": {"configurada": True, "ultimos4": "wxyz"}}))


class QuemPodeEnviarAChave(unittest.TestCase):
    def test_de_outro_site_de_outra_extensao_ou_sem_origem_nada_e_guardado_nem_conferido(self):
        for origem in ("https://exemplo.com", OUTRA_ORIGEM, None):
            with self.subTest(origem), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                status, _, _ = enviar(conexao, origem=origem)
                guardada = estado(conexao)
                pedidos = list(conexao.openai.pedidos)
                arquivos = tudo_em_disco(conexao.chaves)
            self.assertEqual(status, 403)
            self.assertEqual(guardada, (200, {"openai": {"configurada": False}}))
            self.assertEqual((pedidos, arquivos), ([], []))

    def test_o_estado_da_ia_so_responde_a_extensao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, chave_na_conexao="wxyz") as conexao:
            respostas = [conexao.pedir("POST", "/ia/estado", origem=origem)[0] for origem in ("https://exemplo.com", OUTRA_ORIGEM, None)]
        self.assertEqual(respostas, [403, 403, 403])


class ChaveNoDisco(unittest.TestCase):
    def test_a_chave_fica_so_na_pasta_das_chaves_e_em_mais_nenhum_arquivo(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            enviar(conexao, "sem forma de chave")
            conexao.pedir("POST", "/ia/openai/chave", corpo_bruto="{ quebrado " + CHAVE)
            arquivos = tudo_em_disco(pasta)
        com_a_chave = [nome for nome, dados in arquivos if CHAVE.encode() in dados]
        self.assertEqual(com_a_chave, [os.path.join("chaves", "openai.json")])

    @unittest.skipIf(os.name == "nt", "as permissões do Windows não são as do Unix")
    def test_o_arquivo_da_chave_so_o_dono_le(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            modo = stat.S_IMODE(os.stat(os.path.join(conexao.chaves, "openai.json")).st_mode)
        self.assertEqual(modo, 0o600)

    def test_nada_fica_pela_metade_quando_a_chave_e_trocada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            enviar(conexao)
            enviar(conexao, OUTRA_CHAVE)
            nomes = sorted(os.listdir(conexao.chaves))
        self.assertEqual(nomes, ["openai.json"])


class ChaveNoLog(unittest.TestCase):
    def test_a_chave_nunca_e_escrita_no_log_em_nenhum_caminho(self):
        with tempfile.TemporaryDirectory() as pasta:
            for comportamento in ("aceita", "recusa", "sem_credito", "org_nao_verificada", "fora_do_ar"):
                with ConexaoNoTeste(pasta, openai=comportamento) as conexao:
                    enviar(conexao)
                    enviar(conexao, "sem forma de chave " + CHAVE)
                    conexao.pedir("POST", "/ia/openai/chave", corpo_bruto="{ quebrado " + CHAVE)
                    conexao.pedir("POST", "/ia/openai/chave", corpo={"chave": CHAVE}, origem=OUTRA_ORIGEM)
            with ConexaoNoTeste(pasta) as conexao:
                os.chmod(conexao.chaves, 0o500)  # gravar falha: o erro interno também vai ao log
                try:
                    status, _, _ = enviar(conexao, OUTRA_CHAVE)
                finally:
                    os.chmod(conexao.chaves, 0o700)
                registrado = conexao.log()
        if os.name != "nt" and os.geteuid() != 0:
            self.assertEqual(status, 500)
            self.assertIn("Erro na rota POST /ia/openai/chave", registrado)
        for chave in (CHAVE, OUTRA_CHAVE):
            self.assertNotIn(chave, registrado)
            self.assertNotIn(chave[:-4], registrado)


class CorpoDoPedido(unittest.TestCase):
    def test_corpo_que_nao_e_um_objeto_json_e_pedido_invalido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            respostas = [
                conexao.pedir("POST", "/ia/openai/chave", corpo_bruto=bruto)[0]
                for bruto in ("", "[]", '"sk-x"', '{"chave": 3}', '{"outra": "coisa"}', "\xff")
            ]
        self.assertEqual(respostas, [400] * 6)

    def test_pedido_sem_content_length_nao_trava_a_conexao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = conexao.pedir("POST", "/ia/estado")
            saude = conexao.pedir("GET", "/health")[0]
        self.assertEqual((status, saude), (200, 200))


class PedidoQueOProtocoloRecusa(unittest.TestCase):
    """A linha de um pedido malformado nunca volta na resposta de erro nem vai ao log, nem se ela for a chave."""

    LINHAS = (
        "%s\r\n\r\n",                    # uma palavra só: sintaxe ruim
        "GET /x %s\r\n\r\n",             # a “versão” é a chave
        "GET /%s HTTP/9.9\r\n\r\n",       # versão que o servidor não fala
        "%s /x HTTP/1.1\r\n\r\n",         # método que o servidor não tem
        "GET /x HTTP/1.1 %s\r\n\r\n",     # palavras demais
        "GET /x HTTP/1.1\r\n%s\r\n\r\n",  # linha de cabeçalho sem “:”
    )

    @staticmethod
    def _cru(conexao, texto):
        with socket.create_connection(("127.0.0.1", conexao.conexao.porta), timeout=5) as ligacao:
            ligacao.sendall(texto.encode("utf-8"))
            recebido = b""
            while True:
                try:
                    pedaco = ligacao.recv(4096)
                except socket.timeout:
                    break
                if not pedaco:
                    break
                recebido += pedaco
        return recebido

    def test_a_linha_recusada_nao_volta_na_resposta_nem_vai_ao_log(self):
        for modelo in self.LINHAS:
            with self.subTest(modelo), tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
                resposta = self._cru(conexao, modelo % CHAVE)
                registrado = conexao.log()
            self.assertTrue(resposta, "o servidor devia responder o erro")
            for pedaco in (CHAVE, CHAVE[:12]):
                self.assertNotIn(pedaco.encode(), resposta)
                self.assertNotIn(pedaco, registrado)

    def test_o_erro_de_protocolo_fica_registrado_sem_o_conteudo_do_pedido(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            self._cru(conexao, CHAVE + "\r\n\r\n")
            registrado = conexao.log()
        self.assertIn("http: code 400, message Bad Request", registrado)


class AutoridadeVersionada(unittest.TestCase):
    """Opção B: o cliente observa a revisão; só o cofre a muda após aceitar."""

    def test_N1_falha_posterior_nao_reserva_revisao_nem_desfaz_aceitacao(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, _ = conexao.pedir('POST', '/ia/openai/chave',
                corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})
            self.assertEqual(status, 200)
            conexao.openai.comportamento = 'recusa'
            # O adapter externo é a OpenAI: nenhuma revisão é reservada na extensão.
            status, _, _ = conexao.pedir('POST', '/ia/openai/chave',
                corpo={'chave': OUTRA_CHAVE, 'versao': 1, 'conta': 'A'})
            self.assertEqual(status, 401)
            status, _, corpo = conexao.pedir('POST', '/ia/estado')
            atual = json.loads(corpo)['openai']
            self.assertEqual(status, 200)
            self.assertEqual(atual.get('versao'), 1)
            self.assertEqual(atual.get('conta'), 'A')
            self.assertEqual(atual['ultimos4'], 'abcd')
            self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)

    def test_conta_em_duas_conexoes_recebe_troca_e_apagamento_sem_outro_dono(self):
        with tempfile.TemporaryDirectory() as pasta_a, tempfile.TemporaryDirectory() as pasta_b:
            with ConexaoNoTeste(pasta_a) as a, ConexaoNoTeste(pasta_b) as b:
                b.conexao.firestore_base = a.firestore.base # só a fronteira externa é compartilhada
                def sync(conexao, versao):
                    status, _, corpo = conexao.pedir('POST', '/ia/openai/sincronizar',
                        corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': versao})
                    self.assertEqual(status, 200)
                    return json.loads(corpo)
                self.assertEqual(a.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})[0], 200)
                self.assertEqual(sync(a, 1)['resultado'], 'subiu')
                self.assertEqual(sync(b, 0), {'ok': True, 'resultado': 'chegou', 'versao': 1})
                self.assertTrue(b.conexao.cofre.ler('openai') == CHAVE)
                self.assertEqual(b.pedir('POST', '/ia/openai/chave', corpo={'chave': OUTRA_CHAVE, 'versao': 1, 'conta': 'A'})[0], 200)
                self.assertEqual(sync(b, 2)['resultado'], 'subiu')
                self.assertEqual(sync(a, 1), {'ok': True, 'resultado': 'chegou', 'versao': 2})
                self.assertTrue(a.conexao.cofre.ler('openai') == OUTRA_CHAVE)
                self.assertEqual(a.pedir('POST', '/ia/openai/chave/apagar', corpo={'versao': 2, 'conta': 'A'})[0], 200)
                self.assertEqual(sync(a, 3)['resultado'], 'subiu')
                self.assertEqual(sync(b, 2), {'ok': True, 'resultado': 'apagada', 'versao': 3})
                for conexao in (a, b):
                    self.assertEqual(json.loads(conexao.pedir('POST', '/ia/estado')[2])['openai'],
                        {'configurada': False, 'conta': 'A', 'versao': 3, 'naoEnviada': False})
                    self.assertFalse(any(k.encode() in dados for _, dados in tudo_em_disco(conexao.pasta) for k in (CHAVE, OUTRA_CHAVE)))
                self.assertEqual(set(a.firestore.documentos['A']), {'chave', 'em'})
                self.assertEqual(a.firestore.documentos['A']['chave']['stringValue'], '')
                self.assertTrue(all(auth == 'Bearer token-ficticio-A' for _, _, auth in a.firestore.pedidos))

    def test_sync_nao_persiste_credencial_nem_repete_segredos_da_falha_externa(self):
        token = 'token-ficticio-nao-deve-ir-ao-disco'
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            self.assertEqual(conexao.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'conta': 'A', 'versao': 0})[0], 200)
            for falha in (401, 403, 409, 500, 502, 503):
                conexao.firestore.falha = falha
                status, cabecalhos, corpo = conexao.pedir('POST', '/ia/openai/sincronizar',
                    corpo={'uid': 'A', 'token': token, 'versao': 1})
                self.assertEqual((status, json.loads(corpo)), (falha, {'error': 'cloud_sync_failed', 'status': falha}))
                for segredo in (CHAVE, token):
                    self.assertNotIn(segredo, conexao.log())
                    self.assertNotIn(segredo, json.dumps(cabecalhos) + corpo.decode())
            self.assertFalse(any(token.encode() in dados for _, dados in tudo_em_disco(pasta)))
            self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)
            self.assertTrue(conexao.conexao.cofre.documento('openai')['naoEnviada'])

    def test_ler_uma_conta_sem_chave_nao_inventa_mudanca_no_dono_vazio(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': 0})
            self.assertEqual((status, json.loads(corpo)), (200, {'ok': True, 'resultado': None, 'versao': 0}))
            self.assertEqual(conexao.conexao.cofre.documento('openai'), {})
            self.assertEqual(os.listdir(conexao.chaves), [])

    def test_empate_de_hora_so_confirma_replicacao_depois_de_entregar_o_valor_pendente(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            self.assertEqual(conexao.pedir('POST', '/ia/openai/chave',
                corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})[0], 200)
            hora = conexao.conexao.cofre.documento('openai')['em']
            conexao.firestore.documentos['A'] = {'chave': {'stringValue': OUTRA_CHAVE}, 'em': {'integerValue': str(hora)}}
            status, _, corpo = conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': 1})
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(corpo)['resultado'], 'subiu')
            self.assertEqual(conexao.firestore.documentos['A']['chave']['stringValue'], CHAVE)
            self.assertEqual(conexao.conexao.cofre.documento('openai')['naoEnviada'], False)
            self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)

    def test_empate_de_hora_com_copia_ja_replicada_recebe_o_apagamento_observado_na_nuvem(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            self.assertEqual(conexao.pedir('POST', '/ia/openai/chave',
                corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})[0], 200)
            hora = conexao.conexao.cofre.documento('openai')['em']
            pedido = {'uid': 'A', 'token': 'token-ficticio-A', 'versao': 1}
            conexao.firestore.documentos['A'] = {'chave': {'stringValue': CHAVE}, 'em': {'integerValue': str(hora)}}
            self.assertEqual(conexao.pedir('POST', '/ia/openai/sincronizar', corpo=pedido)[0], 200)
            conexao.firestore.documentos['A']['chave']['stringValue'] = ''
            status, _, corpo = conexao.pedir('POST', '/ia/openai/sincronizar', corpo=pedido)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(corpo), {'ok': True, 'resultado': 'apagada', 'versao': 2})
            self.assertFalse(conexao.conexao.cofre.ler('openai'))
            self.assertEqual(conexao.conexao.cofre.documento('openai')['naoEnviada'], False)
            self.assertFalse(any(CHAVE.encode() in dados for _, dados in tudo_em_disco(conexao.pasta)))

    def test_L1_chegada_da_nuvem_nao_reserva_revisoes_nem_chama_OpenAI_fora_do_ar(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, openai='fora_do_ar') as conexao:
            conexao.firestore.documentos['A'] = {'chave': {'stringValue': CHAVE}, 'em': {'integerValue': '100'}}
            for revisao in (0, 1, 1):
                status, _, corpo = conexao.pedir('POST', '/ia/openai/sincronizar',
                    corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': revisao})
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(corpo)['versao'], 1)
            self.assertEqual(conexao.openai.pedidos, [])
            self.assertEqual(json.loads(conexao.pedir('POST', '/ia/estado')[2]),
                {'openai': {'configurada': True, 'ultimos4': 'abcd', 'conta': 'A', 'versao': 1, 'naoEnviada': False}})
            self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)

    def test_R1_HTTP_perdido_aceita_tarde_e_replay_apos_reinicio_e_so_leitura(self):
        entrou, liberar = threading.Event(), threading.Event()
        def esperar(metodo, _auth):
            if metodo == 'GET':
                entrou.set()
                self.assertTrue(liberar.wait(5))
        with tempfile.TemporaryDirectory() as pasta:
            with ConexaoNoTeste(pasta) as conexao:
                conexao.openai.antes_de_responder = esperar
                cliente = http.client.HTTPConnection('127.0.0.1', conexao.conexao.porta, timeout=0.2)
                cliente.request('POST', '/ia/openai/chave', body=json.dumps({'chave': CHAVE, 'versao': 0, 'conta': 'A'}),
                    headers={'Origin': ORIGEM, 'Content-Type': 'application/json'})
                self.assertTrue(entrou.wait(5))
                try:
                    with self.assertRaises(socket.timeout): cliente.getresponse()
                finally:
                    cliente.close()
                    liberar.set()
                limite = time.monotonic() + 5
                while conexao.conexao.cofre.ler('openai') != CHAVE and time.monotonic() < limite: time.sleep(0.01)
                self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)
            with ConexaoNoTeste(pasta, openai='fora_do_ar') as conexao:
                antes = conexao.conexao.cofre.documento('openai')
                status, _, corpo = conexao.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})
                self.assertEqual((status, json.loads(corpo)), (200, {'ok': True, 'ultimos4': 'abcd'}))
                self.assertEqual(conexao.openai.pedidos, [])
                self.assertTrue(conexao.conexao.cofre.documento('openai') == antes)
                self.assertEqual(json.loads(conexao.pedir('POST', '/ia/estado')[2])['openai'],
                    {'configurada': True, 'ultimos4': 'abcd', 'conta': 'A', 'versao': 1, 'naoEnviada': True})
                self.assertEqual(conexao.pedir('POST', '/ia/openai/chave/apagar', corpo={'versao': 1, 'conta': 'A'})[0], 200)
                self.assertEqual(conexao.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})[0], 409)
                self.assertFalse(any(CHAVE.encode() in dados for _, dados in tudo_em_disco(pasta)))

    def test_J1_wipe_de_C_nao_marca_A_nem_apaga_sua_chave_mais_nova(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.firestore.documentos['A'] = {
                'chave': {'stringValue': OUTRA_CHAVE}, 'em': {'integerValue': '200'}}
            conexao.pedir('POST', '/ia/openai/chave',
                corpo={'chave': CHAVE, 'versao': 0, 'conta': 'C'})
            self.assertEqual(conexao.pedir('POST', '/ia/openai/chave/apagar',
                corpo={'versao': 1, 'conta': 'C'})[0], 200)
            # Conclui a única mudança de C antes de trocar o dono ativo: não
            # existe uma marca de A que possa ser reentregue quando A entrar.
            self.assertEqual(conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'C', 'token': 'token-ficticio-C', 'versao': 2})[0], 200)
            status, _, _ = conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': 2})
            self.assertEqual(status, 200)
            self.assertTrue(conexao.conexao.cofre.ler('openai') == OUTRA_CHAVE)
            self.assertTrue(conexao.firestore.documentos['A']['chave']['stringValue'] == OUTRA_CHAVE)
            self.assertEqual(conexao.firestore.documentos['A']['em']['integerValue'], '200')
            self.assertFalse(any(metodo == 'PATCH' and uid == 'A' for metodo, uid, _token in conexao.firestore.pedidos))
            self.assertEqual(set(conexao.conexao.cofre.documento('openai')), {'chave', 'conta', 'versao', 'em', 'naoEnviada'})

    def test_P1_upload_recusado_nao_transfere_nem_descarta_A_ao_entrar_em_B(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            conexao.pedir('POST', '/ia/openai/chave', corpo={'chave': CHAVE, 'versao': 0, 'conta': 'A'})
            conexao.firestore.recusar_escritas = True
            self.assertEqual(conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': 1})[0], 503)
            conexao.firestore.documentos['B'] = {'chave': {'stringValue': OUTRA_CHAVE}, 'em': {'integerValue': '100'}}
            status, _, corpo = conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'B', 'token': 'token-ficticio-B', 'versao': 1})
            self.assertEqual((status, json.loads(corpo)), (409, {'error': 'other_account_unsent'}))
            self.assertTrue(conexao.conexao.cofre.ler('openai') == CHAVE)
            self.assertTrue(conexao.firestore.documentos['B']['chave']['stringValue'] == OUTRA_CHAVE)
            self.assertFalse(any(uid == 'B' for _metodo, uid, _token in conexao.firestore.pedidos))
            conexao.firestore.recusar_escritas = False
            self.assertEqual(conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'A', 'token': 'token-ficticio-A', 'versao': 1})[0], 200)
            self.assertTrue(conexao.firestore.documentos['A']['chave']['stringValue'] == CHAVE)
            self.assertEqual(conexao.pedir('POST', '/ia/openai/sincronizar',
                corpo={'uid': 'B', 'token': 'token-ficticio-B', 'versao': 1})[0], 200)
            self.assertTrue(conexao.conexao.cofre.ler('openai') == OUTRA_CHAVE)


if __name__ == "__main__":
    unittest.main()
