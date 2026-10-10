"""Único dono da chave: valor/conta/revisão no cofre, fora de logs e diagnóstico.

Só o servidor avança a revisão, depois da aceitação. O cliente envia a revisão
que leu; uma recusa não reserva nada. Valor vazio é ausência de chave, não uma
marca de apagamento separada. Nenhuma resposta devolve o segredo inteiro.
"""

import json
import os
import threading
import time

_ARQUIVOS = {"openai": "openai.json"}


class OutraContaNaoEnviada(Exception):
    pass


class LegadoNaoVinculado(Exception):
    pass


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
        """Sob a tranca: substituição atômica, modo 0600 desde o primeiro byte."""
        destino = self._caminho(nome)
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

    def reentrega(self, nome, chave, versao, conta=''):
        """True: mesmo valor aceito; False: conflito; None: precisa conferir."""
        with self._tranca:
            atual = self.documento(nome)
            revisao = atual.get('versao', 0)
            igual = (atual.get('chave', '') == chave and atual.get('conta', '') == conta)
            if igual and versao == revisao - 1:
                return True
            return None if versao == revisao else False

    def guardar(self, nome, chave, versao=0, conta='', em=None, nao_enviada=True):
        """CAS após validar; cópia da nuvem mantém a hora dela, não cria mudança."""
        with self._tranca:
            repetida = self.reentrega(nome, chave, versao, conta)
            if repetida is False:
                return False
            if repetida is True and (em is None or self.documento(nome).get('em', 0) == em):
                return True
            if self.documento(nome).get('versao', 0) != versao:
                return False
            anterior = self.documento(nome)
            self._gravar(nome, {'chave': chave, 'conta': conta,
                'versao': anterior.get('versao', 0) + 1,
                'em': em if em is not None else max(int(time.time() * 1000), anterior.get('em', 0) + 1),
                'naoEnviada': nao_enviada})
            return True

    def vincular_legado(self, nome, chave, conta, em, versao):
        """Prova exata: só transfere os metadados do valor que já é do dono."""
        with self._tranca:
            atual = self.documento(nome)
            if atual.get('chave', '') != chave or (atual.get('conta') and atual['conta'] != conta):
                return False
            if atual.get('versao', 0) != versao:
                return self.reentrega(nome, chave, versao, conta) is True
            if 'conta' in atual and 'naoEnviada' in atual:
                return atual['conta'] == conta
            return self.guardar(nome, chave, versao, conta, em=em)

    def apagar(self, nome, versao=0, conta=''):
        return self.guardar(nome, '', versao, conta)

    def sincronizar(self, nome, conta, nuvem, versao):
        """Um dono, sob a mesma tranca das mutações; nunca manda o valor de A a B."""
        with self._tranca:
            aqui = self.documento(nome)
            if aqui.get('versao', 0) != versao:
                return None
            def confirmado(resultado):
                atual = self.documento(nome)
                if atual.get('naoEnviada'):
                    atual['naoEnviada'] = False
                    self._gravar(nome, atual)
                return {'resultado': resultado, 'versao': atual.get('versao', 0)}
            chave = aqui.get('chave', '')
            if chave and 'conta' not in aqui:
                raise LegadoNaoVinculado()
            if aqui.get('conta') and aqui['conta'] != conta and aqui.get('naoEnviada', bool(chave)):
                raise OutraContaNaoEnviada()
            # A primeira tentativa já vincula o valor local ao UID capturado.
            # Uma falha da nuvem não pode deixá-lo solto para a próxima conta.
            if chave and not aqui.get('conta'):
                self.guardar(nome, chave, aqui.get('versao', 0), conta, em=aqui.get('em') or 1)
                aqui = self.documento(nome)
            remota = nuvem.ler()
            if not remota and not chave and not aqui.get('em'):
                return confirmado(None) # uma leitura vazia não é uma mudança
            if aqui.get('conta', '') != conta:
                valor = remota or {'chave': '', 'em': 0}
                self.guardar(nome, valor['chave'], aqui.get('versao', 0), conta, em=valor['em'], nao_enviada=False)
                return confirmado('chegou' if valor['chave'] else ('apagada' if chave else None))
            hora = aqui.get('em') or (1 if chave else 0)
            # Em empate, entrega uma mudança ainda não replicada; se já foi
            # replicada, recebe o valor observado na nuvem. Só confirma o
            # mesmo valor inteiro, nunca a igualdade da hora ou do sufixo.
            pendente = aqui.get('naoEnviada', bool(chave))
            empate = remota and remota['em'] == hora and remota['chave'] != chave
            if remota and (remota['em'] > hora or (empate and not pendente)):
                self.guardar(nome, remota['chave'], aqui.get('versao', 0), conta, em=remota['em'], nao_enviada=False)
                return confirmado('chegou' if remota['chave'] else 'apagada')
            if hora > (remota['em'] if remota else 0) or (empate and pendente):
                nuvem.gravar(chave, hora)
                return confirmado('subiu')
            return confirmado(None)
