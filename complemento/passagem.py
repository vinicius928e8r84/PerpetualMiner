"""A passagem do Windows do dono (#178): na primeira vez que abre, a Conexão nova acha a de hoje na porta 8766 e faz a passagem sozinha.

O que a pessoa vê é só o fim: a Conexão de hoje sai e esta ocupa a porta. Antes disso, nesta ordem, e sem perguntar nada:

1. espera o Envio de agora terminar (“Esperando o Envio de agora terminar”, na janela de dentro do Anki);
2. copia a chave, o histórico de custos e só os prompts editados, marca o perfil do Anki da configuração de hoje (a única coisa que
   se aproveita dela) e passa os Envios (a fila que não começou entra na fila daqui; o que terminou entra como histórico);
3. apaga o início automático (as três entradas e o vigia) e encerra o processo da Conexão de hoje;
4. espera a porta ficar livre e anota em `user_files/passagem.json` que acabou. Só então a Conexão nova sobe (`Conexao.iniciar_depois`).

**Copiar, nunca mover:** a pasta do projeto de hoje, os Cartões no Anki e o que se copiou ficam onde estavam. Qualquer passo que falha deixa a Conexão
de hoje no ar (a porta só é liberada depois de tudo copiado) e a passagem tenta de novo na próxima vez que o Anki abrir.

Este código só serve ao PC do dono e sai numa versão seguinte: `inicio.py` o chama por um gancho só (`passagem=None` o desliga).
O sistema (Windows) entra por `sistema` (`passagem_do_windows.py`); os testes põem um de mentira. Desenho: `docs/design/passagem-do-windows.md`.
"""

import http.client
import json
import os
import socket
import time

from . import envio, passagem_das_copias as copias
from .passagem_do_windows import PassagemFalhou, SistemaDoWindows
from .configuracao import ENDERECO, PORTA

ARQUIVO_DA_MARCA = "passagem.json"
INTERVALO_S = 0.25  # curto: a Conexão de hoje liga o Envio seguinte logo que um termina, e o que ela ligou nesse meio-tempo passa também
ESPERA_DA_PORTA_S = 10.0
OUTRAS_VEZES = 5  # quantas vezes a fila de hoje é relida, até uma leitura sem Envio novo


def achar_a_antiga(porta=PORTA, espera=1.0):
    """A Conexão de hoje na porta (`Antiga`), ou None: a porta livre, outro programa, ou esta própria Conexão não são ela.
    Ela se descreve no `GET /health` (`bridge: "running"`, o processo, a pasta do projeto e onde ficam o motor, a fila e os Envios)."""
    ligacao = http.client.HTTPConnection(ENDERECO, porta, timeout=espera)  # sem `urlopen`: ele monta o contexto TLS, que não vale aqui
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
    def __init__(self, *, sistema, porta=PORTA, dormir=time.sleep, intervalo=INTERVALO_S, espera_da_porta=ESPERA_DA_PORTA_S):
        self.sistema, self.porta, self.dormir = sistema, porta, dormir
        self.intervalo, self.espera_da_porta = intervalo, espera_da_porta
        self.antiga = None

    def pendente(self, conexao):
        """Há uma Conexão de hoje na porta, e a passagem ainda não acabou neste computador?"""
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
                self.dormir(self.intervalo)
        finally:
            conexao.situacao_da_passagem = None

    def _marcar_o_perfil(self, antiga, conexao):
        perfil = copias.perfil_de_hoje(antiga)
        if perfil is None or perfil not in conexao.colecao.perfis():
            return None  # o Anki não tem esse perfil: marcar um que some faria o Envio esperar para sempre
        conexao.perfil_fixo.marcar(perfil)
        conexao.ao_mudar_o_perfil()
        return perfil

    def _passar_a_fila(self, antiga, conexao):
        total = {"historico": 0, "fila": 0, "recusados": []}
        for _ in range(OUTRAS_VEZES):  # o que a Conexão de hoje ligou ou recebeu enquanto se copiava passa também
            feito = copias.passar_a_fila(antiga, conexao.fila)
            novos = feito["historico"] + feito["fila"]
            total["historico"] += feito["historico"]
            total["fila"] += feito["fila"]
            total["recusados"] = feito["recusados"]
            if not novos:
                break
        return total

    def fazer(self, conexao, cancelado=lambda: False):
        """Toda a passagem, ou `PassagemFalhou`/um erro: a Conexão de hoje só sai depois de tudo copiado."""
        antiga = self.antiga or achar_a_antiga(self.porta)
        if antiga is None:
            return None
        logger = conexao.logger
        logger.info("Passagem: a Conexão de hoje (processo %d) está na porta %d", antiga.pid, self.porta)
        self._esperar_o_envio_de_agora(antiga, conexao, cancelado)
        chave = copias.copiar_a_chave(antiga, conexao.cofre)
        custos = copias.copiar_os_custos(antiga, conexao.fila)
        prompts = copias.copiar_os_prompts_editados(antiga, os.path.join(conexao.dados.raiz, "prompts"))
        perfil = self._marcar_o_perfil(antiga, conexao)
        fila = self._passar_a_fila(antiga, conexao)
        logger.info("Passagem: chave %s, custos de %d Envios, prompts %s, perfil %s, Envios %s", chave, custos, prompts, perfil, {k: v for k, v in fila.items() if k != "recusados"})
        apagados = self.sistema.apagar_o_inicio_automatico()
        agora = achar_a_antiga(self.porta)
        if agora is not None and agora.pid != antiga.pid:
            raise PassagemFalhou("a Conexão de hoje mudou de processo durante a passagem")
        if agora is not None:
            self.sistema.parar(antiga.pid)
        self._esperar_a_porta()
        self._anotar(conexao, chave, custos, prompts, perfil, fila, apagados)
        logger.info("Passagem: a Conexão de hoje saiu e a porta %d está livre", self.porta)
        return True

    def _esperar_a_porta(self):
        fim = time.monotonic() + self.espera_da_porta
        while _porta_ocupada(self.porta):
            if time.monotonic() >= fim:
                raise PassagemFalhou("a porta %d continua ocupada" % self.porta)
            self.dormir(self.intervalo)

    def _anotar(self, conexao, chave, custos, prompts, perfil, fila, apagados):
        envio._gravar_json(os.path.join(conexao.dados.raiz, ARQUIVO_DA_MARCA), {
            "feita": True, "chave": chave, "custos": custos, "prompts": prompts, "perfil": perfil,
            "historico": fila["historico"], "fila": fila["fila"], "recusados": fila["recusados"], "iniciosApagados": apagados,
        })


def deste_computador(*, plataforma, ambiente, porta=PORTA):
    """A passagem deste computador: só no Windows (a Conexão de hoje do dono é a dele); em outro sistema, None."""
    if plataforma != "win32":
        return None
    return Passagem(sistema=SistemaDoWindows(ambiente=ambiente), porta=porta)
