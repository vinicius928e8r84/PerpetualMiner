"""A tabela de entradas e saídas de `generate_cards.py`, gravada com o código de antes da refatoração do CodeScene (Onda 4): as
formas de cada lema, o veredito da palavra-chave e, para cada caminho de `escrever`, a falha, os pedidos, o arquivo e o log.

Um caso que muda de saída é mudança de comportamento: entra na tabela com o motivo na PR, nunca regravado às cegas. As formas
guardam o que a regra do inglês dá hoje, mesmo quando não é inglês (`carryed`, `stoped`, `visitted`, `tiing`)."""

import logging
import tempfile
import unittest
from pathlib import Path

import generate_cards
from parser import MiningEntry, get_card_jobs
from test_generate_cards import BAD_CARD, GOOD_CARD, _config, _write_prompts, roteiro

FORMAS_DE_HOJE = {
    "Go": ["go", "goes", "going", "gone", "went"],
    "a": ["a"],
    "x": ["x"],
    "e-mail": ["e-mail"],
    "fix": ["fix", "fixed", "fixes", "fixing", "fixs"],
    "buzz": ["buzz", "buzzed", "buzzes", "buzzing", "buzzs"],
    "watch": ["watch", "watched", "watches", "watching", "watchs"],
    "wish": ["wish", "wished", "wishes", "wishing", "wishs"],
    "echo": ["echo", "echoed", "echoes", "echoing", "echos"],
    "bus": ["bus", "bused", "buses", "busing", "buss", "bussed", "bussing"],
    "carry": ["carried", "carries", "carry", "carryed", "carrying"],
    "sky": ["skied", "skies", "sky", "skyed", "skying"],
    "obey": ["obey", "obeyed", "obeying", "obeys"],
    "make": ["made", "make", "makes", "making"],
    "flee": ["flee", "fleed", "flees", "fleing"],
    "tie": ["tie", "tied", "ties", "tiing", "tying"],
    "ie": ["ie", "ied", "ies", "iing", "ying"],
    "STOP": ["stop", "stoped", "stoping", "stopped", "stopping", "stops"],
    "visit": ["visit", "visited", "visiting", "visits", "visitted", "visitting"],
    "chew": ["chew", "chewed", "chewing", "chews"],
    "tax": ["tax", "taxed", "taxes", "taxing", "taxs"],
    "turn": ["turn", "turned", "turning", "turns"],
    "café": ["café", "caféed", "caféing", "cafés"],
}

FRASE = "He exerts himself on brands of his own, if at all."
SEM_A_PRIMEIRA_PALAVRA = GOOD_CARD.replace("He *exerts himself* on", "*exerts himself* on")
CARTAO_DO_TOIL = "Front: They *toil* every single day.\n\nBack: toil - /tɔɪl/\n"
CARTAO_DO_BREAK_DOWN = "Front: My car *broke down* today.\n\nBack: break down - /x/\n"
CARTAO_DO_LABOR = "Front: We *labor* in the fields.\n\nBack: labor - /ˈleɪbər/\n"
CARTAO_RUSSO = "Front\nЯ не мальчик!\n\nBack\nLiteral: Eu não menino\n"
COM_CABECALHO_E_ROTULO = "## Anki Card\n\n" + GOOD_CARD.replace("Front: He", "Front: [Phrase with the keyword]: He") + "x" * 10

VEREDITOS_DE_HOJE = [
    ("sem_back", "Front: He *exerts himself*.\n", "exerts himself", False),
    ("back_com_travessao", "Front: They toil.\n\nBack: **Toil — /tɔɪl/\n", "toil", True),
    ("uma_palavra_sem_front", "Back: toil - /tɔɪl/\n", "toil", True),
    ("duas_palavras_sem_front", "Back: exerts himself - /x/\n", "exerts himself", False),
    ("uma_palavra_com_br", "Front: They toil.<br/>Target\n\nBack: toil - /x/\n", "toil", False),
    ("back_flexionado", "Front: She *turned down* it.\n\nBack: turned down it - /x/\n", "turn down", True),
    ("back_de_outra_palavra", "Front: She *turned down* it.\n\nBack: turned up - /x/\n", "turn down", False),
    ("destaque_flexionado", "Front: She *turned down* it.\n\nBack: turn down - /x/\n", "turn down", True),
    ("destaque_exato_entre_sinais", "Front: She *(turn down)* it.\n\nBack: turn down - /x/\n", "turn down", True),
    ("sem_destaque", "Front: She turned down it.\n\nBack: turn down - /x/\n", "turn down", False),
]


