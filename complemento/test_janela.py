"""A janela do item “PerpetualMiner…” em Ferramentas e os avisos do Envio (#175), sem o Qt.

O que o teste confere é o que a pessoa lê: o estado que a janela mostra, o rótulo do item e os avisos, lidos do que a Conexão
guardou (o Envio de verdade, com a thread de trabalho, a coleção em memória e a OpenAI de mentira). O Qt fica atrás de uma
fronteira pequena (`janela.ligar`), que aqui é um Qt de mentira; a janela de verdade num Anki de verdade é o ensaio do dono.

    python3.9 complemento/test_janela.py
"""

import json
import os
import re
import socket
import sys
import tempfile
import threading
import time
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import configuracao, janela, no_anki, registro, texto_da_janela  # noqa: E402
from complemento.test_colecao_em_memoria import ColecaoEmMemoria  # noqa: E402
from complemento.test_envio import CHAVE, ID, INGLES, EnvioNoTeste, pedido  # noqa: E402
from complemento.test_no_anki import AnkiDeMentira  # noqa: E402

PALAVRAS = ["give up", "run", "carry", "bring", "hold", "keep", "look", "make", "pick", "put", "set", "take"]
DOZE = ["%s : They %s it again" % (palavra, palavra) for palavra in PALAVRAS]
OUTRO_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa"


class ColecaoQueSegura(ColecaoEmMemoria):
    """Grava `ate` Cartões e segura o seguinte até `liberar()`: o Envio fica no meio, com o estado que a janela lê.

    `segurando` só vale a partir de quando o Cartão seguinte já está na etapa de gravar (a etapa muda antes de chegar aqui)."""

    def __init__(self, descricao, ate):
        super().__init__(descricao)
        self.ate, self._solta, self.segurando = ate, threading.Event(), threading.Event()

    def liberar(self):
        self._solta.set()

    def gravar_cartao(self, *argumentos):
        if len(self.gravadas) >= self.ate:
            self.segurando.set()
            self._solta.wait(15)
        return super().gravar_cartao(*argumentos)


def a_janela(conexao, perfil="Usuário 1", versao=configuracao.VERSAO):
    return janela.Janela(conexao.conexao, lambda: perfil, versao, conexao.logger)


def esperar(condicao, limite=15):
    fim = time.monotonic() + limite
    while time.monotonic() < fim:
        valor = condicao()
        if valor:
            return valor
        time.sleep(0.02)
    raise AssertionError("não chegou lá a tempo")


def tudo_o_que_a_pessoa_le(estado, rotulo, avisos):
    """Todo texto que a janela, o item e os avisos mostram, num texto só (para conferir o que nunca aparece)."""
    return "\n".join([repr(estado), rotulo] + list(avisos))


