"""Entrar com o ChatGPT (#155): a tentativa de login, o retorno, os tokens e a renovação, só com a biblioteca padrão.

O desenho (dono de cada dado, estados, transições e limites) está em `docs/design/login-do-chatgpt.md`; os endereços e os
valores do protocolo, em `chatgpt_oficial.py`. Os tokens moram só em `user_files/chaves/chatgpt.json` (0600, gravado de uma
vez); nada daqui os devolve, nem os escreve no log: o log diz o que aconteceu e, no máximo, o status HTTP. A tentativa de login
(`state`, verificador do PKCE e `nonce`) fica na memória, uma por vez, e vale uma vez só. Toda leitura e escrita do arquivo,
a troca do código, a renovação e o Sair passam pela mesma tranca: o `refresh_token` roda a cada renovação.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from . import chatgpt_oficial as oficial
from .chaves import gravar_so_do_dono
from .configuracao import OPENAI_BASE
from .openai_api import contexto_tls

TEMPO_DE_CADA_PEDIDO = 15
VALIDADE_DA_TENTATIVA = 600  # s: depois disso o retorno não vale, e a pessoa aperta o botão de novo
MARGEM_DA_RENOVACAO = 180  # s antes da validade do `access_token`: um pedido nunca começa com um token quase vencido

# O que o estado diz de uma tentativa que não virou login.
SEM_ACESSO = "chatgpt_access_denied"
SEM_PLANO = "chatgpt_plan_not_granted"
LOGIN_FALHOU = "chatgpt_login_failed"
# A segunda troca seguida recusada com `invalid_grant`: a conta (grátis ou Go) não tem o plano (risco 9 da spec). O Envio também grava este código.
NAO_SERVE = "chatgpt_not_eligible"
# Os códigos do Envio: o login acabou (entrar de novo); o plano não respondeu (tentar depois); a conta não tem modelo.
SAIU = "chatgpt_signed_out"
FORA_DO_AR = "openai_unreachable"
RECUSOU = "chatgpt_rejected"
SEM_MODELO = "chatgpt_no_model"


class ErroDoPlano(Exception):
    """O plano não serve para o próximo pedido: `codigo` é um dos de cima, o que o Envio grava no Cartão."""

    def __init__(self, codigo):
        super().__init__(codigo)
        self.codigo = codigo


def _base64url(dados):
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode("ascii")


def _nonce_do_id_token(id_token):
    """O `nonce` do corpo do `id_token` (um JWT); None se ele não se lê. A assinatura não é conferida (limite 5.c do desenho)."""
    try:
        corpo = id_token.split(".")[1]
        dados = json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)).decode("utf-8"))
        return dados.get("nonce") if isinstance(dados, dict) else None
    except (AttributeError, IndexError, ValueError):
        return None


def _tokens(resposta):
    """O que a troca ou a renovação devolveu, se tem a forma da doc (`Token reference`); None se não."""
    acesso, renovacao, validade, escopos = (resposta.get(campo) for campo in ("access_token", "refresh_token", "expires_in", "scope"))
    if not all(isinstance(valor, str) and valor for valor in (acesso, renovacao, escopos)):
        return None
    if type(validade) not in (int, float) or validade <= 0:
        return None
    return {"access_token": acesso, "refresh_token": renovacao, "scopes": escopos.split(), "expira_em": time.time() + validade}


class LoginDoChatGPT:
    """O login do ChatGPT deste computador. `base` é o servidor de login e `api` a API da OpenAI (os testes dão os de mentira)."""

    def __init__(self, pasta, logger, base=oficial.LOGIN, api=OPENAI_BASE):
        self.pasta = pasta
        self.logger = logger
        self.base = base
        self.api = api
        self.validade_da_tentativa = VALIDADE_DA_TENTATIVA
        self._tranca = threading.RLock()
        self._tentativa = None
        self._trocando = False
        self._falha = None
        self._recusas = 0  # trocas seguidas recusadas com `invalid_grant`

    # -- os arquivos --
    def _caminho(self, nome="chatgpt.json"):
        return os.path.join(self.pasta, nome)

    def _ler(self, nome="chatgpt.json"):
        try:
            with open(self._caminho(nome), encoding="utf-8") as arquivo:
                dados = json.load(arquivo)
        except (OSError, ValueError):
            return None
        return dados if isinstance(dados, dict) else None

    def _login(self):
        dados = self._ler()
        campos = ("client_id", "access_token", "refresh_token")
        if dados is None or not all(isinstance(dados.get(campo), str) and dados[campo] for campo in campos):
            return None
        return dados if type(dados.get("expira_em")) in (int, float) else None

    def _apagar(self):
        try:
            os.remove(self._caminho())
        except FileNotFoundError:
            pass

    def _id_deste_computador(self):
        """O `ext_agent_host_id`: criado antes do primeiro login e o mesmo depois (`Registration and sign-in` § 1)."""
        dados = self._ler("chatgpt-host.json") or {}
        guardado = dados.get("ext_agent_host_id")
        if isinstance(guardado, str) and guardado.startswith("urn:uuid:"):
            return guardado
        novo = "urn:uuid:%s" % uuid.uuid4()
        gravar_so_do_dono(self._caminho("chatgpt-host.json"), {"ext_agent_host_id": novo})
        return novo

    # -- o que a extensão pede --
    def estado(self):
        # Sem a tranca: a troca e a renovação a seguram durante um pedido à rede, e o arquivo é sempre trocado de uma vez.
        tentativa, trocando, falha = self._tentativa, self._trocando, self._falha
        return {"conectada": self._login() is not None,
                "entrando": trocando or (tentativa is not None and time.monotonic() < tentativa["expira"]), "falha": falha}

    def iniciar(self, porta):
        """Uma tentativa nova (a anterior deixa de valer) e a URL de autorização que a pessoa abre no navegador."""
        with self._tranca:
            computador = self._id_deste_computador()
            verificador = secrets.token_urlsafe(64)
            tentativa = {
                "state": secrets.token_urlsafe(32), "nonce": secrets.token_urlsafe(32), "verificador": verificador,
                "retorno": "http://127.0.0.1:%d%s" % (porta, oficial.CAMINHO_DO_RETORNO),
                "expira": time.monotonic() + self.validade_da_tentativa,
            }
            self._tentativa, self._falha = tentativa, None
        parametros = [
            ("client_id", oficial.CLIENTE_DINAMICO), ("agent_name_hint", oficial.NOME_DO_APP), ("ext_agent_host_id", computador),
            ("response_type", "code"), ("redirect_uri", tentativa["retorno"]), ("scope", oficial.ESCOPOS), ("resource", oficial.RECURSO),
            ("state", tentativa["state"]), ("nonce", tentativa["nonce"]),
            ("code_challenge", _base64url(hashlib.sha256(verificador.encode("ascii")).digest())), ("code_challenge_method", "S256"),
        ]
        self.logger.info("Entrar com o ChatGPT: a tentativa começou")
        return oficial.AUTORIZAR + "?" + urllib.parse.urlencode(parametros)

    def receber(self, consulta, host, porta):
        """O retorno do navegador. Só a tentativa pendente, pelo `state` dela e no endereço de loopback da Conexão, é aceita; ela
        é consumida antes da troca do código. Qualquer outro retorno não muda nada."""
        estado = consulta.get("state")
        if host != "127.0.0.1:%d" % porta or not estado:
            return
        with self._tranca:
            tentativa = self._tentativa
            if tentativa is None or not hmac.compare_digest(estado.encode("utf-8"), tentativa["state"].encode("utf-8")):
                return
            self._tentativa = None
            if time.monotonic() >= tentativa["expira"]:
                return
            self._trocando = True
            try:
                if consulta.get("error"):
                    self._falha = SEM_ACESSO if consulta["error"] == "access_denied" else LOGIN_FALHOU
                else:
                    self._falha = self._trocar(tentativa, consulta.get("code"), consulta.get("client_id"))
            except Exception as erro:  # só o tipo vai ao log: a mensagem de um erro pode citar o pedido
                self.logger.error("Entrar com o ChatGPT: o login não foi guardado (%s)", type(erro).__name__)
                self._falha = LOGIN_FALHOU
            finally:
                self._trocando = False
        self.logger.info("Entrar com o ChatGPT: %s", self._falha or "conectado")

    def _trocar(self, tentativa, codigo, cliente):
        if not codigo or not cliente:
            return LOGIN_FALHOU
        status, resposta = self._pedir_token({
            "grant_type": "authorization_code", "client_id": cliente, "code": codigo, "code_verifier": tentativa["verificador"],
            "redirect_uri": tentativa["retorno"], "resource": oficial.RECURSO,
        })
        tokens = _tokens(resposta) if status == 200 else None
        recusa = status == 400 and resposta.get("error") == "invalid_grant"
        self._recusas = self._recusas + 1 if recusa else 0
        if tokens is None:
            self.logger.warning("Entrar com o ChatGPT: a troca do código não deu certo (HTTP %s)", status)
            return NAO_SERVE if self._recusas > 1 else LOGIN_FALHOU
        if oficial.ESCOPO_DO_PLANO not in tokens["scopes"]:
            return SEM_PLANO
        id_token = resposta.get("id_token")
        if not isinstance(id_token, str) or _nonce_do_id_token(id_token) != tentativa["nonce"]:
            self.logger.warning("Entrar com o ChatGPT: o id_token não é desta tentativa")
            return LOGIN_FALHOU
        gravar_so_do_dono(self._caminho(), dict(tokens, client_id=cliente, id_token=id_token, salvo_em=int(time.time())))
        return None

    def token(self):
        """O `access_token` do próximo pedido, renovado perto da validade; None sem login. Levanta `ErroDoPlano`."""
        with self._tranca:
            login = self._login()
            if login is None:
                return None
            if time.time() < login["expira_em"] - MARGEM_DA_RENOVACAO:
                return login["access_token"]
            status, resposta = self._pedir_token({
                "grant_type": "refresh_token", "client_id": login["client_id"], "refresh_token": login["refresh_token"],
                "resource": oficial.RECURSO,
            })
            tokens = _tokens(resposta) if status == 200 else None
            if tokens is not None and oficial.ESCOPO_DO_PLANO in tokens["scopes"]:
                gravar_so_do_dono(self._caminho(), dict(login, **tokens))
                return tokens["access_token"]
            if tokens is not None or (status is not None and status < 500 and resposta.get("error") in oficial.REFRESH_INUTILIZAVEL):
                self._apagar()
                self.logger.warning("Entrar com o ChatGPT: o login acabou (HTTP %s); é preciso entrar de novo", status)
                raise ErroDoPlano(SAIU)
            self.logger.warning("Entrar com o ChatGPT: a renovação não deu certo (HTTP %s)", status)
            raise ErroDoPlano(FORA_DO_AR)

    def modelos(self, token):
        """Os modelos da lista da conta (`visibility: list`, na ordem do servidor), o primeiro é o Automático. Levanta `ErroDoPlano`."""
        status, resposta = self._pedir(self.api + oficial.MODELOS, token=token)
        if status in (401, 403):
            raise ErroDoPlano(RECUSOU)
        if status != 200:
            raise ErroDoPlano(FORA_DO_AR)
        lista = resposta.get("models") if isinstance(resposta.get("models"), list) else []
        modelos = [m["slug"] for m in lista if isinstance(m, dict) and m.get("visibility") == "list" and isinstance(m.get("slug"), str) and m["slug"]]
        if not modelos:
            raise ErroDoPlano(SEM_MODELO)
        return modelos

    def sair(self):
        """Revoga a sessão renovável, se dá, e apaga o arquivo do login; devolve se a revogação foi confirmada (sem login: True)."""
        with self._tranca:
            self._tentativa = self._falha = None
            self._recusas = 0
            login = self._login()
            if login is None:
                self._apagar()
                return True
            revogada = self._revogar(login)
            self._apagar()
        self.logger.info("Sair do ChatGPT: %s", "revogado" if revogada else "saiu sem a revogação confirmada")
        return revogada

    def _revogar(self, login):
        status, configuracao = self._pedir(self.base + oficial.OPENID)
        endereco = configuracao.get("revocation_endpoint") if status == 200 else None
        if not isinstance(endereco, str) or not endereco.startswith(self.base + "/"):
            return False  # só o servidor de login recebe o refresh_token
        status, _ = self._pedir(endereco, formulario={"token": login["refresh_token"], "token_type_hint": "refresh_token", "client_id": login["client_id"]})
        return status == 200

    # -- o HTTP --
    def _pedir_token(self, formulario):
        return self._pedir(self.base + oficial.TOKEN, formulario=formulario)

    def _pedir(self, url, formulario=None, token=None):
        """(status, JSON como dict) do pedido; (None, {}) sem resposta. O corpo de um erro só é lido para o `error` dele."""
        dados = None if formulario is None else urllib.parse.urlencode(formulario).encode("utf-8")
        pedido = urllib.request.Request(url, data=dados, method="GET" if dados is None else "POST")
        pedido.add_header("Accept", "application/json")
        if dados is not None:
            pedido.add_header("Content-Type", "application/x-www-form-urlencoded")
        if token:
            pedido.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(pedido, timeout=TEMPO_DE_CADA_PEDIDO, context=contexto_tls()) as resposta:
                status, lido = resposta.status, resposta.read(1024 * 1024)
        except urllib.error.HTTPError as erro:
            status, lido = erro.code, erro.read(65536)
        except (urllib.error.URLError, OSError, ValueError):
            return None, {}
        try:
            corpo = json.loads(lido.decode("utf-8")) if lido else {}
        except ValueError:
            corpo = {}
        return status, corpo if isinstance(corpo, dict) else {}
