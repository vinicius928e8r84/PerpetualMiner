import logging
import unittest

import send_to_anki
from test_send_to_anki import EN_CARD_FULL, RU_CARD_WITH_QUERY_BLOCK, RU_CARD_WITH_THREE_ALIGNED_CHUNKS

EN_SEM_ROTULO_BACK = """Anki Card
Front: She *gave up* smoking 🔊 phrase
gave up - /ɡeɪv ʌp/ 🔊 word
Definition: To stop doing something.
"""

SO_UMA_LINHA = "Front: Only a front line"

LINHAS_DE_IMAGEM_E_MIDIA = """Front: x
Back: word - /wɜːd/

Image search query: a word
**Image search query:** a bold word
Google image search: words
**Google Image Search:** bold words
Image: a picture
**Image:** a bold picture
Audio: word.mp3
Picture: word.png
Sound: [sound:word.ogg]
Definition: A unit of language.
"""

ALINHAMENTO_NO_VERSO_INGLES = """Front: x
Back: word - /wɜːd/
Alignment:
1 | a | b
2 | c | d
Definition: shown because it is not a pair.

**Alignment:**
1 | e | f

2 | g | h
Gist: after the block.
"""

PAR_FORA_DO_ALINHAMENTO = """Front: x
Back: word
1 | looks | like a pair
"""

CONSULTAS_COM_MARCADORES = """Front: x
Back: head - /hed/
Image Search Queries:
- first query
* second query
1) third query
2. fourth query
Simple meaning: the block ended here.
**Google Image Search Queries:**
1. hidden

1. shown after the blank line
Gist: shown.
"""

ALINHAMENTO_DENTRO_DAS_CONSULTAS = """Front: x
Back: line
Pronunciation: p
Image Search Queries:
1. query
Alignment:
1 | a | b
2. still a query item
Natural: shown
"""

BLOCOS_COM_ROTULO_EM_NEGRITO = """Front: x
Back: first line
**Examples:**
one example
another example

plain block line one
plain block line two

**Note:** inline label
"""

SEGUNDA_LINHA_COMECA_COM_B = """Front: x
Back: a
bring it
"""

RUSSO_LITERAL_EM_NEGRITO = """Front
Я не мальчик!

Back
Pronunciation: Ya ne mal'chik!

**Literal:** I not a boy!

Alignment:
1 | Я | I
2 | не | not
3 | мальчик | a boy
"""

RUSSO_LITERAL_EM_OUTRA_CAIXA = """Front
Я дома.

Back
Literal: I At home.

Alignment:
1 | Я | i
2 | дома | at HOME
"""

RUSSO_LITERAL_SEM_ALINHAMENTO = """Front
Я дома.

Back
Pronunciation: Ya doma.
Literal: I at home.
"""

INGLES_CAMPOS_REPETIDOS = """Front: x
Back: word - /wɜːd/
Stray line the English card drops.
Definition: first definition
Definition: second definition
-> First arrow.
→ Second arrow.
word - /wɜːd/
**Trigger:** bold trigger
Gist: gist
"""

NEGRITO_EM_DUAS_LINHAS = """Front: x
Back: **two
lines** bold
"""

FIM_DE_LINHA_DO_WINDOWS = "Front: x\r\nBack: word\r\n\r\nDefinition: d\r\n"

BACK_COM_TRACO_E_NEGRITO = """**Front:** x
**Back -** word
Note: n
"""

ALEMAO = """Front: x
Back: Wort

Definition: d
Gist: g
Stray: kept
"""

