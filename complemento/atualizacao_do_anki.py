import logging
import os
import re
import threading

from .configuracao import NOME_DO_LOGGER

LIMITE_DO_REINICIO_S = 10


class AnkiWebDoAnki:
    def __init__(self, mw, pasta_do_complemento):
        self._mw = mw
        self._pasta = os.path.abspath(pasta_do_complemento)

    def id(self):
        nome = os.path.basename(self._pasta)
        return int(nome) if nome.isdigit() else None

    def _modulo(self):
        import aqt.addons

        return aqt.addons

    def pronto(self):
        try:
            addons = self._modulo()
            gerente = self._mw.addonManager
            meta = gerente.addon_meta(os.path.basename(self._pasta))
            return (
                callable(getattr(addons, "fetch_update_info", None))
                and callable(getattr(addons, "download_and_install_addon", None))
                and hasattr(addons, "HttpClient") and hasattr(addons, "InstallOk")
                and callable(getattr(gerente, "get_updated_addons", None))
                and callable(getattr(gerente, "write_addon_meta", None))
                and hasattr(meta, "update_enabled")
            )
        except Exception:
            return False

    def ha_versao_nova(self, id_):
        addons = self._modulo()
        informacoes = addons.fetch_update_info([id_])
        return bool(self._mw.addonManager.get_updated_addons(informacoes))

    def instalar(self, id_):
        mudos = self._calar_os_logs()
        try:
            addons = self._modulo()
            _, resultado = addons.download_and_install_addon(self._mw.addonManager, addons.HttpClient(), id_)
        finally:
            for handler, filtro in mudos:
                handler.removeFilter(filtro)
        return isinstance(resultado, addons.InstallOk)

    def _calar_os_logs(self):
        raiz = os.path.join(self._pasta, "user_files") + os.sep
        mudos = []
        for handler in list(logging.getLogger(NOME_DO_LOGGER).handlers):
            arquivo = getattr(handler, "baseFilename", None)
            if arquivo and os.path.abspath(arquivo).startswith(raiz):
                filtro = lambda registro: False
                handler.addFilter(filtro)
                handler.close()
                mudos.append((handler, filtro))
        return mudos

    def versao_instalada(self):
        with open(os.path.join(self._pasta, "configuracao.py"), encoding="utf-8") as lido:
            achada = re.search(r'^VERSAO\s*=\s*"([^"]+)"', lido.read(), re.MULTILINE)
        if achada is None:
            raise ValueError("a versão instalada não está em configuracao.py")
        return achada.group(1)

    def marcar(self, sem_dialogo):
        gerente = self._mw.addonManager
        meta = gerente.addon_meta(os.path.basename(self._pasta))
        if meta.update_enabled == (not sem_dialogo):
            return
        meta.update_enabled = not sem_dialogo
        gerente.write_addon_meta(meta)

    def fechar_o_anki(self):
        entregue = threading.Event()

        def fechar():
            self._mw.progress.single_shot(500, self._mw.close, False)
            entregue.set()

        self._mw.taskman.run_on_main(fechar)
        return entregue.wait(LIMITE_DO_REINICIO_S)
