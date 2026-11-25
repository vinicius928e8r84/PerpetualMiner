import re
from collections import namedtuple

from . import openai_api
from .chaves import LegadoNaoVinculado, OutraContaNaoEnviada, Posse
from .nuvem_da_chave import NuvemDaChave, NuvemIndisponivel

_FORMA_DA_CHAVE = re.compile(r"^[A-Za-z0-9._\-]{8,256}$")
_FORMA_DO_UID = re.compile(r'[A-Za-z0-9_-]{1,128}')
_QUEBRA_DE_LINHA = re.compile(r'[\r\n]')
_MAIOR_INTEIRO_DO_JS = 9007199254740991

_BaseDaChave = namedtuple('_BaseDaChave', 'versao conta')

_STATUS_DO_ERRO_DA_CHAVE = {
    openai_api.RECUSADA: 401,
    openai_api.SEM_CREDITO: 402,
    openai_api.ORGANIZACAO_NAO_VERIFICADA: 403,
    openai_api.FORA_DO_AR: 502,
}


def _inteiro_do_js(valor):
    return type(valor) is int and 0 <= valor <= _MAIOR_INTEIRO_DO_JS


def _versao_da_chave(corpo):
    versao = corpo.get('versao', 0)
    return versao if _inteiro_do_js(versao) else None


def _conta_valida(conta):
    return isinstance(conta, str) and len(conta) <= 128


def _base_da_chave(corpo):
    versao, conta = _versao_da_chave(corpo), corpo.get('conta', '')
    return _BaseDaChave(versao, conta) if versao is not None and _conta_valida(conta) else None


def _chave_colada(corpo):
    chave = corpo.get("chave")
    return chave.strip() if isinstance(chave, str) and chave.strip() else None


def guardar_chave_da_openai(conexao, corpo):
    base, chave = _base_da_chave(corpo), _chave_colada(corpo)
    if base is None or chave is None:
        return 400, {'error': 'invalid_request'}
    repetida = conexao.cofre.reentrega('openai', chave, base.versao, base.conta)
    if repetida is True:
        return 200, {'ok': True, 'ultimos4': chave[-4:]}
    if repetida is False:
        return 409, {'error': 'stale_key_version'}
    return _conferir_na_openai_e_guardar(conexao, chave, base)


def _conferir_na_openai_e_guardar(conexao, chave, base):
    if not _FORMA_DA_CHAVE.match(chave):
        return 401, {"error": openai_api.RECUSADA}
    try:
        openai_api.conferir(conexao.openai_base, chave, conexao.logger)
    except openai_api.ErroDaChave as erro:
        return _STATUS_DO_ERRO_DA_CHAVE[erro.codigo], {"error": erro.codigo}
    if not conexao.cofre.guardar("openai", chave, versao=base.versao, conta=base.conta):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True, "ultimos4": chave[-4:]}


def apagar_chave_da_openai(conexao, corpo):
    base = _base_da_chave(corpo)
    if base is None:
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.apagar("openai", versao=base.versao, conta=base.conta):
        return 409, {'error': 'stale_key_version'}
    return 200, {"ok": True}


def _legado_bem_formado(chave, conta, em):
    return isinstance(chave, str) and _conta_valida(conta) and _inteiro_do_js(em)


def vincular_legado_da_openai(conexao, corpo):
    versao, chave, conta, em = _versao_da_chave(corpo), corpo.get('chave'), corpo.get('conta'), corpo.get('em')
    if versao is None or not _legado_bem_formado(chave, conta, em):
        return 400, {'error': 'invalid_request'}
    if not conexao.cofre.vincular_legado('openai', Posse(chave, conta, em), versao):
        return 409, {'error': 'legacy_key_mismatch'}
    return 200, {'ok': True}


def _uid_valido(uid):
    return isinstance(uid, str) and _FORMA_DO_UID.fullmatch(uid) is not None


def _token_que_cabe_no_cabecalho(token):
    return isinstance(token, str) and token != '' and _QUEBRA_DE_LINHA.search(token) is None


def _credencial_da_conta_valida(uid, token):
    return _uid_valido(uid) and _token_que_cabe_no_cabecalho(token)


def sincronizar_chave_da_openai(conexao, corpo):
    uid, token = corpo.get('uid'), corpo.get('token')
    versao = _versao_da_chave(corpo)
    if versao is None or not _credencial_da_conta_valida(uid, token):
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
