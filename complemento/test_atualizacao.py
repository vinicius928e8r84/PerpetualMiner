"""A atualização em silêncio pelo AnkiWeb (#177): a consulta pelo id, a instalação, a marca e o que acontece quando o Anki muda por dentro.

O AnkiWeb é de mentira (`AnkiWebDeMentira`): nada sai da máquina, e o teste confere o que a Conexão perguntou e o que ela instalou.

    python3.9 complemento/test_atualizacao.py
"""

import json
import logging
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import atualizacao, configuracao  # noqa: E402


class AnkiWebDeMentira:
    """O AnkiWeb e o gerente de complementos do Anki, por trás da fronteira `atualizacao_do_anki.AnkiWebDoAnki`: guarda o que lhe perguntaram,
    o que instalaram e a marca (`update_enabled`) como o `meta.json` do Anki a guarda."""

    def __init__(self, id_=12345678, versao_no_ankiweb="0.9.0", pronto=True):
        self.id_, self.versao_no_ankiweb, self._pronto = id_, versao_no_ankiweb, pronto
        self.consultas, self.instalacoes, self.fechamentos = [], [], 0
        self.update_enabled = True      # o padrão do Anki: ele mostra o diálogo
        self.tem_versao_nova = True
        self.instalar_funciona = True
        self.consulta_quebra = False
        self.instalado = None

    def id(self):
        return self.id_

    def pronto(self):
        return self._pronto

    def ha_versao_nova(self, id_):
        self.consultas.append(id_)
        if self.consulta_quebra:
            raise OSError("sem rede")
        return self.tem_versao_nova

    def instalar(self, id_):
        self.instalacoes.append(id_)
        if self.instalar_funciona:
            self.instalado = self.versao_no_ankiweb
        # a instalação do Anki grava o meta.json de antes, com o `update_enabled` que estava: a marca sobrevive
        return self.instalar_funciona

    def versao_instalada(self):
        return self.instalado

    def marcar(self, sem_dialogo):
        self.update_enabled = not sem_dialogo

    def fechar_o_anki(self):
        self.fechamentos += 1
        return True


def montar(pasta, anki_web=None, versao="0.4.5", ligada=True):
    anki_web = anki_web or AnkiWebDeMentira()
    return atualizacao.Atualizacao(
        arquivo=os.path.join(pasta, "atualizacao.json"), anki_web=anki_web, versao=versao, ligada=ligada,
        logger=logging.getLogger("teste-da-atualizacao"),
    ), anki_web


# A atualização na MATRIZ do `test_servidor.py`: não lê a coleção nem o perfil; sem o Anki dentro, "Atualizar agora" não tem de onde atualizar e "Reiniciar" não é entregue.
MATRIZ_DA_ATUALIZACAO = {
    ("POST", "/atualizacao/agora"): {"corpo": {}, "muda": True, "le_a_colecao": False, "le_o_perfil": False, "recusas": []},
    ("POST", "/atualizacao/reiniciar"): {"corpo": {}, "le_a_colecao": False, "le_o_perfil": False, "recusas": [], "status": 503},
}


def atualizacao_do_exemplo(pasta, guardado, ankiweb, logger):
    """A atualização no contexto de um exemplo do contrato (`atualizacao` e `ankiweb`): `guardado` é o que ficou da última vez (`instalada`, `falhou`,
    `atualizada`) e `ankiweb`, como o AnkiWeb de mentira responde (`com_versao_nova`, `sem_versao_nova`, `recusa`); sem os dois, None (a Conexão sem o Anki)."""
    if not (guardado or ankiweb):
        return None
    arquivo = os.path.join(pasta, "atualizacao.json")
    antes = {"instalada": {"instalada": "9.9.9", "rodava": configuracao.VERSAO}, "falhou": {"falha": True}, "atualizada": {"rodava": "0.0.1"}}.get(guardado)
    if antes:
        with open(arquivo, "w", encoding="utf-8") as escrito:
            json.dump(antes, escrito)
    anki_web = AnkiWebDeMentira(versao_no_ankiweb="9.9.9") if ankiweb else atualizacao.AnkiWebAusente()
    anki_web.tem_versao_nova = ankiweb != "sem_versao_nova"
    anki_web.instalar_funciona = ankiweb != "recusa"
    return atualizacao.Atualizacao(arquivo=arquivo, anki_web=anki_web, versao=configuracao.VERSAO, logger=logger)


