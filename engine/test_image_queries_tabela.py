import unittest

from image_queries import (
    CardToSearch,
    _build_card_google_queries,
    _card_phrase_and_context_from_text,
    _english_query_variants_from_text,
    _extract_multiline_image_queries,
    _visual_subject_for_card,
)

CARTAO_EN = """Front: I *saw* it happen.
Back: saw - /saw/
Definition: perceived with the eyes.
Simple meaning: noticed visually.
Image: A person witnessing an event, no text."""

CARTAO_COM_BLOCO = """**Google Image Search Queries:**
1. eye
- person looking
b) witness
* watching scene
None
2) eye

3. depois do branco"""

CARTAO_RU = """Image: none
Google Image Search: N/A
Back: **голодный** / x
Translation: hungry people
Literal: we hungry
Natural: we are hungry
Gist: hunger
Front: Мы голодны"""

VARIANTES = [
    ("", []),
    ("   ", []),
    ("cat", ["cat"]),
    ("a cat on a mat", ["a cat on a mat", "cat mat"]),
    (
        "  - **A hungry child**, eating rice!  ",
        [
            "A hungry child , eating rice",
            "A hungry child eating rice",
            "hungry child eating rice",
            "hungry child eating",
            "child eating rice",
            "hungry child",
            "child eating",
            "eating rice",
            "hungry rice",
            "hungry eating child",
        ],
    ),
    ("Dog DOG dog", ["Dog DOG dog", "Dog DOG", "dog"]),
    ("Café crème brûlée", ["Café crème brûlée", "Caf cr me br l e", "caf"]),
    (
        "one two three four five six",
        [
            "one two three four five six",
            "one two three four",
            "two three four five",
            "three four five six",
            "one two three",
            "two three four",
            "three four five",
            "four five six",
            "one two",
            "two three",
            "three four",
            "four five",
            "five six",
            "one six",
            "one two three four five",
        ],
    ),
    (
        "Hungry people asking for food in a crowded market street at night",
        [
            "Hungry people asking for food in a crowded market street at night",
            "Hungry people asking for",
            "people asking for food",
            "asking for food crowded",
            "for food crowded market",
            "food crowded market street",
            "crowded market street night",
            "Hungry people asking",
            "people asking for",
            "asking for food",
            "for food crowded",
            "food crowded market",
            "crowded market street",
            "market street night",
            "Hungry people",
            "people asking",
            "asking for",
            "for food",
            "food crowded",
            "crowded market",
            "market street",
            "street night",
            "hungry asking",
            "hungry asking food",
            "hungry asking food crowded",
            "hungry night",
            "crowded Hungry people",
            "Hungry people asking for food",
        ],
    ),
    (
        "it's a well-known fact",
        ["it's a well-known fact", "it s a well known fact", "well known fact", "well known", "known fact", "well fact", "known well fact"],
    ),
    ("x y z", ["x y z"]),
    ("big red apple", ["big red apple", "big red", "red apple", "big apple", "apple big red"]),
    (
        "an old big red fat cat",
        [
            "an old big red fat cat",
            "old big red fat",
            "big red fat cat",
            "old big red",
            "big red fat",
            "red fat cat",
            "old big",
            "big red",
            "red fat",
            "fat cat",
            "old cat",
        ],
    ),
    (
        "— The *king* looks at his starving people.",
        [
            "The king looks at his starving people",
            "The king looks his",
            "king looks his starving",
            "looks his starving people",
            "The king looks",
            "king looks his",
            "looks his starving",
            "his starving people",
            "The king",
            "king looks",
            "looks his",
            "his starving",
            "starving people",
            "king looks starving",
            "king starving",
            "starving people looks",
            "The king looks his starving",
        ],
    ),
]

BLOCOS = [
    ("", []),
    ("Front: nada aqui", []),
    (CARTAO_COM_BLOCO, ["eye", "person looking", "witness", "watching scene", "eye"]),
    ("Image Search Queries:\n1. food\nImage: a plate\n2. never read", ["food"]),
    ("Google Image Search Queries:\nn/a\nNONE.\n  4.   empty   plate  \n", ["empty plate"]),
    ("Image search queries:\n1. first\n\nGoogle Image Search Queries:\n1. second", ["first"]),
    (
        "Google Image Search Queries:\n1. **bold** _query_\nC. third\nD) fourth\nE. not a letter list",
        ["bold query", "third", "fourth", "E. not a letter list"],
    ),
]

