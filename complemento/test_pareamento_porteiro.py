"""O porteiro da Conexão (#192): toda rota privada recusa o que não vem assinado por um navegador pareado, a resposta volta com a prova e o
Desconectar navegadores esvazia a lista. Servidor real por HTTP, como `test_pareamento.py`.

    python3.9 complemento/test_pareamento_porteiro.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import pareamento  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_pareamento_de_mentira import (  # noqa: E402
    CLIENTE, DESAFIO, OUTRO_CLIENTE, OUTRO_SEGREDO, SEGREDO, UM_CLIENTE_NOVO, bytes_de, cabecalhos_assinados, comecar, concluir, json_de, segredo_em_base64, semear,
)
from complemento.test_servidor import ORIGEM, ConexaoNoTeste  # noqa: E402


class OPorteiro(unittest.TestCase):
    """Toda rota privada recusa o que não vem assinado por um navegador pareado, e o recusado nem chega à rota."""

    def test_toda_rota_privada_recusa_o_pedido_sem_assinatura_ou_com_assinatura_errada_e_aceita_o_certo(self):
        from complemento import servidor

        privadas = sorted(r for r in servidor.ROTAS if r not in servidor.ROTAS_ABERTAS and r not in servidor.ROTAS_SEM_ASSINATURA)
        self.assertGreater(len(privadas), 20)
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria.fechada()) as conexao:
            for metodo, caminho in privadas:
                with self.subTest("%s %s" % (metodo, caminho)):
                    sem = conexao.pedir(metodo, caminho, corpo={}, assinar=False)
                    errada = conexao.pedir(metodo, caminho, corpo={}, cabecalhos={pareamento.CABECALHO_DA_ASSINATURA: "AAAA"})
                    velha = conexao.pedir(metodo, caminho, corpo={}, cabecalhos={pareamento.CABECALHO_DA_SESSAO: "sessao-velha"})
                    certa = conexao.pedir(metodo, caminho, corpo={})
                    self.assertEqual(
                        [(sem[0], json_de(sem[2])), (errada[0], json_de(errada[2])), (velha[0], json_de(velha[2]))],
                        [(401, {"error": "pairing_required"}), (401, {"error": "pairing_invalid"}), (401, {"error": "session_expired"})],
                    )
                    self.assertNotEqual(certa[0], 401)

    def test_a_rota_que_nao_existe_tambem_exige_a_assinatura_e_nao_diz_se_existe(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            sem = conexao.pedir("POST", "/rota/que/nao-existe", corpo={}, assinar=False)
            com = conexao.pedir("POST", "/rota/que/nao-existe", corpo={})
        self.assertEqual((sem[0], com[0]), (401, 404))

    def test_a_assinatura_cobre_o_corpo_o_metodo_e_o_caminho(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            sessao = conexao.conexao.pareamento.sessao
            corpo = json.dumps({"deck": "Inglês", "lang": "en"}).encode("utf-8")
            outro_corpo = json.dumps({"deck": "Outro", "lang": "en"}).encode("utf-8")
            codigos = [
                conexao.pedir("POST", "/anki/vocabulary", corpo=outro_corpo, assinar=False, cabecalhos=cabecalhos_assinados(sessao, "POST", "/anki/vocabulary", corpo))[0],
                conexao.pedir("POST", "/anki/vocabulary", corpo=corpo, assinar=False, cabecalhos=cabecalhos_assinados(sessao, "POST", "/anki/decks", corpo))[0],
                conexao.pedir("POST", "/anki/vocabulary", corpo=corpo, assinar=False, cabecalhos=cabecalhos_assinados(sessao, "PUT", "/anki/vocabulary", corpo))[0],
            ]
        self.assertEqual(codigos, [401, 401, 401])

    def test_o_nonce_repetido_e_recusado_mesmo_com_a_assinatura_certa(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            cabecalhos = cabecalhos_assinados(conexao.conexao.pareamento.sessao, "POST", "/ia/estado", b"{}", nonce="nonce-repetido-1")
            primeiro = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos)[0]
            segundo = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos)
        self.assertEqual((primeiro, segundo[0], json_de(segundo[2])), (200, 401, {"error": "pairing_invalid"}))

    def test_um_nonce_fora_do_formato_e_recusado(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            cabecalhos = cabecalhos_assinados(conexao.conexao.pareamento.sessao, "POST", "/ia/estado", b"{}", nonce="curto")
            status = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos)[0]
        self.assertEqual(status, 401)

    def test_um_navegador_que_a_conexao_nao_conhece_nao_pede_nada_mesmo_com_um_segredo_qualquer(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            cabecalhos = cabecalhos_assinados(conexao.conexao.pareamento.sessao, "POST", "/ia/estado", b"{}", cliente=UM_CLIENTE_NOVO)
            status, _, corpo = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos)
        self.assertEqual((status, json_de(corpo)), (401, {"error": "pairing_required"}))

    def test_um_cliente_que_so_forja_a_origem_da_extensao_nao_le_mais_nada(self):
        """O limite que o #190 aceitou (`contrato/LEIA-ME.md`, regra 3) acabou: o `Origin` ainda é exigido, mas deixou de ser a fronteira."""
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, colecao=ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": []}]})) as conexao:
            lidos = [conexao.pedir("POST", caminho, origem=ORIGEM, corpo=corpo, assinar=False) for caminho, corpo in (
                ("/anki/vocabulary", {"deck": "Inglês", "lang": "en"}), ("/ia/estado", {}), ("/jobs/list", {}), ("/anki/decks", {}),
                ("/atualizacao/reiniciar", {}))]
            conexao.pedir("POST", "/jobs", corpo={"jobId": "9b2f4c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b", "lang": "en", "deckName": "Inglês", "entries": []}, assinar=False)
            fila = os.listdir(conexao.dados.fila)
        self.assertEqual([r[0] for r in lidos], [401] * 5)
        self.assertEqual(fila, [])
        for _, _, corpo in lidos:
            self.assertEqual(json_de(corpo)["error"], "pairing_required")

    def test_so_a_saude_e_o_retorno_do_login_continuam_abertos(self):
        from complemento import servidor

        self.assertEqual(sorted(servidor.ROTAS_ABERTAS), [("GET", "/auth/callback"), ("GET", "/health")])
        self.assertEqual(sorted(servidor.ROTAS_SEM_ASSINATURA), [("POST", "/pareamento/comecar"), ("POST", "/pareamento/concluir"), ("POST", "/pareamento/conferir")])
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            saude = conexao.pedir("GET", "/health", assinar=False)[0]
            saude_sem_origem = conexao.pedir("GET", "/health", origem=None, assinar=False)[0]
        self.assertEqual((saude, saude_sem_origem), (200, 200))

    def test_o_preflight_da_extensao_passa_sem_assinatura_e_libera_os_cabecalhos_do_pareamento(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            pedidos = "content-type,%s,%s" % (pareamento.CABECALHO_DO_CLIENTE.lower(), pareamento.CABECALHO_DA_ASSINATURA.lower())
            status, cabecalhos, _ = conexao.pedir("OPTIONS", "/ia/estado", assinar=False, cabecalhos={"Access-Control-Request-Headers": pedidos})
        self.assertEqual(status, 204)
        self.assertEqual(cabecalhos["Access-Control-Allow-Headers"], pedidos)

    def test_o_corpo_grande_demais_e_recusado_antes_de_a_assinatura_ser_conferida(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            status, _, corpo = conexao.pedir("POST", "/ia/estado", corpo=b"{" + b" " * (70 * 1024) + b"}")
        self.assertEqual((status, json_de(corpo)), (400, {"error": "invalid_json"}))

    def test_a_origem_errada_e_recusada_antes_de_qualquer_conferencia(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            status, _, corpo = conexao.pedir("POST", "/pareamento/comecar", origem="chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", corpo={})
            sem_origem = conexao.pedir("POST", "/pareamento/conferir", origem=None, corpo={"cliente": CLIENTE, "desafio": DESAFIO})[0]
        self.assertEqual((status, json_de(corpo), sem_origem), (403, {"error": "origin_not_allowed"}, 403))


class AProvaDaResposta(unittest.TestCase):
    def test_toda_resposta_a_um_pedido_assinado_volta_com_a_prova_dele(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            sessao = conexao.conexao.pareamento.sessao
            cabecalhos = cabecalhos_assinados(sessao, "POST", "/ia/estado", b"{}", nonce="nonce-da-prova-1")
            status, recebidos, corpo = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos)
            nao_encontrada = conexao.pedir("POST", "/nao/existe", corpo={}, assinar=False,
                                           cabecalhos=cabecalhos_assinados(sessao, "POST", "/nao/existe", b"{}", nonce="nonce-da-prova-2"))
        esperada = pareamento.prova_da_resposta(SEGREDO, sessao, "nonce-da-prova-1", status, corpo)
        self.assertEqual(recebidos[pareamento.CABECALHO_DA_PROVA], esperada)
        self.assertIn(pareamento.CABECALHO_DA_PROVA, nao_encontrada[1])
        self.assertIn(pareamento.CABECALHO_DA_PROVA, recebidos["Access-Control-Expose-Headers"])

    def test_a_prova_nao_serve_a_outro_pedido_a_outro_corpo_nem_a_outro_status(self):
        base = ("sessao", "nonce-0001", 200, b'{"ok": true}')
        prova = pareamento.prova_da_resposta(SEGREDO, *base)
        for mudada in (("outra", "nonce-0001", 200, base[3]), ("sessao", "nonce-0002", 200, base[3]), ("sessao", "nonce-0001", 500, base[3]),
                       ("sessao", "nonce-0001", 200, b'{"ok": false}')):
            self.assertNotEqual(pareamento.prova_da_resposta(SEGREDO, *mudada), prova)

    def test_a_recusa_do_porteiro_nao_leva_prova_porque_ninguem_provou_nada(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            cabecalhos = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False)[1]
        self.assertNotIn(pareamento.CABECALHO_DA_PROVA, cabecalhos)

    def test_a_resposta_a_um_pedido_sem_assinatura_nao_leva_prova_de_um_pedido_de_outra_pessoa(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            saude = conexao.pedir("GET", "/health", assinar=False)[1]
        self.assertNotIn(pareamento.CABECALHO_DA_PROVA, saude)


class DesconectarOsNavegadores(unittest.TestCase):
    def test_desconectar_esvazia_a_lista_e_o_navegador_volta_a_pedir_o_codigo_sem_perder_o_resto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, chave_na_conexao="abcd") as conexao:
            antes = conexao.pedir("POST", "/ia/estado", corpo={})[0]
            chave_antes = bytes_de(os.path.join(conexao.chaves, "openai.json"))
            saiu = conexao.conexao.pareamento.desconectar()
            depois = conexao.pedir("POST", "/ia/estado", corpo={})
            conferir = conexao.pedir("POST", "/pareamento/conferir", corpo={"cliente": CLIENTE, "desafio": DESAFIO}, assinar=False)[0]
            chave_depois = bytes_de(os.path.join(conexao.chaves, "openai.json"))
            restam = conexao.conexao.pareamento.quantos()
        self.assertEqual((antes, saiu, depois[0], json_de(depois[2]), conferir, restam), (200, 1, 401, {"error": "pairing_required"}, 401, 0))
        self.assertEqual(chave_antes, chave_depois)

    def test_desconectar_com_o_codigo_ja_usado_nao_deixa_o_concluir_repetido_devolver_um_segredo_morto(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            concluir(conexao)
            conexao.conexao.pareamento.desconectar()
            status, resposta, _ = concluir(conexao)
        self.assertEqual((status, resposta), (410, {"error": "pairing_code_expired"}))

    def test_cada_navegador_tem_o_seu_segredo_e_um_nao_assina_pelo_outro(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            semear(os.path.join(pasta, "pareamento.json"), ((CLIENTE, SEGREDO), (OUTRO_CLIENTE, OUTRO_SEGREDO)))
            sessao = conexao.conexao.pareamento.sessao
            do_segundo = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos_assinados(sessao, "POST", "/ia/estado", b"{}", cliente=OUTRO_CLIENTE, segredo=OUTRO_SEGREDO))[0]
            trocado = conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False, cabecalhos=cabecalhos_assinados(sessao, "POST", "/ia/estado", b"{}", cliente=OUTRO_CLIENTE, segredo=SEGREDO))[0]
        self.assertEqual((do_segundo, trocado), (200, 401))

    def test_uma_linha_do_arquivo_com_segredo_que_nao_e_base64_nao_pareia_ninguem(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            with open(os.path.join(pasta, "pareamento.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"versao": 1, "clientes": [{"cliente": CLIENTE, "segredo": "isto não é base64!"}, "lixo", {"cliente": 7}]}, arquivo)
            status, _, corpo = conexao.pedir("POST", "/ia/estado", corpo={})
            quantos = conexao.conexao.pareamento.quantos()
        self.assertEqual((status, json_de(corpo), quantos), (401, {"error": "pairing_required"}, 0))

    def test_a_sessao_lembra_um_numero_limitado_de_nonces_e_esquece_os_mais_antigos(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            p = conexao.conexao.pareamento
            sessao = p.sessao
            for n in range(pareamento.NONCES_LEMBRADOS + 5):
                cabecalhos = cabecalhos_assinados(sessao, "POST", "/ia/estado", b"{}", nonce="nonce-%08d" % n)
                self.assertEqual(p.verificar("POST", "/ia/estado", b"{}", cabecalhos).status, 200)
            lembrados = len(p._nonces)
        self.assertEqual(lembrados, pareamento.NONCES_LEMBRADOS)

    def test_o_arquivo_estragado_e_um_pareamento_vazio_e_nao_um_erro(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta) as conexao:
            with open(os.path.join(pasta, "pareamento.json"), "w", encoding="utf-8") as arquivo:
                arquivo.write("{isto nao e json")
            status = conexao.pedir("POST", "/ia/estado", corpo={})[0]
        self.assertEqual(status, 401)


class AsFronteirasNaoMisturam(unittest.TestCase):
    def test_o_pacote_do_complemento_nao_leva_o_pareamento_nem_os_helpers_de_teste(self):
        from complemento import empacotar

        nomes = empacotar.arquivos_do_pacote()
        self.assertIn("pareamento.py", nomes)
        self.assertEqual([n for n in nomes if "pareamento.json" in n or n.startswith("user_files") or n.startswith("test_")], [])

    def test_o_segredo_nao_aparece_no_log(self):
        with tempfile.TemporaryDirectory() as pasta, ConexaoNoTeste(pasta, pareado=False) as conexao:
            comecar(conexao)
            _, resposta, _ = concluir(conexao)
            conexao.pedir("POST", "/ia/estado", corpo={}, assinar=False)
            tudo_no_log = conexao.log()
        self.assertNotIn(resposta["segredo"], tudo_no_log)
        self.assertNotIn(segredo_em_base64(SEGREDO), tudo_no_log)


if __name__ == "__main__":
    unittest.main()
