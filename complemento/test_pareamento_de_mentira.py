import base64
import dataclasses
import json
import os
import unittest

from complemento import pareamento

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "contrato", "exemplos-do-pareamento.json"), encoding="utf-8") as _arquivo:
    _CONTRATO = json.load(_arquivo)
CLIENTE = _CONTRATO["navegadoresDeTeste"]["primeiro"]["cliente"]
SEGREDO = base64.b64decode(_CONTRATO["navegadoresDeTeste"]["primeiro"]["segredo"])
OUTRO_CLIENTE = _CONTRATO["navegadoresDeTeste"]["segundo"]["cliente"]
OUTRO_SEGREDO = base64.b64decode(_CONTRATO["navegadoresDeTeste"]["segundo"]["segredo"])
VETOR = _CONTRATO["vetorDeAssinatura"]
NONCE = "nonce-de-teste-%08d"


def segredo_em_base64(segredo=SEGREDO):
    return base64.b64encode(segredo).decode("ascii")


def semear(arquivo, clientes=((CLIENTE, SEGREDO),)):
    with open(arquivo, "w", encoding="utf-8") as saida:
        json.dump({"versao": 1, "clientes": [
            {"cliente": c, "segredo": segredo_em_base64(s), "nome": "Teste", "criadoEm": "2026-11-09T00:00:00Z"} for c, s in clientes]}, saida)


class Contador:
    def __init__(self):
        self.vez = 0

    def proximo(self):
        self.vez += 1
        return NONCE % self.vez


class NonceFixo:
    def __init__(self, nonce):
        self.nonce = nonce

    def proximo(self):
        return self.nonce


_NONCES = Contador()


@dataclasses.dataclass(frozen=True)
class Navegador:
    cliente: str
    segredo: bytes
    nonces: object = _NONCES

    def com_nonce(self, nonce):
        return dataclasses.replace(self, nonces=NonceFixo(nonce))

    def assinar(self, sessao, metodo, caminho, corpo=b""):
        nonce = self.nonces.proximo()
        return {
            pareamento.CABECALHO_DO_CLIENTE: self.cliente,
            pareamento.CABECALHO_DA_SESSAO: sessao,
            pareamento.CABECALHO_DO_NONCE: nonce,
            pareamento.CABECALHO_DA_ASSINATURA: pareamento.assinatura_do_pedido(self.segredo, sessao, nonce, metodo, caminho, corpo),
        }


PRIMEIRO = Navegador(CLIENTE, SEGREDO)
SEGUNDO = Navegador(OUTRO_CLIENTE, OUTRO_SEGREDO)


def cabecalhos_assinados(sessao, metodo, caminho, corpo=b""):
    return PRIMEIRO.assinar(sessao, metodo, caminho, corpo)


class TelaDeMentira:
    def __init__(self):
        self.codigos = []
        self.fechou = 0
        self.conectados = 0
        self.cancelar = None
        self.quebra = False
        self.aberta = False

    def mostrar_codigo(self, codigo, validade_s, ao_cancelar):
        if self.quebra:
            raise RuntimeError("o Qt mudou")
        self.codigos.append(codigo)
        self.cancelar = ao_cancelar
        self.aberta = True

    def fechar_codigo(self):
        self.fechou += 1
        self.aberta = False

    def apertar_cancelar(self):
        self.aberta = False
        self.cancelar()

    def conectou(self):
        self.conectados += 1

    @property
    def codigo(self):
        return self.codigos[-1]


def semear_em(pasta, clientes=((CLIENTE, SEGREDO),)):
    pasta = getattr(pasta, "name", pasta)
    os.makedirs(os.path.join(pasta, "user_files"), exist_ok=True)
    semear(os.path.join(pasta, "user_files", "pareamento.json"), clientes)


def travar_o_item_de_login_do_computador():
    from unittest.mock import patch

    remendo = patch("complemento.inicio.itens_de_login.deste_computador", return_value=None)
    remendo.start()
    unittest.addModuleCleanup(remendo.stop)


def iniciar_pareado(pasta, *argumentos, **palavras):
    from complemento import inicio

    semear_em(pasta)
    return inicio.iniciar(pasta, *argumentos, **palavras)


def ao_carregar_pareado(anki, pasta, **palavras):
    from complemento import no_anki

    semear_em(pasta)
    return no_anki.ao_carregar(anki, pasta, **palavras)


