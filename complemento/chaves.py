"""O cofre das chaves da Conexão: um arquivo por chave, só do dono, fora de tudo o que o complemento mostra.

A chave mora em `user_files/chaves/` (o Anki preserva `user_files` nas atualizações) e em mais lugar nenhum:
nem na configuração do complemento, nem em `fila`, `estado`, `custos` ou `logs` (o pacote de diagnóstico
lê essas), e o `.ankiaddon` que vai ao AnkiWeb nunca leva `user_files`. Quem pergunta pela chave recebe só
os 4 últimos caracteres (`ultimos4`); a chave inteira só sai daqui para o pedido que a gasta, na OpenAI.
"""

import json
import os
import threading

_ARQUIVOS = {"openai": "openai.json"}


class Cofre:
    def __init__(self, pasta):
        self._pasta = pasta
        self._tranca = threading.Lock()

    def _caminho(self, nome):
        return os.path.join(self._pasta, _ARQUIVOS[nome])

    def ler(self, nome):
        """A chave inteira, ou None. Só para quem vai usá-la: nunca para uma resposta nem para o log."""
        try:
            with open(self._caminho(nome), encoding="utf-8") as arquivo:
                chave = json.load(arquivo).get("chave")
        except (OSError, ValueError, AttributeError):
            return None
        return chave if isinstance(chave, str) and chave else None

    def ultimos4(self, nome):
        chave = self.ler(nome)
        return chave[-4:] if chave else None

    def guardar(self, nome, chave):
        """Grava de uma vez só (arquivo novo e `os.replace`), com a permissão só do dono desde o primeiro byte."""
        destino = self._caminho(nome)
        temporario = destino + ".novo"
        with self._tranca:
            try:
                os.remove(temporario)
            except OSError:
                pass
            descritor = os.open(temporario, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
                    json.dump({"chave": chave}, arquivo)
                os.replace(temporario, destino)
            except BaseException:
                try:
                    os.remove(temporario)
                except OSError:
                    pass
                raise
