from datetime import datetime, timezone

from . import normalizacao
from .motor import estilos

SITUACOES = ("all", "new", "recent", "mature", "mixed", "seen")
TIPOS = ("all", "word", "term")
LIMITE_PADRAO = 1000
LIMITE_MAXIMO = 10000
FONTE = "colecao"

_NOMES_DA_FRENTE = ("frente", "front", "frase")
_NOMES_DO_VERSO = ("verso", "back", "palavra")


class ColecaoIndisponivel(Exception):
    pass


class OutroPerfil(ColecaoIndisponivel):
    def __init__(self, aberto, marcado):
        super().__init__("anki_other_profile")
        self.aberto, self.marcado = aberto, marcado


class PerfilSumiu(ColecaoIndisponivel):
    def __init__(self, marcado, aberto=None):
        super().__init__("anki_profile_missing")
        self.marcado, self.aberto = marcado, aberto


class PerfilIlegivel(ColecaoIndisponivel):
    def __init__(self):
        super().__init__("anki_profile_unreadable")


def espera_pelo_perfil(motivo):
    if isinstance(motivo, OutroPerfil):
        return {"reason": "other_profile", "profile": motivo.aberto, "marked": motivo.marcado}
    if isinstance(motivo, PerfilSumiu):
        return {"reason": "profile_missing", "profile": motivo.aberto, "marked": motivo.marcado}
    return None


class TipoDeNotaAusente(Exception):
    pass


class TipoDeNotaAlterado(Exception):
    pass


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


def _baralho_pedido(pedido):
    return str(pedido.get("deckName") or "").strip(), str(pedido.get("lang") or "en").strip().lower()


def _pedido_que_se_le(nome, idioma):
    return bool(nome) and idioma in estilos.idiomas()


def _pedidos_sem_repetir(pedidos):
    vistos = set()
    for nome, idioma in map(_baralho_pedido, pedidos):
        chave = (nome.casefold(), idioma)
        if _pedido_que_se_le(nome, idioma) and chave not in vistos:
            vistos.add(chave)
            yield nome, idioma


def numeros_dos_baralhos(colecao, pedidos):
    existentes = set(colecao.nomes_dos_baralhos())
    linhas = []
    for nome, idioma in _pedidos_sem_repetir(pedidos):
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


def _escolha(valor, aceitas):
    escolhida = str(valor or "all").strip().lower()
    return escolhida if escolhida in aceitas else "all"


def _bate(escolha, palavra, campo):
    return escolha == "all" or palavra[campo] == escolha


class _FiltrosDoVocabulario:
    def __init__(self, filtros):
        self.situacao = _escolha(filtros.get("status"), SITUACOES)
        self.tipo = _escolha(filtros.get("type"), TIPOS)
        self.busca = str(filtros.get("q") or "").strip().casefold()
        self.limite = _inteiro(filtros.get("limit") or LIMITE_PADRAO, LIMITE_PADRAO, 1, LIMITE_MAXIMO)
        self.deslocamento = _inteiro(filtros.get("offset") or 0, 0, 0, 10**9)

    def _achada_pela_busca(self, palavra):
        return not self.busca or self.busca in palavra["word"].casefold()

    def aceita(self, palavra):
        return _bate(self.situacao, palavra, "status") and _bate(self.tipo, palavra, "type") and self._achada_pela_busca(palavra)

    def pagina(self, palavras):
        return palavras[self.deslocamento:self.deslocamento + self.limite]

    def lidos(self):
        return {"status": self.situacao, "type": self.tipo, "q": self.busca, "limit": self.limite, "offset": self.deslocamento}


def vocabulario(colecao, nome, idioma, filtros=None):
    escolhidos = _FiltrosDoVocabulario(filtros or {})
    cartoes = _cartoes_para_leitura(colecao, nome) if nome in set(colecao.nomes_dos_baralhos()) else []
    palavras = normalizacao.front_vocabulary_rows_from_cards(cartoes, idioma, normalizacao.normalizar_frase_ru)
    palavras = [palavra for palavra in palavras if escolhidos.aceita(palavra)]
    return {
        "generatedAt": _agora(),
        "deckName": nome,
        "lang": idioma,
        "source": FONTE,
        "totalCards": len(cartoes),
        "filters": escolhidos.lidos(),
        "totalWords": len(palavras),
        "words": escolhidos.pagina(palavras),
    }