def pedir_como_a_extensao(porta, metodo, caminho, corpo=None):
    import http.client
    import secrets

    from complemento import configuracao

    def enviar(metodo_, caminho_, corpo_, extras):
        ligacao = http.client.HTTPConnection("127.0.0.1", porta, timeout=10)
        try:
            enviados = {"Origin": configuracao.ORIGENS_ACEITAS[0], **extras}
            if corpo_ is not None:
                enviados["Content-Type"] = "application/json"
            ligacao.request(metodo_, caminho_, body=corpo_, headers=enviados)
            resposta = ligacao.getresponse()
            return resposta.status, dict(resposta.getheaders()), resposta.read()
        finally:
            ligacao.close()

    _, _, lido = enviar("POST", "/pareamento/conferir", json.dumps({"cliente": CLIENTE, "desafio": secrets.token_hex(16)}).encode("utf-8"), {})
    sessao = json.loads(lido)["sessao"]
    bruto = None if corpo is None else (corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode("utf-8"))
    extras = cabecalhos_assinados(sessao, metodo, caminho, bruto or b"")
    return enviar(metodo, caminho, bruto, extras)


def pedir_como_o_exemplo(conexao, pedido, corpo=None):
    modo = pedido.get("assinatura")
    cabecalhos = {"errada": {pareamento.CABECALHO_DA_ASSINATURA: "AAAA"}, "sessaoVelha": {pareamento.CABECALHO_DA_SESSAO: "sessao-de-outra-subida"}}.get(modo)
    return conexao.pedir(
        pedido["metodo"], pedido["caminho"], pedido["origem"], cabecalhos=cabecalhos, assinar=modo != "ausente",
        corpo=corpo if corpo is not None else pedido.get("corpo"), corpo_bruto=pedido.get("corpoBruto"),
    )


RECUSAS_DO_PORTEIRO = frozenset(["pairing_required", "pairing_invalid", "session_expired"])


def recusa_do_porteiro(status, erro, caminho):
    return status == 401 and erro in RECUSAS_DO_PORTEIRO and not caminho.startswith("/pareamento/")


def gastar_as_tentativas_de_um_codigo(p):
    p.comecar()
    for _ in range(pareamento.TENTATIVAS):
        p.concluir("AAA-AAA", OUTRO_CLIENTE, "")


def bloquear_o_pareamento(p):
    for _ in range(pareamento.CODIGOS_ESGOTADOS_PARA_BLOQUEAR):
        gastar_as_tentativas_de_um_codigo(p)


def mostrar_o_codigo_pendente(p, contexto):
    codigo = contexto.get("codigoPendente")
    if not codigo:
        return
    p.sortear = lambda: codigo
    p.comecar()
    if contexto.get("codigoUsadoPor"):
        p.concluir(codigo, contexto["codigoUsadoPor"], "Outro")


def preparar_o_pareamento(p, com_tela, contexto=None):
    contexto = contexto or {}
    tela = TelaDeMentira()
    p.na_tela = tela if com_tela else None
    mostrar_o_codigo_pendente(p, contexto)
    if contexto.get("desconectado"):
        p.desconectar()
    if contexto.get("bloqueado"):
        bloquear_o_pareamento(p)
    return tela


UM_CLIENTE_NOVO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
DESAFIO = "desafio-de-teste-0123456789abcdef"
CODIGO = "K7M4PX"


def json_de(corpo):
    return json.loads(corpo) if corpo else None


def concluir(conexao, codigo="K7M-4PX", cliente=UM_CLIENTE_NOVO, nome="Chrome"):
    status, cabecalhos, corpo = conexao.pedir("POST", "/pareamento/concluir", corpo={"codigo": codigo, "cliente": cliente, "nome": nome})
    return status, json_de(corpo), cabecalhos


def comecar(conexao, codigo=CODIGO):
    conexao.conexao.pareamento.sortear = lambda: codigo
    return conexao.pedir("POST", "/pareamento/comecar", corpo={})


def bytes_de(caminho):
    with open(caminho, "rb") as arquivo:
        return arquivo.read()


def arquivo_do_pareamento(conexao):
    with open(os.path.join(conexao.pasta, "pareamento.json"), encoding="utf-8") as arquivo:
        return json.load(arquivo)
