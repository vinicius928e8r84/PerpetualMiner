import json
import re
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

TAMANHO_MAXIMO = 65536
FORMATO_DA_CHAVE = re.compile(r'[A-Za-z0-9._\-]{8,256}')


def _e_uma_chave(chave):
    return isinstance(chave, str) and FORMATO_DA_CHAVE.fullmatch(chave) is not None


def _chave_que_a_nuvem_guarda(chave):
    return chave == '' or _e_uma_chave(chave)


class NuvemIndisponivel(Exception):
    def __init__(self, status):
        self.status = status if status in (401, 403, 409, 500, 502, 503) else 503
        super().__init__('cloud_sync_failed')


def _ler_a_resposta(pedido):
    with urlopen(pedido, timeout=10) as resposta:
        bruto = resposta.read(TAMANHO_MAXIMO + 1)
    if len(bruto) > TAMANHO_MAXIMO:
        raise NuvemIndisponivel(502)
    return json.loads(bruto)


def _hora_da_chave(chave, em):
    return em or (1 if chave else 0)


def _chave_do_documento(campos):
    apagada = campos.get('apagada', {}).get('booleanValue')
    chave = '' if apagada else campos.get('chave', {}).get('stringValue', '')
    em = int(campos.get('em', {}).get('integerValue', 0))
    if not _chave_que_a_nuvem_guarda(chave) or em < 0:
        raise ValueError()
    return {'chave': chave, 'em': _hora_da_chave(chave, em)}


def _e_o_documento_que_nao_existe(metodo, erro):
    return isinstance(erro, HTTPError) and (metodo, erro.code) == ('GET', 404)


def _recusa_da_nuvem(erro):
    if isinstance(erro, HTTPError):
        return NuvemIndisponivel(erro.code)
    return NuvemIndisponivel(503 if isinstance(erro, OSError) else 502)


class NuvemDaChave:
    def __init__(self, base, uid, token):
        self._url = '%s/usuarios/%s/segredos/openai' % (base.rstrip('/'), quote(uid, safe=''))
        self._token = token

    def _montar_o_pedido(self, metodo, dados):
        corpo = None if dados is None else json.dumps(dados).encode('utf-8')
        return Request(self._url, data=corpo, method=metodo,
            headers={'Authorization': 'Bearer ' + self._token, 'Content-Type': 'application/json'})

    def _pedir(self, metodo, dados=None):
        pedido = self._montar_o_pedido(metodo, dados)
        try:
            return _ler_a_resposta(pedido)
        except (OSError, ValueError) as erro:
            if _e_o_documento_que_nao_existe(metodo, erro):
                return None
            raise _recusa_da_nuvem(erro) from None

    def ler(self):
        dados = self._pedir('GET')
        if dados is None:
            return None
        try:
            return _chave_do_documento(dados['fields'])
        except (KeyError, TypeError, ValueError, AttributeError):
            raise NuvemIndisponivel(502) from None

    def gravar(self, chave, em):
        self._pedir('PATCH', {'fields': {'chave': {'stringValue': chave}, 'em': {'integerValue': str(em)}}})
