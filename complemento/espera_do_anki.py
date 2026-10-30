"""A espera do Envio pelo Anki (#142, #149): a coleção que falta, sincroniza ou está noutro perfil não derruba o Envio, que espera e tenta de novo.

`Trabalho` (`envio.py`) herda daqui; usa `fila`, `colecao`, `logger`, `espera_do_anki`, `_dormir` e `_etapa` dele.
"""

from . import baralhos


class Interrompido(Exception):
    """A Conexão está parando (o Anki fecha): o Envio fica `running` e volta à fila quando ela subir de novo."""


class Apagado(Exception):
    """O Apagar tudo veio com o Envio andando: ele para onde está (o estado já diz `failed` com `wiped`)."""


def _espera_pelo_perfil(motivo):
    """O que o estado do Envio diz da espera quando o motivo é o perfil (#149); None para qualquer outro motivo."""
    if isinstance(motivo, baralhos.OutroPerfil):
        return {"reason": "other_profile", "profile": motivo.aberto, "marked": motivo.marcado}
    if isinstance(motivo, baralhos.PerfilSumiu):
        return {"reason": "profile_missing", "profile": motivo.aberto, "marked": motivo.marcado}
    return None


class EsperaDoAnki:
    """O que o `Trabalho` faz para falar com a coleção do Anki e esperá-la."""

    def _com_a_colecao(self, job_id, leitura):
        """Roda `leitura()` na coleção; sem ela (perfil fechado, sincronizando, ocupado), espera em `wait_anki` e tenta de novo."""
        esperando_desde = None
        while True:
            try:
                resultado = leitura()
            except baralhos.ColecaoIndisponivel as motivo:
                if esperando_desde is None:
                    esperando_desde = self.fila.estado(job_id).get("stage")
                    self.logger.info("Envio %s: esperando o Anki (%s)", job_id, motivo)
                    self._etapa(job_id, "wait_anki")
                self._dizer_a_espera(job_id, _espera_pelo_perfil(motivo))
                if str(motivo) == "collection_not_open":
                    self._entrar_no_perfil(job_id)
                self._dormir(self.espera_do_anki)
                if self.fila.estado(job_id).get("wiped"):
                    raise Apagado()
                continue
            if esperando_desde is not None:
                self._dizer_a_espera(job_id, None)
            if esperando_desde not in (None, "queued", "wait_anki"):
                self._etapa(job_id, esperando_desde)
            return resultado

    def _dizer_a_espera(self, job_id, espera):
        """O estado diz por que o Envio espera quando é o perfil (`waiting`, que o painel lê); só grava se mudou."""
        if self.fila.estado(job_id).get("waiting") == espera:
            return

        def mudanca(estado):
            if espera:
                estado["waiting"] = espera
            else:
                estado.pop("waiting", None)

        self.fila.mudar(job_id, mudanca)

    def _entrar_no_perfil(self, job_id):
        """O Anki está na tela de perfis (ou fechado o perfil): ninguém estuda, e a Conexão abre o perfil marcado. Com um perfil aberto o
        adaptador não faz nada, e a troca só vem do clique da pessoa."""
        try:
            if self.colecao.entrar_no_perfil_fixo():
                self.logger.info("Envio %s: o Anki estava sem perfil aberto; a Conexão abriu o perfil marcado", job_id)
        except Exception as erro:  # o Envio só continua esperando
            self.logger.warning("Envio %s: não deu para abrir o perfil marcado (%s)", job_id, type(erro).__name__)