class AtualizacaoEmSilencio(unittest.TestCase):
    def setUp(self):
        self._pasta = tempfile.TemporaryDirectory()
        self.pasta = self._pasta.name
        self.addCleanup(self._pasta.cleanup)
        logging.getLogger("teste-da-atualizacao").addHandler(logging.NullHandler())

    def test_consulta_o_ankiweb_pelo_proprio_id_e_instala_a_versao_nova_sem_perguntar(self):
        conexao, ankiweb = montar(self.pasta)
        estado = conexao.verificar()
        self.assertEqual(ankiweb.consultas, [12345678])
        self.assertEqual(ankiweb.instalacoes, [12345678])
        self.assertEqual(estado, {"estado": "instalada", "versao": "0.9.0", "atualizada": None})

    def test_se_o_ankiweb_nao_tem_versao_nova_nada_e_instalado_e_fica_em_dia(self):
        conexao, ankiweb = montar(self.pasta)
        ankiweb.tem_versao_nova = False
        self.assertEqual(conexao.verificar(), {"estado": "em_dia", "versao": "0.4.5", "atualizada": None})
        self.assertEqual(ankiweb.instalacoes, [])

    def test_ela_se_marca_com_a_atualizacao_automatica_do_anki_desligada(self):
        conexao, ankiweb = montar(self.pasta)
        conexao.ajustar_a_marca()
        self.assertFalse(ankiweb.update_enabled)

    def test_depois_de_instalar_a_marca_continua_la(self):
        conexao, ankiweb = montar(self.pasta)
        conexao.ajustar_a_marca()
        ankiweb.update_enabled = True  # uma instalação que regravou o meta.json
        conexao.verificar()
        self.assertFalse(ankiweb.update_enabled)

    def test_subir_pela_primeira_vez_sem_nada_guardado_nao_cria_arquivo_nenhum(self):
        montar(self.pasta)
        self.assertEqual(os.listdir(self.pasta), [])

    def test_a_versao_nova_vale_so_na_proxima_vez_e_depois_disso_o_estado_e_atualizada(self):
        conexao, _ = montar(self.pasta)
        conexao.verificar()
        # o Anki abre de novo: a Conexão que sobe já é a nova
        depois, _ = montar(self.pasta, versao="0.9.0")
        self.assertEqual(depois.estado(), {"estado": "em_dia", "versao": "0.9.0", "atualizada": "0.9.0"})
        self.assertEqual(depois.na_saude(), {"estado": "em_dia", "versao": "0.9.0", "atualizada": "0.9.0"})

    def test_a_saude_nao_diz_nada_enquanto_esta_em_dia(self):
        conexao, ankiweb = montar(self.pasta)
        ankiweb.tem_versao_nova = False
        conexao.verificar()
        self.assertIsNone(conexao.na_saude())

    def test_uma_consulta_que_quebra_vira_falhou_e_a_conexao_segue_na_versao_de_agora(self):
        conexao, ankiweb = montar(self.pasta)
        ankiweb.consulta_quebra = True
        self.assertEqual(conexao.verificar(), {"estado": "falhou", "versao": "0.4.5", "atualizada": None})
        self.assertEqual(ankiweb.instalacoes, [])

    def test_uma_instalacao_que_nao_deu_certo_vira_falhou_e_tentar_de_novo_resolve(self):
        conexao, ankiweb = montar(self.pasta)
        ankiweb.instalar_funciona = False
        self.assertEqual(conexao.verificar(a_pedido=True)["estado"], "falhou")
        ankiweb.instalar_funciona = True
        self.assertEqual(conexao.verificar(a_pedido=True), {"estado": "instalada", "versao": "0.9.0", "atualizada": None})

    def test_se_o_anki_mudou_as_funcoes_internas_nada_e_usado_e_a_marca_e_desfeita(self):
        conexao, ankiweb = montar(self.pasta)
        conexao.ajustar_a_marca()
        self.assertFalse(ankiweb.update_enabled)
        ankiweb._pronto = False  # o Anki novo mudou o que a Conexão lia
        conexao.ajustar_a_marca()
        self.assertTrue(ankiweb.update_enabled, "o diálogo do Anki tem de voltar")
        self.assertEqual(conexao.verificar()["estado"], "falhou")
        self.assertEqual((ankiweb.consultas, ankiweb.instalacoes), ([], []))

    def test_a_atualizacao_automatica_vem_ligada_por_padrao(self):
        self.assertTrue(configuracao.ATUALIZACAO_AUTOMATICA)

    def test_desligada_nao_consulta_nem_se_marca_sozinha(self):
        conexao, ankiweb = montar(self.pasta, ligada=False)
        conexao.iniciar(espera_inicial_s=0)
        self.assertEqual(conexao.verificar()["estado"], "em_dia")
        self.assertEqual((ankiweb.consultas, ankiweb.instalacoes, ankiweb.update_enabled), ([], [], True))

    def test_desligada_o_atualizar_agora_da_pessoa_ainda_consulta_e_instala_sem_se_marcar(self):
        conexao, ankiweb = montar(self.pasta, ligada=False)
        self.assertEqual(conexao.verificar(a_pedido=True)["estado"], "instalada")
        self.assertEqual(ankiweb.instalacoes, [12345678])
        self.assertTrue(ankiweb.update_enabled)

    def test_ligar_depois_de_desligada_desfaz_a_marca_de_quando_estava_ligada(self):
        conexao, ankiweb = montar(self.pasta)
        conexao.ajustar_a_marca()
        desligada, _ = montar(self.pasta, ankiweb, ligada=False)
        desligada.ajustar_a_marca()
        self.assertTrue(ankiweb.update_enabled)

    def test_instalada_por_arquivo_sem_id_do_ankiweb_nao_ha_de_onde_atualizar(self):
        conexao, ankiweb = montar(self.pasta, AnkiWebDeMentira(id_=None))
        conexao.ajustar_a_marca()
        self.assertEqual(conexao.verificar(a_pedido=True)["estado"], "em_dia")
        self.assertEqual((ankiweb.consultas, ankiweb.update_enabled), ([], True))

    def test_a_consulta_se_repete_a_cada_intervalo_na_thread_da_atualizacao(self):
        conexao, ankiweb = montar(self.pasta)
        ankiweb.tem_versao_nova = False
        conexao.iniciar(intervalo_s=0.01, espera_inicial_s=0)
        for _ in range(200):
            if len(ankiweb.consultas) >= 3:
                break
            time.sleep(0.01)
        conexao.parar()
        self.assertGreaterEqual(len(ankiweb.consultas), 3)

    def test_reiniciar_fecha_o_anki_pela_fronteira(self):
        conexao, ankiweb = montar(self.pasta)
        self.assertTrue(conexao.fechar_o_anki())
        self.assertEqual(ankiweb.fechamentos, 1)

    def test_um_arquivo_de_estado_ilegivel_nao_derruba_nada(self):
        with open(os.path.join(self.pasta, "atualizacao.json"), "w") as arquivo:
            arquivo.write("{ não é json")
        conexao, _ = montar(self.pasta)
        self.assertEqual(conexao.estado()["estado"], "em_dia")
        conexao.verificar(a_pedido=True)
        with open(os.path.join(self.pasta, "atualizacao.json"), encoding="utf-8") as lido:
            self.assertEqual(json.load(lido)["rodava"], "0.4.5")


