import logging
import os
import sys
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from complemento import baralhos, envio, perfil
from complemento.esperas import Esperas
from complemento.limite_do_plano import PLANO_NO_LIMITE, dizer_a_espera
from complemento.test_colecao_em_memoria import ColecaoEmMemoria
from complemento.test_envio_fila import FRASE, ID, MOTOR, SEGUNDA, cartao, na_pasta, pecas_do_trabalho, um_estado, um_pedido
from complemento.test_motor_do_cartao import TEXTO

PEDIDO = um_pedido(ID, {"phraseId": FRASE}, {"phraseId": SEGUNDA})


def terminar(teste, pedido, estado, erro):
    pasta = na_pasta(teste, lambda p: p.com(pedido, estado).na_fila(ID))
    pasta.fila.logger = logging.getLogger("test_envio_trabalho")
    trabalho = envio.Trabalho(pecas_do_trabalho(pasta.fila, Esperas()), None)
    with teste.assertLogs("test_envio_trabalho", "INFO") as registro:
        trabalho._terminar(ID, pedido, erro)
    return pasta.ler("estado"), registro.output


def o_fim(teste, cartoes, erro, pedido=PEDIDO):
    estado = um_estado(ID, "running", cartoes, stage="send_to_anki", progress={"done": 1, "total": 2}, waiting={"reason": "monthly_cap"})
    return terminar(teste, pedido, estado, erro)


def resumo(estado):
    return (estado["status"], estado["stage"], estado["lastError"], estado["successfulPhraseIds"], estado["failedPhraseIds"],
            estado["duplicatePhraseIds"], estado["progress"], "waiting" in estado)


class OFimGravadoPeloTrabalho(unittest.TestCase):
    CASOS = [
        ("tudo no Anki", {"a": cartao(FRASE, "added"), "b": cartao(SEGUNDA, "duplicate")}, None,
         ("completed", "completed", None, [FRASE, SEGUNDA], [], [SEGUNDA], {}, False)),
        ("uma Frase falhou: o erro do Cartão", {"a": cartao(FRASE, "added"), "b": cartao(SEGUNDA, "failed", "voice_failed")}, None,
         ("partial", "partial", "voice_failed", [FRASE], [SEGUNDA], [], {}, False)),
        ("o código que parou vale mais que o erro do Cartão", {"a": cartao(FRASE, "added"), "b": cartao(SEGUNDA, "failed", "voice_failed")},
         "openai_key_rejected", ("partial", "partial", "openai_key_rejected", [FRASE], [SEGUNDA], [], {}, False)),
        ("parado com tudo no Anki é partial", {"a": cartao(FRASE, "added"), "b": cartao(SEGUNDA, "added")}, "internal_error",
         ("partial", "partial", "internal_error", [FRASE, SEGUNDA], [], [], {}, False)),
        ("parado sem nada no Anki é failed", {"a": cartao(FRASE, "text"), "b": cartao(SEGUNDA, "pending")}, "openai_no_credit",
         ("failed", "failed", "openai_no_credit", [], [FRASE, SEGUNDA], [], {}, False)),
        ("o primeiro erro é o do Cartão que falhou, não o de um que espera", {"a": cartao(FRASE, "pending", "openai_rate_limited"),
                                                                               "b": cartao(SEGUNDA, "failed", None), "c": cartao(SEGUNDA, "failed", "empty_response")},
         None, ("failed", "failed", "empty_response", [], [FRASE, SEGUNDA], [], {}, False)),
        ("sem erro de Cartão, o motivo das Frases sem Cartão", {"a": cartao(FRASE, "added"), "b": cartao(SEGUNDA, "failed", None)}, None,
         ("partial", "partial", "cards_failed", [FRASE], [SEGUNDA], [], {}, False)),
    ]

    def test_cada_estado_dos_cartoes_e_cada_codigo_que_parou_dao_um_fim_gravado(self):
        for nome, cartoes, erro, esperado in self.CASOS:
            with self.subTest(nome):
                gravado, registro = o_fim(self, cartoes, erro)
                self.assertEqual(resumo(gravado), esperado)
                self.assertEqual(registro, ["INFO:test_envio_trabalho:Envio %s: %s (%s)" % (ID, esperado[0], esperado[2] or "sem erro")])

    def test_a_frase_sem_palavra_marcada_da_keyword_missing(self):
        pedido = um_pedido(ID, {"phraseId": FRASE}, {"phraseId": SEGUNDA, "line": "sem palavra", "keywords": []})
        gravado, _ = o_fim(self, {"a": cartao(FRASE, "added")}, None, pedido)
        self.assertEqual(resumo(gravado), ("partial", "partial", "keyword_missing", [FRASE], [SEGUNDA], [], {}, False))

    def test_o_envio_apagado_fica_com_o_que_tinha(self):
        apagado = dict(um_estado(ID, "failed", {"a": cartao(FRASE, "added")}, lastError="frases_apagadas"), wiped=True)
        gravado, registro = terminar(self, PEDIDO, apagado, "internal_error")
        self.assertEqual(dict(gravado, updatedAt=apagado["updatedAt"]), apagado)
        self.assertEqual(registro, ["INFO:test_envio_trabalho:Envio %s: failed (frases_apagadas)" % ID])


