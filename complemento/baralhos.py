"""O que a Conexão lê da coleção: a lista de Baralhos, os números de cada um e o vocabulário.

Fala só com o **lado de leitura** de um adaptador da coleção (o do Anki está em `no_anki.py`; o dos
testes, em memória, em `test_colecao_em_memoria.py`). O adaptador tem quatro métodos:

- `perfis()`: os nomes dos perfis do Anki; vale também sem coleção aberta (a tela de perfis);
- `nomes_dos_baralhos()`: todos os Baralhos, com `::` entre os níveis;
- `cartoes_do_baralho(nome)`: os Cartões do Baralho e dos subbaralhos, cada um
  `{ "nota": id, "campos": [(nome, valor), ...], "tipo": 0..3, "intervalo": dias }`;
- os dois últimos levantam `ColecaoIndisponivel` quando não há coleção aberta ou o Anki não respondeu.

O **lado de gravação**, que o Envio usa (`envio.py`), tem mais três; todos levantam `ColecaoIndisponivel` também quando o
Anki está sincronizando (`anki_syncing`):

- `tipo_de_nota(nome)`: os nomes dos campos do tipo de nota, ou None se a coleção não o tem;
- `guids_existentes(guids)`: quais destes `guid` já são de uma nota da coleção;
- `adicionar_nota(baralho, tipo_de_nota, campos, etiquetas, guid, midia=None)`: grava uma nota (`campos` é `{nome: valor}`), criando o
  Baralho se faltar; a `midia` (`{nome do arquivo: bytes}`, o áudio do Cartão, #143) é guardada pela coleção com a nota, e a nota cita
  o nome que a coleção deu ao arquivo (o Anki troca o nome se já tem outro arquivo com ele e outro conteúdo); uma nota com o mesmo `guid` já gravada fica como está (gravar de novo não dobra); um tipo de nota que falta, ou sem um dos campos, levanta `TipoDeNotaAusente` sem gravar nada.

- `gravar_cartao(baralho, tipo_de_nota, campos, etiquetas, guid, campo_da_frente, frente_normalizada, normalizar, midia=None)`: **a** função de
  gravar um Cartão, uma só na thread principal do Anki. Nesta ordem: a sincronização (`ColecaoIndisponivel`, sem gravar), o
  `guid` (achou: devolve `"added"`, sem gravar), a frente normalizada no Baralho (achou: `"duplicate"`, sem gravar) e a nota nova
  (devolve `"added"`; é só aqui que a `midia` é guardada). O que dá errado é devolvido ou levantado para a thread de trabalho, nunca para a thread principal do Anki.

O **perfil fixo** (#149, `perfil.py`): a Conexão entrega ao adaptador o `PerfilFixo` por `fixar_o_perfil(fixo)`, e daí em diante
toda gravação só vale no perfil marcado: com outro perfil aberto levanta `OutroPerfil` e com o marcado apagado, `PerfilSumiu` (os dois
são `ColecaoIndisponivel`: o Envio espera, nada é gravado). A conferência acontece na hora de gravar, no mesmo passo que a grava.
Mais três métodos, para a Conexão:

- `perfil_aberto()`: o nome do perfil com a coleção aberta, ou None (a tela de perfis);
- `entrar_no_perfil_fixo()`: **só** com o Anki na tela de perfis, abre o marcado pelas funções de perfil do Anki; devolve se começou.
  Com um perfil aberto não faz nada: ninguém é tirado do perfil em que estuda;
- `trocar_para_o_perfil_fixo()`: o clique em “Abrir <perfil>”: fecha o perfil aberto pelo caminho normal do Anki (que sincroniza) e abre
  o marcado; na tela de perfis, só abre; já no marcado, não faz nada. Devolve se começou.

A frente e o verso são os campos “Frente” e “Verso” (ou “Front” e “Back”, do Anki em inglês) e, sem eles,
o primeiro e o segundo campo, como a Conexão de hoje faz.
"""