VERSOS = [
    (
        'ingles_completo_com_audio_e_imagem', EN_CARD_FULL, 'resent_it_word.mp3', 'resent_it.png', 'en',
        ('resent it - /ri-ZENT it/ [sound:resent_it_word.mp3]<br>Definition: To feel bitterness or anger about '
         'something seen as unfair.<br><br>Simple meaning: To feel annoyed because something feels unfair.<br><br>-> '
         'Dealers resent it when advertisers bypass them. = Dealers dislike that unfair treatment.<br><br>Gist: '
         'Dealers feel pushed aside by a sales practice they dislike.<br><br>Other example: -> Retailers resent it '
         'when jobbers take over their customers.<br><br>Trigger: A dealer sees a supplier ignore him and sell '
         'straight to his customers.<br><br><img src="resent_it.png">'),
        [],
    ),
    (
        'ingles_completo_sem_midia', EN_CARD_FULL, None, None, 'en',
        ('resent it - /ri-ZENT it/<br>Definition: To feel bitterness or anger about something seen as '
         'unfair.<br><br>Simple meaning: To feel annoyed because something feels unfair.<br><br>-> Dealers resent it '
         'when advertisers bypass them. = Dealers dislike that unfair treatment.<br><br>Gist: Dealers feel pushed '
         'aside by a sales practice they dislike.<br><br>Other example: -> Retailers resent it when jobbers take over '
         'their customers.<br><br>Trigger: A dealer sees a supplier ignore him and sell straight to his customers.'),
        [],
    ),
    (
        'russo_com_tres_pedacos', RU_CARD_WITH_THREE_ALIGNED_CHUNKS, 'w.mp3', None, 'ru',
        ('Pronunciation: Ya ne malchik! [sound:w.mp3]<br>Literal: <span style="color: #ff8c42;">I</span> <span '
         'style="color: #a855f7;">not</span> <span style="color: #22c55e;">a boy</span>!<br><br>Natural: I am not a '
         'boy!<br><br>Gist: Someone corrects a mistaken assumption about them.<br><br>'),
        [],
    ),
    (
        'russo_com_bloco_de_consultas', RU_CARD_WITH_QUERY_BLOCK, 'w.mp3', 'i.png', 'ru',
        'Pronunciation: Ya ne mal\'chik! [sound:w.mp3]<br>Translation: I am not a boy!<br><br><br><br><img src="i.png">',
        [],
    ),
    (
        'sem_rotulo_back_usa_o_resto_e_tira_o_alto_falante', EN_SEM_ROTULO_BACK, 'w.mp3', None, 'en',
        'Front: She <b>gave up</b> smoking [sound:w.mp3]<br>Definition: To stop doing something.',
        ["'Back' not found - using rest of file as back."],
    ),
    (
        'texto_vazio', '', None, None, 'en',
        '<br>',
        ['_build_back FAILED - the card text has no usable content (0 characters)'],
    ),
    (
        'so_uma_linha', SO_UMA_LINHA, 'w.mp3', None, 'ru',
        ' [sound:w.mp3]<br>',
        ['_build_back FAILED - the card text has no usable content (24 characters)'],
    ),
    (
        'linhas_de_imagem_e_midia_somem', LINHAS_DE_IMAGEM_E_MIDIA, None, None, 'en',
        'word - /wɜːd/<br>Definition: A unit of language.',
        [],
    ),
    (
        'linhas_de_imagem_e_midia_somem_no_russo', LINHAS_DE_IMAGEM_E_MIDIA, None, None, 'ru',
        'word - /wɜːd/<br>Definition: A unit of language.',
        [],
    ),
    (
        'alinhamento_some_tambem_no_ingles', ALINHAMENTO_NO_VERSO_INGLES, None, None, 'en',
        'word - /wɜːd/<br>Definition: shown because it is not a pair.<br><br>Gist: after the block.',
        [],
    ),
    (
        'alinhamento_some_ate_a_linha_em_branco', ALINHAMENTO_NO_VERSO_INGLES, None, None, 'de',
        'word - /wɜːd/<br>Definition: shown because it is not a pair.<br><br>2 | g | h Gist: after the block.',
        [],
    ),
    (
        'par_fora_do_alinhamento_fica', PAR_FORA_DO_ALINHAMENTO, None, None, 'ru',
        'word<br>1 | looks | like a pair',
        [],
    ),
    (
        'consultas_com_marcadores', CONSULTAS_COM_MARCADORES, None, None, 'en',
        'head - /hed/<br>Simple meaning: the block ended here.<br><br>Gist: shown.',
        [],
    ),
    (
        'consultas_somem_ate_a_linha_em_branco', CONSULTAS_COM_MARCADORES, None, None, 'de',
        'head - /hed/<br>Simple meaning: the block ended here.<br><br>1. shown after the blank line Gist: shown.',
        [],
    ),
    (
        'item_de_consulta_depois_do_alinhamento', ALINHAMENTO_DENTRO_DAS_CONSULTAS, None, None, 'ru',
        'line<br>Pronunciation: p Natural: shown',
        [],
    ),
    (
        'blocos_com_rotulo_em_negrito', BLOCOS_COM_ROTULO_EM_NEGRITO, None, None, 'ru',
        ('first line<br>Examples:</b><br>one example<br>another example<br><br>plain block line one plain block line '
         'two<br><br><b>Note:</b> inline label'),
        [],
    ),
    (
        'segunda_linha_comeca_com_b', SEGUNDA_LINHA_COMECA_COM_B, None, None, 'ru',
        'a<br>ing it',
        [],
    ),
    (
        'russo_literal_em_negrito', RUSSO_LITERAL_EM_NEGRITO, None, None, 'ru',
        ('Pronunciation: Ya ne mal\'chik!<br>Literal:</b> <span style="color: #ff8c42;">I</span> <span style="color: '
         '#a855f7;">not</span> <span style="color: #22c55e;">a boy</span>!'),
        [],
    ),
    (
        'russo_literal_em_outra_caixa', RUSSO_LITERAL_EM_OUTRA_CAIXA, None, None, 'ru',
        'Literal: <span style="color: #ff8c42;">I</span> <span style="color: #a855f7;">At home</span>.<br>',
        [],
    ),
    (
        'russo_literal_sem_alinhamento', RUSSO_LITERAL_SEM_ALINHAMENTO, None, None, 'ru',
        'Pronunciation: Ya doma.<br>Literal: I at home.',
        [],
    ),
    (
        'literal_no_ingles_nao_e_colorido', RUSSO_LITERAL_EM_NEGRITO, None, None, 'en',
        "Pronunciation: Ya ne mal'chik!<br>",
        [],
    ),
    (
        'ingles_campos_repetidos', INGLES_CAMPOS_REPETIDOS, None, None, 'en',
        ('word - /wɜːd/<br>Definition: second definition<br><br>-> First arrow.<br><br>Gist: '
         'gist<br><br><b>Trigger:</b> bold trigger'),
        [],
    ),
    (
        'negrito_em_duas_linhas', NEGRITO_EM_DUAS_LINHAS, None, None, 'en',
        '**two<br>',
        [],
    ),
    (
        'fim_de_linha_do_windows', FIM_DE_LINHA_DO_WINDOWS, None, None, 'en',
        'word<br>Definition: d',
        [],
    ),
    (
        'back_com_traco_e_negrito', BACK_COM_TRACO_E_NEGRITO, None, None, 'ru',
        'word<br>Note: n',
        [],
    ),
    (
        'outro_idioma_nem_reordena_nem_colore', ALEMAO, 'w.mp3', None, 'de',
        'Wort [sound:w.mp3]<br>Definition: d Gist: g Stray: kept',
        [],
    ),
]

