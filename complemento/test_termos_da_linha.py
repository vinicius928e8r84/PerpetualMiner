import contextlib
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import termos_da_linha
from complemento.test_envio import CHAVE, EnvioNoTeste

LINHA = "She can't put up with him"
PHRASAL = {"texto": "put up with", "posicoes": [2, 3, 4], "tipo": "phrasal_verb", "comum": True}
ERROS_DA_CHAVE = {"recusa": "openai_key_rejected", "sem_credito": "openai_no_credit", "limite_de_uso": "openai_rate_limited", "fora_do_ar": "openai_unreachable"}


@contextlib.contextmanager
def conexao_dos_termos(chave=CHAVE, **cenario):
    with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=chave, trabalhando=False, **cenario) as conexao:
        yield conexao


def ler(conexao, texto=LINHA, lang="en"):
    status, _, corpo = conexao.pedir("POST", "/ia/termos", corpo={"lang": lang, "texto": texto})
    return status, json.loads(corpo)


def custos_do_mes(conexao):
    return json.loads(conexao.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})[2])["jobs"]


def registros_de_custo(conexao):
    registros = []
    for pasta, _, nomes in os.walk(conexao.dados.custos):
        if "costs.jsonl" in nomes:
            with open(os.path.join(pasta, "costs.jsonl"), encoding="utf-8") as arquivo:
                registros += [json.loads(linha) for linha in arquivo if linha.strip()]
    return registros


class AsPalavrasDaLinha(unittest.TestCase):
    def test_as_palavras_sao_as_que_a_extensao_conta_com_o_apostrofo_e_o_hifen_dentro_da_palavra(self):
        self.assertEqual(termos_da_linha.palavras_da_linha("She can't put up with him"), ["She", "can't", "put", "up", "with", "him"])
        self.assertEqual(termos_da_linha.palavras_da_linha("My mother-in-law's here, ok? 3 pm!"), ["My", "mother-in-law's", "here", "ok", "3", "pm"])

    def test_o_russo_tambem_se_conta_por_palavras(self):
        self.assertEqual(termos_da_linha.palavras_da_linha("Я не мальчик!"), ["Я", "не", "мальчик"])


class OsTermosDaLinhaPelaChave(unittest.TestCase):
    def test_um_phrasal_verb_volta_com_as_posicoes_das_palavras_o_tipo_e_se_e_comum(self):
        with conexao_dos_termos() as conexao:
            status, resposta = ler(conexao)
        self.assertEqual((status, resposta), (200, {"termos": [PHRASAL], "pagou": "chave"}))

    def test_um_nome_e_uma_giria_voltam_com_o_tipo_deles(self):
        casos = {
            "Tell Walter I'm here": {"texto": "Walter", "posicoes": [1], "tipo": "nome", "comum": False},
            "That's lit": {"texto": "lit", "posicoes": [1], "tipo": "giria", "comum": True},
        }
        for linha, termo in casos.items():
            with self.subTest(linha), conexao_dos_termos() as conexao:
                status, resposta = ler(conexao, linha)
            self.assertEqual((status, resposta["termos"]), (200, [termo]))

    def test_a_chave_pede_o_texto_numerado_ao_modelo_barato_e_so_a_ela(self):
        with conexao_dos_termos() as conexao:
            ler(conexao)
            [(autorizacao, corpo)] = conexao.openai.termos
            respostas = list(conexao.openai.respostas)
        self.assertEqual((autorizacao, corpo["model"], respostas), ("Bearer " + CHAVE, termos_da_linha.MODELO_DA_CHAVE, []))
        self.assertEqual(corpo["response_format"], {"type": "json_object"})
        self.assertIn("Language: English\nLine: %s\nWords:\n0 She\n1 can't\n2 put\n3 up\n4 with\n5 him" % LINHA, corpo["messages"][-1]["content"])

    def test_o_russo_pede_a_linha_em_russo(self):
        with conexao_dos_termos() as conexao:
            status, resposta = ler(conexao, "Я не мальчик!", lang="ru")
            [(_, corpo)] = conexao.openai.termos
        self.assertEqual(status, 200)
        self.assertEqual([termo["texto"] for termo in resposta["termos"]], ["Я", "не", "мальчик"])
        self.assertIn("Language: Russian\n", corpo["messages"][-1]["content"])

    def test_o_termo_que_nao_e_vizinho_guarda_as_posicoes_na_ordem_da_linha(self):
        with conexao_dos_termos() as conexao:
            conexao.openai.termos_de = lambda linha: json.dumps({"terms": [{"words": [4, 2], "type": "phrasal_verb", "common": False}]})
            status, resposta = ler(conexao)
        self.assertEqual((status, resposta["termos"]), (200, [{"texto": "put with", "posicoes": [2, 4], "tipo": "phrasal_verb", "comum": False}]))

    def test_uma_linha_sem_termos_volta_a_lista_vazia(self):
        with conexao_dos_termos() as conexao:
            conexao.openai.termos_de = lambda linha: json.dumps({"terms": []})
            status, resposta = ler(conexao)
        self.assertEqual((status, resposta), (200, {"termos": [], "pagou": "chave"}))


