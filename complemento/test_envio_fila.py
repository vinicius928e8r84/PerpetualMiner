import copy
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import envio, pasta_de_dados

ID = "11111111-2222-4333-8444-555555555555"
OUTRO = "66666666-7777-4888-9999-aaaaaaaaaaaa"
ORFAO = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"
FRASE, SEGUNDA = 1760000000000, 1760000000001
LINHA = "keep running | run : They keep running"
CRIADO = "2026-11-20T10:00:00-03:00"
MOTOR = envio.motor_do_complemento()


def cartao(frase, status, erro=None):
    return {"phraseId": frase, "status": status, "error": erro}


def um_pedido(job_id, *entradas, **campos):
    return dict({"jobId": job_id, "lang": "en", "deckName": "Inglês", "createdAt": CRIADO, "corpoSha256": "f" * 64,
                 "entries": list(entradas)}, **campos)


def um_estado(job_id, status, cartoes, **campos):
    etapa = campos.pop("stage", status)
    return dict({"jobId": job_id, "status": status, "stage": etapa, "completedStages": [], "progress": {}, "successfulPhraseIds": [],
                 "failedPhraseIds": [], "duplicatePhraseIds": [], "lastError": None, "updatedAt": CRIADO, "cards": cartoes}, **campos)


class PastaDoEnvio:
    def __init__(self, pasta):
        self.dados = pasta_de_dados.preparar(pasta)
        self.fila = envio.Fila(self.dados, MOTOR)

    def gravar(self, caminho, conteudo):
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        with open(caminho, "w", encoding="utf-8") as arquivo:
            json.dump(conteudo, arquivo) if not isinstance(conteudo, str) else arquivo.write(conteudo)

    def com(self, pedido=None, estado=None, textos=(), job_id=ID):
        if pedido is not None:
            self.gravar(os.path.join(self.dados.fila, job_id + ".json"), pedido)
        if estado is not None:
            self.gravar(os.path.join(self.dados.estado, job_id + ".json"), estado)
        for nome in textos:
            self.gravar(os.path.join(self.dados.estado, job_id, nome), "texto pago de " + nome)
        return self

    def na_fila(self, *ids):
        self.gravar(os.path.join(self.dados.fila, "fila.json"), {"jobs": [{"jobId": i, "lang": "en", "createdAt": CRIADO} for i in ids]})
        return self

    def ler(self, pasta, job_id=ID):
        try:
            with open(os.path.join(getattr(self.dados, pasta), job_id + ".json"), encoding="utf-8") as arquivo:
                return json.load(arquivo)
        except FileNotFoundError:
            return None

    def retrato(self):
        arquivos = {}
        for raiz, _, nomes in os.walk(self.dados.raiz):
            for nome in nomes:
                caminho = os.path.join(raiz, nome)
                with open(caminho, "rb") as arquivo:
                    arquivos[os.path.relpath(caminho, self.dados.raiz)] = (os.stat(caminho).st_ino, arquivo.read())
        return arquivos

    def textos(self, job_id=ID):
        pasta = os.path.join(self.dados.estado, job_id)
        return sorted(os.listdir(pasta)) if os.path.isdir(pasta) else []


def na_pasta(teste, preparar):
    pasta = tempfile.TemporaryDirectory()
    teste.addCleanup(pasta.cleanup)
    return preparar(PastaDoEnvio(pasta.name))