ORDENS_DO_VERSO_INGLES = [
    (
        'vazio',
        [],
        [],
    ),
    (
        'so_linhas_em_branco',
        ['', '  '],
        [],
    ),
    (
        'so_a_primeira_linha',
        ['  word  '],
        ['word'],
    ),
    (
        'ordem_do_verso',
        ['word', 'Trigger: t', 'Other example: o', 'Gist: g', '-> arrow', 'Simple meaning: s', 'Definition: d'],
        ['word',
         '',
         'Definition: d',
         '',
         'Simple meaning: s',
         '',
         '-> arrow',
         '',
         'Gist: g',
         '',
         'Other example: o',
         '',
         'Trigger: t'],
    ),
    (
        'o_campo_repetido_fica_o_ultimo_e_a_seta_a_primeira',
        ['word', 'Definition: a', 'definition: b', '→ first', '-> second', 'word', 'Stray', '**GIST:** bold'],
        ['word', '', 'definition: b', '', '→ first', '', '**GIST:** bold'],
    ),
    (
        'sem_campos',
        ['', 'word', '', 'nothing else'],
        ['word'],
    ),
]

ALINHAMENTOS = [
    ('sem_cabecalho', '1 | a | b',
     []),
    ('pares_ate_a_linha_em_branco', 'x\nAlignment:\n1 | a | b\n2 | c | d\n\n3 | e | f',
     [('a', 'b'), ('c', 'd')]),
    ('linhas_antes_do_primeiro_par', 'Alignment:\nnot a pair\n1 | a | b\nnot a pair\n2 | c | d',
     [('a', 'b')]),
    ('cabecalho_repetido_dentro_do_bloco', 'Alignment:\n1 | a | b\n**Alignment:**\n2 | c | d',
     [('a', 'b'), ('c', 'd')]),
    ('lado_vazio_nao_conta_como_par', 'Alignment:\n1 |   | x\nnot a pair\n2 | c | d\nstop?',
     [('c', 'd')]),
    ('so_o_primeiro_bloco', '**Alignment:**\n1 | a | b\n\nAlignment:\n2 | c | d',
     [('a', 'b')]),
    ('cabecalho_e_linha_em_branco', 'Alignment:\n\n1 | a | b',
     []),
    ('linha_em_branco_antes_do_cabecalho', '\n\nALIGNMENT:  \n 1|a|b ',
     [('a', 'b')]),
]

