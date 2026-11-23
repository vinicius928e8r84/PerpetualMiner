"""A nota que cada texto de Cartão vira (`nota_do_cartao.py`), gravada com o código de antes da refatoração da Onda 3 do CodeScene.

Cada linha é uma entrada e o que sai dela: a nota inteira, com os campos na ordem em que saem, nos Cartões dos testes da nota; a
morfologia que se lê do texto, a explicação das cores e a frase pintada pelos pedaços das palavras.
"""

import unittest

from nota_do_cartao import _explicacao_das_cores, _pintar, morfologia_do_texto
from test_nota_do_cartao import AVANCADO, INGLES, INTERMEDIARIO, RUSSO, nota
from test_nota_do_cartao_russo import RUSSO_AVANCADO, RUSSO_INTERMEDIARIO

NOTAS = [
    (
        INGLES,
        "en",
        {"audio_da_frase": "frase.mp3", "audio_da_palavra": "palavra.mp3", "imagem": "foto.png", "nivel": "iniciante", "palavra": "give up"},
        {
            "campos": {
                "Frase": '<span style="color: #ff8c42;">She</span> <b><span style="color: #a855f7;">gave up</span></b> <span style="color: #22c55e;">smoking</span> last year.',
                "Pronúncia": "shi GUÊIV âp SMÔU-kin lést iâr",
                "Tradução literal": '<span style="color: #ff8c42;">Ela</span> <span style="color: #a855f7;">desistiu</span> <span style="color: #22c55e;">fumando</span> último ano',
                "Tradução natural": "Ela parou de fumar ano passado.",
                "Contexto da cena": "Alguém conta que largou o cigarro.",
                "Palavra": "gave up – /ɡeɪv ʌp/",
                "Imagem": '<img src="foto.png">',
                "Frase com lacuna": 'She <b class="lacuna">[…]</b> smoking last year.',
                "Dica": "Ela parou de fumar ano passado.",
                "Fonte": "Série - The Office - S01E01",
                "Áudio da frase": "[sound:frase.mp3]",
                "Áudio da palavra": "[sound:palavra.mp3]",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "she gave up smoking last year.",
            "etiquetas": ["perpetual_miner", "série", "the_office", "s01e01"],
        },
    ),
    (
        INTERMEDIARIO,
        "en",
        {"nivel": "intermediario", "palavra": "quit"},
        {
            "campos": {
                "Frase": "She <b>gave up</b> smoking last year.",
                "Contexto da cena": "Alguém conta que largou o cigarro no ano passado.",
                "Palavra": "gave up – /ɡeɪv ʌp/",
                "Definição": "Desistir de fazer algo, parar de tentar.",
                "Outro exemplo": "Michael never gives up on a bad joke.",
                "Frase com lacuna": 'She <b class="lacuna">[…]</b> smoking last year.',
                "Dica": "Desistir de fazer algo, parar de tentar.",
                "Fonte": "Série - The Office - S01E01",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "she gave up smoking last year.",
            "etiquetas": ["perpetual_miner", "série", "the_office", "s01e01"],
        },
    ),
    (
        AVANCADO,
        "en",
        {"nivel": "avancado", "audio_da_palavra": "p.mp3"},
        {
            "campos": {
                "Frase": "She <b>gave up</b> smoking last year.",
                "Contexto da cena": "A coworker explains how she quit smoking, and why the habit had to go.",
                "Palavra": "gave up – /ɡeɪv ʌp/",
                "Definição": "To stop doing or trying something, usually a habit, because it has become pointless or too hard.",
                "Outro exemplo": "Pam never gave up on her dream of becoming an artist.",
                "Frase com lacuna": 'She <b class="lacuna">[…]</b> smoking last year.',
                "Dica": "To stop doing or trying something, usually a habit, because it has become pointless or too hard.",
                "Fonte": "Série - The Office - S01E01",
                "Áudio da palavra": "[sound:p.mp3]",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "she gave up smoking last year.",
            "etiquetas": ["perpetual_miner", "série", "the_office", "s01e01"],
        },
    ),
    (
        RUSSO,
        "ru",
        {"palavra": "мальчик"},
        {
            "campos": {
                "Frase": '<span style="color: #ff8c42;">Я</span> <span style="color: #a855f7;">не</span> <span style="color: #22c55e;">мальчик</span>!',
                "Pronúncia": "ia ni MAL-tchik",
                "Tradução literal": '<span style="color: #ff8c42;">Eu</span> <span style="color: #a855f7;">não</span> <span style="color: #22c55e;">menino</span>',
                "Tradução natural": "Eu não sou um menino!",
                "Contexto da cena": "Alguém corrige uma suposição errada sobre si.",
                "Palavra": "мальчик",
                "Frase com lacuna": 'Я не <b class="lacuna">[…]</b>!',
                "Dica": "Eu não sou um menino!",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "Я не мальчик!",
            "etiquetas": ["perpetual_miner"],
        },
    ),
    (
        RUSSO_INTERMEDIARIO,
        "ru",
        {"audio_da_frase": "frase.mp3", "audio_da_palavra": "palavra.mp3", "imagem": "foto.png", "nivel": "intermediario"},
        {
            "campos": {
                "Frase": 'Она <span style="font-weight: bold; border-bottom: 3px solid #f59e0b;"><span style="color: #a855f7;">при</span><span style="color: #22c55e;">ход</span><span style="color: #f59e0b;">и</span><span style="color: #f59e0b;">л</span><span style="color: #ef4444;">а</span></span> <span style="color: #22c55e;">вчер</span><span style="color: #ef4444;">а</span>, но меня не было <span style="color: #22c55e;">дом</span><span style="color: #ef4444;">а</span>.',
                "Morfologia": "приходила = при + ход + и + л + а<br>вчера = вчер + а<br>дома = дом + а<br>Мама = мам + а",
                "Explicação das cores": '<span style="color: #a855f7;">при-</span> – arrival, movement towards a place<br><span style="color: #22c55e;">ход</span> – the idea of walking, going<br><span style="color: #f59e0b;">-и-л-</span> – verb stem and past tense; imperfective aspect<br><span style="color: #ef4444;">-а</span> – feminine singular: she (3rd person, past tense)',
                "Pronúncia": "pri-ha-DI-la",
                "Sílaba forte": "приходи́ла",
                "Definição": 'To come or to arrive on foot; here it is the habitual or repeated past, "she used to come".',
                "Significado simples": "It is when a person walks to a place to be there, again and again.",
                "Outro exemplo": '<span style="color: #22c55e;">Мам</span><span style="color: #ef4444;">а</span> <span style="font-weight: bold; border-bottom: 3px solid #f59e0b;"><span style="color: #a855f7;">при</span><span style="color: #22c55e;">ход</span><span style="color: #f59e0b;">и</span><span style="color: #f59e0b;">л</span><span style="color: #ef4444;">а</span></span> домой поздно.',
                "Imagem": '<img src="foto.png">',
                "Palavra": "приходила",
                "Raiz": "ход",
                "Frase com lacuna": 'Она <b class="lacuna">[…]</b> вчера, но меня не было дома.',
                "Dica": 'To come or to arrive on foot; here it is the habitual or repeated past, "she used to come".',
                "Áudio da frase": "[sound:frase.mp3]",
                "Áudio da palavra": "[sound:palavra.mp3]",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "Она приходила вчера, но меня не было дома.",
            "etiquetas": ["perpetual_miner"],
        },
    ),
    (
        RUSSO_INTERMEDIARIO,
        "ru",
        {"nivel": "avancado", "palavra": "вчера"},
        {
            "campos": {
                "Frase": 'Она <span style="color: #f59e0b; font-weight: bold;">приходила</span> вчера, но меня не было дома.',
                "Sílaba forte": "приходи́ла",
                "Definição": 'To come or to arrive on foot; here it is the habitual or repeated past, "she used to come".',
                "Significado simples": "It is when a person walks to a place to be there, again and again.",
                "Outro exemplo": 'Мама <span style="color: #f59e0b; font-weight: bold;">приходила</span> домой поздно.',
                "Palavra": "приходила",
                "Raiz": "ход",
                "Frase com lacuna": 'Она приходила <b class="lacuna">[…]</b>, но меня не было дома.',
                "Dica": 'To come or to arrive on foot; here it is the habitual or repeated past, "she used to come".',
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "Она приходила вчера, но меня не было дома.",
            "etiquetas": ["perpetual_miner"],
        },
    ),
    (
        RUSSO_AVANCADO,
        "ru",
        {"nivel": "avancado", "palavra": "дома", "imagem": "x.png"},
        {
            "campos": {
                "Frase": 'Она <span style="color: #f59e0b; font-weight: bold;">приходила</span> вчера, но меня не было дома.',
                "Sílaba forte": "приходи́ла",
                "Definição": "Приходить, то есть прибывать пешком; здесь это привычное действие в прошлом: «она приходила обычно».",
                "Significado simples": "Это когда человек идёт к кому-то и бывает там, и так много раз.",
                "Outro exemplo": 'Мама <span style="color: #f59e0b; font-weight: bold;">приходила</span> домой поздно.',
                "Mesma raiz": "ходить (идти пешком), вход (место, где входят), выход (место, где выходят)",
                "Imagem": '<img src="x.png">',
                "Palavra": "приходила",
                "Raiz": "ход",
                "Frase com lacuna": 'Она приходила вчера, но меня не было <b class="lacuna">[…]</b>.',
                "Dica": "Приходить, то есть прибывать пешком; здесь это привычное действие в прошлом: «она приходила обычно».",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "Она приходила вчера, но меня не было дома.",
            "etiquetas": ["perpetual_miner"],
        },
    ),
    (
        "Front: Hello world\nSource Context:  Um livro  \nGist: x",
        "en",
        {"palavra": "world"},
        {
            "campos": {
                "Frase": "Hello world<br>Source Context:  Um livro  <br>Gist: x",
                "Contexto da cena": "x",
                "Palavra": "world",
                "Frase com lacuna": 'Hello <b class="lacuna">[…]</b>Source Context:  Um livro  Gist: x',
                "Dica": "x",
                "Fonte": "Um livro",
            },
            "campo_da_frente": "Frase",
            "frente_normalizada": "hello world source context: um livro gist: x",
            "etiquetas": ["perpetual_miner", "um_livro"],
        },
    ),
    (
        "Front: Hello world",
        "en",
        {"nivel": "avancado", "palavra": "nada"},
        {
            "campos": {"Frase": "Hello world", "Palavra": "nada"},
            "campo_da_frente": "Frase",
            "frente_normalizada": "hello world",
            "etiquetas": ["perpetual_miner"],
        },
    ),
]

MORFOLOGIAS = [
    ("", []),
    ("Morphology:", []),
    ("**Morphology:**\nМама | root:мам | ending:а\n\nдома | root:дом | ending:а", [("Мама", [("root", "мам"), ("ending", "а")])]),
    (
        "Morphology:\n| root:x\n| nada\nабв | prefix:- | root:абв\nабв | prefix:а | root:б\nнада\nприходи́ла | prefix:при- | ROOT:ход | suffix:–и | suffix:л | ending:а",
        [("приходила", [("prefix", "при"), ("root", "ход"), ("suffix", "и"), ("suffix", "л"), ("ending", "а")])],
    ),
    (
        "Morphology:\nслово | kind:сл | root:слово | prefix\nвход | prefix: в | root:ход\nX|root:x",
        [("слово", [("root", "слово")]), ("вход", [("prefix", "в"), ("root", "ход")]), ("X", [("root", "x")])],
    ),
    (
        "Morphology:\nсло́во | root:сло́в | ending:о\nдо́м | root:дом",
        [("слово", [("root", "слов"), ("ending", "о")]), ("дом", [("root", "дом")])],
    ),
]

CORES = [
    ("", ""),
    (
        "Colors:\nroot | ход | walking\nprefix | при- | arrival",
        '<span style="color: #a855f7;">при-</span> – arrival<br><span style="color: #22c55e;">ход</span> – walking',
    ),
    (
        "Colors:\nROOT | <ход> | a & b | c\nroot | outro | ignorado\nending | -а |\nsuffix || x\nsomething | x | y\nprefix | при",
        '<span style="color: #22c55e;">&lt;ход&gt;</span> – a &amp; b | c',
    ),
    (
        "**Colors:**\nending | -а | she\nsuffix | -и-л- | past\n\nprefix | depois | do branco",
        '<span style="color: #f59e0b;">-и-л-</span> – past<br><span style="color: #ef4444;">-а</span> – she',
    ),
]

PINTURAS = [
    (
        "Она приходила вчера.",
        [
            ("приходила", [("prefix", "при"), ("root", "ход"), ("suffix", "и"), ("suffix", "л"), ("ending", "а")]),
            ("вчера", [("root", "вчер"), ("ending", "а")]),
        ],
        "приходила",
        'Она <span style="font-weight: bold; border-bottom: 3px solid #f59e0b;"><span style="color: #a855f7;">при</span><span style="color: #22c55e;">ход</span><span style="color: #f59e0b;">и</span><span style="color: #f59e0b;">л</span><span style="color: #ef4444;">а</span></span> <span style="color: #22c55e;">вчер</span><span style="color: #ef4444;">а</span>.',
    ),
    (
        "Она приходила вчера.",
        [("вчера", [("root", "вчер"), ("ending", "а")])],
        "приходила",
        'Она <span style="color: #f59e0b; font-weight: bold;">приходила</span> <span style="color: #22c55e;">вчер</span><span style="color: #ef4444;">а</span>.',
    ),
    (
        "Она Приходила, приходила.",
        [("приходила", [("prefix", "при"), ("root", "ход"), ("suffix", "и"), ("suffix", "л"), ("ending", "а")])],
        "ПРИХОДИЛА",
        'Она <span style="font-weight: bold; border-bottom: 3px solid #f59e0b;"><span style="color: #a855f7;">При</span><span style="color: #22c55e;">ход</span><span style="color: #f59e0b;">и</span><span style="color: #f59e0b;">л</span><span style="color: #ef4444;">а</span></span>, приходила.',
    ),
    ("Нет слова.", [("дома", [("root", "дом"), ("ending", "а")])], "дома", "Нет слова."),
    (
        "дома и дом",
        [("дом", [("root", "дом")]), ("дома", [("root", "дом"), ("ending", "а")])],
        "",
        '<span style="color: #22c55e;">дом</span><span style="color: #ef4444;">а</span> и <span style="color: #22c55e;">дом</span>',
    ),
    ("Она приходила.", [], "приходила", 'Она <span style="color: #f59e0b; font-weight: bold;">приходила</span>.'),
    ("Она приходила.", [], "", "Она приходила."),
]


def nota_em_ordem(texto, lang, argumentos):
    pronta = nota(texto, lang, **argumentos)
    return dict(pronta, campos=list(pronta["campos"].items()))


class ANotaDoCartao(unittest.TestCase):
    def conferir(self, funcao, casos):
        for caso in casos:
            *entrada, esperado = caso
            with self.subTest(entrada=entrada):
                self.assertEqual(funcao(*entrada), esperado)

    def test_cada_cartao_vira_os_mesmos_campos_na_mesma_ordem_com_a_frente_a_frase_comparada_e_as_etiquetas(self):
        casos = [(texto, lang, argumentos, dict(nota, campos=list(nota["campos"].items()))) for texto, lang, argumentos, nota in NOTAS]
        self.conferir(nota_em_ordem, casos)

    def test_a_morfologia_guarda_so_a_palavra_cujos_pedacos_a_soletram(self):
        self.conferir(morfologia_do_texto, MORFOLOGIAS)

    def test_a_explicacao_tem_a_primeira_linha_completa_de_cada_tipo_na_ordem_dos_pedacos(self):
        self.conferir(_explicacao_das_cores, CORES)

    def test_a_frase_pintada_leva_a_cor_de_cada_pedaco_e_marca_a_palavra_chave(self):
        self.conferir(_pintar, PINTURAS)


if __name__ == "__main__":
    unittest.main()