class MotorDoCartaoDeRoteiro:
    def __init__(self, fila):
        self.fila = fila
        self.ao_escrever = self.ao_montar = lambda cartao: None

    def escrever(self, cartao, ia):
        self.ao_escrever(cartao)
        caminho = self.fila.arquivo_do_texto(cartao.job_id, cartao.id)
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        with open(caminho, "w", encoding="utf-8") as arquivo:
            arquivo.write(TEXTO.replace("last year", "no Cartão " + cartao.id))

    def montar(self, cartao, texto, ia, avisar):
        self.ao_montar(cartao)
        return MOTOR.nota_do_cartao.campos_da_nota(texto, cartao.pedido["lang"], alem_do_texto=MOTOR.nota_do_cartao.AlemDoTexto(palavra="gave up")), {}


class IaQueNaoPede:
    def novo_envio(self):
        pass

    def da_conta(self, uid):
        return self


class UmEnvioDeDoisCartoes:
    def __init__(self, teste, colecao=None):
        self.pasta = na_pasta(teste, lambda p: p)
        self.fila, self.colecao = self.pasta.fila, colecao or ColecaoEmMemoria({"baralhos": [{"nome": "Inglês"}]})
        parar = threading.Event()
        prazo = threading.Timer(10, parar.set)
        prazo.start()
        teste.addCleanup(prazo.cancel)
        self.fila.logger = logging.getLogger("test_envio_trabalho")
        self.motor = MotorDoCartaoDeRoteiro(self.fila)
        self.trabalho = envio.Trabalho(pecas_do_trabalho(self.fila, Esperas(do_anki=0.01, parar=parar), self.colecao, IaQueNaoPede()), self.motor)
        corpo = {"jobId": ID, "lang": "en", "deckName": "Inglês", "imageSource": "1", "tts": {},
                 "entries": [{"phraseId": FRASE, "line": "keep running | run : They keep running"}]}
        teste.assertEqual(self.fila.criar(corpo)[0], 201)
        self.visto = []

    def ver(self, *campos):
        return lambda cartao: self.visto.append((cartao.id,) + tuple(self.fila.estado(ID).get(campo) for campo in campos))

    def fazer(self):
        with self.trabalho.fila.tranca:
            self.fila.mudar(ID, envio.estado_do_envio.reservar)
        self.trabalho.fazer(ID)
        estado = self.fila.estado(ID)
        return estado["status"], estado["lastError"], {c: (v["status"], v["error"]) for c, v in estado["cards"].items()}