NOTAS = [
    (
        'ingles_com_toda_a_midia', EN_CARD_FULL, 'en', ('p.mp3', 'w.mp3', 'i.png'),
        {'front': 'Dealers <b>resent it</b> when advertisers bypass them.[sound:p.mp3]',
         'back': 'resent it - /ri-ZENT it/ [sound:w.mp3]<br>Definition: To feel bitterness or anger about something '
                 'seen as unfair.<br><br>Simple meaning: To feel annoyed because something feels unfair.<br><br>-> '
                 'Dealers resent it when advertisers bypass them. = Dealers dislike that unfair '
                 'treatment.<br><br>Gist: Dealers feel pushed aside by a sales practice they dislike.<br><br>Other '
                 'example: -> Retailers resent it when jobbers take over their customers.<br><br>Trigger: A dealer '
                 'sees a supplier ignore him and sell straight to his customers.<br><br><img src="i.png">',
         'normalized_front': 'dealers resent it when advertisers bypass them.',
         'tags': ['perpetual_miner', 'scientific_advertising', 'chapter_8']},
    ),
    (
        'russo_so_texto', '## Anki Card\n' + RU_CARD_WITH_THREE_ALIGNED_CHUNKS, 'ru', (None, None, None),
        {'front': '<span style="color: #ff8c42;">Ya</span> <span style="color: #a855f7;">ne</span> <span style="color: '
                  '#22c55e;">malchik</span>!',
         'back': 'Pronunciation: Ya ne malchik!<br>Literal: <span style="color: #ff8c42;">I</span> <span style="color: '
                 '#a855f7;">not</span> <span style="color: #22c55e;">a boy</span>!<br><br>Natural: I am not a '
                 'boy!<br><br>Gist: Someone corrects a mistaken assumption about them.<br><br>',
         'normalized_front': 'Ya ne malchik!',
         'tags': ['perpetual_miner']},
    ),
    (
        'russo_com_audio_da_frase', RU_CARD_WITH_QUERY_BLOCK, 'ru', ('p.mp3', None, None),
        {'front': '<span style="color: #ff8c42;">Я</span> <span style="color: #a855f7;">не</span> <span style="color: '
                  '#22c55e;">мальчик</span>![sound:p.mp3]',
         'back': "Pronunciation: Ya ne mal'chik!<br>Translation: I am not a boy!<br><br>",
         'normalized_front': 'Я не мальчик!',
         'tags': ['perpetual_miner']},
    ),
    (
        'sem_rotulos_com_o_titulo_em_markdown', '## Anki Card\nHello 🔊 there\nsecond line 🔊 x', 'ru', ('p.mp3', 'w.mp3', None),
        {'front': 'Hello[sound:p.mp3]',
         'back': 'second line [sound:w.mp3]<br>',
         'normalized_front': 'Hello',
         'tags': ['perpetual_miner']},
    ),
    (
        'vazio', '', 'en', (None, None, None),
        {'front': '', 'back': '<br>', 'normalized_front': '', 'tags': ['perpetual_miner']},
    ),
]

class _AvisosDoMotor(logging.Handler):
    def __init__(self):
        super().__init__()
        self.mensagens = []

    def emit(self, record):
        self.mensagens.append(record.getMessage())


def _com_avisos(funcao, *args, **kwargs):
    avisos = _AvisosDoMotor()
    log = logging.getLogger("perpetualminer.motor")
    log.addHandler(avisos)
    log.propagate = False
    try:
        return funcao(*args, **kwargs), avisos.mensagens
    finally:
        log.removeHandler(avisos)
        log.propagate = True


def _nota(texto, lang, midia):
    return send_to_anki.card_fields(texto, lang, send_to_anki.CardMedia(*midia))


class ATabelaDeEntradasESaidas(unittest.TestCase):
    def test_o_verso_de_cada_texto_de_cartao_sai_como_saia_antes_e_com_os_mesmos_avisos(self):
        for nome, texto, audio_da_palavra, imagem, lang, verso, avisos in VERSOS:
            with self.subTest(nome):
                self.assertEqual(_com_avisos(send_to_anki._build_back, texto, audio_da_palavra, imagem, lang=lang), (verso, avisos))

    def test_o_verso_ingles_fica_na_ordem_de_antes(self):
        for nome, linhas, ordem in ORDENS_DO_VERSO_INGLES:
            with self.subTest(nome):
                self.assertEqual(send_to_anki._reorder_english_back_lines(linhas), ordem)

    def test_os_pares_do_alignment_sao_os_de_antes(self):
        for nome, texto, pares in ALINHAMENTOS:
            with self.subTest(nome):
                self.assertEqual(send_to_anki._extract_alignments(texto), pares)

    def test_a_nota_inteira_sai_como_saia_antes(self):
        for nome, texto, lang, midia, nota in NOTAS:
            with self.subTest(nome):
                self.assertEqual(_com_avisos(_nota, texto, lang, midia)[0], nota)


if __name__ == "__main__":
    unittest.main()