def _estilo(root: Path, entrada: str) -> dict:
    prompt = root / "estilo.txt"
    prompt.write_text("  estilo prompt \n", encoding="utf-8")
    return {"entrada": entrada, "prompt": str(prompt)}


def _ingles(root: Path) -> dict:
    return _config(root)


def _sem_idioma(root: Path) -> dict:
    config = _config(root)
    del config["lang"]
    return config


def _russo_sem_estilo(root: Path) -> dict:
    return dict(_config(root), lang="ru")


def _russo_que_le_palavras(root: Path) -> dict:
    return dict(_config(root), lang="ru", estilo=_estilo(root, "palavras"))


def _ingles_que_le_a_frase(root: Path) -> dict:
    return dict(_config(root), estilo=_estilo(root, "frase"))


def _trabalho(keywords, phrase=FRASE, posicao=0, **contexto):
    return get_card_jobs(MiningEntry(keywords=keywords, phrase=phrase, **contexto))[posicao]


def _salvo(card: str) -> str:
    return "## Anki Card\n\n" + generate_cards._prepare_card(card)


GERANDO = ("INFO", "Gerando card para: '9-0'")
SALVO = ("INFO", "Card salvo: '9-0.txt'")
DE_NOVO = ("WARNING", "Keyword mismatch para '9-0' - tentando regenerar uma vez.")
VAZIA = ("ERROR", "Resposta vazia para '9-0' - pulando.")


class _Guardado(logging.Handler):
    def __init__(self):
        super().__init__(logging.DEBUG)
        self.linhas = []

    def emit(self, record):
        self.linhas.append((record.levelname, record.getMessage()))


def _escrever(trabalho, montar_config, pedir, ja_no_disco=None):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        _write_prompts(root)
        config = montar_config(root)
        if ja_no_disco is not None:
            (root / "Output").mkdir()
            (root / "Output" / "9-0.txt").write_text(ja_no_disco, encoding="utf-8")
        guardado = _Guardado()
        logger = logging.getLogger("perpetualminer.motor")
        logger.addHandler(guardado)
        nivel = logger.level
        logger.setLevel(logging.DEBUG)
        try:
            falha = generate_cards.escrever(trabalho, config, pedir, "9-0")
        finally:
            logger.removeHandler(guardado)
            logger.setLevel(nivel)
        arquivos = sorted(caminho.name for caminho in (root / "Output").iterdir())
        texto = (root / "Output" / "9-0.txt").read_text(encoding="utf-8") if "9-0.txt" in arquivos else None
    return falha, arquivos, texto, guardado.linhas


def _que_levanta(erro):
    def pedir(sistema, mensagem, rotulo):
        raise erro

    return pedir


def _pedidos_e_respostas(*respostas):
    pedidos = []
    return pedidos, roteiro(*respostas, pedidos=pedidos)


class FormasDoLemaTests(unittest.TestCase):
    def test_as_formas_de_cada_lema_sao_as_de_hoje(self):
        for lema, formas in FORMAS_DE_HOJE.items():
            with self.subTest(lema=lema):
                self.assertEqual(sorted(generate_cards._forms_of(lema)), formas)


class VereditoDaPalavraChaveTests(unittest.TestCase):
    def test_o_veredito_de_cada_cartao_e_o_de_hoje(self):
        for nome, cartao, palavra, veredito in VEREDITOS_DE_HOJE:
            with self.subTest(nome=nome):
                self.assertEqual(generate_cards._validate_keyword(cartao, palavra), veredito)


