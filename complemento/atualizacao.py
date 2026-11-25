import json
import os
import threading

INTERVALO_S = 6 * 60 * 60
ESPERA_INICIAL_S = 20
ARQUIVO_DE_QUEM_DESLIGOU = "sem-atualizacao-automatica"


def _numeros(versao):
    try:
        return tuple(int(parte) for parte in str(versao).split("."))
    except ValueError:
        return ()


class AnkiWebAusente:
    def id(self):
        return None

    def pronto(self):
        return False

    def fechar_o_anki(self):
        return False


class RegistroDaAtualizacao:
    def __init__(self, arquivo, versao, logger):
        self.arquivo, self.versao, self.logger = arquivo, versao, logger

    def ler(self):
        try:
            with open(self.arquivo, encoding="utf-8") as lido:
                guardado = json.load(lido)
            return guardado if isinstance(guardado, dict) else {}
        except (OSError, ValueError):
            return {}

    def guardar(self, **mudancas):
        guardado = {"rodava": self.versao, **self.ler(), **mudancas}
        try:
            os.makedirs(os.path.dirname(self.arquivo), exist_ok=True)
            provisorio = self.arquivo + ".novo.%d" % threading.get_ident()
            with open(provisorio, "w", encoding="utf-8") as escrito:
                json.dump(guardado, escrito)
            os.replace(provisorio, self.arquivo)
        except OSError as erro:
            self.logger.warning("A atualização não guardou o que fez: %s", erro)

    def anotar_a_subida(self):
        guardado = self.ler()
        antes = guardado.get("rodava")
        if antes is None or antes == self.versao:
            return
        self.guardar(rodava=self.versao, atualizada=self.versao)

    def estado(self):
        guardado = self.ler()
        no_disco = guardado.get("instalada")
        atualizada = guardado.get("atualizada") if guardado.get("atualizada") == self.versao else None
        if no_disco and _numeros(no_disco) > _numeros(self.versao):
            return {"estado": "instalada", "versao": no_disco, "atualizada": atualizada}
        if guardado.get("falha"):
            return {"estado": "falhou", "versao": self.versao, "atualizada": atualizada}
        return {"estado": "em_dia", "versao": self.versao, "atualizada": atualizada}


class Atualizacao:
    def __init__(self, *, registro, anki_web, logger, ligada=False):
        self.registro, self.anki_web, self.logger = registro, anki_web, logger
        self.ligada = ligada
        self._trava = threading.Lock()
        self._parar = threading.Event()
        self._thread = None
        self.registro.anotar_a_subida()

    def estado(self):
        return self.registro.estado()

    def ajustar_a_marca(self):
        try:
            pode = self.ligada and self.anki_web.id() is not None and self.anki_web.pronto()
            if pode and not self.registro.ler().get("marcou"):
                self.anki_web.marcar(True)
                self.registro.guardar(marcou=True)
            elif not pode and self.registro.ler().get("marcou"):
                self.anki_web.marcar(False)
                self.registro.guardar(marcou=False)
        except Exception:
            self.logger.exception("A marca da atualização automática não foi ajustada")

    def verificar(self, *, a_pedido=False):
        with self._trava:
            if not (a_pedido or self.ligada):
                return self.estado()
            try:
                self._consultar_e_instalar(a_pedido)
            except Exception:
                self.logger.exception("A atualização da Conexão falhou")
                self.registro.guardar(falha=True)
            return self.estado()

    def _consultar_e_instalar(self, a_pedido):
        id_ = self.anki_web.id()
        if id_ is None:
            return
        self.ajustar_a_marca()
        if not self.anki_web.pronto():
            self.logger.warning("As funções do Anki que a atualização usa mudaram: fica o diálogo do Anki")
            self.registro.guardar(falha=True)
            return
        if not self.anki_web.ha_versao_nova(id_):
            self.registro.guardar(falha=None)
            return
        if not self.anki_web.instalar(id_):
            self.logger.warning("O AnkiWeb não entregou a versão nova")
            self.registro.guardar(falha=True)
            return
        instalada = self.anki_web.versao_instalada()
        if self.ligada:
            self.anki_web.marcar(True)
        self.registro.guardar(falha=None, instalada=instalada)
        self.logger.info("A Conexão %s ficou instalada; vale na próxima vez que o Anki abrir", instalada)

    def na_saude(self):
        estado = self.estado()
        return estado if estado["estado"] in ("instalada", "falhou") or estado["atualizada"] else None

    def fechar_o_anki(self):
        try:
            return bool(self.anki_web.fechar_o_anki())
        except Exception:
            self.logger.exception("O Anki não entregou o pedido de fechar")
            return False

    def iniciar(self, intervalo_s=INTERVALO_S, espera_inicial_s=ESPERA_INICIAL_S):
        self.ajustar_a_marca()
        if not self.ligada:
            return

        def girar():
            if self._parar.wait(espera_inicial_s):
                return
            while True:
                self.verificar()
                if self._parar.wait(intervalo_s):
                    return

        self._thread = threading.Thread(target=girar, name="perpetualminer-atualizacao", daemon=True)
        self._thread.start()

    def parar(self):
        self._parar.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None