class _Meta:
    def __init__(self):
        self.update_enabled = True


class _InstalouBem:
    pass


class GerenteDeMentira:
    """O `mw.addonManager` do Anki, com o `meta.json` na memória."""

    def __init__(self):
        self.meta = _Meta()
        self.gravacoes = 0

    def addon_meta(self, nome):
        return self.meta

    def write_addon_meta(self, meta):
        self.gravacoes += 1

    def get_updated_addons(self, informacoes):
        return [informacao for informacao in informacoes if informacao["modified"] > 100]


class AqtAddonsDeMentira:
    """O `aqt.addons` do Anki (lido no código dele): quem pergunta ao AnkiWeb e quem baixa e instala. Guarda o que lhe perguntaram."""

    InstallOk = _InstalouBem

    def __init__(self, modificado=200, resultado=None):
        self.perguntas, self.baixados, self.modificado = [], [], modificado
        self.resultado = resultado or _InstalouBem()

    class HttpClient:
        pass

    def fetch_update_info(self, ids):
        self.perguntas.append(list(ids))
        return [{"id": ids[0], "modified": self.modificado}]

    def download_and_install_addon(self, gerente, cliente, id_):
        self.baixados.append(id_)
        return id_, self.resultado


class PeloAnkiDeMentira(unittest.TestCase):
    """`AnkiWebDoAnki` falando com um `aqt.addons` e um `mw` de mentira: a consulta pelo id, a instalação e a marca."""

    def setUp(self):
        from complemento import atualizacao_do_anki

        self._pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self._pasta.cleanup)
        self.complemento = os.path.join(self._pasta.name, "12345678")
        os.makedirs(self.complemento)
        with open(os.path.join(self.complemento, "configuracao.py"), "w", encoding="utf-8") as escrito:
            escrito.write('"""x"""\n\nVERSAO = "0.9.0"\n')
        self.aqt_addons = AqtAddonsDeMentira()
        modulo = type(sys)("aqt.addons")
        for nome in ("InstallOk", "HttpClient", "fetch_update_info", "download_and_install_addon"):
            setattr(modulo, nome, getattr(self.aqt_addons, nome))
        pacote = type(sys)("aqt")
        pacote.addons = modulo
        self.modulos = {"aqt": pacote, "aqt.addons": modulo}
        self.antes = {nome: sys.modules.get(nome) for nome in self.modulos}
        sys.modules.update(self.modulos)
        self.addCleanup(self._restaurar)
        self.mw = type("MW", (), {})()
        self.mw.addonManager = GerenteDeMentira()
        self.mw.progress = type("P", (), {"single_shot": staticmethod(lambda *a: None)})()
        self.mw.taskman = type("T", (), {"run_on_main": staticmethod(lambda funcao: funcao())})()
        self.mw.close = lambda: None
        self.anki = atualizacao_do_anki.AnkiWebDoAnki(self.mw, self.complemento)

    def _restaurar(self):
        for nome, antes in self.antes.items():
            if antes is None:
                sys.modules.pop(nome, None)
            else:
                sys.modules[nome] = antes

    def test_o_id_e_o_nome_da_pasta_quando_ela_e_so_digitos(self):
        self.assertEqual(self.anki.id(), 12345678)
        self.assertIsNone(atualizacao_do_anki_sem_id(self.mw, self._pasta.name).id())

    def test_pergunta_ao_ankiweb_pelo_proprio_id_e_diz_se_ha_versao_nova(self):
        self.assertTrue(self.anki.ha_versao_nova(12345678))
        self.assertEqual(self.aqt_addons.perguntas, [[12345678]])

    def test_sem_versao_nova_no_ankiweb_diz_que_nao_ha(self):
        self.aqt_addons.modificado = 50
        modulo = sys.modules["aqt.addons"]
        modulo.fetch_update_info = self.aqt_addons.fetch_update_info
        self.assertFalse(self.anki.ha_versao_nova(12345678))

    def test_instala_pelo_download_do_anki_e_le_a_versao_que_ficou_na_pasta(self):
        self.assertTrue(self.anki.instalar(12345678))
        self.assertEqual(self.aqt_addons.baixados, [12345678])
        self.assertEqual(self.anki.versao_instalada(), "0.9.0")

    def test_o_log_aberto_em_user_files_nao_segura_o_backup_do_anki_e_volta_a_gravar_depois(self):
        # No Windows o Anki renomeia `user_files` e o rename falha com o log da Conexão aberto (#370).
        from complemento import registro

        logs = os.path.join(self.complemento, "user_files", "logs")
        os.makedirs(logs)
        logger = registro.criar(logs)
        self.addCleanup(lambda: [logger.removeHandler(h) or h.close() for h in list(logger.handlers)])
        logger.info("antes")
        abertos_na_hora_do_backup = []

        def instalar_como_no_windows(gerente, cliente, id_):
            logger.info("durante o download, como um Envio em curso faria")
            abertos_na_hora_do_backup.extend(h for h in logger.handlers if getattr(h, "stream", None) is not None)
            return id_, self.aqt_addons.resultado

        sys.modules["aqt.addons"].download_and_install_addon = instalar_como_no_windows
        self.assertTrue(self.anki.instalar(12345678))
        self.assertEqual(abertos_na_hora_do_backup, [])
        logger.info("depois")
        with open(os.path.join(logs, "complemento.log"), encoding="utf-8") as lido:
            texto = lido.read()
        self.assertIn("antes", texto)
        self.assertIn("depois", texto)
        self.assertNotIn("durante o download", texto)

    def test_o_log_volta_a_gravar_mesmo_quando_a_instalacao_levanta(self):
        from complemento import registro

        logs = os.path.join(self.complemento, "user_files", "logs")
        os.makedirs(logs)
        logger = registro.criar(logs)
        self.addCleanup(lambda: [logger.removeHandler(h) or h.close() for h in list(logger.handlers)])

        def quebra(*a):
            raise PermissionError("rename")

        sys.modules["aqt.addons"].download_and_install_addon = quebra
        with self.assertRaises(PermissionError):
            self.anki.instalar(12345678)
        logger.info("depois do erro")
        with open(os.path.join(logs, "complemento.log"), encoding="utf-8") as lido:
            self.assertIn("depois do erro", lido.read())

    def test_uma_instalacao_que_o_anki_recusou_nao_conta(self):
        sys.modules["aqt.addons"].download_and_install_addon = lambda *a: (12345678, "erro do Anki")
        self.assertFalse(self.anki.instalar(12345678))

    def test_a_marca_e_o_update_enabled_do_meta_do_anki_e_so_grava_quando_muda(self):
        self.anki.marcar(True)
        self.assertFalse(self.mw.addonManager.meta.update_enabled)
        self.assertEqual(self.mw.addonManager.gravacoes, 1)
        self.anki.marcar(True)
        self.assertEqual(self.mw.addonManager.gravacoes, 1)
        self.anki.marcar(False)
        self.assertTrue(self.mw.addonManager.meta.update_enabled)

    def test_pronto_com_as_funcoes_que_a_conexao_le(self):
        self.assertTrue(self.anki.pronto())

    def test_se_o_anki_renomear_uma_funcao_interna_nao_esta_pronto(self):
        del sys.modules["aqt.addons"].download_and_install_addon
        self.assertFalse(self.anki.pronto())

    def test_se_o_meta_do_anki_perder_o_update_enabled_nao_esta_pronto(self):
        self.mw.addonManager.meta = object()
        self.assertFalse(self.anki.pronto())

    def test_fechar_o_anki_agenda_o_fechamento_pelo_caminho_normal(self):
        agendado = []
        self.mw.progress.single_shot = lambda ms, funcao, exige_colecao: agendado.append((ms, funcao, exige_colecao))
        self.assertTrue(self.anki.fechar_o_anki())
        self.assertEqual(agendado, [(500, self.mw.close, False)])


def atualizacao_do_anki_sem_id(mw, pasta):
    from complemento import atualizacao_do_anki

    return atualizacao_do_anki.AnkiWebDoAnki(mw, pasta)


if __name__ == "__main__":
    unittest.main()
