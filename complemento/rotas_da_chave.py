"""As rotas da chave da OpenAI da Conexão com o Anki (`/ia/openai/…`, #154): guardar, apagar, vincular a chave de antes da conta,
sincronizá-la com a conta e dizer o estado. Cada uma é uma função `(conexao, corpo) -> (status, json)`, listada em `servidor.ROTAS`."""

import re

from . import openai_api
from .chaves import OutraContaNaoEnviada, LegadoNaoVinculado
from .nuvem_da_chave import NuvemDaChave, NuvemIndisponivel

# Uma chave da OpenAI é uma palavra só, de caracteres que cabem num cabeçalho HTTP. O que não tem essa
# forma nem sai da Conexão: não vale gastar um pedido para a OpenAI dizer o que já se vê.
_FORMA_DA_CHAVE = re.compile(r"^[A-Za-z0-9._\-]{8,256}$")

_STATUS_DO_ERRO_DA_CHAVE = {
    openai_api.RECUSADA: 401,
    openai_api.SEM_CREDITO: 402,
    openai_api.ORGANIZACAO_NAO_VERIFICADA: 403,
    openai_api.FORA_DO_AR: 502,
}


def _versao_da_chave(corpo):
    versao = corpo.get('versao', 0)
    return versao if type(versao) is int and 0 <= versao <= 9007199254740991 else None


def guardar_chave_da_openai(conexao, corpo):
    versao = _versao_da_chave(corpo)
    if versao is None:
        return 400, {'error': 'invalid_request'}
    conta = corpo.get('conta', '')
    if not isinstance(conta, str) or len(conta) > 128:
        return 400, {'error': 'invalid_request'}
    chave = corpo.get("chave")
    if not isinstance(chave, str) or not chave.strip():
        return 400, {"error": "invalid_request"}
    chave = chave.strip()
    repetida = conexao.cofre.reentrega('openai', chave, versao, conta)
    if repetida is True:
        return 200, {'ok': True, 'ultimos4': chave[-4:]}
    if repetida is False:
        return 409, {'error': 'stale_key_version'}
    if not _FORMA_DA_CHAVE.match(chave):
        return 401, {"error": openai_api.RECUSADA}
    try:
        openai_api.conferir(conexao.openai_base, chave, conexao.logger)
    except openai_api.ErroDaChave as erro:
        return _STATUS_DO_ERRO_DA_CHAVE[erro.codigo], {"error": erro.codigo}
    if not conexao.cofre.guardar("openai", chave, versao=versao, conta=conta):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True, "ultimos4": chave[-4:]}


def apagar_chave_da_openai(conexao, corpo):
    """Apagar chave e Apagar tudo na extensão tiram a cópia daqui também (#154). Trocar a chave a substitui pelo POST /ia/openai/chave."""
    versao = _versao_da_chave(corpo)
    if versao is None:
        return 400, {'error': 'invalid_request'}
    conta = corpo.get('conta', '')
    if not isinstance(conta, str) or len(conta) > 128:
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.apagar("openai", versao=versao, conta=conta):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True}


def vincular_legado_da_openai(conexao, corpo):
    versao, chave, conta, em = _versao_da_chave(corpo), corpo.get('chave'), corpo.get('conta'), corpo.get('em')
    if versao is None or not isinstance(chave, str) or not isinstance(conta, str) or len(conta) > 128 or type(em) is not int or not 0 <= em <= 9007199254740991:
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.vincular_legado('openai', chave, conta, em, versao):
        return 409, {'error': 'legacy_key_mismatch'}
    return 200, {'ok': True}


def sincronizar_chave_da_openai(conexao, corpo):
    uid, token = corpo.get('uid'), corpo.get('token')
    versao = _versao_da_chave(corpo)
    if versao is None or not isinstance(uid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid) or not isinstance(token, str) or not token or '\r' in token or '\n' in token:
        return 400, {'error': 'invalid_request'}
    try:
        resultado = conexao.cofre.sincronizar('openai', uid, NuvemDaChave(conexao.firestore_base, uid, token), versao)
    except OutraContaNaoEnviada:
        return 409, {'error': 'other_account_unsent'}
    except LegadoNaoVinculado:
        return 409, {'error': 'legacy_key_unbound'}
    except NuvemIndisponivel as erro:
        return erro.status, {'error': 'cloud_sync_failed', 'status': erro.status}
    if resultado is None:
        return 409, {'error': 'stale_key_version'}
    return 200, dict(ok=True, **resultado)


def estado_da_ia(conexao, corpo):
    documento = conexao.cofre.documento('openai')
    chave = documento.get('chave')
    openai = {'configurada': bool(chave), 'conta': documento.get('conta', None if chave else ''),
              'versao': documento.get('versao', 0), 'naoEnviada': documento.get('naoEnviada', bool(chave))}
    if chave:
        openai['ultimos4'] = chave[-4:]
    return 200, {"openai": openai}
