"""O modelo dos cartões (#157), visto de fora: o servidor real da Conexão com a thread do Envio ligada, a OpenAI de mentira na
fronteira HTTP e o relógio que o teste dá à Conexão. O que o teste confere é o modelo que a OpenAI recebe em cada Cartão, o que a
extensão lê (`POST /ia/modelo/estado`) e o que fica guardado. O desenho: `docs/design/modelo-dos-cartoes.md`.

    python3.9 complemento/test_modelo_dos_cartoes.py
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_envio import CHAVE, ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_login_do_chatgpt import entrar_e_voltar  # noqa: E402
from complemento.test_modelos_de_mentira import LISTA_NOSSA  # noqa: E402
from complemento.test_servidor import ler_o_contrato  # noqa: E402

FRASE = "gave up : She gave up smoking"
AUTOMATICO = {"escolha": "automatico", "trocou": None}


def cenario(nome, **mudancas):
    """Uma cópia do cenário do contrato (o teste muda o `hoje` dela para passar o tempo)."""
    return dict(json.loads(json.dumps(ler_o_contrato()["modelos"][nome])), **mudancas)


def modelo_do_motor():
    """O modelo que o motor usa sem escolha: o que está no `engine/config.json`, e nunca um escrito no código do complemento."""
    with open(os.path.join(os.path.dirname(__file__), "..", "engine", "config.json"), encoding="utf-8") as arquivo:
        return json.load(arquivo)["openai"]["chat_model"]


def estado(conexao):
    status, _, corpo = conexao.pedir("POST", "/ia/modelo/estado", corpo={})
    return status, json.loads(corpo)


def escolher(conexao, modelo):
    status, _, corpo = conexao.pedir("POST", "/ia/modelo/escolher", corpo={"modelo": modelo})
    return status, json.loads(corpo)


def enviar(conexao, job_id=ID, *linhas):
    conexao.criar(pedido(job_id, *(linhas or (FRASE,))))
    return conexao.esperar(job_id)


def modelos_pedidos(conexao):
    """O `model` de cada pedido de texto que a OpenAI recebeu: pela chave (chat) ou pelo plano (responses)."""
    return [corpo["model"] for _, corpo in list(conexao.openai.chats) + list(conexao.openai.respostas)]


def guardado(conexao):
    with open(os.path.join(conexao.pasta, "modelo-dos-cartoes.json"), encoding="utf-8") as arquivo:
        return json.load(arquivo)


class OAutomatico(unittest.TestCase):
    def test_sem_escolha_o_envio_com_a_chave_usa_o_modelo_do_motor_e_o_estado_diz_automatico(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            fim = enviar(conexao)
            visto = estado(conexao)
            usados = modelos_pedidos(conexao)
        self.assertEqual(fim["status"], "completed")
        self.assertEqual(usados, [modelo_do_motor()])
        self.assertEqual(visto, (200, {"paga": "chave", "escolha": "automatico", "modelos": ["gpt-4o", "gpt-4.1", "gpt-4.1-mini"], "aviso": None, "trocou": None}))

    def test_sem_escolha_o_envio_com_o_login_usa_o_primeiro_modelo_da_lista_do_plano(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            entrar_e_voltar(conexao)
            fim = enviar(conexao)
            visto = estado(conexao)
            usados = modelos_pedidos(conexao)
        self.assertEqual(fim["status"], "completed")
        self.assertEqual(usados, ["gpt-6-luna"])
        self.assertEqual(visto, (200, {"paga": "plano", "escolha": "automatico", "modelos": ["gpt-6-luna", "gpt-6-sol"], "aviso": None, "trocou": None}))

    def test_sem_chave_e_sem_login_so_o_automatico_vale(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None, modelo=cenario("Automático")) as conexao:
            visto = estado(conexao)
            recusado = escolher(conexao, "gpt-4o")
            aceito = escolher(conexao, "automatico")
        self.assertEqual(visto, (200, {"paga": None, "escolha": "automatico", "modelos": [], "aviso": None, "trocou": None}))
        self.assertEqual((recusado, aceito), ((404, {"error": "model_not_found"}), (200, {"ok": True, "escolha": "automatico"})))


class EscolherOutroModelo(unittest.TestCase):
    def test_o_modelo_escolhido_da_lista_da_conta_e_o_que_a_openai_recebe_no_envio_seguinte(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            resposta = escolher(conexao, "gpt-4.1-mini")
            fim = enviar(conexao)
            visto = estado(conexao)[1]
            usados = modelos_pedidos(conexao)
        self.assertEqual((resposta, fim["status"], usados), ((200, {"ok": True, "escolha": "gpt-4.1-mini"}), "completed", ["gpt-4.1-mini"]))
        self.assertEqual((visto["escolha"], visto["aviso"], visto["trocou"]), ("gpt-4.1-mini", None, None))

    def test_com_o_login_o_modelo_escolhido_da_lista_do_plano_vai_pela_responses_api(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            entrar_e_voltar(conexao)
            resposta = escolher(conexao, "gpt-6-sol")
            enviar(conexao)
            usados = modelos_pedidos(conexao)
        self.assertEqual((resposta, usados), ((200, {"ok": True, "escolha": "gpt-6-sol"}), ["gpt-6-sol"]))

    def test_a_chave_so_oferece_modelos_de_texto_que_veem_foto_e_que_a_conta_tem(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            lista = estado(conexao)[1]["modelos"]
            sem_foto = escolher(conexao, "gpt-3.5-turbo")
            de_imagem = escolher(conexao, "gpt-image-1")
            fora_da_conta = escolher(conexao, "gpt-4.1-nano")
        self.assertEqual(lista, ["gpt-4o", "gpt-4.1", "gpt-4.1-mini"])
        self.assertEqual([sem_foto[0], de_imagem[0], fora_da_conta[0]], [404, 404, 404])

    def test_a_escolha_fica_guardada_e_vale_depois_de_a_conexao_subir_de_novo(self):
        with tempfile.TemporaryDirectory() as pasta:
            with EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
                escolher(conexao, "gpt-4.1")
                no_arquivo = guardado(conexao)
            with EnvioNoTeste(pasta, modelo=cenario("Automático", escolha="gpt-4.1")) as conexao:
                depois = estado(conexao)[1]["escolha"]
        self.assertEqual((no_arquivo, depois), ({"escolha": "gpt-4.1", "trocou": None}, "gpt-4.1"))

    def test_nem_o_estado_nem_a_escolha_levam_a_chave_ou_o_token_e_o_arquivo_nao_os_guarda(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático")) as conexao:
            respostas = [conexao.pedir("POST", "/ia/modelo/estado", corpo={})[2], conexao.pedir("POST", "/ia/modelo/escolher", corpo={"modelo": "gpt-4o"})[2]]
            entrar_e_voltar(conexao)
            respostas.append(conexao.pedir("POST", "/ia/modelo/estado", corpo={})[2])
            segredos = [CHAVE] + list(conexao.servidor_de_login.emitidos)
            no_arquivo = json.dumps(guardado(conexao))
        self.assertGreaterEqual(len(segredos), 3)
        for segredo in segredos:
            self.assertNotIn(segredo, no_arquivo)
            for resposta in respostas:
                self.assertNotIn(segredo.encode("utf-8"), resposta)


class AntesEDepoisDaSaida(unittest.TestCase):
    def test_antes_da_data_o_estado_traz_o_aviso_e_o_envio_ainda_usa_o_modelo(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("gpt-4.1-mini sai em 20/11")) as conexao:
            visto = estado(conexao)[1]
            fim = enviar(conexao)
            usados = modelos_pedidos(conexao)
        self.assertEqual(visto["aviso"], {"modelo": "gpt-4.1-mini", "saida": "2026-11-20"})
        self.assertEqual((visto["escolha"], visto["trocou"]), ("gpt-4.1-mini", None))
        self.assertEqual((fim["status"], usados), ("completed", ["gpt-4.1-mini"]))

    def test_no_dia_da_saida_o_envio_passa_sozinho_para_o_automatico_termina_e_conta_o_que_trocou(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("gpt-4.1-mini saiu hoje")) as conexao:
            fim = enviar(conexao, ID, FRASE, "give in : They gave in")
            visto = estado(conexao)[1]
            usados = modelos_pedidos(conexao)
            no_arquivo = guardado(conexao)
        self.assertEqual((fim["status"], fim["lastError"]), ("completed", None))
        self.assertEqual(usados, [modelo_do_motor()] * 2)
        self.assertEqual((visto["escolha"], visto["aviso"], visto["trocou"]), ("automatico", None, {"de": "gpt-4.1-mini"}))
        self.assertEqual(no_arquivo, {"escolha": "automatico", "trocou": {"de": "gpt-4.1-mini"}})

    def test_o_dia_chega_entre_dois_envios_o_primeiro_usa_o_modelo_e_o_segundo_ja_o_automatico(self):
        escolhido = cenario("gpt-4.1-mini sai em 20/11")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=escolhido) as conexao:
            enviar(conexao, ID)
            escolhido["hoje"] = "2026-11-20"
            enviar(conexao, OUTRO_ID, "give in : They gave in")
            usados = modelos_pedidos(conexao)
            visto = estado(conexao)[1]
        self.assertEqual(usados, ["gpt-4.1-mini", modelo_do_motor()])
        self.assertEqual((visto["escolha"], visto["trocou"]), ("automatico", {"de": "gpt-4.1-mini"}))

    def test_com_o_login_o_dia_da_saida_passa_para_o_primeiro_da_lista_do_plano(self):
        escolhido = cenario("Automático", escolha="gpt-6-sol", saidas={"gpt-6-sol": "2026-11-20"}, hoje="2026-11-20")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=escolhido) as conexao:
            entrar_e_voltar(conexao)
            fim = enviar(conexao)
            usados = modelos_pedidos(conexao)
            visto = estado(conexao)[1]
        self.assertEqual((fim["status"], usados), ("completed", ["gpt-6-luna"]))
        self.assertEqual((visto["escolha"], visto["trocou"]), ("automatico", {"de": "gpt-6-sol"}))

    def test_o_modelo_que_sumiu_da_conta_antes_da_data_troca_na_hora_e_avisa_depois(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("gpt-4.1 sumiu da conta")) as conexao:
            fim = enviar(conexao)
            visto = estado(conexao)[1]
            usados = modelos_pedidos(conexao)
        self.assertEqual((fim["status"], usados), ("completed", [modelo_do_motor()]))
        self.assertEqual((visto["escolha"], visto["trocou"]), ("automatico", {"de": "gpt-4.1"}))

    def test_Trocar_agora_e_escolher_o_automatico_antes_da_data_e_o_aviso_some(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("gpt-4.1-mini sai em 20/11")) as conexao:
            resposta = escolher(conexao, "automatico")
            visto = estado(conexao)[1]
            enviar(conexao)
            usados = modelos_pedidos(conexao)
        self.assertEqual(resposta, (200, {"ok": True, "escolha": "automatico"}))
        self.assertEqual((visto["escolha"], visto["aviso"], visto["trocou"]), ("automatico", None, None))
        self.assertEqual(usados, [modelo_do_motor()])

    def test_escolher_outro_modelo_apaga_a_linha_do_que_trocou(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("Automático", trocou={"de": "gpt-4.1-mini"})) as conexao:
            antes = estado(conexao)[1]["trocou"]
            escolher(conexao, "gpt-4o")
            depois = estado(conexao)[1]
        self.assertEqual((antes, depois["trocou"], depois["escolha"]), ({"de": "gpt-4.1-mini"}, None, "gpt-4o"))

    def test_o_modelo_que_ja_saiu_nao_e_oferecido_nem_pode_ser_escolhido(self):
        saiu = cenario("Automático", saidas={"gpt-4.1-mini": "2026-11-01"})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=saiu) as conexao:
            lista = estado(conexao)[1]["modelos"]
            resposta = escolher(conexao, "gpt-4.1-mini")
        self.assertEqual((lista, resposta[0]), (["gpt-4o", "gpt-4.1"], 404))

    def test_ler_o_estado_depois_da_data_nao_grava_nada_quem_grava_e_o_envio(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("gpt-4.1-mini saiu hoje")) as conexao:
            antes = guardado(conexao)
            visto = estado(conexao)[1]
            depois = guardado(conexao)
        self.assertEqual((antes, depois), ({"escolha": "gpt-4.1-mini", "trocou": None},) * 2)
        self.assertEqual((visto["escolha"], visto["trocou"]), ("automatico", {"de": "gpt-4.1-mini"}))


class QuandoAListaDaContaNaoVem(unittest.TestCase):
    def test_com_a_openai_fora_do_ar_o_estado_diz_que_nao_deu_e_nada_muda(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, openai="fora_do_ar", modelo=cenario("gpt-4.1-mini sai em 20/11")) as conexao:
            visto = estado(conexao)
            recusado = escolher(conexao, "gpt-4o")
            no_arquivo = guardado(conexao)
        self.assertEqual((visto, recusado), ((503, {"error": "models_unavailable"}),) * 2)
        self.assertEqual(no_arquivo["escolha"], "gpt-4.1-mini")

    def test_o_envio_segue_com_a_escolha_da_pessoa_quando_a_lista_da_chave_nao_veio(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, modelo=cenario("gpt-4.1-mini sai em 20/11")) as conexao:
            conexao.openai.modelos_da_conta = None
            conexao.openai.comportamento = "fora_do_ar"
            fim = enviar(conexao)
            usados = modelos_pedidos(conexao)
        self.assertEqual((fim["status"], usados), ("completed", ["gpt-4.1-mini"]))


class AListaQueViajaComAExtensao(unittest.TestCase):
    def test_cada_modelo_diz_o_que_faz_e_o_dia_em_que_sai_e_nenhum_se_repete(self):
        with open(LISTA_NOSSA, encoding="utf-8") as arquivo:
            lista = json.load(arquivo)["modelos"]
        nomes = [modelo["modelo"] for modelo in lista]
        self.assertEqual(len(nomes), len(set(nomes)))
        for modelo in lista:
            self.assertEqual(sorted(modelo), ["foto", "modelo", "saida", "texto"], modelo)
            self.assertIsInstance(modelo["foto"], bool)
            self.assertIsInstance(modelo["texto"], bool)
            self.assertTrue(modelo["saida"] is None or date.fromisoformat(modelo["saida"]), modelo)
        self.assertIn(modelo_do_motor(), [m["modelo"] for m in lista if m["texto"] and m["foto"]])


if __name__ == "__main__":
    unittest.main()