class EscreverPalavraTests(unittest.TestCase):
    def test_o_cartao_que_confere_de_primeira_e_salvo_com_um_pedido(self):
        trabalho = _trabalho(["exerts himself"], context_source="Naval")
        pedidos, pedir = _pedidos_e_respostas(COM_CABECALHO_E_ROTULO)
        saida = _escrever(trabalho, _ingles, pedir)
        mensagem = generate_cards._build_message(trabalho)
        self.assertEqual((saida, pedidos), (
            (None, ["9-0.txt"], _salvo(COM_CABECALHO_E_ROTULO), [GERANDO, SALVO]),
            [("en prompt", mensagem, "9-0")]))

    def test_o_back_de_outra_palavra_pede_de_novo_pela_palavra_e_salva_a_segunda(self):
        trabalho = _trabalho(["exerts himself"])
        pedidos, pedir = _pedidos_e_respostas(BAD_CARD, GOOD_CARD)
        saida = _escrever(trabalho, _ingles, pedir)
        mensagem = generate_cards._build_message(trabalho)
        self.assertEqual((saida, [m for _, m, _ in pedidos]), (
            (None, ["9-0.txt"], _salvo(GOOD_CARD), [GERANDO, DE_NOVO, SALVO]),
            [mensagem, generate_cards._build_keyword_retry_message(mensagem, "exerts himself")]))

    def test_o_front_que_perde_palavra_pede_de_novo_pela_frase_limpa_do_contexto(self):
        trabalho = _trabalho(["exerts himself"], phrase=FRASE + " [Context: Livro]")
        pedidos, pedir = _pedidos_e_respostas(SEM_A_PRIMEIRA_PALAVRA, GOOD_CARD)
        falha, _, texto, _ = _escrever(trabalho, _ingles, pedir)
        mensagem = generate_cards._build_message(trabalho)
        self.assertEqual((falha, texto, [m for _, m, _ in pedidos]), (
            None, _salvo(GOOD_CARD), [mensagem, generate_cards._build_phrase_retry_message(mensagem, FRASE)]))

    def test_o_erro_que_persiste_e_keyword_mismatch_sem_arquivo(self):
        pedidos, pedir = _pedidos_e_respostas(SEM_A_PRIMEIRA_PALAVRA, BAD_CARD)
        saida = _escrever(_trabalho(["exerts himself"]), _ingles, pedir)
        self.assertEqual((saida, len(pedidos)), (("keyword_mismatch", [], None, [
            GERANDO, DE_NOVO, ("ERROR", "Keyword mismatch persistente para '9-0' - card nao sera salvo.")]), 2))

    def test_a_palavra_secundaria_nao_precisa_repetir_a_frase(self):
        trabalho = _trabalho(["exerts himself", "toil"], posicao=1)
        pedidos, pedir = _pedidos_e_respostas(CARTAO_DO_TOIL)
        falha, _, texto, _ = _escrever(trabalho, _ingles, pedir)
        self.assertEqual((falha, texto, [m for _, m, _ in pedidos]), (
            None, _salvo(CARTAO_DO_TOIL), [generate_cards._build_message(trabalho)]))

    def test_a_palavra_que_nao_esta_na_frase_nao_precisa_repetir_a_frase(self):
        pedidos, pedir = _pedidos_e_respostas(CARTAO_DO_LABOR)
        falha, _, texto, _ = _escrever(_trabalho(["labor"], phrase="They toil all day."), _ingles, pedir)
        self.assertEqual((falha, texto, len(pedidos)), (None, _salvo(CARTAO_DO_LABOR), 1))

    def test_a_palavra_flexionada_na_frase_precisa_repetir_a_frase(self):
        pedidos, pedir = _pedidos_e_respostas(CARTAO_DO_TOIL)
        falha, _, texto, _ = _escrever(_trabalho(["toil"], phrase="They toiled all day."), _ingles, pedir)
        self.assertEqual((falha, texto, len(pedidos)), ("keyword_mismatch", None, 2))

    def test_a_expressao_flexionada_na_frase_precisa_repetir_a_frase(self):
        pedidos, pedir = _pedidos_e_respostas(CARTAO_DO_BREAK_DOWN)
        falha, _, texto, _ = _escrever(_trabalho(["break down"], phrase="Our car broke down."), _ingles, pedir)
        self.assertEqual((falha, texto, len(pedidos)), ("keyword_mismatch", None, 2))

    def test_sem_idioma_na_configuracao_o_cartao_e_do_ingles(self):
        pedidos, pedir = _pedidos_e_respostas(GOOD_CARD)
        falha, _, _, _ = _escrever(_trabalho(["exerts himself"]), _sem_idioma, pedir)
        self.assertEqual((falha, [s for s, _, _ in pedidos]), (None, ["en prompt"]))

    def test_o_russo_cujo_estilo_le_palavras_confere_a_palavra(self):
        trabalho = _trabalho(["exerts himself"])
        pedidos, pedir = _pedidos_e_respostas(BAD_CARD)
        falha, _, _, _ = _escrever(trabalho, _russo_que_le_palavras, pedir)
        mensagem = generate_cards._build_message(trabalho)
        self.assertEqual((falha, pedidos), ("keyword_mismatch", [
            ("estilo prompt", mensagem, "9-0"),
            ("estilo prompt", generate_cards._build_keyword_retry_message(mensagem, "exerts himself"), "9-0")]))


