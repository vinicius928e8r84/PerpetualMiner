"""Firestore da chave: stdlib, credencial transitória, erros só por código.

A URL vem do código, nunca do pedido HTTP. O token e os corpos não são
persistidos nem registrados. O cofre é quem decide/serializa o valor a replicar.
"""

import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

FORMATO_DA_CHAVE = re.compile(r'[A-Za-z0-9._\-]{8,256}')


def _e_uma_chave(chave):
    return isinstance(chave, str) and FORMATO_DA_CHAVE.fullmatch(chave) is not None


def _chave_que_a_nuvem_guarda(chave):
    return chave == '' or _e_uma_chave(chave)


class NuvemIndisponivel(Exception):
    def __init__(self, status):
        self.status = status if status in (401, 403, 409, 500, 502, 503) else 503
        super().__init__('cloud_sync_failed')


class NuvemDaChave:
    def __init__(self, base, uid, token):
        self._url = '%s/usuarios/%s/segredos/openai' % (base.rstrip('/'), quote(uid, safe=''))
        self._token = token

    def _pedir(self, metodo, dados=None):
        corpo = None if dados is None else json.dumps(dados).encode('utf-8')
        pedido = Request(self._url, data=corpo, method=metodo,
            headers={'Authorization': 'Bearer ' + self._token, 'Content-Type': 'application/json'})
        try:
            with urlopen(pedido, timeout=10) as resposta:
                bruto = resposta.read(65537)
            if len(bruto) > 65536:
                raise NuvemIndisponivel(502)
            return json.loads(bruto)
        except HTTPError as erro:
            if metodo == 'GET' and erro.code == 404:
                return None
            raise NuvemIndisponivel(erro.code) from None
        except (URLError, TimeoutError, OSError):
            raise NuvemIndisponivel(503) from None
        except (ValueError, UnicodeError):
            raise NuvemIndisponivel(502) from None

    def ler(self):
        dados = self._pedir('GET')
        if dados is None:
            return None
        try:
            campos = dados['fields']
            chave = '' if campos.get('apagada', {}).get('booleanValue') else campos.get('chave', {}).get('stringValue', '')
            em = int(campos.get('em', {}).get('integerValue', 0))
            if not _chave_que_a_nuvem_guarda(chave) or em < 0:
                raise ValueError()
            return {'chave': chave, 'em': em or (1 if chave else 0)}
        except (KeyError, TypeError, ValueError, AttributeError):
            raise NuvemIndisponivel(502) from None

    def gravar(self, chave, em):
        self._pedir('PATCH', {'fields': {'chave': {'stringValue': chave}, 'em': {'integerValue': str(em)}}})