class OCaminhoDeCadaCartao(unittest.TestCase):
    PRIMEIRO, SEGUNDO = "%d-0" % FRASE, "%d-1" % FRASE

    def test_cada_texto_e_pedido_com_o_progresso_dos_cartoes_que_ja_estao_no_anki(self):
        envio_ = UmEnvioDeDoisCartoes(self)
        envio_.motor.ao_escrever = envio_.ver("stage", "progress")
        fim = envio_.fazer()
        self.assertEqual(envio_.visto, [(self.PRIMEIRO, "generate_cards", {"done": 0, "total": 2}), (self.SEGUNDO, "generate_cards", {"done": 1, "total": 2})])
        self.assertEqual(fim, ("completed", None, {self.PRIMEIRO: ("added", None), self.SEGUNDO: ("added", None)}))

    def test_a_espera_do_texto_some_do_estado_quando_o_texto_chega(self):
        envio_ = UmEnvioDeDoisCartoes(self)
        envio_.motor.ao_escrever = lambda cartao: dizer_a_espera(envio_.fila, ID, dict(PLANO_NO_LIMITE))
        envio_.motor.ao_montar = envio_.ver("waiting")
        envio_.fazer()
        self.assertEqual(envio_.visto, [(self.PRIMEIRO, None), (self.SEGUNDO, None)])

    def test_depois_de_esperar_o_anki_o_envio_volta_a_etapa_em_que_estava_e_sem_espera(self):
        envio_ = UmEnvioDeDoisCartoes(self)
        procurar, falhas = envio_.colecao.guids_existentes, [baralhos.ColecaoIndisponivel("syncing")]

        def guids_com_uma_espera(guids):
            if falhas:
                raise falhas.pop()
            return procurar(guids)

        envio_.colecao.guids_existentes = guids_com_uma_espera
        envio_.motor.ao_escrever = envio_.ver("stage", "waiting")
        fim = envio_.fazer()
        self.assertEqual(envio_.visto, [(self.PRIMEIRO, "generate_cards", None), (self.SEGUNDO, "generate_cards", None)])
        self.assertEqual((fim[0], envio_.colecao.entradas), ("completed", []))

    def test_na_tela_de_perfis_a_conexao_entra_no_perfil_marcado_e_o_envio_termina(self):
        envio_ = UmEnvioDeDoisCartoes(self, ColecaoEmMemoria({"baralhos": [{"nome": "Inglês"}]}, aberta=False))
        fixo = perfil.PerfilFixo(os.path.join(envio_.pasta.dados.raiz, "perfil.json"))
        fixo.marcar("Usuário 1")
        envio_.colecao.fixar_o_perfil(fixo)
        self.assertEqual((envio_.fazer()[0], envio_.colecao.entradas), ("completed", ["Usuário 1"]))

    def test_a_frase_que_some_entre_o_texto_e_a_nota_falha_o_cartao_sem_gravar_a_nota(self):
        envio_ = UmEnvioDeDoisCartoes(self)

        def esquecer_a_linha(cartao):
            pedido = envio_.fila.pedido(ID)
            pedido["entries"][0].pop("line")
            envio_.pasta.gravar(os.path.join(envio_.pasta.dados.fila, ID + ".json"), pedido)

        envio_.motor.ao_escrever = esquecer_a_linha
        fim = envio_.fazer()
        self.assertEqual(fim, ("failed", "phrase_wiped", {self.PRIMEIRO: ("failed", "phrase_wiped"), self.SEGUNDO: ("failed", "phrase_wiped")}))
        self.assertEqual(envio_.colecao.gravadas, [])

    def test_o_tipo_de_nota_que_some_antes_da_gravacao_falha_o_cartao_com_note_type_missing(self):
        envio_ = UmEnvioDeDoisCartoes(self)

        def sem_o_tipo(*argumentos):
            raise baralhos.TipoDeNotaAusente()

        envio_.colecao.gravar_cartao = sem_o_tipo
        fim = envio_.fazer()
        self.assertEqual(fim, ("failed", "note_type_missing", {self.PRIMEIRO: ("failed", "note_type_missing"),
                                                               self.SEGUNDO: ("failed", "note_type_missing")}))


if __name__ == "__main__":
    unittest.main()