class EscreverFraseInteiraTests(unittest.TestCase):
    def test_o_russo_sem_estilo_pede_a_frase_inteira_com_o_prompt_russo(self):
        trabalho = _trabalho(["Я не"], phrase=" Я не мальчик! ", context_source="Série")
        pedidos, pedir = _pedidos_e_respostas(CARTAO_RUSSO)
        saida = _escrever(trabalho, _russo_sem_estilo, pedir)
        self.assertEqual((saida, pedidos), (
            (None, ["9-0.txt"], _salvo(CARTAO_RUSSO), [GERANDO, SALVO]),
            [("ru prompt", "Я не мальчик!\n[Context: Série]", "9-0")]))

    def test_o_estilo_que_le_a_frase_nao_confere_a_palavra(self):
        pedidos, pedir = _pedidos_e_respostas(CARTAO_RUSSO)
        falha, _, texto, _ = _escrever(_trabalho(["exerts himself"]), _ingles_que_le_a_frase, pedir)
        self.assertEqual((falha, texto, pedidos), (None, _salvo(CARTAO_RUSSO), [("estilo prompt", FRASE, "9-0")]))

    def test_a_recusa_do_modelo_e_invalid_card_com_o_motivo_no_log(self):
        _, pedir = _pedidos_e_respostas("I cannot assist with that. Literal: x")
        saida = _escrever(_trabalho(["Я не"], phrase="Я не мальчик!"), _russo_sem_estilo, pedir)
        self.assertEqual(saida, ("invalid_card", [], None, [
            GERANDO, ("ERROR", "Card russo para '9-0' invalido (recusa/erro do modelo) - skipping.")]))

    def test_o_cartao_sem_traducao_e_invalid_card_com_o_motivo_no_log(self):
        _, pedir = _pedidos_e_respostas("Front\nЯ не мальчик!\n\nLiteral:   \n")
        saida = _escrever(_trabalho(["Я не"], phrase="Я не мальчик!"), _russo_sem_estilo, pedir)
        self.assertEqual(saida, ("invalid_card", [], None, [
            GERANDO, ("ERROR", "Card russo para '9-0' invalido (campo Translation/Definition ausente) - skipping.")]))


class EscreverFalhasTests(unittest.TestCase):
    def test_o_cartao_ja_no_disco_nao_e_pedido_e_o_vazio_e_pedido_de_novo(self):
        pedidos, pedir = _pedidos_e_respostas(GOOD_CARD)
        cheio = _escrever(_trabalho(["exerts himself"]), _ingles, pedir, ja_no_disco="pronto")
        vazio = _escrever(_trabalho(["exerts himself"]), _ingles, pedir, ja_no_disco="")
        self.assertEqual((cheio, vazio[0], vazio[2], len(pedidos)), ((None, ["9-0.txt"], "pronto", []), None, _salvo(GOOD_CARD), 1))

    def test_cada_falha_do_pedido_volta_com_o_seu_codigo_e_o_seu_log(self):
        casos = [
            (_que_levanta(generate_cards.provedores.ErroDoProvedor("openai_quota")), "openai_quota", ("ERROR", "Modelo falhou para '9-0': openai_quota")),
            (_que_levanta(KeyError("segredo")), "generation_error", ("ERROR", "Modelo falhou para '9-0': KeyError")),
            (roteiro(None), "empty_response", VAZIA),
            (roteiro(""), "empty_response", VAZIA),
        ]
        for pedir, codigo, linha in casos:
            with self.subTest(codigo=codigo, linha=linha):
                saida = _escrever(_trabalho(["exerts himself"]), _ingles, pedir)
                self.assertEqual(saida, (codigo, [], None, [GERANDO, linha]))

    def test_a_falha_da_frase_inteira_tambem_volta_com_o_seu_codigo(self):
        saida = _escrever(_trabalho(["Я не"], phrase="Я не мальчик!"), _russo_sem_estilo, roteiro(""))
        self.assertEqual(saida[0], "empty_response")

    def test_a_segunda_resposta_vazia_e_empty_response_com_o_log_das_duas_etapas(self):
        saida = _escrever(_trabalho(["exerts himself"]), _ingles, roteiro(BAD_CARD, ""))
        self.assertEqual(saida, ("empty_response", [], None, [GERANDO, DE_NOVO, VAZIA]))


if __name__ == "__main__":
    unittest.main()
