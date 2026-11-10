"""A fronteira da atualização com o Anki de verdade (`atualizacao.py`): o que só existe lá dentro (`aqt.addons`, `mw.addonManager`).

Lido no código do Anki 26.09 (`aqt/addons.py`), sem rodar: `fetch_update_info` e o gerente de complementos dizem se o AnkiWeb tem versão
mais nova (`AddonManager.get_updated_addons`), `download_and_install_addon` baixa e instala sem janela (é o que o diálogo do Anki chama
por baixo), e a marca é o `update_enabled` do `meta.json` (`AddonManager.addon_meta` e `write_addon_meta`). `pronto()` confere que tudo
isso existe antes de qualquer uso: se uma versão do Anki mudar um nome, a Conexão não usa nada e desfaz a marca (`atualizacao.py`).
"""

import logging
import os
import re
import threading

from .configuracao import NOME_DO_LOGGER

LIMITE_DO_REINICIO_S = 10


class AnkiWebDoAnki:
    """`mw` é a janela do Anki; `pasta_do_complemento`, onde esta Conexão está instalada: o nome dela é o id do AnkiWeb, quando é só dígitos."""

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
        addons = self._modulo()
        # O Anki faz o backup de `user_files` renomeando a pasta; no Windows o rename falha com o log aberto (#370).
        # Fechado o stream, o handler reabre o arquivo sozinho na próxima linha (`FileHandler.emit`).
        self._soltar_os_logs()
        _, resultado = addons.download_and_install_addon(self._mw.addonManager, addons.HttpClient(), id_)
        return isinstance(resultado, addons.InstallOk)

    def _soltar_os_logs(self):
        """Fecha o arquivo de cada handler do logger da Conexão que grava dentro de `user_files`."""
        raiz = os.path.join(self._pasta, "user_files") + os.sep
        for handler in list(logging.getLogger(NOME_DO_LOGGER).handlers):
            arquivo = getattr(handler, "baseFilename", None)
            if arquivo and os.path.abspath(arquivo).startswith(raiz):
                handler.close()

    def versao_instalada(self):
        """A `VERSAO` do `configuracao.py` que a instalação acabou de pôr na pasta (a Conexão que roda ainda é a de antes)."""
        with open(os.path.join(self._pasta, "configuracao.py"), encoding="utf-8") as lido:
            achada = re.search(r'^VERSAO\s*=\s*"([^"]+)"', lido.read(), re.MULTILINE)
        if achada is None:
            raise ValueError("a versão instalada não está em configuracao.py")
        return achada.group(1)

    def marcar(self, sem_dialogo):
        """`update_enabled` do Anki: desligado (`sem_dialogo`), o Anki não mostra o diálogo de atualização deste complemento ao abrir."""
        gerente = self._mw.addonManager
        meta = gerente.addon_meta(os.path.basename(self._pasta))
        if meta.update_enabled == (not sem_dialogo):
            return
        meta.update_enabled = not sem_dialogo
        gerente.write_addon_meta(meta)

    def fechar_o_anki(self):
        """Fecha o Anki pelo caminho normal dele (`mw.close`, que salva a coleção), na thread principal. Devolve se o pedido foi entregue."""
        entregue = threading.Event()

        def fechar():
            self._mw.progress.single_shot(500, self._mw.close, False)  # a resposta da Conexão sai antes de a janela fechar
            entregue.set()

        self._mw.taskman.run_on_main(fechar)
        return entregue.wait(LIMITE_DO_REINICIO_S)
