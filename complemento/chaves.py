"""Único dono da chave: valor/conta/revisão no cofre, fora de logs e diagnóstico.

Só o servidor avança a revisão, depois da aceitação. O cliente envia a revisão
que leu; uma recusa não reserva nada. Valor vazio é ausência de chave, não uma
marca de apagamento separada. Nenhuma resposta devolve o segredo inteiro.
"""

import json
import os
import threading
import time
from collections import namedtuple

_ARQUIVOS = {"openai": "openai.json"}


def gravar_so_do_dono(destino, documento):
    """Sob a tranca de quem chama: substituição atômica; 0600 em POSIX, ACL herdada no Windows (a chave e o login do ChatGPT)."""
    temporario = destino + ".novo"
    try:
        os.remove(temporario)
    except OSError:
        pass
    descritor = os.open(temporario, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
            json.dump(documento, arquivo)
        os.replace(temporario, destino)
    except BaseException:
        try:
            os.remove(temporario)
        except OSError:
            pass
        raise


class OutraContaNaoEnviada(Exception):
    pass


class LegadoNaoVinculado(Exception):
    pass


Posse = namedtuple('Posse', 'chave conta em')
Passo = namedtuple('Passo', 'acao valor resultado')

NADA = 'nada'
ADOTAR = 'adotar'
SUBIR = 'subir'
SEM_MUDANCA = Passo(NADA, None, None)


def _pendente(aqui):
    return aqui.get('naoEnviada', bool(aqui.get('chave')))


def _e_de_outra_conta(aqui, conta):
    return bool(aqui.get('conta')) and aqui['conta'] != conta


def _recusa_da_posse(aqui, conta):
    if aqui.get('chave') and not aqui.get('conta'):
        return LegadoNaoVinculado
    if _e_de_outra_conta(aqui, conta) and _pendente(aqui):
        return OutraContaNaoEnviada
    return None


def _nada_aqui(aqui):
    return not aqui.get('chave') and not aqui.get('em')


def _resultado_de_adotar(chave_da_nuvem, tinha_chave):
    if chave_da_nuvem:
        return 'chegou'
    return 'apagada' if tinha_chave else None


def _primeira_vez_da_conta(aqui, remota):
    valor = remota or {'chave': '', 'em': 0}
    return Passo(ADOTAR, valor, _resultado_de_adotar(valor['chave'], bool(aqui.get('chave'))))


def _empatam(remota, hora, chave):
    if not remota:
        return False
    return remota['em'] == hora and remota['chave'] != chave


def _ja_aceita(atual, chave, conta, versao):
    if atual.get('chave', '') != chave or atual.get('conta', '') != conta:
        return False
    revisao = atual.get('versao', 0)
    if versao == revisao - 1:
        return True
    return versao == revisao and _documento_completo_com_chave(atual, chave)


def _documento_completo_com_chave(atual, chave):
    if not chave:
        return False
    return all(campo in atual for campo in ('conta', 'versao', 'em', 'naoEnviada'))


def _a_nuvem_ganha(remota, hora, empate, pendente):
    if remota['em'] > hora:
        return True
    return empate and not pendente


def _este_cofre_ganha(remota, hora, empate, pendente):
    if hora > (remota['em'] if remota else 0):
        return True
    return empate and pendente


def _disputa_da_mesma_conta(aqui, remota):
    chave = aqui.get('chave', '')
    hora = aqui.get('em') or (1 if chave else 0)
    pendente = _pendente(aqui)
    empate = _empatam(remota, hora, chave)
    if remota and _a_nuvem_ganha(remota, hora, empate, pendente):
        return Passo(ADOTAR, remota, _resultado_de_adotar(remota['chave'], True))
    if _este_cofre_ganha(remota, hora, empate, pendente):
        return Passo(SUBIR, {'chave': chave, 'em': hora}, 'subiu')
    return SEM_MUDANCA


def decidir_a_sincronia(aqui, conta, remota):
    if not remota and _nada_aqui(aqui):
        return SEM_MUDANCA
    if aqui.get('conta', '') != conta:
        return _primeira_vez_da_conta(aqui, remota)
    return _disputa_da_mesma_conta(aqui, remota)


class Cofre:
    def __init__(self, pasta):
        self._pasta = pasta
        self._tranca = threading.RLock()

    def _caminho(self, nome):
        return os.path.join(self._pasta, _ARQUIVOS[nome])

    def documento(self, nome):
        try:
            with open(self._caminho(nome), encoding="utf-8") as arquivo:
                dados = json.load(arquivo)
            return dados if isinstance(dados, dict) else {}
        except (OSError, ValueError):
            return {}

    def ler(self, nome):
        chave = self.documento(nome).get('chave')
        return chave if isinstance(chave, str) and chave else None

    def ultimos4(self, nome):
        chave = self.ler(nome)
        return chave[-4:] if chave else None

    def _gravar(self, nome, documento):
        gravar_so_do_dono(self._caminho(nome), documento)

    def reentrega(self, nome, chave, versao, conta=''):
        """True: chave/conta já aceitas no CAS atual ou replay; False: conflito."""
        with self._tranca:
            atual = self.documento(nome)
            revisao = atual.get('versao', 0)
            if _ja_aceita(atual, chave, conta, versao):
                return True
            return None if versao == revisao else False

    def guardar(self, nome, chave, versao=0, conta=''):
        """CAS após validar; cópia da nuvem mantém a hora dela, não cria mudança."""
        return self._guardar(nome, Posse(chave, conta, None), versao, True)

    def _guardar(self, nome, posse, versao, nao_enviada):
        with self._tranca:
            repetida = self.reentrega(nome, posse.chave, versao, posse.conta)
            if repetida is False:
                return False
            if repetida is True and self._repete_a_hora(nome, posse):
                return True
            if self.documento(nome).get('versao', 0) != versao:
                return False
            self._gravar(nome, self._proximo_documento(nome, posse, nao_enviada))
            return True

    def _repete_a_hora(self, nome, posse):
        return posse.em is None or self.documento(nome).get('em', 0) == posse.em

    def _proximo_documento(self, nome, posse, nao_enviada):
        anterior = self.documento(nome)
        agora = max(int(time.time() * 1000), anterior.get('em', 0) + 1)
        return {'chave': posse.chave, 'conta': posse.conta,
                'versao': anterior.get('versao', 0) + 1,
                'em': posse.em if posse.em is not None else agora,
                'naoEnviada': nao_enviada}

    def vincular_legado(self, nome, posse, versao):
        """Prova exata: só transfere os metadados do valor que já é do dono."""
        with self._tranca:
            atual = self.documento(nome)
            if atual.get('chave', '') != posse.chave or _e_de_outra_conta(atual, posse.conta):
                return False
            if atual.get('versao', 0) != versao:
                return self.reentrega(nome, posse.chave, versao, posse.conta) is True
            if 'conta' in atual and 'naoEnviada' in atual:
                return atual['conta'] == posse.conta
            return self._guardar(nome, posse, versao, True)

    def apagar(self, nome, versao=0, conta=''):
        return self.guardar(nome, '', versao, conta)

    def sincronizar(self, nome, conta, nuvem, versao):
        """Um dono, sob a mesma tranca das mutações; nunca manda o valor de A a B."""
        with self._tranca:
            aqui = self.documento(nome)
            if aqui.get('versao', 0) != versao:
                return None
            recusa = _recusa_da_posse(aqui, conta)
            if recusa:
                raise recusa()
            passo = decidir_a_sincronia(aqui, conta, nuvem.ler())
            return self._cumprir(nome, conta, nuvem, passo)

    def _cumprir(self, nome, conta, nuvem, passo):
        if passo.acao == ADOTAR:
            posse = Posse(passo.valor['chave'], conta, passo.valor['em'])
            self._guardar(nome, posse, self.documento(nome).get('versao', 0), False)
        elif passo.acao == SUBIR:
            nuvem.gravar(passo.valor['chave'], passo.valor['em'])
        return self._confirmar(nome, passo.resultado)

    def _confirmar(self, nome, resultado):
        atual = self.documento(nome)
        if atual.get('naoEnviada'):
            atual['naoEnviada'] = False
            self._gravar(nome, atual)
        return {'resultado': resultado, 'versao': atual.get('versao', 0)}
