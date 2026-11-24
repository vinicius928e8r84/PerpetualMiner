"""O explorador do Envio: o Apagar tudo e a morte da Conexão em cada fronteira da thread de trabalho.

`test_envio_fronteiras.py` mata a Conexão em cada gravação, mas com a thread de trabalho desligada no Apagar tudo. Aqui o
trabalho (`envio.Trabalho.fazer`) roda de verdade, e em cada fronteira dele (cada leitura e cada gravação do estado, o pedido
da linha, o texto gravado e o momento logo depois dele) o explorador escolhe: seguir, atender o Apagar tudo inteiro,
matar a Conexão, ou os dois (o Apagar tudo, depois a morte em qualquer fronteira adiante). Depois sobe outra Conexão na mesma
pasta, deixa a fila terminar e confere o que o Envio promete:

- depois do Apagar tudo respondido, nem a Palavra nem a Frase ficam em `user_files`, mesmo com a morte no meio;
- depois dele, no máximo o pedido à OpenAI e a nota que já iam a caminho (um Cartão: a linha já tinha sido lida e o pedido
  já saía); o segundo Cartão nunca é feito;
- do apagado não se sai (`job_wiped` ao tentar de novo);
- nenhum id fica encalhado, e sem Apagar tudo todo Cartão vira uma nota só.

Limite escrito: um Envio de dois Cartões (de um, nas combinações), uma morte e um Apagar tudo por rodada; a morte depois do Apagar tudo, nas duas
fronteiras seguintes e na última (todas as combinações custariam uns 10 minutos). A corrida real pela tranca (a thread que
acorda antes de o Apagar tudo gravar) não entra: cada pedido aqui é atendido inteiro entre duas fronteiras.

    python3.9 complemento/test_envio_explorador.py

Para ver o explorador falhar: tire de `Fila.recuperar_os_interrompidos` a limpeza dos textos do Envio apagado.
"""

import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_envio import ID, INGLES, LINHA, PALAVRA, SENTINELAS, EnvioNoTeste, arquivos_sem_o_log, chats, pedido


def Morte():
    return SystemExit("a Conexão morreu aqui")


SEGUNDA = "late : Better late than never [Context: Série - Cervejaria zorblax - S01E02]"


def o_envio(cartoes):
    """Um Envio de uma ou duas Frases, todas com a Palavra ou o texto únicos das sentinelas."""
    return pedido(ID, *(LINHA, SEGUNDA)[:cartoes])


def o_trabalho_de(conexao, fila, colecao):
    c = conexao.conexao
    return envio.Trabalho(fila, colecao, c.ia, c.logger, conexao.openai.base, threading.Event(), espera_do_anki=0.01,
                          esperas_da_openai=(0, 0), openverse_base=conexao.openverse.base, voz_base=conexao.voz.base)


class Explorador:
    """Conta as fronteiras do trabalho e, na de número escolhido, faz o que o plano manda: `apagar` e/ou `morrer`."""

    LEITURAS_E_GRAVACOES = ("estado", "estado_ou_refazer", "pedido", "mudar", "linha_do_cartao", "cartao_chegou")

    def __init__(self, fila, plano):
        self.fila, self.plano = fila, plano
        self.contadas = 0
        self.antes_da_escrita = None
        self.dentro = False
        self.apagou = None
        self.openai = self.colecao = None

    def passar(self):
        if self.dentro or self.fila.tranca._is_owned():
            return
        numero, self.contadas = self.contadas, self.contadas + 1
        for acao in self.plano.get(numero, ()):
            if acao == "apagar":
                self.dentro = True
                try:
                    self.fila.apagar_as_frases()
                finally:
                    self.dentro = False
                self.apagou = (len(chats(self.openai)), len(self.colecao.gravadas))
            else:
                raise Morte()

    def ligadas(self):
        explorador = self
        patches = []
        for nome in self.LEITURAS_E_GRAVACOES:
            original = getattr(envio.Fila, nome)

            def com_fronteira(fila, *argumentos, _original=original, **nomeados):
                explorador.passar()
                return _original(fila, *argumentos, **nomeados)

            patches.append(mock.patch.object(envio.Fila, nome, com_fronteira))
        motor = envio.motor_do_complemento().generate_cards
        gravar_texto = motor._write_card

        def _write_card(*argumentos):
            explorador.antes_da_escrita = explorador.contadas
            explorador.passar()
            gravar_texto(*argumentos)
            explorador.passar()

        patches.append(mock.patch.object(motor, "_write_card", _write_card))
        return patches

    def __enter__(self):
        for patch in self.ligadas():
            patch.start()
            self.__dict__.setdefault("_ligados", []).append(patch)
        return self

    def __exit__(self, *erro):
        for patch in self._ligados:
            patch.stop()


def fila_ids_encalhados(pasta):
    try:
        with open(os.path.join(pasta, "fila", "fila.json"), encoding="utf-8") as arquivo:
            ids = [item["jobId"] for item in json.load(arquivo)["jobs"]]
    except (OSError, ValueError):
        return []
    return [i for i in ids if not (os.path.exists(os.path.join(pasta, "fila", i + ".json")) and os.path.exists(os.path.join(pasta, "estado", i + ".json")))]


def recomecar(conexao):
    """Uma pasta de dados vazia e a OpenAI sem pedidos: cada rodada começa do zero, sem subir outro servidor."""
    for nome in ("fila", "estado", "custos"):
        pasta = getattr(conexao.conexao.dados, nome)
        shutil.rmtree(pasta, ignore_errors=True)
        os.makedirs(pasta)
    del conexao.openai.chats[:]