class OFimDoEnvioPeloEstadoDeCadaCartao(unittest.TestCase):
    CASOS = [
        ("todas as Frases no Anki", [FRASE, SEGUNDA], {"a": cartao(FRASE, "added"), "b": cartao(SEGUNDA, "duplicate")},
         ("completed", [FRASE, SEGUNDA], [], [SEGUNDA])),
        ("todas duplicadas", [FRASE], {"a": cartao(FRASE, "duplicate"), "b": cartao(FRASE, "duplicate")}, ("completed", [FRASE], [], [FRASE])),
        ("uma Frase com um Cartão novo e um duplicado não é duplicada", [FRASE], {"a": cartao(FRASE, "added"), "b": cartao(FRASE, "duplicate")},
         ("completed", [FRASE], [], [])),
        ("uma Frase com um Cartão por fazer não chegou", [FRASE, SEGUNDA], {"a": cartao(FRASE, "added"), "b": cartao(FRASE, "text"),
                                                                           "c": cartao(SEGUNDA, "added")},
         ("partial", [SEGUNDA], [FRASE], [])),
        ("nenhuma chegou", [FRASE], {"a": cartao(FRASE, "failed", "x")}, ("failed", [], [FRASE], [])),
        ("a Frase sem Cartões falhou", [FRASE, SEGUNDA], {"a": cartao(FRASE, "added")}, ("partial", [FRASE], [SEGUNDA], [])),
        ("um pedido sem Frases falhou", [], {}, ("failed", [], [], [])),
        ("o mesmo phraseId repetido e um texto vale uma vez", [FRASE, str(FRASE), "x"], {"a": cartao(FRASE, "added")},
         ("completed", [FRASE], [], [])),
        ("o Cartão de uma Frase fora do pedido não conta", [FRASE], {"a": cartao(FRASE, "added"), "z": cartao(SEGUNDA, "failed")},
         ("completed", [FRASE], [], [])),
    ]

    def test_cada_estado_guardado_diz_o_fim_e_as_frases_que_chegaram_falharam_e_eram_duplicadas(self):
        for nome, frases, cartoes, esperado in self.CASOS:
            with self.subTest(nome):
                pedido = {"entries": [{"phraseId": frase} for frase in frases]}
                self.assertEqual(envio.resolver(pedido, {"cards": cartoes}), esperado)

    def test_sem_cartoes_no_estado_todas_as_frases_falham(self):
        self.assertEqual(envio.resolver({"entries": [{"phraseId": FRASE}]}, {}), ("failed", [], [FRASE], []))


class OEstadoRefeitoDoPedido(unittest.TestCase):
    def refeito(self, pedido):
        pasta = na_pasta(self, lambda p: p.com(pedido=pedido).na_fila(ID))
        devolvido = pasta.fila.estado_ou_refazer(ID)
        self.assertEqual(devolvido, pasta.ler("estado"))
        return devolvido

    def test_cada_palavra_fixada_e_um_cartao_pending_e_o_que_ja_chegou_fica_como_o_pedido_diz(self):
        estado = self.refeito(um_pedido(ID, {"phraseId": FRASE, "line": LINHA, "keywords": ["keep running", "run"]},
                                         {"phraseId": SEGUNDA, "noAnki": {"%d-0" % SEGUNDA: "duplicate"}},
                                         {"phraseId": 1760000000002}, {"phraseId": 1760000000003, "line": "sem palavra", "keywords": []}))
        self.assertEqual(estado, um_estado(ID, "queued", {
            "%d-0" % FRASE: cartao(FRASE, "pending"), "%d-1" % FRASE: cartao(FRASE, "pending"), "%d-0" % SEGUNDA: cartao(SEGUNDA, "duplicate")}))

    def test_o_pedido_de_antes_sem_as_palavras_fixadas_conta_os_cartoes_pela_linha(self):
        estado = self.refeito(um_pedido(ID, {"phraseId": FRASE, "line": LINHA}, {"phraseId": SEGUNDA, "line": "give up : She gave up smoking"}))
        self.assertEqual(sorted(estado["cards"]), ["%d-0" % FRASE, "%d-1" % FRASE, "%d-0" % SEGUNDA])

    def test_o_pedido_apagado_refaz_um_estado_failed_com_frases_apagadas(self):
        estado = self.refeito(um_pedido(ID, {"phraseId": FRASE, "noAnki": {"%d-0" % FRASE: "added"}}, {"phraseId": SEGUNDA}, wiped=True))
        self.assertEqual(estado, um_estado(ID, "failed", {"%d-0" % FRASE: cartao(FRASE, "added")}, lastError="frases_apagadas", wiped=True))

    def test_sem_o_pedido_nao_ha_estado_e_nada_e_gravado(self):
        pasta = na_pasta(self, lambda p: p.na_fila(ID))
        self.assertIsNone(pasta.fila.estado_ou_refazer(ID))
        self.assertIsNone(pasta.ler("estado"))