class OsTermosDaLinhaPeloPlano(unittest.TestCase):
    def test_com_o_login_paga_o_plano_e_a_chave_nao_e_gasta(self):
        with conexao_dos_termos(chatgpt="conectada") as conexao:
            status, resposta = ler(conexao)
            [(autorizacao, corpo)] = conexao.openai.termos
            chats, respostas = list(conexao.openai.chats), list(conexao.openai.respostas)
        self.assertEqual((status, resposta), (200, {"termos": [PHRASAL], "pagou": "plano"}))
        self.assertEqual(autorizacao, "Bearer acesso-x")
        self.assertEqual((len(respostas), chats), (1, []))
        self.assertEqual(corpo["model"], "gpt-6-luna")
        self.assertEqual(corpo["text"], {"format": {"type": "json_object"}})

    def test_com_o_login_e_sem_chave_o_plano_paga_do_mesmo_jeito(self):
        with conexao_dos_termos(chave=None, chatgpt="conectada") as conexao:
            status, resposta = ler(conexao)
        self.assertEqual((status, resposta["pagou"]), (200, "plano"))

    def test_o_plano_no_limite_responde_o_codigo_e_nao_troca_para_a_chave(self):
        with conexao_dos_termos(chatgpt="conectada") as conexao:
            conexao.openai.recusa_das_respostas = (429, "subscription_sharing_usage_limit_exceeded")
            status, resposta = ler(conexao)
            sem_resposta, na_chave = list(conexao.openai.termos), list(conexao.openai.chats)
        self.assertEqual((status, resposta), (502, {"error": "chatgpt_usage_limit"}))
        self.assertEqual((sem_resposta, na_chave), ([], []))


class SemQuemPague(unittest.TestCase):
    def test_sem_login_e_sem_chave_responde_parado_com_o_motivo_sem_chamar_a_ia(self):
        with conexao_dos_termos(chave=None) as conexao:
            status, resposta = ler(conexao)
            pedidos = list(conexao.openai.pedidos)
            custos = registros_de_custo(conexao)
        self.assertEqual((status, resposta), (409, {"error": "openai_key_missing"}))
        self.assertEqual((pedidos, custos), ([], []))

    def test_o_login_que_acabou_para_mesmo_com_chave_e_nao_troca_sozinho_para_a_chave(self):
        with conexao_dos_termos(chatgpt="acabou") as conexao:
            status, resposta = ler(conexao)
            pedidos = list(conexao.openai.pedidos)
        self.assertEqual((status, resposta), (409, {"error": "chatgpt_signed_out"}))
        self.assertEqual(pedidos, [])


