"""Os custos de cada Envio, como a aba Custos os lê (`POST /analytics/jobs`).

Cada Envio guarda os registros do `cost_tracker` do motor em `custos/<jobId>/costs.jsonl` (`envio.py`). As linhas e o
resumo são os de `JobAnalytics.jobs` e `summarize_records` (`bridge/analytics.py`), que o painel já lê: as mesmas
chaves, as mesmas regras (o texto em `cardUsd`; o juiz e a triagem de imagem pela Palavra `[image_judge]`/`[image_guard]`;
as imagens pelos registros `image` e `image_pipeline`), só com a biblioteca padrão.
"""

import json
import os
from datetime import date


def dia(valor):
    """O dia de um instante ISO 8601 (o do computador de quem usa), ou None."""
    try:
        return date.fromisoformat(str(valor or "").strip()[:10])
    except ValueError:
        return None


def _no_periodo(valor, de, ate):
    if valor is None:
        return de is None and ate is None
    return not (de and valor < de) and not (ate and valor > ate)


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
    origem = str(valor or "").strip().lower()
    if origem in {"real", "google", "openverse"}:
        return "real"
    if origem in {"gerada", "generated", "dalle", "dall-e", "gpt-image"}:
        return "generated"
    return "skipped" if origem == "skipped" else "failed"


def registros(pasta):
    """Os registros de custo de um Envio, da pasta dos custos dele (linhas que não se leem ficam de fora)."""
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
    """O resumo dos registros de um Envio no período (`summarize_records` do bridge)."""
    custos, imagens, dos_registros = _custos_zerados(), _imagens_zeradas(), _imagens_zeradas()
    geradas_nos_registros = geradas_no_pipeline = 0.0
    no_pipeline = contados = 0
    for registro in lidos:
        if not _no_periodo(dia(registro.get("date") or registro.get("createdAt")) or dia_do_envio, de, ate):
            continue
        contados += 1
        tipo, custo = registro.get("type"), _custo(registro)
        if tipo == "tokens":
            palavra = str(registro.get("keyword") or "")
            custos["imageJudgeUsd" if palavra.startswith("[image_judge]") else "imageGuardUsd" if palavra.startswith("[image_guard]") else "cardUsd"] += custo
        elif tipo == "image":
            origem = _origem_da_imagem(registro.get("source"))
            if origem == "generated":
                geradas_nos_registros += custo
            dos_registros["total"] += 1
            dos_registros[origem] += 1
        elif tipo == "image_pipeline":
            origem = _origem_da_imagem(registro.get("final_source"))
            no_pipeline += 1
            imagens["total"] += 1
            imagens[origem] += 1
            if registro.get("generated_attempted"):
                imagens["generatedAttempted"] += 1
            imagens["savingsUsd"] += _custo(registro, "cost_saved_vs_generated_usd")
            if origem == "generated":
                geradas_no_pipeline += _custo(registro, "actual_cost_usd")
        elif tipo != "session" and custo:
            custos["otherUsd"] += custo
    if no_pipeline == 0 and dos_registros["total"]:
        imagens.update(dos_registros)
    custos["imageGenerationUsd"] = max(geradas_nos_registros, geradas_no_pipeline)
    custos["totalUsd"] = sum(valor for chave, valor in custos.items() if chave != "totalUsd")
    total = imagens["total"]

    def pct(parte):
        return round(parte / total * 100, 1) if total else 0.0

    return {
        "costs": {chave: round(valor, 6) for chave, valor in custos.items()},
        "images": dict(
            {chave: int(valor) for chave, valor in imagens.items() if chave != "savingsUsd"},
            savingsUsd=round(imagens["savingsUsd"], 6),
            realPct=pct(imagens["real"]), generatedPct=pct(imagens["generated"]), skippedPct=pct(imagens["skipped"]),
            failedPct=pct(imagens["failed"]), generatedAttemptPct=pct(imagens["generatedAttempted"]),
        ),
        "matchedRecords": contados,
    }


def linhas(fila, de, ate, lang):
    """Uma linha por Envio do período e do idioma (`JobAnalytics.jobs` do bridge), do mais novo ao mais velho."""
    resultado = []
    for item in fila.ordem():
        job_id = item["jobId"]
        pedido, estado = fila.pedido(job_id) or {}, fila.estado(job_id)
        criado_em = pedido.get("createdAt") or item.get("createdAt")
        idioma = pedido.get("lang") or item.get("lang") or "unknown"
        status = estado.get("status") or item.get("status") or "unknown"
        lidos = fila.registros_de_custo(job_id)
        do_envio = dia(criado_em)
        if lang != "all" and idioma != lang:
            continue
        if not _no_periodo(do_envio, de, ate) and not any(_no_periodo(dia(r.get("date") or r.get("createdAt")) or do_envio, de, ate) for r in lidos):
            continue
        resumo = resumir(lidos, do_envio, de, ate)
        pedidas = len({entrada.get("phraseId") for entrada in pedido.get("entries", [])})
        enviadas = len(set(estado.get("successfulPhraseIds") or []))
        falharam = len(set(estado.get("failedPhraseIds") or []))
        if status in ("failed", "partial"):
            falharam = max(falharam, pedidas - enviadas)
        resultado.append({
            "jobId": job_id, "createdAt": criado_em, "updatedAt": estado.get("updatedAt") or item.get("updatedAt") or criado_em,
            "lang": idioma, "deckName": pedido.get("deckName", ""), "imageSource": pedido.get("imageSource", ""),
            "status": status, "stage": estado.get("stage") or status,
            "requestedCards": pedidas, "successfulCards": enviadas, "failedCards": falharam, "lastError": estado.get("lastError"),
            "costs": resumo["costs"], "images": resumo["images"], "matchedRecords": resumo["matchedRecords"],
        })
    return sorted(resultado, key=lambda linha: linha["createdAt"] or "", reverse=True)
