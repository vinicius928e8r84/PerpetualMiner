import os
import subprocess

TAREFA = "PerpetualMinerAnkiBridge"
VIGIA = "PerpetualMinerAnkiBridgeWatchdog"
CHAVE_RUN = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
LANCADORES = ("perpetualminer-anki-bridge.cmd", "perpetualminer-anki-bridge.vbs")
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class PassagemFalhou(Exception):
    pass


def _executar_de_verdade(argumentos):
    resultado = subprocess.run(argumentos, capture_output=True, text=True, check=False, timeout=30, creationflags=SEM_JANELA)
    return resultado.returncode


class SistemaDoWindows:
    def __init__(self, *, ambiente, executar=_executar_de_verdade):
        self.ambiente = ambiente
        self.executar = executar

    def _pasta_inicializar(self):
        appdata = self.ambiente.get("APPDATA")
        return os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup") if appdata else None

    def _tarefa(self, nome):
        if self.executar(["schtasks", "/Query", "/TN", nome]) != 0:
            return False
        if self.executar(["schtasks", "/Delete", "/TN", nome, "/F"]) != 0:
            raise PassagemFalhou("a Tarefa Agendada %s não foi apagada" % nome)
        return True

    def _valor_do_run(self):
        if self.executar(["reg", "query", CHAVE_RUN, "/v", TAREFA]) != 0:
            return False
        if self.executar(["reg", "delete", CHAVE_RUN, "/v", TAREFA, "/f"]) != 0:
            raise PassagemFalhou("o valor %s de HKCU Run não foi apagado" % TAREFA)
        return True

    def _lancadores(self):
        pasta = self._pasta_inicializar()
        apagados = []
        for nome in LANCADORES if pasta else ():
            caminho = os.path.join(pasta, nome)
            if not os.path.exists(caminho):
                continue
            try:
                os.remove(caminho)
            except OSError as erro:
                raise PassagemFalhou("o lançador %s não foi apagado: %s" % (nome, erro)) from erro
            apagados.append(nome)
        return apagados

    def apagar_o_inicio_automatico(self):
        apagados = []
        if self._tarefa(TAREFA):
            apagados.append("tarefa")
        if self._valor_do_run():
            apagados.append("run")
        apagados += self._lancadores()
        if self._tarefa(VIGIA):
            apagados.append("vigia")
        return apagados

    def parar(self, pid):
        if not isinstance(pid, int) or pid <= 0:
            raise PassagemFalhou("a Conexão de hoje não disse qual é o processo dela")
        if self.executar(["taskkill", "/PID", str(pid), "/F"]) != 0:
            raise PassagemFalhou("o processo %d não foi encerrado" % pid)