from datetime import datetime, timezone

from . import normalizacao

IDIOMAS = ("en", "ru")
SITUACOES = ("all", "new", "recent", "mature", "mixed", "seen")
TIPOS = ("all", "word", "term")
LIMITE_PADRAO = 1000
LIMITE_MAXIMO = 10000
FONTE = "colecao"

_NOMES_DA_FRENTE = ("frente", "front")
_NOMES_DO_VERSO = ("verso", "back")


class ColecaoIndisponivel(Exception):
    """Não há coleção aberta (o Anki está na tela de perfis), o Anki está sincronizando ou não respondeu a tempo."""


class OutroPerfil(ColecaoIndisponivel):
    """O Anki está noutro perfil que o marcado (#149): nada se grava, e o Envio espera o marcado abrir (`aberto`, `marcado`)."""

    def __init__(self, aberto, marcado):
        super().__init__("anki_other_profile")
        self.aberto, self.marcado = aberto, marcado


class PerfilSumiu(ColecaoIndisponivel):
    """O perfil marcado já não existe no Anki (renomeado ou apagado, #149): nada se grava em perfil nenhum até a pessoa escolher outro."""

    def __init__(self, marcado, aberto=None):
        super().__init__("anki_profile_missing")
        self.marcado, self.aberto = marcado, aberto


class PerfilIlegivel(ColecaoIndisponivel):
    """O arquivo do perfil marcado existe e não se lê (#149): não vale por “nenhum perfil marcado”, e nada é marcado nem gravado por cima."""

    def __init__(self):
        super().__init__("anki_profile_unreadable")


def espera_pelo_perfil(motivo):
    """O que o estado do Envio diz da espera quando o motivo é o perfil (#149); None para qualquer outro motivo."""
    if isinstance(motivo, OutroPerfil):
        return {"reason": "other_profile", "profile": motivo.aberto, "marked": motivo.marcado}
    if isinstance(motivo, PerfilSumiu):
        return {"reason": "profile_missing", "profile": motivo.aberto, "marked": motivo.marcado}
    return None


class TipoDeNotaAusente(Exception):
    """A coleção não tem o tipo de nota pedido (ou ele não tem os campos pedidos): nada foi gravado."""


def _agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _campo(campos, nomes, posicao):
    for nome, valor in campos:
        if str(nome).casefold() in nomes:
            return valor
    return campos[posicao][1] if posicao < len(campos) else ""


def _cartoes_para_leitura(colecao, nome):
    cartoes = []
    for cartao in colecao.cartoes_do_baralho(nome):
        campos = cartao["campos"]
        cartoes.append({
            "noteId": int(cartao["nota"]),
            "front": _campo(campos, _NOMES_DA_FRENTE, 0),
            "back": _campo(campos, _NOMES_DO_VERSO, 1),
            "created": int(cartao["nota"]),
            "bucket": normalizacao.card_bucket_from_values(int(cartao["tipo"] or 0), int(cartao["intervalo"] or 0)),
        })
    return cartoes


def nomes_dos_baralhos(colecao):
    """Os Baralhos para a escolha dos Ajustes de envio: sem o “Default” do Anki, em ordem alfabética."""
    limpos = {str(nome or "").strip() for nome in colecao.nomes_dos_baralhos()}
    return sorted((nome for nome in limpos if nome and nome != "Default"), key=str.casefold)


