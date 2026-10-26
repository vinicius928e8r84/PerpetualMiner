"""O perfil fixo do Anki (#149): os Cartões só entram no perfil que ficou marcado na primeira conexão.

O perfil marcado é o que estava aberto na primeira vez que a Conexão viu um perfil aberto, e só muda quando a pessoa escolhe outro
(“Perfil do Anki ▾” nas Configurações). Fica em `user_files/perfil.json` (`{"perfil": "<nome>"}`), que o Anki preserva nas
atualizações. Não há marca por padrão nem se adivinha: sem perfil aberto, nada fica marcado.

A conferência de gravar mora nos adaptadores da coleção (`no_anki.py`), que a fazem na thread principal do Anki, no mesmo passo
que grava: com outro perfil aberto, `OutroPerfil`; com o marcado renomeado ou apagado, `PerfilSumiu`. Aqui só se guarda e se compara.
"""

import json
import os
import threading

from .baralhos import OutroPerfil, PerfilSumiu


class PerfilFixo:
    def __init__(self, caminho):
        self._caminho = caminho
        self._tranca = threading.Lock()

    def marcado(self):
        """O nome do perfil marcado, ou None se nenhum perfil ficou marcado ainda (ou o arquivo não se lê)."""
        try:
            with open(self._caminho, encoding="utf-8") as arquivo:
                nome = json.load(arquivo).get("perfil")
        except (OSError, ValueError, AttributeError):
            return None
        return nome if isinstance(nome, str) and nome else None

    def marcar(self, nome):
        """Marca `nome`, escrevendo ao lado e trocando de uma vez. O mesmo nome de novo não muda nada."""
        with self._tranca:
            self._gravar(nome)

    def marcar_se_falta(self, aberto):
        """O perfil marcado; se nenhum está e há um perfil `aberto`, é ele que fica marcado (a primeira conexão)."""
        with self._tranca:
            marcado = self.marcado()
            if marcado is None and aberto:
                self._gravar(aberto)
                return aberto
            return marcado

    def conferir(self, aberto, existentes):
        """A conferência de gravar: não faz nada se `aberto` é o marcado; senão levanta `PerfilSumiu` (o marcado não está em
        `existentes`) ou `OutroPerfil`. Sem nenhum marcado, o `aberto` passa a ser."""
        marcado = self.marcar_se_falta(aberto)
        if marcado not in existentes:
            raise PerfilSumiu(marcado, aberto)
        if aberto != marcado:
            raise OutroPerfil(aberto, marcado)

    def _gravar(self, nome):
        if self.marcado() == nome:
            return
        os.makedirs(os.path.dirname(self._caminho), exist_ok=True)
        provisorio = self._caminho + ".novo"
        with open(provisorio, "w", encoding="utf-8") as arquivo:
            json.dump({"perfil": nome}, arquivo, ensure_ascii=False)
        os.replace(provisorio, self._caminho)