class OCartaoQueChegouAoAnki(unittest.TestCase):
    PEDIDO = um_pedido(ID, {"phraseId": FRASE, "line": LINHA, "keywords": ["keep running", "run"]},
                       {"phraseId": SEGUNDA, "line": "give up : She gave up smoking", "keywords": ["give up"]})
    TEXTOS = ("%d-0.txt" % FRASE, "%d-1.txt" % FRASE, "%d-0.txt" % SEGUNDA)

    def chegou(self, cartoes, cartao_id, pedido=PEDIDO):
        estado = um_estado(ID, "running", cartoes, stage="send_to_anki") if cartoes is not None else None
        pasta = na_pasta(self, lambda p: p.com(copy.deepcopy(pedido), estado, self.TEXTOS).na_fila(ID))
        antes = pasta.retrato()
        self.assertIsNone(pasta.fila.cartao_chegou(ID, cartao_id))
        mudou = sorted(nome for nome in set(antes) | set(pasta.retrato()) if antes.get(nome) != pasta.retrato().get(nome))
        return pasta, mudou

    def test_o_ultimo_cartao_da_frase_tira_o_texto_e_reduz_a_linha_aos_status_no_anki(self):
        pasta, mudou = self.chegou({"%d-0" % FRASE: cartao(FRASE, "duplicate"), "%d-1" % FRASE: cartao(FRASE, "added"),
                                    "%d-0" % SEGUNDA: cartao(SEGUNDA, "pending")}, "%d-1" % FRASE)
        self.assertEqual(mudou, [os.path.join("estado", ID, "%d-1.txt" % FRASE), os.path.join("fila", ID + ".json")])
        self.assertEqual(pasta.ler("fila")["entries"], [
            {"phraseId": FRASE, "noAnki": {"%d-0" % FRASE: "duplicate", "%d-1" % FRASE: "added"}}, self.PEDIDO["entries"][1]])

    def test_so_o_texto_sai_enquanto_a_frase_nao_chegou_inteira(self):
        for nome, outro in (("o outro Cartão por fazer", "text"), ("o outro Cartão falhou", "failed")):
            with self.subTest(nome):
                pasta, mudou = self.chegou({"%d-0" % FRASE: cartao(FRASE, "added"), "%d-1" % FRASE: cartao(FRASE, outro)}, "%d-0" % FRASE)
                self.assertEqual(mudou, [os.path.join("estado", ID, "%d-0.txt" % FRASE)])

    def test_sem_o_pedido_sem_o_estado_ou_com_um_cartao_que_o_estado_nao_tem_so_o_texto_sai(self):
        no_anki = {"%d-0" % FRASE: cartao(FRASE, "added"), "%d-1" % FRASE: cartao(FRASE, "added")}
        for nome, cartoes, cartao_id, pedido in (
            ("sem o pedido", no_anki, "%d-0" % FRASE, None),
            ("sem o estado", None, "%d-0" % FRASE, self.PEDIDO),
            ("um Cartão que o estado não tem", no_anki, "%d-0" % SEGUNDA, self.PEDIDO),
        ):
            with self.subTest(nome):
                pasta, mudou = self.chegou(cartoes, cartao_id, pedido)
                self.assertEqual(mudou, [os.path.join("estado", ID, cartao_id + ".txt")])

    def test_a_frase_ja_reduzida_nao_e_regravada(self):
        reduzido = um_pedido(ID, {"phraseId": FRASE, "noAnki": {"%d-0" % FRASE: "added"}})
        pasta, mudou = self.chegou({"%d-0" % FRASE: cartao(FRASE, "added")}, "%d-0" % FRASE, reduzido)
        self.assertEqual(mudou, [os.path.join("estado", ID, "%d-0.txt" % FRASE)])
        self.assertEqual(pasta.ler("fila"), reduzido)


if __name__ == "__main__":
    unittest.main()