CARTOES = [
    ("", {}, []),
    (
        CARTAO_EN,
        {},
        [
            "A person witnessing an event, no text",
            "A person witnessing an event no text",
            "person witnessing event text",
            "person witnessing event",
            "witnessing event text",
            "person witnessing",
            "witnessing event",
            "event text",
        ],
    ),
    (
        CARTAO_EN,
        {"stem": "saw_it", "prompt": "an eye watching", "max_queries": 30},
        [
            "A person witnessing an event, no text",
            "A person witnessing an event no text",
            "person witnessing event text",
            "person witnessing event",
            "witnessing event text",
            "person witnessing",
            "witnessing event",
            "event text",
            "witnessing person event",
            "perceived with the eyes",
            "perceived with the",
            "with the eyes",
            "perceived with",
            "with the",
            "the eyes",
            "perceived eyes",
            "perceived with eyes",
            "noticed visually",
            "visually noticed",
            "saw",
            "I saw it happen",
            "saw it",
            "an eye watching",
            "eye watching",
            "watching eye",
        ],
    ),
    (
        CARTAO_EN,
        {"lang": "ru", "stem": "saw_it", "prompt": "an eye watching", "max_queries": 30},
        [
            "A person witnessing an event, no text",
            "A person witnessing an event no text",
            "person witnessing event text",
            "person witnessing event",
            "witnessing event text",
            "person witnessing",
            "witnessing event",
            "event text",
            "witnessing person event",
            "perceived with the eyes",
            "perceived with the",
            "with the eyes",
            "perceived with",
            "with the",
            "the eyes",
            "perceived eyes",
            "perceived with eyes",
            "noticed visually",
            "visually noticed",
            "saw",
            "an eye watching",
            "eye watching",
            "watching eye",
        ],
    ),
    (CARTAO_EN + "\nGoogle Image Search: eye close up\nImage Search Query: witness", {"max_queries": 2}, ["eye close up", "witness"]),
    (CARTAO_COM_BLOCO + "\n" + CARTAO_EN, {"max_queries": 3}, ["eye", "person looking", "witness"]),
    (
        CARTAO_COM_BLOCO + "\n" + CARTAO_EN,
        {"max_queries": 12},
        [
            "eye",
            "person looking",
            "witness",
            "watching scene",
            "A person witnessing an event, no text",
            "A person witnessing an event no text",
            "person witnessing event text",
            "person witnessing event",
            "witnessing event text",
            "person witnessing",
            "witnessing event",
            "event text",
        ],
    ),
    (CARTAO_COM_BLOCO + "\n" + CARTAO_EN, {"max_queries": 5}, ["eye", "person looking", "witness", "watching scene"]),
    (
        CARTAO_RU,
        {"lang": "ru", "stem": "golodny", "max_queries": 40},
        ["hungry people", "hungry", "we hungry", "we are hungry", "are hungry", "hungry are", "hunger", "голодный"],
    ),
    (
        "Back: **hungry old people** / x\nFront: Мы",
        {"lang": "ru", "max_queries": 9},
        ["hungry old people", "hungry old", "old people", "hungry people old"],
    ),
    ("Back: **hungry** / x\nFront hungry people", {"stem": "_", "prompt": "", "max_queries": 8}, ["hungry", "hungry people"]),
    ("Front: - * Repeated\nBack: repeated", {"stem": "Repeated", "prompt": "REPEATED", "max_queries": 0}, []),
    ("Front: um", {"max_queries": -1}, []),
]

ASSUNTOS = [
    ("", "", "", ""),
    (CARTAO_COM_BLOCO, "stem", "prompt", "eye"),
    ("Image Search Query: witness\nGoogle Image Search: eye", "stem", "prompt", "witness"),
    ("Image Search Query: none\nGoogle Image Search: eye", "stem", "prompt", "eye"),
    ("Image Search Query: N/A\nBack: **saw** / x", "stem", "", "saw"),
    ("Back: none", "saw_it_happen", "", "saw it happen"),
    ("Front: x", "saw_it_happen", "an eye", "an eye"),
]

FRASES = [
    ("", ("", "")),
    ("**Front:** She *gave up*.\n**Back:** gave up\nSource Context: Netflix - Ep 1", ("She gave up.", "Netflix - Ep 1")),
    ("Front\nSó a frente\nsource context:   o livro  ", ("Só a frente\nsource context:   o livro", "o livro")),
]


def consultas_do_cartao(texto, argumentos):
    busca = dict(argumentos)
    cartao = CardToSearch(texto, stem=busca.pop("stem", ""), prompt=busca.pop("prompt", ""))
    return _build_card_google_queries(cartao, **busca)


class AsConsultasDeImagemDoCartao(unittest.TestCase):
    def conferir(self, funcao, casos):
        for caso in casos:
            *entrada, esperado = caso
            with self.subTest(entrada=entrada):
                self.assertEqual(funcao(*entrada), esperado)

    def test_as_variantes_de_um_texto_em_ingles_vao_da_frase_inteira_as_palavras_de_conteudo(self):
        self.conferir(_english_query_variants_from_text, VARIANTES)

    def test_o_bloco_de_consultas_e_o_primeiro_e_termina_no_branco_ou_no_proximo_rotulo(self):
        self.conferir(_extract_multiline_image_queries, BLOCOS)

    def test_a_lista_do_openverse_comeca_pelo_que_o_cartao_pede_e_completa_pelo_sentido_ate_o_teto(self):
        self.conferir(consultas_do_cartao, CARTOES)

    def test_o_assunto_visual_e_a_primeira_consulta_escrita_senao_o_prompt_senao_o_nome(self):
        self.conferir(_visual_subject_for_card, ASSUNTOS)

    def test_a_frase_e_o_contexto_saem_da_frente_e_do_source_context(self):
        self.conferir(_card_phrase_and_context_from_text, FRASES)


if __name__ == "__main__":
    unittest.main()
