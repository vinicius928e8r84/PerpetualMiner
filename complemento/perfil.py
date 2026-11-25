import json
import os
import threading

from .baralhos import OutroPerfil, PerfilIlegivel, PerfilSumiu


class PerfilFixo:
    def __init__(self, caminho):
        self._caminho = caminho
        self._tranca = threading.Lock()

    def marcado(self):
        try:
            with open(self._caminho, encoding="utf-8") as arquivo:
                nome = json.load(arquivo).get("perfil")
        except FileNotFoundError:
            return None
        except (OSError, ValueError, AttributeError):
            raise PerfilIlegivel() from None
        return nome if isinstance(nome, str) and nome else None

    def marcar(self, nome):
        with self._tranca:
            self._gravar(nome)

    def marcar_se_falta(self, aberto):
        with self._tranca:
            marcado = self.marcado()
            if marcado is None and aberto:
                self._gravar(aberto)
                return aberto
            return marcado

    def conferir(self, aberto, existentes):
        marcado = self.marcar_se_falta(aberto)
        if marcado not in existentes:
            raise PerfilSumiu(marcado, aberto)
        if aberto != marcado:
            raise OutroPerfil(aberto, marcado)

    def _gravar(self, nome):
        try:
            if self.marcado() == nome:
                return
        except PerfilIlegivel:
            pass
        os.makedirs(os.path.dirname(self._caminho), exist_ok=True)
        provisorio = self._caminho + ".novo"
        with open(provisorio, "w", encoding="utf-8") as arquivo:
            json.dump({"perfil": nome}, arquivo, ensure_ascii=False)
        os.replace(provisorio, self._caminho)