class ORespostaInvalidaDaIA(unittest.TestCase):
    CORPOS = {
        "texto que não é JSON": "isto não é JSON",
        "JSON que não é um objeto": "[1, 2]",
        "sem a lista de termos": '{"termos": []}',
        "termos que não é lista": '{"terms": {"words": [1]}}',
        "termo que não é objeto": '{"terms": ["lit"]}',
        "posição fora da linha": '{"terms": [{"words": [9], "type": "palavra", "common": true}]}',
        "posição negativa": '{"terms": [{"words": [-1], "type": "palavra", "common": true}]}',
        "posição que não é número": '{"terms": [{"words": ["2"], "type": "palavra", "common": true}]}',
        "posição verdadeiro": '{"terms": [{"words": [true], "type": "palavra", "common": true}]}',
        "sem posições": '{"terms": [{"words": [], "type": "palavra", "common": true}]}',
        "tipo que não existe": '{"terms": [{"words": [1], "type": "verbo", "common": true}]}',
        "comum que não é verdadeiro ou falso": '{"terms": [{"words": [1], "type": "palavra", "common": "sim"}]}',
    }

    def test_cada_resposta_que_nao_serve_vira_o_erro_com_codigo_e_nada_de_termos(self):
        for nome, corpo in self.CORPOS.items():
            with self.subTest(nome), conexao_dos_termos() as conexao:
                conexao.openai.termos_de = lambda linha, corpo=corpo: corpo
                status, resposta = ler(conexao)
            self.assertEqual((status, resposta), (502, {"error": "ai_invalid_response"}))

    def test_o_que_a_ia_gastou_para_responder_mal_tambem_e_custo(self):
        with conexao_dos_termos(openai="resposta_quebrada") as conexao:
            status, _ = ler(conexao)
            registros = registros_de_custo(conexao)
        self.assertEqual(status, 502)
        self.assertEqual([r["type"] for r in registros], ["terms_tokens"])


class AIaForaDoAr(unittest.TestCase):
    def test_cada_recusa_da_openai_responde_o_codigo_dela(self):
        for comportamento, codigo in ERROS_DA_CHAVE.items():
            with self.subTest(comportamento), conexao_dos_termos(openai=comportamento) as conexao:
                status, resposta = ler(conexao)
                custos = registros_de_custo(conexao)
            self.assertEqual((status, resposta, custos), (502, {"error": codigo}, []))

    def test_o_corpo_do_erro_da_openai_e_lido_so_para_escolher_o_codigo_e_nunca_volta_nem_vai_ao_log(self):
        for comportamento in ERROS_DA_CHAVE:
            with self.subTest(comportamento), conexao_dos_termos(openai=comportamento) as conexao:
                status, _, bruto = conexao.pedir("POST", "/ia/termos", corpo={"lang": "en", "texto": LINHA})
                log = conexao.log()
                guardado = json.dumps([registros_de_custo(conexao), os.listdir(conexao.dados.logs)])
            self.assertEqual(status, 502)
            for onde, texto in (("a resposta", bruto.decode("utf-8")), ("o log", log), ("o que ficou guardado", guardado)):
                self.assertNotIn(CHAVE, texto, onde)
                self.assertNotIn("Incorrect API key", texto, onde)

    def test_a_chave_que_a_openai_repete_no_corpo_do_erro_nao_aparece_em_nenhum_arquivo_da_conexao(self):
        with conexao_dos_termos(openai="recusa") as conexao:
            ler(conexao)
            achados = []
            for pasta, _, nomes in os.walk(conexao.pasta):
                for nome in nomes:
                    caminho = os.path.join(pasta, nome)
                    if os.path.relpath(caminho, conexao.pasta) == os.path.join("chaves", "openai.json"):
                        continue
                    with open(caminho, "rb") as arquivo:
                        if CHAVE.encode("utf-8") in arquivo.read():
                            achados.append(os.path.relpath(caminho, conexao.pasta))
        self.assertEqual(achados, [])


