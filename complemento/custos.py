import json
import os
from datetime import date

_ORIGENS_DA_IMAGEM = {
    "real": "real", "google": "real", "openverse": "real",
    "gerada": "generated", "generated": "generated", "dalle": "generated", "dall-e": "generated", "gpt-image": "generated",
    "skipped": "skipped",
}
_CHAVES_DO_TEXTO_PELA_PALAVRA = (("[image_judge]", "imageJudgeUsd"), ("[image_guard]", "imageGuardUsd"))


def dia(valor):
    try:
        return date.fromisoformat(str(valor or "").strip()[:10])
    except ValueError:
        return None


def _custo(registro, campo="cost_usd"):
    try:
        return float(registro.get(campo) or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _custos_zerados():
    return {"cardUsd": 0.0, "imageJudgeUsd": 0.0, "imageGuardUsd": 0.0, "imageGenerationUsd": 0.0, "otherUsd": 0.0, "totalUsd": 0.0}


def _imagens_zeradas():
    return {"total": 0, "real": 0, "generated": 0, "skipped": 0, "failed": 0, "generatedAttempted": 0, "savingsUsd": 0.0}


def _origem_da_imagem(valor):
    return _ORIGENS_DA_IMAGEM.get(str(valor or "").strip().lower(), "failed")


def _chave_do_texto(registro):
    palavra = str(registro.get("keyword") or "")
    return next((chave for prefixo, chave in _CHAVES_DO_TEXTO_PELA_PALAVRA if palavra.startswith(prefixo)), "cardUsd")


def _dia_do_registro(registro, dia_do_envio):
    return dia(registro.get("date") or registro.get("createdAt")) or dia_do_envio


def _porcentagem(parte, total):
    return round(parte / total * 100, 1) if total else 0.0


class _Periodo:
    def __init__(self, de, ate):
        self.de, self.ate = de, ate

    def _aberto(self):
        return self.de is None and self.ate is None

    def _depois_do_inicio(self, valor):
        return not (self.de and valor < self.de)

    def _antes_do_fim(self, valor):
        return not (self.ate and valor > self.ate)

    def contem(self, valor):
        if valor is None:
            return self._aberto()
        return self._depois_do_inicio(valor) and self._antes_do_fim(valor)

    def tem_o_envio(self, dia_do_envio, lidos):
        return self.contem(dia_do_envio) or any(self.contem(_dia_do_registro(registro, dia_do_envio)) for registro in lidos)


class _Imagens:
    def __init__(self):
        self.contagem = _imagens_zeradas()
        self.geradas_usd = 0.0

    def contar(self, origem, registro, campo_do_custo):
        self.contagem["total"] += 1
        self.contagem[origem] += 1
        if origem == "generated":
            self.geradas_usd += _custo(registro, campo_do_custo)


class _SomaDoEnvio:
    def __init__(self):
        self.custos = _custos_zerados()
        self.do_pipeline, self.dos_registros = _Imagens(), _Imagens()
        self.cartoes_do_plano, self.na_chave = set(), 0.0
        self.corrigiu, self.correcao = False, 0.0
        self.contados = 0

    def somar(self, registro):
        self.contados += 1
        _SOMAR_PELO_TIPO.get(str(registro.get("type")), _SomaDoEnvio._outro_custo)(self, registro, _custo(registro))

    def _texto(self, registro, custo):
        self.custos[_chave_do_texto(registro)] += custo

    def _correcao_da_criacao(self, registro, custo):
        self.corrigiu, self.correcao = True, self.correcao + custo

    def _cartao_do_plano(self, registro, custo):
        self.cartoes_do_plano.add(str(registro.get("keyword") or ""))
        self.na_chave += _custo(registro, "would_cost_usd")

    def _imagem_do_registro(self, registro, custo):
        self.dos_registros.contar(_origem_da_imagem(registro.get("source")), registro, "cost_usd")

    def _imagem_do_pipeline(self, registro, custo):
        self.do_pipeline.contar(_origem_da_imagem(registro.get("final_source")), registro, "actual_cost_usd")
        if registro.get("generated_attempted"):
            self.do_pipeline.contagem["generatedAttempted"] += 1
        self.do_pipeline.contagem["savingsUsd"] += _custo(registro, "cost_saved_vs_generated_usd")

    def _sessao_nao_custa(self, registro, custo):
        pass

    def _outro_custo(self, registro, custo):
        self.custos["otherUsd"] += custo

    def _imagens_contadas(self):
        if self.do_pipeline.contagem["total"] == 0 and self.dos_registros.contagem["total"]:
            return self.dos_registros.contagem
        return self.do_pipeline.contagem

    def _custos_contados(self):
        custos = dict(self.custos, imageGenerationUsd=max(self.dos_registros.geradas_usd, self.do_pipeline.geradas_usd))
        if self.corrigiu:
            custos["correctionUsd"] = self.correcao
        custos["totalUsd"] = sum(valor for chave, valor in custos.items() if chave != "totalUsd")
        return custos

    def resumo(self):
        resumo = {
            "costs": {chave: round(valor, 6) for chave, valor in self._custos_contados().items()},
            "images": _imagens_do_resumo(self._imagens_contadas()),
            "matchedRecords": self.contados,
        }
        if self.cartoes_do_plano:
            resumo["plan"] = {"cards": len(self.cartoes_do_plano), "wouldCostUsd": round(self.na_chave, 6)}
        return resumo


_SOMAR_PELO_TIPO = {
    "tokens": _SomaDoEnvio._texto, "correction_tokens": _SomaDoEnvio._correcao_da_criacao, "plan_tokens": _SomaDoEnvio._cartao_do_plano,
    "image": _SomaDoEnvio._imagem_do_registro, "image_pipeline": _SomaDoEnvio._imagem_do_pipeline, "session": _SomaDoEnvio._sessao_nao_custa,
}


def _imagens_do_resumo(imagens):
    total = imagens["total"]
    return dict(
        {chave: int(valor) for chave, valor in imagens.items() if chave != "savingsUsd"},
        savingsUsd=round(imagens["savingsUsd"], 6),
        realPct=_porcentagem(imagens["real"], total), generatedPct=_porcentagem(imagens["generated"], total),
        skippedPct=_porcentagem(imagens["skipped"], total), failedPct=_porcentagem(imagens["failed"], total),
        generatedAttemptPct=_porcentagem(imagens["generatedAttempted"], total),
    )


def anotar_a_voz(pasta, modelo, letras, dolares_por_mil_letras):
    os.makedirs(pasta, exist_ok=True)
    registro = {"date": date.today().isoformat(), "type": "tts", "model": modelo, "characters": letras,
                "cost_usd": round(letras * dolares_por_mil_letras / 1000, 6)}
    with open(os.path.join(pasta, "costs.jsonl"), "a", encoding="utf-8") as arquivo:
        arquivo.write(json.dumps(registro, ensure_ascii=False) + "\n")


def registros(pasta):
    lidos = []
    try:
        with open(os.path.join(pasta, "costs.jsonl"), encoding="utf-8") as arquivo:
            for linha in arquivo:
                try:
                    registro = json.loads(linha)
                except ValueError:
                    continue
                if isinstance(registro, dict):
                    lidos.append(registro)
    except OSError:
        pass
    return lidos


def resumir(lidos, dia_do_envio, de, ate):
    return _resumo_no_periodo(lidos, dia_do_envio, _Periodo(de, ate))


def _resumo_no_periodo(lidos, dia_do_envio, periodo):
    soma = _SomaDoEnvio()
    for registro in lidos:
        if periodo.contem(_dia_do_registro(registro, dia_do_envio)):
            soma.somar(registro)
    return soma.resumo()


ARQUIVO_DA_FICHA = "ficha.json"
_CAMPOS_DA_FICHA = ("createdAt", "updatedAt", "lang", "deckName", "imageSource", "status", "stage", "requestedCards", "successfulCards", "failedCards", "lastError")
_SO_NA_FICHA = ("successfulPhraseIds", "duplicatePhraseIds")
_STATUS_QUE_CONTAM_O_QUE_NAO_CHEGOU = ("failed", "partial")


def ficha_valida(ficha):
    return isinstance(ficha, dict) and all(campo in ficha for campo in _CAMPOS_DA_FICHA) and isinstance(ficha["lang"], str)


def ficha_do_envio(item, pedido, estado):
    status = estado.get("status") or "unknown"
    return {
        **_datas_do_envio(item, pedido, estado), **_destino_do_envio(item, pedido),
        "status": status, "stage": estado.get("stage") or status,
        **_cartoes_do_envio(pedido, estado, status), "lastError": estado.get("lastError"),
        "successfulPhraseIds": sorted(_frases_do_estado(estado, "successfulPhraseIds")),
        "duplicatePhraseIds": sorted(_frases_do_estado(estado, "duplicatePhraseIds")),
    }


def _datas_do_envio(item, pedido, estado):
    criado_em = pedido.get("createdAt") or item.get("createdAt")
    return {"createdAt": criado_em, "updatedAt": estado.get("updatedAt") or item.get("updatedAt") or criado_em}


def _destino_do_envio(item, pedido):
    return {"lang": pedido.get("lang") or item.get("lang") or "unknown", "deckName": pedido.get("deckName", ""), "imageSource": pedido.get("imageSource", "")}


def _frases_do_estado(estado, chave):
    return set(estado.get(chave) or [])


def _cartoes_do_envio(pedido, estado, status):
    pedidas = len({entrada.get("phraseId") for entrada in pedido.get("entries", [])})
    enviadas = len(_frases_do_estado(estado, "successfulPhraseIds"))
    falharam = len(_frases_do_estado(estado, "failedPhraseIds"))
    if status in _STATUS_QUE_CONTAM_O_QUE_NAO_CHEGOU:
        falharam = max(falharam, pedidas - enviadas)
    return {"requestedCards": pedidas, "successfulCards": enviadas, "failedCards": falharam}


def linhas(fila, de, ate, lang):
    periodo, resultado = _Periodo(de, ate), []
    for item in fila.envios_dos_custos():
        job_id = item["jobId"]
        ficha = _ficha_da_linha(fila, item, job_id)
        lidos = fila.registros_de_custo(job_id)
        do_envio = dia(ficha["createdAt"])
        if _do_idioma(ficha, lang) and periodo.tem_o_envio(do_envio, lidos):
            resultado.append(_linha_do_envio(job_id, ficha, _resumo_no_periodo(lidos, do_envio, periodo)))
    return sorted(resultado, key=_quando_foi_criada, reverse=True)


def _ficha_da_linha(fila, item, job_id):
    return item.get("ficha") or ficha_do_envio(item, fila.pedido(job_id) or {}, fila.estado(job_id))


def _do_idioma(ficha, lang):
    return lang == "all" or ficha["lang"] == lang


def _linha_do_envio(job_id, ficha, resumo):
    return {"jobId": job_id, **{campo: valor for campo, valor in ficha.items() if campo not in _SO_NA_FICHA}, **resumo}


def _quando_foi_criada(linha):
    return linha["createdAt"] or ""
