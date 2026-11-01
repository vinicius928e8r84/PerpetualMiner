"""A passagem do Windows do dono (#178), o que ela copia e passa: a chave, os custos, os prompts editados, o perfil, a fila e os Cartões antigos
do “Básico”, com a origem sempre intacta. O mesmo mundo de mentira de `test_passagem.py`.

    python3.9 complemento/test_passagem_cartoes.py
"""

import http.client
import json
import os
import socket
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_conexao_antiga_de_mentira import ConexaoAntigaDeMentira  # noqa: E402
from complemento.test_envio import ID, OUTRO_ID  # noqa: E402
from complemento.test_passagem_de_mentira import (  # noqa: E402
    CHAVE_DO_DONO, LINHA, PROMPT_EDITADO, TERCEIRO_ID, NaPassagem, uma_conexao_de_hoje)


class APassagemCopiaSemMoverNada(unittest.TestCase):
    def passar(self, **argumentos):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        antiga = uma_conexao_de_hoje(pasta.name, **argumentos).__enter__()
        self.addCleanup(antiga.parar)
        antiga.terminar(ID, [10])
        antes = antiga.fotografia()
        nova = NaPassagem(pasta.name, antiga, colecao=ColecaoEmMemoria({"baralhos": []}, perfis=("Usuário 1", "Ingles - Vinicius"), perfil_aberto="Usuário 1"))
        nova.__enter__()
        self.addCleanup(nova.__exit__, None, None, None)
        self.antes, self.antiga, self.nova = antes, antiga, nova.passar()
        return nova

    def test_copia_a_chave_para_o_cofre_daqui_sem_conta_e_sem_subir_para_a_nuvem(self):
        nova = self.passar()
        documento = nova.conexao.cofre.documento("openai")
        self.assertEqual((documento["chave"], documento["conta"], documento["naoEnviada"]), (CHAVE_DO_DONO, "", True))
        self.assertEqual(nova.novo.firestore.pedidos, [], "a Conexão não fala com a nuvem da conta na passagem")

    def test_a_chave_nao_vai_para_o_log_nem_para_a_marca_da_passagem(self):
        nova = self.passar()
        self.assertNotIn(CHAVE_DO_DONO, nova.log())
        with open(os.path.join(nova.conexao.dados.raiz, "passagem.json"), encoding="utf-8") as arquivo:
            marca = arquivo.read()
        self.assertNotIn(CHAVE_DO_DONO, marca)
        self.assertEqual(json.loads(marca)["feita"], True)

    def test_uma_chave_que_o_cofre_ja_tem_nao_e_trocada_pela_de_hoje(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        with uma_conexao_de_hoje(pasta.name) as antiga:
            antiga.terminar(ID, [10])
            with NaPassagem(pasta.name, antiga) as nova:
                nova.conexao.cofre.guardar("openai", "sk-proj-chave-nova-9999", versao=0)
                nova.passar()
                self.assertEqual(nova.conexao.cofre.ler("openai"), "sk-proj-chave-nova-9999")

    def test_copia_o_historico_de_custos_sem_a_palavra_e_ele_aparece_na_aba_custos(self):
        nova = self.passar()
        status, _, resposta = nova.novo.pedir("POST", "/analytics/jobs", corpo={"lang": "all"})
        linhas = {linha["jobId"]: linha for linha in json.loads(resposta)["jobs"]}
        antigo = next(linha for linha in linhas.values() if linha["createdAt"].startswith("2026-01-01"))
        self.assertEqual(status, 200)
        self.assertEqual((antigo["status"], antigo["successfulCards"], antigo["costs"]["cardUsd"], antigo["costs"]["imageJudgeUsd"]), ("completed", 2, 0.0045, 0.0001))
        copiado = [texto for nome, texto in nova.novo.arquivos().items() if nome.startswith("custos") and nome.endswith("costs.jsonl")]
        self.assertEqual(len(copiado), 1)
        self.assertNotIn(b"give up", copiado[0].replace(b"[image_judge]", b""))
        self.assertIn(b"[image_judge]", copiado[0])

    def test_copia_so_os_prompts_editados_e_o_arquivo_do_dono_fica_na_pasta_de_prompts(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engine", "prompts", "ru_card.txt"), encoding="utf-8") as arquivo:
            padrao = arquivo.read()
        with ConexaoAntigaDeMentira(pasta.name, prompts={"en_card.txt": PROMPT_EDITADO, "ru_card.txt": padrao.replace("\n", "\r\n")}) as antiga, \
                NaPassagem(pasta.name, antiga) as nova:
            nova.passar()
            prompts = {n: t for n, t in nova.novo.arquivos().items() if n.startswith("prompts")}
        self.assertEqual(prompts, {os.path.join("prompts", "en_card.txt"): PROMPT_EDITADO.encode("utf-8")})

    def test_nada_e_apagado_nem_mudado_na_origem(self):
        self.passar()
        self.assertEqual(self.antiga.fotografia(), self.antes)

    def test_o_perfil_da_configuracao_de_hoje_vira_o_perfil_marcado_e_so_ele_e_aproveitado(self):
        nova = self.passar()
        self.assertEqual(nova.conexao.perfil_fixo.marcado(), "Ingles - Vinicius")
        self.assertEqual(sorted(n for n in nova.novo.arquivos() if n.startswith(("perfil", "config"))), ["perfil.json"])

    def test_um_perfil_que_o_anki_nao_tem_nao_e_marcado(self):
        pasta = tempfile.TemporaryDirectory()
        self.addCleanup(pasta.cleanup)
        with uma_conexao_de_hoje(pasta.name, perfil="Perfil que sumiu") as antiga, NaPassagem(pasta.name, antiga) as nova:
            antiga.terminar(ID, [10])
            nova.passar()
            self.assertNotEqual(nova.conexao.perfil_fixo.marcado(), "Perfil que sumiu")


class APassagemPassaOsEnvios(unittest.TestCase):
    def test_a_fila_que_nao_comecou_passa_sem_refazer_os_cartoes_prontos_e_o_que_terminou_vira_historico(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            antiga.envio(TERCEIRO_ID, "queued", [(30, "keep : They keep going")], criado="2026-10-01T10:02:00-03:00")
            with NaPassagem(pasta, antiga, trabalhando=False) as nova:
                nova.passar()
                ordem = [item["jobId"] for item in nova.conexao.fila.ordem()]
                pedidos = {i: nova.conexao.fila.pedido(i) for i in ordem}
                estados = {i: nova.conexao.fila.estado(i)["status"] for i in ordem}
        self.assertEqual(estados[OUTRO_ID], "queued")
        self.assertEqual([e["phraseId"] for e in pedidos[OUTRO_ID]["entries"]], [20], "a Frase 21, pronta, não volta")
        self.assertEqual(pedidos[OUTRO_ID]["entries"][0]["line"], "late : She is late")
        self.assertEqual(estados[TERCEIRO_ID], "queued")
        historico = [i for i in pedidos if i not in (ID, OUTRO_ID, TERCEIRO_ID)]
        self.assertEqual(len(historico), 1, "o Envio que terminou antes entra só como histórico")
        self.assertEqual((estados[historico[0]], [e for e in pedidos[historico[0]]["entries"] if "line" in e]), ("completed", []))
        self.assertLess(ordem.index(OUTRO_ID), ordem.index(TERCEIRO_ID))
        self.assertEqual(ordem.index(historico[0]), 0, "o histórico fica antes da fila, que é o que a janela lê por último")

    def test_o_envio_que_a_conexao_de_hoje_ligou_enquanto_se_copiava_tambem_passa(self):
        with tempfile.TemporaryDirectory() as pasta, uma_conexao_de_hoje(pasta) as antiga:
            antiga.terminar(ID, [10])
            with NaPassagem(pasta, antiga, trabalhando=False) as nova:
                from complemento import passagem_das_copias

                original = passagem_das_copias.passar_a_fila
                chamadas = []

                def passar_e_ligar_outro(antiga_, fila):
                    chamadas.append(1)
                    if len(chamadas) == 1:
                        antiga.estado(OUTRO_ID, "running", [21])  # a de hoje ligou o Envio seguinte no meio-tempo
                    return original(antiga_, fila)

                passagem_das_copias.passar_a_fila = passar_e_ligar_outro
                self.addCleanup(setattr, passagem_das_copias, "passar_a_fila", original)
                nova.passar()
                estado = nova.conexao.fila.estado(OUTRO_ID)
        self.assertEqual(estado["status"], "queued")


class OsCartoesDeAntesFicamComoEstao(unittest.TestCase):
    def test_os_cartoes_do_basico_nos_baralhos_cimv_e_russian_ficam_e_os_envios_passados_os_reconhecem_como_duplicata(self):
        antigos = {"baralhos": [
            {"nome": "CIMV", "notas": [{"frente": "She <b>gave up</b> smoking[sound:antigo.mp3]", "verso": "gave up - /x/"}]},
            {"nome": "RUSSIAN", "notas": [{"frente": "Я не мальчик![sound:antigo.mp3]", "verso": "eu não sou menino"}]},
        ]}
        colecao = ColecaoEmMemoria(antigos, perfis=("Usuário 1", "Ingles - Vinicius"), perfil_aberto="Ingles - Vinicius")
        with tempfile.TemporaryDirectory() as pasta, ConexaoAntigaDeMentira(pasta) as antiga:
            antiga.envio(ID, "queued", [(10, LINHA)], baralho="CIMV")
            antiga.envio(OUTRO_ID, "queued", [(20, "Я не мальчик! [Context: Série - Episódio 1]")], lang="ru", baralho="RUSSIAN")
            antes = {baralho: colecao.cartoes_do_baralho(baralho) for baralho in ("CIMV", "RUSSIAN")}
            with NaPassagem(pasta, antiga, colecao=colecao) as nova:
                nova.passar()
                estados = [nova.novo.esperar(id_) for id_ in (ID, OUTRO_ID)]
            depois = {baralho: colecao.cartoes_do_baralho(baralho) for baralho in ("CIMV", "RUSSIAN")}
        self.assertEqual([(e["status"], e["duplicatePhraseIds"]) for e in estados], [("completed", [10]), ("completed", [20])])
        self.assertEqual(colecao.gravadas, [])
        self.assertEqual(depois, antes)
        self.assertEqual(colecao.tipo_de_nota("Básico"), ["Frente", "Verso"])


if __name__ == "__main__":
    unittest.main()