class OPedidoMalFeito(unittest.TestCase):
    def test_o_pedido_que_nao_tem_idioma_ou_linha_que_sirva_e_recusado_sem_chamar_a_ia(self):
        recusados = [
            {}, {"lang": "en"}, {"texto": LINHA}, {"lang": "fr", "texto": LINHA}, {"lang": ["en"], "texto": LINHA},
            {"lang": "en", "texto": ""}, {"lang": "en", "texto": "   "}, {"lang": "en", "texto": 7}, {"lang": "en", "texto": "a" * 501},
            {"lang": "en", "texto": "!!! ???"},
        ]
        with conexao_dos_termos() as conexao:
            for corpo in recusados:
                with self.subTest(corpo):
                    status, _, resposta = conexao.pedir("POST", "/ia/termos", corpo=corpo)
                    self.assertEqual((status, json.loads(resposta)), (400, {"error": "invalid_request"}))
            self.assertEqual(conexao.openai.pedidos, [])

    def test_a_linha_nao_vai_ao_log(self):
        with conexao_dos_termos(openai="fora_do_ar") as conexao:
            ler(conexao)
            log = conexao.log()
        self.assertNotIn(LINHA, log)


class OCustoDosTermos(unittest.TestCase):
    def test_o_custo_pela_chave_aparece_nos_custos_do_mes_e_no_gasto_do_teto(self):
        with conexao_dos_termos() as conexao:
            ler(conexao)
            [linha] = custos_do_mes(conexao)
            gasto = conexao.conexao.teto.gasto()
            registros = registros_de_custo(conexao)
        esperado = round((300 * 0.15 + 60 * 0.6) / 1_000_000, 6)
        self.assertEqual([(r["type"], r["model"], r["input_tokens"], r["output_tokens"], r["cost_usd"]) for r in registros],
                         [("terms_tokens", termos_da_linha.MODELO_DA_CHAVE, 300, 60, esperado)])
        self.assertEqual(linha["costs"]["totalUsd"], esperado)
        self.assertEqual((linha["costs"]["otherUsd"], linha["lang"], linha["successfulCards"]), (esperado, "en", 0))
        self.assertEqual(gasto, esperado)

    def test_cada_chamada_soma_e_o_idioma_tem_a_linha_dele(self):
        with conexao_dos_termos() as conexao:
            ler(conexao)
            ler(conexao, "That's lit")
            ler(conexao, "Я не мальчик!", lang="ru")
            linhas = {linha["lang"]: linha["costs"]["totalUsd"] for linha in custos_do_mes(conexao)}
            gasto = conexao.conexao.teto.gasto()
        por_chamada = round((300 * 0.15 + 60 * 0.6) / 1_000_000, 6)
        self.assertEqual(linhas, {"en": round(2 * por_chamada, 6), "ru": por_chamada})
        self.assertEqual(gasto, round(3 * por_chamada, 6))

    def test_o_gasto_dos_termos_pode_levar_o_mes_ao_teto(self):
        with conexao_dos_termos(teto=0.01) as conexao:
            conexao.openai.uso_dos_termos = (100_000, 50_000)
            antes = conexao.conexao.teto.chegou()
            ler(conexao)
            depois = conexao.conexao.teto.chegou()
        self.assertEqual((antes, depois), (False, True))

    def test_o_que_o_plano_paga_custa_zero_e_guarda_o_que_a_chave_cobraria(self):
        with conexao_dos_termos(chatgpt="conectada") as conexao:
            ler(conexao)
            [linha] = custos_do_mes(conexao)
            gasto = conexao.conexao.teto.gasto()
            [registro] = registros_de_custo(conexao)
        cobraria = round((1000 * 0.15 + 200 * 0.6) / 1_000_000, 6)
        self.assertEqual((registro["type"], registro["model"], registro["cost_usd"], registro["would_cost_usd"]), ("terms_tokens", "gpt-6-luna", 0.0, cobraria))
        self.assertEqual((linha["costs"]["totalUsd"], gasto), (0.0, 0.0))

    def test_o_custo_do_mes_nao_vira_um_envio_na_lista_de_envios(self):
        with conexao_dos_termos() as conexao:
            ler(conexao)
            lista = json.loads(conexao.pedir("POST", "/jobs/list", corpo={})[2])["jobs"]
        self.assertEqual(lista, [])


if __name__ == "__main__":
    unittest.main()