def trabalhar(trabalho, fila, job):
    """O que a thread de trabalho faz com um Envio (`trabalhador.py:_rodar`): o erro dela vira o fim do Envio; a morte a leva."""
    try:
        try:
            trabalho.fazer(job)
        except Exception:
            trabalho._terminar(job, fila.pedido(job) or {}, "internal_error")
    except SystemExit:
        pass


def rodar(conexao, plano, cartoes=2):
    """Uma rodada: o trabalho com o plano; a Conexão "sobe de novo" (uma `Fila` nova na mesma pasta) e termina a fila."""
    recomecar(conexao)
    dados, c = conexao.conexao.dados, conexao.conexao
    colecao = ColecaoEmMemoria(INGLES)
    assert conexao.criar(o_envio(cartoes))[0] == 201
    fila = c.fila
    explorador = Explorador(fila, plano)
    explorador.openai, explorador.colecao = conexao.openai, colecao
    trabalho = o_trabalho_de(conexao, fila, colecao)
    with explorador:
        trabalhar(trabalho, fila, fila.reservar_o_proximo())
    fila = envio.Fila(dados, c.fila.motor, c.logger)
    fila.recuperar_os_interrompidos()
    trabalho = o_trabalho_de(conexao, fila, colecao)
    while True:
        job = fila.reservar_o_proximo()
        if job is None:
            break
        trabalhar(trabalho, fila, job)
    estado = fila.estado(ID)
    retomada = json.loads(conexao.pedir("POST", "/jobs/retry", corpo={"jobId": ID})[2])
    palavras = sorted(nota["campos"]["Palavra"].split(" - ")[0] for nota in colecao.gravadas)
    return explorador, dict(
        estado=estado, retomada=retomada, arquivos=arquivos_sem_o_log(conexao), encalhados=fila_ids_encalhados(dados.raiz),
        palavras=palavras, cartoes=cartoes, pedidos_no_fim=len(chats(conexao.openai)), notas=len(colecao.gravadas))


def conferir(caso, plano, explorador, fim):
    rotulo = "plano %s" % (plano,)
    caso.assertEqual(fim["encalhados"], [], "%s: id encalhado na fila" % rotulo)
    caso.assertEqual(len(fim["palavras"]), len(set(fim["palavras"])), "%s: um Cartão virou duas notas" % rotulo)
    if explorador.apagou is None:
        caso.assertFalse([a for acoes in plano.values() for a in acoes if a == "apagar"], "%s: o Apagar tudo planejado não rodou" % rotulo)
        caso.assertEqual((fim["estado"]["status"], fim["palavras"]), ("completed", sorted([PALAVRA, "late"][:fim["cartoes"]])), rotulo)
        return
    pedidos_no_apagar, notas_no_apagar = explorador.apagou
    caso.assertTrue(fim["estado"].get("wiped"), "%s: o Envio apagado perdeu a marca" % rotulo)
    caso.assertEqual((fim["estado"]["status"], fim["retomada"]), ("failed", {"error": "job_wiped"}), "%s: do apagado não se sai" % rotulo)
    caso.assertLessEqual(fim["pedidos_no_fim"], pedidos_no_apagar + 1, "%s: gastou com a OpenAI além do pedido que já ia a caminho" % rotulo)
    caso.assertLessEqual(fim["notas"], notas_no_apagar + 1, "%s: entrou mais de uma nota depois do Apagar tudo" % rotulo)
    for sentinela in SENTINELAS:
        for nome, conteudo in fim["arquivos"].items():
            caso.assertNotIn(sentinela.encode(), conteudo, "%s: %s ficou em %s" % (rotulo, sentinela, nome))


class OApagarTudoEAMorteEmCadaFronteiraDoTrabalho(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pasta = tempfile.TemporaryDirectory()
        cls.conexao = EnvioNoTeste(cls.pasta.name, trabalhando=False)
        cls.conexao.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.conexao.__exit__(None, None, None)
        cls.pasta.cleanup()

    def test_o_explorador_ve_as_fronteiras_do_trabalho(self):
        explorador, _ = rodar(self.conexao, {})
        self.assertGreater(explorador.contadas, 30, "o contador devia ver as leituras, as gravações e o texto do trabalho")

    def test_o_texto_gravado_depois_do_apagar_tudo_e_antes_da_conferencia_nao_fica_se_a_conexao_morre_ali(self):
        antes = rodar(self.conexao, {}, cartoes=1)[0].antes_da_escrita
        plano = {antes: ("apagar",), antes + 1: ("morrer",)}
        explorador, fim = rodar(self.conexao, plano, cartoes=1)
        conferir(self, plano, explorador, fim)
        self.assertEqual([nome for nome in fim["arquivos"] if nome.endswith(".txt")], [])

    def test_um_apagar_tudo_ou_uma_morte_em_qualquer_fronteira_nao_deixa_a_frase_nem_gasta_de_novo(self):
        total = rodar(self.conexao, {})[0].contadas
        for ponto in range(total):
            for acoes in (("apagar",), ("morrer",), ("apagar", "morrer")):
                plano = {ponto: acoes}
                with self.subTest(plano=plano):
                    explorador, fim = rodar(self.conexao, plano)
                    conferir(self, plano, explorador, fim)

    def test_o_apagar_tudo_e_depois_a_morte_logo_adiante_ou_no_fim_nao_deixa_a_frase(self):
        total = rodar(self.conexao, {}, cartoes=1)[0].contadas
        for apagar in range(total):
            for morrer in sorted({apagar + 1, apagar + 2, total - 1} & set(range(apagar + 1, total))):
                plano = {apagar: ("apagar",), morrer: ("morrer",)}
                with self.subTest(plano=plano):
                    explorador, fim = rodar(self.conexao, plano, cartoes=1)
                    conferir(self, plano, explorador, fim)


if __name__ == "__main__":
    unittest.main()