class AJanelaDiz(unittest.TestCase):
    def test_a_conexao_ligada_a_versao_e_o_perfil_e_que_nao_ha_envio_nem_erro_ainda(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            estado = a_janela(conexao).estado()
        self.assertEqual(
            (estado.conexao, estado.versao, estado.perfil, estado.envio, estado.ultimo_erro),
            ("Ligada", configuracao.VERSAO, "Usuário 1", None, None),
        )

    def test_sem_perfil_aberto_a_janela_diz_nenhum_perfil_aberto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            estado = a_janela(conexao, perfil=None).estado()
        self.assertEqual(estado.perfil, "Nenhum perfil aberto")

    def test_um_perfil_ilegivel_nao_derruba_a_janela(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False, falha_no_perfil=True) as conexao:
            estado = janela.Janela(conexao.conexao, conexao._ler_o_perfil, configuracao.VERSAO, conexao.logger).estado()
        self.assertEqual((estado.conexao, estado.perfil), ("Ligada", "Nenhum perfil aberto"))

    def test_a_conexao_que_nao_subiu_aparece_desligada_com_onde_achar_o_motivo(self):
        estado = janela.Janela(None, lambda: "Usuário 1", configuracao.VERSAO, registro.silencioso()).estado()
        self.assertEqual(
            (estado.conexao, estado.envio, estado.ultimo_erro),
            ("Desligada. O motivo está no registro da pasta user_files (Ferramentas › Complementos › Ver arquivos).", None, None),
        )

    def test_o_envio_no_meio_mostra_7_de_12_a_etapa_a_fracao_e_o_baralho_sem_o_separador_do_anki(self):
        colecao = ColecaoQueSegura({"baralhos": []}, ate=7)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, *DOZE, baralho="Inglês::Mineradas"))
            a = a_janela(conexao)
            self.assertTrue(colecao.segurando.wait(15))
            envio = a.estado().envio
            colecao.liberar()
            conexao.esperar(ID)
        self.assertEqual(
            (envio.progresso, envio.etapa, envio.feitos, envio.total, envio.baralho),
            ("7 de 12 cartões", "Enviando ao Anki", 7, 12, "Inglês › Mineradas"),
        )

    def test_o_envio_terminado_mostra_concluido_e_nenhum_erro(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking", "run : They run"))
            conexao.esperar(ID)
            estado = a_janela(conexao).estado()
        self.assertEqual((estado.envio.progresso, estado.envio.etapa, estado.envio.baralho, estado.ultimo_erro), ("2 de 2 cartões", "Concluído", "Inglês", None))

    def test_com_o_perfil_fechado_o_envio_aparece_esperando_o_anki(self):
        colecao = ColecaoEmMemoria(INGLES)
        colecao.fechar()
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID, lambda estado: estado["stage"] == "wait_anki")
            envio = a_janela(conexao).estado().envio
            colecao.abrir()
            conexao.esperar(ID)
        self.assertEqual((envio.progresso, envio.etapa), ("0 de 1 cartão", "Esperando o Anki"))

    def test_o_envio_que_falhou_aparece_como_ultimo_erro_com_o_codigo_e_quantos_cartoes_nao_entraram(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking", "run : They run"))
            conexao.esperar(ID)
            estado = a_janela(conexao).estado()
        self.assertEqual((estado.envio.etapa, estado.ultimo_erro), ("Não concluído", "2 cartões não entraram no Baralho Inglês · openai_key_missing"))

    def test_o_ultimo_erro_so_conta_o_envio_mais_recente_que_terminou(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            with open(os.path.join(conexao.chaves, "openai.json"), "w", encoding="utf-8") as arquivo:
                json.dump({"chave": CHAVE, "conta": "", "versao": 1, "em": 1, "naoEnviada": True}, arquivo)
            conexao.criar(pedido(OUTRO_ID, "run : They run"))
            conexao.esperar(OUTRO_ID)
            estado = a_janela(conexao).estado()
        self.assertEqual((estado.envio.etapa, estado.ultimo_erro), ("Concluído", None))

    def test_a_chave_nunca_aparece_no_que_a_pessoa_le_nem_com_o_envio_em_parte(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            a = a_janela(conexao)
            a.passo()
            conexao.criar(pedido(ID, "give up : She gave up smoking", "run : They run"))
            conexao.esperar(ID)
            rotulo, avisos = a.passo()
            lido = tudo_o_que_a_pessoa_le(a.estado(), rotulo, avisos)
        self.assertIn("openai_rate_limited", lido)
        self.assertNotIn(CHAVE, lido)
        self.assertNotIn("sk-", lido)


class OsAvisosEORotuloDoItem(unittest.TestCase):
    def test_aviso_no_comeco_e_no_fim_do_envio_e_o_rotulo_com_a_contagem_so_enquanto_envia(self):
        colecao = ColecaoQueSegura({"baralhos": []}, ate=7)
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            a = a_janela(conexao)
            antes = a.passo()
            conexao.criar(pedido(ID, *DOZE))
            esperar(lambda: a.estado().envio and a.estado().envio.feitos == 7)
            no_meio = a.passo()
            de_novo = a.passo()
            colecao.liberar()
            conexao.esperar(ID)
            fim = a.passo()
            depois = a.passo()
        self.assertEqual(antes, ("PerpetualMiner…", []))
        self.assertEqual(no_meio, ("PerpetualMiner · 7 de 12", ["Enviando 12 cartões ao Baralho Inglês"]))
        self.assertEqual(de_novo, ("PerpetualMiner · 7 de 12", []))
        self.assertEqual(fim, ("PerpetualMiner…", ["12 cartões enviados ao Baralho Inglês"]))
        self.assertEqual(depois, ("PerpetualMiner…", []))

    def test_o_envio_que_comeca_e_termina_entre_dois_passos_ganha_so_o_aviso_do_fim(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            a = a_janela(conexao)
            a.passo()
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            passo = a.passo()
        self.assertEqual(passo, ("PerpetualMiner…", ["1 cartão enviado ao Baralho Inglês"]))

    def test_o_envio_que_ja_tinha_terminado_antes_de_o_anki_abrir_nao_ganha_aviso(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            primeiro = a_janela(conexao).passo()
        self.assertEqual(primeiro, ("PerpetualMiner…", []))

    def test_o_envio_em_parte_diz_quantos_entraram_e_quantos_nao(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            conexao.openai.recusar_o_chat_de("run", 429, "rate_limit_exceeded")
            a = a_janela(conexao)
            a.passo()
            conexao.criar(pedido(ID, "give up : She gave up smoking", "run : They run"))
            conexao.esperar(ID)
            _, avisos = a.passo()
        self.assertEqual(avisos, ["1 cartão enviado ao Baralho Inglês · 1 não entrou"])

    def test_a_frase_que_ja_estava_no_baralho_aparece_como_ja_estava_la(self):
        colecao = ColecaoEmMemoria({"baralhos": [{"nome": "Inglês", "notas": [{"frente": "She <b>gave up</b> smoking", "verso": "x"}]}]})
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, colecao=colecao) as conexao:
            a = a_janela(conexao)
            a.passo()
            conexao.criar(pedido(ID, "gave up : She gave up smoking", "run : They run"))
            conexao.esperar(ID)
            _, avisos = a.passo()
        self.assertEqual(avisos, ["1 cartão enviado ao Baralho Inglês · 1 já estava lá"])

    def test_o_envio_que_nao_fez_nenhum_cartao_diz_que_nao_terminou(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, chave=None) as conexao:
            a = a_janela(conexao)
            a.passo()
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            _, avisos = a.passo()
        self.assertEqual(avisos, ["O Envio ao Baralho Inglês não terminou"])


class QtDeMentira:
    """A fronteira com o Qt do Anki (`janela.ligar`): o que o complemento pede a ele, anotado."""

    def __init__(self):
        self.itens, self.configuracoes, self.avisos, self.janelas, self.tique = [], {}, [], [], None
        self.desconectar = None
        self.codigos, self.fechados = [], 0   # o diálogo do código do pareamento (#192): (texto, rótulo de cancelar, ao_cancelar)

    def item_do_menu(self, mw, texto, ao_clicar):
        item = types.SimpleNamespace(texto=texto, clicar=ao_clicar)
        item.mudar_texto = lambda novo: setattr(item, "texto", novo)
        self.itens.append(item)
        return item

    def acao_de_configuracao(self, mw, modulo, ao_clicar):
        self.configuracoes[modulo] = ao_clicar

    def aviso(self, texto):
        self.avisos.append(texto)

    def abrir_janela(self, mw, ler_estado, desconectar=None):
        self.desconectar = desconectar
        self.janelas.append(ler_estado())

    def mostrar_codigo(self, mw, texto, rotulo_de_cancelar, ao_cancelar):
        self.codigos.append((texto, rotulo_de_cancelar, ao_cancelar))

    def fechar_codigo(self, mw):
        self.fechados += 1

    def avisar_de_outra_thread(self, mw, texto):
        self.avisos.append(texto)

    def a_cada(self, mw, segundos, funcao):
        self.tique = funcao


class OItemNoMenuDoAnki(unittest.TestCase):
    def ligado(self, conexao, qt=None, perfil="Usuário 1"):
        qt = qt or QtDeMentira()
        janela.ligar(object(), a_janela(conexao, perfil=perfil), qt, "perpetualminer", conexao.logger)
        return qt

    def test_um_item_so_com_o_nome_do_programa_abre_a_janela_com_o_estado_de_agora(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            qt = self.ligado(conexao)
            qt.itens[0].clicar()
        self.assertEqual([item.texto for item in qt.itens], ["PerpetualMiner…"])
        self.assertEqual((qt.janelas[0].conexao, qt.janelas[0].perfil), ("Ligada", "Usuário 1"))

    def test_o_botao_config_dos_complementos_abre_a_mesma_janela_e_nunca_a_configuracao_em_texto(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            qt = self.ligado(conexao)
            qt.configuracoes["perpetualminer"]()
            qt.itens[0].clicar()
        self.assertEqual(list(qt.configuracoes), ["perpetualminer"])
        self.assertEqual(qt.janelas[0], qt.janelas[1])

    def test_o_tique_muda_o_rotulo_do_item_e_mostra_os_avisos(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta) as conexao:
            qt = self.ligado(conexao)
            qt.tique()
            conexao.criar(pedido(ID, "give up : She gave up smoking"))
            conexao.esperar(ID)
            qt.tique()
        self.assertEqual((qt.itens[0].texto, qt.avisos), ("PerpetualMiner…", ["1 cartão enviado ao Baralho Inglês"]))

    def test_um_erro_ao_ler_o_estado_nunca_sai_para_o_anki_e_vai_ao_registro(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            def estourar():
                raise RuntimeError("a Conexão quebrou")

            conexao.conexao.fila.ordem = estourar
            qt = self.ligado(conexao)
            qt.tique()
            qt.itens[0].clicar()
            qt.configuracoes["perpetualminer"]()
            registro = conexao.log()
        self.assertEqual(len(qt.janelas), 2)
        self.assertEqual(qt.janelas[0].envio, None)
        self.assertIn("a Conexão quebrou", registro)

    def test_o_erro_do_qt_ao_abrir_a_janela_nunca_sai_para_o_anki(self):
        with tempfile.TemporaryDirectory() as pasta, EnvioNoTeste(pasta, trabalhando=False) as conexao:
            qt = QtDeMentira()
            qt.abrir_janela = lambda mw, ler_estado, desconectar=None: (_ for _ in ()).throw(RuntimeError("o Qt mudou"))
            self.ligado(conexao, qt)
            qt.itens[0].clicar()
            registro = conexao.log()
        self.assertIn("o Qt mudou", registro)

    def test_ao_carregar_no_anki_poe_o_item_e_o_config_com_a_conexao_no_ar(self):
        anki = AnkiDeMentira()
        anki.abrir("Usuário 1")
        qt = QtDeMentira()
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(anki, os.path.join(pasta, "perpetualminer"), porta=0, abridor=None, ao_sincronizar=lambda c: None, qt=qt)
            try:
                qt.itens[0].clicar()
            finally:
                conexao.parar()
        self.assertEqual((qt.itens[0].texto, list(qt.configuracoes)), ("PerpetualMiner…", ["perpetualminer"]))
        self.assertEqual((qt.janelas[0].conexao, qt.janelas[0].perfil), ("Ligada", "Usuário 1"))

    def test_ao_carregar_sem_a_conexao_no_ar_ainda_poe_o_item_com_a_janela_desligada(self):
        anki = AnkiDeMentira()
        qt = QtDeMentira()
        with tempfile.TemporaryDirectory() as pasta:
            dono = socket.socket()
            dono.bind(("127.0.0.1", 0))
            dono.listen(1)
            try:
                conexao = no_anki.ao_carregar(
                    anki, os.path.join(pasta, "perpetualminer"), porta=dono.getsockname()[1], abridor=None, ao_sincronizar=lambda c: None, qt=qt)
            finally:
                dono.close()
            qt.itens[0].clicar()
        self.assertIsNone(conexao)
        self.assertTrue(qt.janelas[0].conexao.startswith("Desligada."))

    def test_se_o_anki_mudou_o_menu_a_conexao_sobe_do_mesmo_jeito(self):
        class QtQueQuebra(QtDeMentira):
            def item_do_menu(self, *argumentos):
                raise AttributeError("menuTools sumiu")

        anki = AnkiDeMentira()
        with tempfile.TemporaryDirectory() as pasta:
            conexao = no_anki.ao_carregar(
                anki, os.path.join(pasta, "perpetualminer"), porta=0, abridor=None, ao_sincronizar=lambda c: None, qt=QtQueQuebra())
            try:
                subiu = conexao is not None
            finally:
                if conexao is not None:
                    conexao.parar()
        self.assertTrue(subiu)


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def tabela_da_pagina():
    """Os textos de `docs/design/dentro-do-anki.md`: `ANK-02.progresso` → o modelo da linha da tabela."""
    with open(os.path.join(RAIZ, "docs", "design", "dentro-do-anki.md"), encoding="utf-8") as arquivo:
        linhas = [linha for linha in arquivo.read().split("\n") if linha.startswith("| ANK-")]
    celulas = [[c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", linha)[1:-1]] for linha in linhas]
    return {id_: modelo for id_, modelo, *_ in celulas}


class ACopiaDaJanelaEADaVoz(unittest.TestCase):
    def test_cada_texto_da_janela_e_o_da_pagina_de_desenho_por_id(self):
        tabela = tabela_da_pagina()
        meus = {id_: modelo for id_, modelo in texto_da_janela.TEXTOS.items() if id_.startswith("ANK-")}
        self.assertTrue(meus)
        self.assertEqual(tabela, meus)

    def test_cada_texto_reusado_do_envio_e_o_do_catalogo_da_voz_por_id(self):
        caminho = os.path.join(RAIZ, "docs", "design", "voz", "catalogo-textos.json")
        if not os.path.exists(caminho):
            self.skipTest("o catálogo da Voz não vai no .ankiaddon")
        with open(caminho, encoding="utf-8") as arquivo:
            retrato = json.load(arquivo)
        reusados = {id_: modelo for id_, modelo in texto_da_janela.TEXTOS.items() if not id_.startswith("ANK-")}
        self.assertTrue(reusados)
        self.assertEqual({id_: retrato.get(id_) for id_ in reusados}, reusados)

    def test_o_catalogo_enche_os_valores_como_a_extensao_numeros_em_pt_br_e_singular_e_plural(self):
        self.assertEqual(texto_da_janela.texto("ANK-03.terminou", n=1, baralho="X"), "1 cartão enviado ao Baralho X")
        self.assertEqual(texto_da_janela.texto("ANK-03.terminou", n=1284, baralho="X"), "1.284 cartões enviados ao Baralho X")
        with self.assertRaises(KeyError):
            texto_da_janela.texto("ANK-03.terminou", n=2)


if __name__ == "__main__":
    unittest.main()