def _numeros_de_um_baralho(colecao, nome, idioma):
    cartoes = _cartoes_para_leitura(colecao, nome)
    baldes = {"new": 0, "learning": 0, "young": 0, "mature": 0}
    frentes = set()
    for cartao in cartoes:
        baldes[cartao["bucket"]] += 1
        identidade = normalizacao.normalize_term_identity(cartao["front"], idioma, normalizacao.normalizar_frase_ru)
        if identidade:
            frentes.add(identidade)
    vocabulario = normalizacao.catalog_stats_from_cards(cartoes, idioma, normalizacao.normalizar_frase_ru)
    revisados = baldes["learning"] + baldes["young"] + baldes["mature"]
    return {
        "deckName": nome,
        "lang": idioma,
        "frontField": "Frente",
        "notes": len({cartao["noteId"] for cartao in cartoes}),
        "cards": len(cartoes),
        "uniqueTerms": vocabulario["targetTerms"],
        "uniqueFronts": len(frentes),
        "uniqueTermTokens": vocabulario["phraseVocabulary"],
        "vocabulary": vocabulario,
        "termMetric": "anki_target_terms",
        "new": baldes["new"],
        "learning": baldes["learning"],
        "young": baldes["young"],
        "mature": baldes["mature"],
        "reviewed": revisados,
        "maturePct": round((baldes["mature"] / revisados) * 100, 1) if revisados else 0.0,
    }


def numeros_dos_baralhos(colecao, pedidos):
    """Os números dos Baralhos pedidos (`[{ deckName, lang }]`), na ordem, sem repetir. Um Baralho que o Anki
    não tem volta como `missing`, com tudo zerado."""
    existentes = set(colecao.nomes_dos_baralhos())
    linhas, vistos = [], set()
    for pedido in pedidos:
        nome = str(pedido.get("deckName") or "").strip()
        idioma = str(pedido.get("lang") or "en").strip().lower()
        if not nome or idioma not in IDIOMAS or (nome.casefold(), idioma) in vistos:
            continue
        vistos.add((nome.casefold(), idioma))
        if nome in existentes:
            linhas.append(_numeros_de_um_baralho(colecao, nome, idioma))
        else:
            linhas.append(normalizacao.empty_deck_stats(nome, idioma))
    return {
        "generatedAt": _agora(),
        "decks": linhas,
        "totals": normalizacao.deck_stats_totals(linhas),
        "source": FONTE,
    }


def _inteiro(valor, padrao, minimo, maximo):
    try:
        return max(minimo, min(maximo, int(valor)))
    except (TypeError, ValueError):
        return padrao


def vocabulario(colecao, nome, idioma, filtros=None):
    """O vocabulário do Baralho (as Palavras e os Termos do verso dos Cartões), com os filtros da aba aplicados.
    Um Baralho que o Anki não tem tem vocabulário vazio."""
    filtros = filtros or {}
    situacao = str(filtros.get("status") or "all").strip().lower()
    tipo = str(filtros.get("type") or "all").strip().lower()
    busca = str(filtros.get("q") or "").strip().casefold()
    limite = _inteiro(filtros.get("limit") or LIMITE_PADRAO, LIMITE_PADRAO, 1, LIMITE_MAXIMO)
    deslocamento = _inteiro(filtros.get("offset") or 0, 0, 0, 10**9)
    if situacao not in SITUACOES:
        situacao = "all"
    if tipo not in TIPOS:
        tipo = "all"

    cartoes = _cartoes_para_leitura(colecao, nome) if nome in set(colecao.nomes_dos_baralhos()) else []
    palavras = normalizacao.front_vocabulary_rows_from_cards(cartoes, idioma, normalizacao.normalizar_frase_ru)
    if situacao != "all":
        palavras = [palavra for palavra in palavras if palavra["status"] == situacao]
    if tipo != "all":
        palavras = [palavra for palavra in palavras if palavra["type"] == tipo]
    if busca:
        palavras = [palavra for palavra in palavras if busca in palavra["word"].casefold()]
    return {
        "generatedAt": _agora(),
        "deckName": nome,
        "lang": idioma,
        "source": FONTE,
        "totalCards": len(cartoes),
        "filters": {"status": situacao, "type": tipo, "q": busca, "limit": limite, "offset": deslocamento},
        "totalWords": len(palavras),
        "words": palavras[deslocamento:deslocamento + limite],
    }
