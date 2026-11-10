"""O navegador pareado dos testes: o segredo, a assinatura de cada pedido e a janela do Anki de mentira (apoio de `test_servidor.py` e de `test_pareamento.py`).

Os testes pedem à Conexão como a extensão pede: com a assinatura de um navegador que já se pareou (`CLIENTE`, `SEGREDO` em
`user_files/pareamento.json`). O pedido de quem não se pareou, ou que assina errado, é o que `test_pareamento.py` confere.
"""

import base64
import json
import os

from complemento import pareamento

# Os dois navegadores de teste e o vetor de assinatura vêm do contrato, para o e2e (`e2e/pareamento-de-teste.js`) e os testes do complemento
# falarem dos mesmos.
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
    """Escreve o `pareamento.json` de uma Conexão que já tem estes navegadores pareados."""
    with open(arquivo, "w", encoding="utf-8") as saida:
        json.dump({"versao": 1, "clientes": [
            {"cliente": c, "segredo": segredo_em_base64(s), "nome": "Teste", "criadoEm": "2026-11-09T00:00:00Z"} for c, s in clientes]}, saida)


class Contador:
    def __init__(self):
        self.vez = 0

    def proximo(self):
        self.vez += 1
        return NONCE % self.vez


_NONCES = Contador()


def cabecalhos_assinados(sessao, metodo, caminho, corpo=b"", cliente=CLIENTE, segredo=SEGREDO, nonce=None):
    """Os cabeçalhos que a extensão põe num pedido: o navegador, a sessão provada, um nonce novo e a assinatura."""
    nonce = nonce or _NONCES.proximo()
    return {
        pareamento.CABECALHO_DO_CLIENTE: cliente,
        pareamento.CABECALHO_DA_SESSAO: sessao,
        pareamento.CABECALHO_DO_NONCE: nonce,
        pareamento.CABECALHO_DA_ASSINATURA: pareamento.assinatura_do_pedido(segredo, sessao, nonce, metodo, caminho, corpo),
    }


class TelaDeMentira:
    """A janela do Anki (`pareamento.Pareamento.na_tela`): guarda o que a pessoa veria, e o teste lê o código que "apareceu"."""

    def __init__(self):
        self.codigos = []      # os códigos mostrados, na ordem
        self.fechou = 0
        self.conectados = 0
        self.cancelar = None
        self.quebra = False
        self.aberta = False    # o diálogo do código está na tela

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
        """A pessoa apertou Cancelar no diálogo: ele fecha e o pareamento é avisado."""
        self.aberta = False
        self.cancelar()

    def conectou(self):
        self.conectados += 1

    @property
    def codigo(self):
        return self.codigos[-1]


def semear_em(pasta, clientes=((CLIENTE, SEGREDO),)):
    """Semeia o `pareamento.json` da pasta do complemento (`<pasta>/user_files`) antes de a Conexão subir por `inicio.iniciar` ou `no_anki.ao_carregar`."""
    pasta = getattr(pasta, "name", pasta)
    os.makedirs(os.path.join(pasta, "user_files"), exist_ok=True)
    semear(os.path.join(pasta, "user_files", "pareamento.json"), clientes)


def iniciar_pareado(pasta, *argumentos, **palavras):
    """`inicio.iniciar` numa pasta onde o navegador de teste já se pareou."""
    from complemento import inicio

    semear_em(pasta)
    return inicio.iniciar(pasta, *argumentos, **palavras)


def ao_carregar_pareado(anki, pasta, **palavras):
    """`no_anki.ao_carregar` numa pasta onde o navegador de teste já se pareou."""
    from complemento import no_anki

    semear_em(pasta)
    return no_anki.ao_carregar(anki, pasta, **palavras)


def pedir_como_a_extensao(porta, metodo, caminho, corpo=None, origem=None, cabecalhos=None):
    """Um pedido assinado a uma Conexão na `porta`, como a extensão o faz: primeiro o `conferir` (que dá a sessão), depois o pedido.

    Devolve (status, cabeçalhos, bytes). Serve às provas que sobem a Conexão por `inicio.iniciar` ou `no_anki.ao_carregar`, que
    não têm um `ConexaoNoTeste` para assinar por elas."""
    import http.client
    import secrets

    from complemento import configuracao

    def enviar(metodo_, caminho_, corpo_, extras):
        ligacao = http.client.HTTPConnection("127.0.0.1", porta, timeout=10)
        try:
            enviados = {"Origin": origem or configuracao.ORIGENS_ACEITAS[0], **extras}
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
    extras.update(cabecalhos or {})
    return enviar(metodo, caminho, bruto, extras)


def pedir_como_o_exemplo(conexao, pedido, corpo=None):
    """O pedido do exemplo, assinado como a extensão assina; `assinatura` no pedido diz o que a extensão não faria: `ausente`, `errada` ou
    `sessaoVelha` (assinado numa subida anterior da Conexão)."""
    modo = pedido.get("assinatura")
    cabecalhos = {"errada": {pareamento.CABECALHO_DA_ASSINATURA: "AAAA"}, "sessaoVelha": {pareamento.CABECALHO_DA_SESSAO: "sessao-de-outra-subida"}}.get(modo)
    return conexao.pedir(
        pedido["metodo"], pedido["caminho"], pedido["origem"], cabecalhos=cabecalhos, assinar=modo != "ausente",
        corpo=corpo if corpo is not None else pedido.get("corpo"), corpo_bruto=pedido.get("corpoBruto"),
    )


# O que o porteiro responde a qualquer rota que não é do pareamento (`servidor._pedido_aceito`): os exemplos dele são os de uma rota só.
RECUSAS_DO_PORTEIRO = frozenset(["pairing_required", "pairing_invalid", "session_expired"])


def recusa_do_porteiro(status, erro, caminho):
    return status == 401 and erro in RECUSAS_DO_PORTEIRO and not caminho.startswith("/pareamento/")


def preparar_o_pareamento(p, com_tela, contexto=None):
    """A janela do Anki de mentira no pareamento `p` (`com_tela=False`: o Anki não tem onde mostrar o código) e o que o `contexto` de um exemplo do contrato
    diz dele: `codigoPendente` (o código que a janela mostra agora), `codigoUsadoPor` (o navegador que já o usou) e `bloqueado` (três códigos gastaram as
    tentativas seguidos). Devolve a janela."""
    contexto = contexto or {}
    tela = TelaDeMentira()
    p.na_tela = tela if com_tela else None
    if contexto.get("codigoPendente"):
        p.sortear = lambda: contexto["codigoPendente"]
        p.comecar()
        if contexto.get("codigoUsadoPor"):
            p.concluir(contexto["codigoPendente"], contexto["codigoUsadoPor"], "Outro")
    if contexto.get("bloqueado"):
        for _ in range(pareamento.CODIGOS_ESGOTADOS_PARA_BLOQUEAR):
            p.comecar()
            for _ in range(pareamento.TENTATIVAS):
                p.concluir("AAA-AAA", OUTRO_CLIENTE, "")
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
