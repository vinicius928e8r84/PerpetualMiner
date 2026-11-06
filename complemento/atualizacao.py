"""A atualização em silêncio da Conexão com o Anki pelo AnkiWeb (#177).

A Conexão consulta o AnkiWeb pelo próprio id (o nome da pasta dela no Anki, quando o arquivo foi instalado pela página do AnkiWeb) ao
abrir o Anki e a cada 6 h, e instala a versão nova sem perguntar. A versão nova vale na próxima vez que o Anki abrir: o código que
roda agora é o de antes, e `estado()` diz qual versão ficou no disco. Para o Anki não mostrar o diálogo dele, ela se marca com a
atualização automática desligada (`update_enabled`).

**Nunca pior que o diálogo do Anki**: quem fala com o Anki é a fronteira `anki_web` (`atualizacao_do_anki.py`; os testes usam uma de
mentira). Se `anki_web.pronto()` diz que as funções internas do Anki mudaram, a Conexão não consulta, não instala e **desfaz a marca**
que tivesse posto: o diálogo normal do Anki volta. Qualquer erro de consulta ou de instalação vira "falhou" (a Conexão segue na versão
de agora); nada aqui levanta erro.

**Desligada por padrão** (`configuracao.ATUALIZACAO_AUTOMATICA`): os termos do AnkiWeb sobre um complemento que se atualiza sozinho
ainda não foram conferidos pelo dono. Desligada, nada é consultado nem marcado sozinho; "Atualizar agora" (`verificar(a_pedido=True)`),
que é um clique da pessoa, continua valendo.

O que fica em `user_files/atualizacao.json`: `marcou` (a marca é nossa), `instalada` (a versão que ficou no disco), `falha` (a última
tentativa não deu certo) e `rodava` (a versão que rodava na última subida, de onde sai `atualizada`).

`estado()` é o que `POST /atualizacao/agora` responde, e `na_saude()` o que a saúde da Conexão diz à extensão (`GET /health` › `atualizacao`, só havendo o que dizer):
`{ estado: em_dia | instalada | falhou, versao, atualizada }`. `versao` é a que roda, e a do disco em `instalada`;
`atualizada` é a versão que roda quando ela veio de uma atualização (a extensão mostra "Conexão atualizada" uma vez por versão).
"""

import json
import os
import threading
import time

INTERVALO_S = 6 * 60 * 60
# O Anki está abrindo quando a Conexão sobe: a primeira consulta espera um pouco para não disputar a abertura com ele.
ESPERA_INICIAL_S = 20


def _numeros(versao):
    try:
        return tuple(int(parte) for parte in str(versao).split("."))
    except ValueError:
        return ()


class AnkiWebAusente:
    """A fronteira de quem não está dentro do Anki (os testes que não falam de atualização): sem id, nada a consultar, nada a fechar."""

    def id(self):
        return None

    def pronto(self):
        return False

    def fechar_o_anki(self):
        return False


