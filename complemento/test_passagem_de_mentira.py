"""O apoio dos testes da passagem (#178): o Windows de mentira, a Conexão nova com a passagem por cima e a Conexão de hoje com os Envios do dono.

Não é um teste: `test_passagem.py` e `test_passagem_cartoes.py` o importam.
"""

import os
import time

from complemento import passagem
from complemento.passagem_do_windows import PassagemFalhou
from complemento.test_conexao_antiga_de_mentira import PID, ConexaoAntigaDeMentira
from complemento.test_envio import ID, OUTRO_ID, EnvioNoTeste

CHAVE_DO_DONO = "sk-proj-chave-do-dono-0001"
TERCEIRO_ID = "99999999-8888-4777-8666-555555555555"
PROMPT_EDITADO = "Você é o meu professor de inglês, do meu jeito.\n"
LINHA = "gave up : She gave up smoking [Context: Série - The Office - S01E01]"


class SistemaDeMentira:
    """O Windows de mentira: guarda o que a passagem pediu, na ordem, e ao parar o processo fecha a Conexão de hoje de mentira."""

    def __init__(self, antiga, eventos, ao_parar=lambda: None, falha_em=None):
        self.antiga, self.eventos, self.ao_parar, self.falha_em = antiga, eventos, ao_parar, falha_em
        self.inicio_apagado = False

    def apagar_o_inicio_automatico(self):
        if self.falha_em == "inicio":
            raise PassagemFalhou("o vigia não foi apagado")
        self.eventos.append("inicio_apagado")
        self.inicio_apagado = True
        return ["tarefa", "run", "perpetualminer-anki-bridge.vbs", "vigia"]

    def parar(self, pid):
        assert pid == PID, "só o processo que a Conexão de hoje disse"
        if self.falha_em == "parar":
            raise PassagemFalhou("o processo não foi encerrado")
        self.ao_parar()
        self.eventos.append("processo_parado")
        self.antiga.parar()


class NaPassagem:
    """A Conexão nova (porta da Conexão de hoje de mentira, uma coleção e a thread de trabalho ligada) e a passagem por cima dela."""

    def __init__(self, pasta, antiga, colecao=None, falha_em=None, **envio_no_teste):
        self.antiga, self.eventos, self.fotografias, self.dormiu = antiga, [], [], []
        envio_no_teste.setdefault("trabalhando", True)
        os.makedirs(os.path.join(pasta, "novo"))
        self.novo = EnvioNoTeste(os.path.join(pasta, "novo"), colecao=colecao, chave=None, **envio_no_teste)
        self.conexao = self.novo.conexao
        self.conexao.porta = antiga.porta
        self.sistema = SistemaDeMentira(antiga, self.eventos, ao_parar=lambda: self.fotografias.append(self.fotografar()), falha_em=falha_em)
        self.passagem = passagem.Passagem(sistema=self.sistema, porta=antiga.porta, dormir=self._dormir, intervalo=0, espera_da_porta=5)
        self.a_cada_espera = lambda vez: None

    def _dormir(self, _segundos):
        self.dormiu.append((self.novo_arquivos(), self.conexao.situacao_da_passagem))
        self.a_cada_espera(len(self.dormiu))
        time.sleep(0.005)

    def novo_arquivos(self):
        return sorted(n for n in self.novo.arquivos() if not n.startswith("logs") and n != "pareamento.json")

    def fotografar(self):
        """O que já está guardado aqui no instante em que a Conexão de hoje é encerrada."""
        cofre = self.conexao.cofre
        return {
            "chave": cofre.ler("openai"), "custos": sorted(n for n in self.novo.arquivos() if n.startswith("custos")),
            "prompts": sorted(n for n in self.novo.arquivos() if n.startswith("prompts")),
            "perfil": self.conexao.perfil_fixo.marcado(), "fila": [item["jobId"] for item in self.conexao.fila.ordem()],
            "inicio_apagado": self.sistema.inicio_apagado,
        }

    def __enter__(self):
        for de_mentira in self.novo.de_mentira:
            de_mentira.__enter__()
        return self

    def passar(self):
        """Sobe a Conexão nova atrás da passagem, como o `inicio` faz, e espera o fim dela (a Conexão ouvindo, ou a passagem desistindo)."""
        assert self.passagem.pendente(self.conexao), "devia haver uma Conexão de hoje na porta"
        self.conexao.iniciar_depois(lambda cancelado: self.passagem.fazer(self.conexao, cancelado))
        self.conexao._thread_da_passagem.join(timeout=30)
        return self

    @property
    def no_ar(self):
        return self.conexao._servidor is not None

    def __exit__(self, *erro):
        self.conexao.parar()
        for de_mentira in self.novo.de_mentira:
            de_mentira.__exit__(*erro)
        for handler in list(self.novo.logger.handlers):
            handler.close()

    def log(self):
        return self.novo.log()


def uma_conexao_de_hoje(pasta, **argumentos):
    """A Conexão de hoje do dono: um Envio andando, um que nem começou, um que já terminou (com custos) e um prompt editado."""
    antiga = ConexaoAntigaDeMentira(pasta, prompts={"en_card.txt": PROMPT_EDITADO}, **argumentos)
    antiga.envio("20260101-100000-en-aaaaaa", "completed", [(1, "give up : She gave up"), (2, "run : They run")], prontas=[1, 2], custos=[
        {"date": "2026-01-01", "type": "tokens", "model": "gpt-4o", "input_tokens": 1000, "output_tokens": 200, "cost_usd": 0.0045, "keyword": "give up"},
        {"date": "2026-01-01", "type": "tokens", "model": "gpt-4o-mini", "input_tokens": 100, "output_tokens": 20, "cost_usd": 0.0001, "keyword": "[image_judge] give up"},
    ], criado="2026-01-01T10:00:00-03:00")
    antiga.envio(ID, "running", [(10, LINHA)], criado="2026-10-01T10:00:00-03:00")
    antiga.envio(OUTRO_ID, "queued", [(20, "late : She is late"), (21, "ready : Are you ready")], prontas=[21], criado="2026-10-01T10:01:00-03:00")
    return antiga
