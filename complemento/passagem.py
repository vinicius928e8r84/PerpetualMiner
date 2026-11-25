import http.client
import json
import os
import socket
import time
from collections import namedtuple

from . import envio, passagem_das_copias as copias
from .passagem_do_windows import PassagemFalhou, SistemaDoWindows
from .configuracao import ENDERECO, PORTA

ARQUIVO_DA_MARCA = "passagem.json"
INTERVALO_S = 0.25
ESPERA_DA_PORTA_S = 10.0
OUTRAS_VEZES = 5

EsperasDaPassagem = namedtuple("EsperasDaPassagem", "dormir intervalo da_porta", defaults=(time.sleep, INTERVALO_S, ESPERA_DA_PORTA_S))
OQueSeCopiou = namedtuple("OQueSeCopiou", "chave custos prompts perfil fila")


def achar_a_antiga(porta=PORTA, espera=1.0):
    ligacao = http.client.HTTPConnection(ENDERECO, porta, timeout=espera)
    try:
        ligacao.request("GET", "/health")
        saude = json.loads(ligacao.getresponse().read().decode("utf-8"))
        tempo = saude["runtime"]
        pid = tempo["pid"]
        if saude.get("bridge") != "running" or type(pid) is not int:
            return None
        return copias.Antiga(pid, str(tempo["root"]), str(saude["automaticAnkiPath"]), str(tempo["jobsRoot"]), str(tempo["queueFile"]))
    except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError, AttributeError):
        return None
    finally:
        ligacao.close()


def _porta_ocupada(porta):
    with socket.socket() as soquete:
        soquete.settimeout(0.5)
        return soquete.connect_ex((ENDERECO, porta)) == 0


class Passagem:
    def __init__(self, *, sistema, porta=PORTA, esperas=EsperasDaPassagem()):
        self.sistema, self.porta, self.esperas = sistema, porta, esperas
        self.antiga = None

    def pendente(self, conexao):
        if os.path.exists(os.path.join(conexao.dados.raiz, ARQUIVO_DA_MARCA)):
            return False
        self.antiga = achar_a_antiga(self.porta)
        return self.antiga is not None

    def _ativa(self, antiga):
        try:
            with open(antiga.fila, encoding="utf-8") as arquivo:
                return any(item.get("status") == envio.RUNNING for item in json.load(arquivo).get("jobs", []))
        except (OSError, ValueError, AttributeError):
            return False

    def _esperar_o_envio_de_agora(self, antiga, conexao, cancelado):
        conexao.situacao_da_passagem = "esperando"
        try:
            while self._ativa(antiga):
                if cancelado():
                    raise PassagemFalhou("o Anki fechou durante a espera")
                self.esperas.dormir(self.esperas.intervalo)
        finally:
            conexao.situacao_da_passagem = None

    def _marcar_o_perfil(self, antiga, conexao):
        perfil = copias.perfil_de_hoje(antiga)
        if perfil is None or perfil not in conexao.colecao.perfis():
            return None
        conexao.perfil_fixo.marcar(perfil)
        conexao.ao_mudar_o_perfil()
        return perfil

    def _passar_a_fila(self, antiga, conexao):
        total = {"historico": 0, "fila": 0, "recusados": []}
        for _ in range(OUTRAS_VEZES):
            feito = copias.passar_a_fila(antiga, conexao.fila)
            novos = feito["historico"] + feito["fila"]
            total["historico"] += feito["historico"]
            total["fila"] += feito["fila"]
            total["recusados"] = feito["recusados"]
            if not novos:
                break
        return total

    def fazer(self, conexao, cancelado=lambda: False):
        antiga = self.antiga or achar_a_antiga(self.porta)
        if antiga is None:
            return None
        logger = conexao.logger
        logger.info("Passagem: a Conexão de hoje (processo %d) está na porta %d", antiga.pid, self.porta)
        self._esperar_o_envio_de_agora(antiga, conexao, cancelado)
        copiado = self._copiar(antiga, conexao)
        apagados = self.sistema.apagar_o_inicio_automatico()
        agora = achar_a_antiga(self.porta)
        if agora is not None and agora.pid != antiga.pid:
            raise PassagemFalhou("a Conexão de hoje mudou de processo durante a passagem")
        if agora is not None:
            self.sistema.parar(antiga.pid)
        self._esperar_a_porta()
        self._anotar(conexao, copiado, apagados)
        logger.info("Passagem: a Conexão de hoje saiu e a porta %d está livre", self.porta)
        return True

    def _copiar(self, antiga, conexao):
        copiado = OQueSeCopiou(
            chave=copias.copiar_a_chave(antiga, conexao.cofre),
            custos=copias.copiar_os_custos(antiga, conexao.fila),
            prompts=copias.copiar_os_prompts_editados(antiga, os.path.join(conexao.dados.raiz, "prompts")),
            perfil=self._marcar_o_perfil(antiga, conexao),
            fila=self._passar_a_fila(antiga, conexao),
        )
        conexao.logger.info("Passagem: chave %s, custos de %d Envios, prompts %s, perfil %s, Envios %s", copiado.chave, copiado.custos, copiado.prompts,
                            copiado.perfil, {k: v for k, v in copiado.fila.items() if k != "recusados"})
        return copiado

    def _esperar_a_porta(self):
        fim = time.monotonic() + self.esperas.da_porta
        while _porta_ocupada(self.porta):
            if time.monotonic() >= fim:
                raise PassagemFalhou("a porta %d continua ocupada" % self.porta)
            self.esperas.dormir(self.esperas.intervalo)

    def _anotar(self, conexao, copiado, apagados):
        fila = copiado.fila
        envio._gravar_json(os.path.join(conexao.dados.raiz, ARQUIVO_DA_MARCA), {
            "feita": True, "chave": copiado.chave, "custos": copiado.custos, "prompts": copiado.prompts, "perfil": copiado.perfil,
            "historico": fila["historico"], "fila": fila["fila"], "recusados": fila["recusados"], "iniciosApagados": apagados,
        })


def deste_computador(*, plataforma, ambiente, porta=PORTA):
    if plataforma != "win32":
        return None
    return Passagem(sistema=SistemaDoWindows(ambiente=ambiente), porta=porta)