class Atualizacao:
    """A atualização desta Conexão. `anki_web` é a fronteira (ver `atualizacao_do_anki.AnkiWebDoAnki`); `arquivo`, o `atualizacao.json`."""

    def __init__(self, *, arquivo, anki_web, versao, logger, ligada=False, agora=time.time):
        self.arquivo, self.anki_web, self.versao, self.logger = arquivo, anki_web, versao, logger
        self.ligada, self.agora = ligada, agora
        self._trava = threading.Lock()
        self._parar = threading.Event()
        self._thread = None
        self._anotar_a_subida()

    # ─── o que fica guardado ──────────────────────────────────────────────────

    def _ler(self):
        try:
            with open(self.arquivo, encoding="utf-8") as lido:
                guardado = json.load(lido)
            return guardado if isinstance(guardado, dict) else {}
        except (OSError, ValueError):
            return {}

    def _guardar(self, **mudancas):
        guardado = {"rodava": self.versao, **self._ler(), **mudancas}  # a primeira vez que algo é guardado diz também qual versão rodava
        try:
            os.makedirs(os.path.dirname(self.arquivo), exist_ok=True)
            provisorio = self.arquivo + ".novo.%d" % threading.get_ident()
            with open(provisorio, "w", encoding="utf-8") as escrito:
                json.dump(guardado, escrito)
            os.replace(provisorio, self.arquivo)
        except OSError as erro:
            self.logger.warning("A atualização não guardou o que fez: %s", erro)

    def _anotar_a_subida(self):
        """`atualizada` é a versão de agora quando a anterior era outra; a versão de agora vira a que "rodava". Sem nada guardado ainda (nunca
        consultou nem foi pedida), não há o que anotar: o arquivo nasce na primeira consulta."""
        guardado = self._ler()
        antes = guardado.get("rodava")
        if antes is None or antes == self.versao:
            return
        self._guardar(rodava=self.versao, atualizada=self.versao)

    # ─── o que a extensão lê ──────────────────────────────────────────────────

    def estado(self):
        guardado = self._ler()
        no_disco = guardado.get("instalada")
        atualizada = guardado.get("atualizada") if guardado.get("atualizada") == self.versao else None
        if no_disco and _numeros(no_disco) > _numeros(self.versao):
            return {"estado": "instalada", "versao": no_disco, "atualizada": atualizada}
        if guardado.get("falha"):
            return {"estado": "falhou", "versao": self.versao, "atualizada": atualizada}
        return {"estado": "em_dia", "versao": self.versao, "atualizada": atualizada}

    # ─── a marca ──────────────────────────────────────────────────────────────

    def ajustar_a_marca(self):
        """A marca (a atualização automática do Anki desligada) só existe enquanto a Conexão sabe atualizar sozinha: desligada, ou com o
        Anki que mudou as funções internas, ela é desfeita e o diálogo do Anki volta. Nada levanta erro."""
        try:
            pode = self.ligada and self.anki_web.id() is not None and self.anki_web.pronto()
            if pode and not self._ler().get("marcou"):
                self.anki_web.marcar(True)
                self._guardar(marcou=True)
            elif not pode and self._ler().get("marcou"):
                self.anki_web.marcar(False)
                self._guardar(marcou=False)
        except Exception:
            self.logger.exception("A marca da atualização automática não foi ajustada")

    # ─── consultar e instalar ─────────────────────────────────────────────────

    def verificar(self, *, a_pedido=False):
        """Consulta o AnkiWeb e instala o que houver. Sozinha (`a_pedido=False`) só se a atualização automática está ligada. Devolve `estado()`."""
        with self._trava:
            if not (a_pedido or self.ligada):
                return self.estado()
            try:
                self._consultar_e_instalar(a_pedido)
            except Exception:
                self.logger.exception("A atualização da Conexão falhou")
                self._guardar(falha=True)
            return self.estado()

    def _consultar_e_instalar(self, a_pedido):
        id_ = self.anki_web.id()
        if id_ is None:
            return  # instalada por arquivo, sem a página do AnkiWeb: não há de onde atualizar
        self.ajustar_a_marca()
        if not self.anki_web.pronto():
            self.logger.warning("As funções do Anki que a atualização usa mudaram: fica o diálogo do Anki")
            self._guardar(falha=True)
            return
        if not self.anki_web.ha_versao_nova(id_):
            self._guardar(falha=None)
            return
        if not self.anki_web.instalar(id_):
            self.logger.warning("O AnkiWeb não entregou a versão nova")
            self._guardar(falha=True)
            return
        instalada = self.anki_web.versao_instalada()
        if self.ligada:
            self.anki_web.marcar(True)  # a instalação não deve mexer na marca; se mexeu, volta
        self._guardar(falha=None, instalada=instalada)
        self.logger.info("A Conexão %s ficou instalada; vale na próxima vez que o Anki abrir", instalada)

    def na_saude(self):
        """O que a saúde diz da atualização: só o que há a dizer (uma versão no disco, uma tentativa que falhou, a atualização que acabou de valer);
        em dia, nada, e a saúde fica como sempre foi."""
        estado = self.estado()
        return estado if estado["estado"] in ("instalada", "falhou") or estado["atualizada"] else None

    def fechar_o_anki(self):
        try:
            return bool(self.anki_web.fechar_o_anki())
        except Exception:
            self.logger.exception("O Anki não entregou o pedido de fechar")
            return False

    # ─── de tempos em tempos ──────────────────────────────────────────────────

    def iniciar(self, intervalo_s=INTERVALO_S, espera_inicial_s=ESPERA_INICIAL_S):
        """Ajusta a marca agora e consulta ao abrir o Anki e a cada `intervalo_s`, numa thread."""
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
