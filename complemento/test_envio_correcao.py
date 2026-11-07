"""A correção da Criação (#169) vista de fora: o Envio real com a thread de trabalho ligada, a coleção em memória com uma nota da frente Criação
(a frase que a pessoa escreveu já está no campo, como o gancho da revisão a deixa) e a OpenAI de mentira na fronteira HTTP. Confere o pedido de
correção que atravessa o HTTP, o que fica na nota e o custo, que a aba Custos lê à parte do custo dos Cartões.

    python3.9 complemento/test_envio_correcao.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import tipo_de_nota  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_chatgpt_de_mentira import MARCA  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_login_do_chatgpt import entrar_e_voltar  # noqa: E402

INGLES = "PerpetualMiner::Inglês"
NOVA = "run : They keep running"
ESCRITA = "I gave up suggar last year"
CORRIGIDA = "I gave up sugar last year."
TERCEIRO_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd"


def colecao_com_a_criacao(escrita=ESCRITA):
    """Um Anki com o Cartão `gave up` já feito pelo Envio de antes e a frase que a pessoa escreveu na revisão da Criação."""
    colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Default"}]})
    tipo_de_nota.preparar(colecao)
    colecao.adicionar_nota(INGLES, "PerpetualMiner Inglês", {"Frase": "She <b>gave up</b> smoking", "Palavra": "gave up - /ɡɪv ʌp/"}, [], "g-criacao")
    if escrita:
        colecao.gravar_frase_escrita("g-criacao", escrita)
    return colecao


def campos(colecao, guid="g-criacao"):
    return colecao.nota_gravada(guid)["campos"]


def enviar(conexao, id_=ID, linha=NOVA):
    conexao.criar(pedido(id_, linha, baralho=INGLES))
    return conexao.esperar(id_)


def custos_do_envio(conexao, id_=ID):
    [linha] = [linha for linha in json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"] if linha["jobId"] == id_]
    return linha["costs"]


class ACorrecaoVaiNoProximoEnvio(unittest.TestCase):
    def test_a_frase_escrita_na_criacao_e_corrigida_no_proximo_envio_e_a_nota_guarda_o_que_foi_lido_e_a_correcao(self):
        colecao = colecao_com_a_criacao()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.correcao_de = lambda escrita: CORRIGIDA
            fim = enviar(conexao)
            pedidos = list(conexao.openai.correcoes)
        self.assertEqual((fim["status"], fim["successfulPhraseIds"]), ("completed", [1760000000000]))
        self.assertEqual([(c["Escrito antes"], c["Correção"], c["Frase escrita"]) for c in [campos(colecao)]], [(ESCRITA, CORRIGIDA, ESCRITA)])
        self.assertEqual(pedidos, [("Bearer sk-proj-chave-do-envio-0000", ESCRITA, "gave up")])

    def test_o_cartao_do_envio_nao_e_tocado_pela_correcao(self):
        colecao = colecao_com_a_criacao()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            enviar(conexao)
        [novo] = [nota for nota in colecao.gravadas if nota["guid"] != "g-criacao"]
        self.assertEqual((novo["campos"].get("Frase escrita", ""), novo["campos"].get("Correção", "")), ("", ""))

    def test_uma_frase_ja_corrigida_nao_e_corrigida_de_novo_nem_paga_de_novo(self):
        colecao = colecao_com_a_criacao()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.correcao_de = lambda escrita: CORRIGIDA
            enviar(conexao)
            antes = campos(colecao)
            enviar(conexao, OUTRO_ID, "give in : They gave in")
            pedidos = len(conexao.openai.correcoes)
            custos = custos_do_envio(conexao, OUTRO_ID)
        self.assertEqual(pedidos, 1)
        self.assertEqual(campos(colecao), antes)
        self.assertNotIn("correctionUsd", custos)

    def test_uma_frase_nova_escrita_depois_da_correcao_e_corrigida_no_envio_seguinte(self):
        colecao = colecao_com_a_criacao()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.correcao_de = lambda escrita: escrita.capitalize() + "."
            enviar(conexao)
            colecao.gravar_frase_escrita("g-criacao", "she keep running")
            enviar(conexao, OUTRO_ID, "give in : They gave in")
            pedidos = [escrita for _, escrita, _ in conexao.openai.correcoes]
        self.assertEqual(pedidos, [ESCRITA, "she keep running"])
        self.assertEqual((campos(colecao)["Escrito antes"], campos(colecao)["Correção"]), ("she keep running", "She keep running."))

    def test_sem_frase_escrita_nenhuma_correcao_e_pedida(self):
        colecao = colecao_com_a_criacao(escrita=None)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            enviar(conexao)
            pedidos, custos = list(conexao.openai.correcoes), custos_do_envio(conexao)
        self.assertEqual(pedidos, [])
        self.assertNotIn("correctionUsd", custos)

    def test_a_frase_da_criacao_do_russo_e_corrigida_no_envio_do_russo(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Default"}]})
        tipo_de_nota.preparar(colecao)
        colecao.adicionar_nota("PerpetualMiner::Russo", "PerpetualMiner Russo", {"Frase": "Я не мальчик!", "Palavra": "мальчик"}, [], "g-ru")
        colecao.gravar_frase_escrita("g-ru", "Он мальчика.")
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.correcao_de = lambda escrita: "Он мальчик."
            conexao.criar(pedido(ID, "Я не мальчик! [Context: Série - Episódio 1]", lang="ru", baralho="PerpetualMiner::Russo"))
            conexao.esperar(ID)
        self.assertEqual((campos(colecao, "g-ru")["Escrito antes"], campos(colecao, "g-ru")["Correção"]), ("Он мальчика.", "Он мальчик."))


class OVersoDaCriacaoQueJaExistiaGanhaAFrase(unittest.TestCase):
    def colecao_com_o_modelo_de_antes(self):
        colecao = colecao_com_a_criacao()
        tipo_de_nota.trocar_a_frente(colecao, "en", "criacao")
        [modelo] = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        colecao.trocar_o_modelo("PerpetualMiner Inglês", dict(modelo, verso=modelo["verso"].replace("Da última vez você escreveu", "")), tipo_de_nota.CSS)
        return colecao

    def test_o_cartao_da_criacao_feito_antes_da_correcao_passa_a_mostrar_da_ultima_vez_voce_escreveu(self):
        colecao = self.colecao_com_o_modelo_de_antes()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            enviar(conexao)
        [modelo] = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
        self.assertIn("Da última vez você escreveu", modelo["verso"])

    def test_o_tipo_de_nota_que_a_pessoa_mexeu_ou_trocou_de_frente_nao_e_regravado(self):
        for como in ("outra frente", "outro modelo"):
            with self.subTest(como):
                colecao = colecao_com_a_criacao()
                tipo_de_nota.trocar_a_frente(colecao, "en", "lacuna" if como == "outra frente" else "criacao")
                if como == "outro modelo":
                    colecao._cartoes_dos_tipos.pop("PerpetualMiner Inglês")  # um tipo da pessoa, sem o modelo da Conexão
                antes = colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês")
                with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
                    fim = enviar(conexao)
                self.assertEqual(fim["status"], "completed")
                self.assertEqual(colecao.modelos_do_tipo_de_nota("PerpetualMiner Inglês"), antes)


class OCustoDaCorrecaoFicaAParte(unittest.TestCase):
    def test_a_aba_custos_le_o_custo_da_correcao_a_parte_do_custo_dos_cartoes(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao_com_a_criacao()) as conexao:
            enviar(conexao)
            custos = custos_do_envio(conexao)
            registros = conexao.arquivos()[os.path.join("custos", ID, "costs.jsonl")].decode("utf-8")
        # 300 tokens de entrada e 40 de saída, ao preço do gpt-4o da chave; o Cartão, 1000 e 200 (US$ 0,0045).
        self.assertEqual((custos["cardUsd"], custos["correctionUsd"]), (0.0045, 0.00115))
        self.assertEqual(custos["totalUsd"], round(sum(valor for chave, valor in custos.items() if chave != "totalUsd"), 6))
        self.assertNotIn("gave up", registros)
        self.assertNotIn(ESCRITA, registros)

    def test_o_custo_da_correcao_conta_no_periodo_em_que_foi_gasto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao_com_a_criacao()) as conexao:
            enviar(conexao)
            fora = json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all", "from": "2001-01-01", "to": "2001-01-02"})[2])["jobs"]
        self.assertEqual(fora, [])

    def test_a_correcao_pelo_plano_do_chatgpt_nao_gasta_a_chave_e_custa_zero(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao_com_a_criacao()) as conexao:
            entrar_e_voltar(conexao)
            conexao.openai.correcao_de = lambda escrita: CORRIGIDA
            enviar(conexao)
            custos, chats, correcoes = custos_do_envio(conexao), list(conexao.openai.chats), list(conexao.openai.correcoes)
            respostas = len(conexao.openai.respostas)
        self.assertEqual(chats, [])
        self.assertEqual(respostas, 2)  # o texto do Cartão e a correção
        self.assertEqual(len(correcoes), 1)
        self.assertEqual(correcoes[0][0][:13], "Bearer acesso")
        self.assertEqual(custos["correctionUsd"], 0.0)


class ACorrecaoNuncaDerrubaOEnvio(unittest.TestCase):
    def test_a_chave_recusada_na_correcao_deixa_a_frase_para_o_proximo_envio_e_o_envio_termina(self):
        colecao = colecao_com_a_criacao()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.recusar_o_chat_de("[correcao]", 401, "invalid_api_key")
            fim = enviar(conexao)
            antes = campos(colecao)
            conexao.openai.recusar_o_chat_de("[correcao]", None, None)
            conexao.openai.correcao_de = lambda escrita: CORRIGIDA
            enviar(conexao, OUTRO_ID, "give in : They gave in")
        self.assertEqual((fim["status"], fim["lastError"]), ("completed", None))
        self.assertEqual((antes["Escrito antes"], antes["Correção"]), ("", ""))
        self.assertEqual((campos(colecao)["Escrito antes"], campos(colecao)["Correção"]), (ESCRITA, CORRIGIDA))

    def test_uma_resposta_vazia_da_ia_nao_apaga_nem_marca_a_frase_como_corrigida(self):
        colecao = colecao_com_a_criacao()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.openai.correcao_de = lambda escrita: ""
            fim = enviar(conexao)
        self.assertEqual(fim["status"], "completed")
        self.assertEqual((campos(colecao)["Escrito antes"], campos(colecao)["Correção"]), ("", ""))

    def test_a_chave_nao_aparece_no_log_nem_nos_arquivos(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao_com_a_criacao()) as conexao:
            conexao.openai.recusar_o_chat_de("[correcao]", 401, "invalid_api_key")
            enviar(conexao)
            log = conexao.log()
        self.assertNotIn("sk-proj-chave-do-envio-0000", log)
        self.assertNotIn(ESCRITA, log)


if __name__ == "__main__":
    unittest.main()
