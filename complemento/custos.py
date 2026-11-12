"""Os custos de cada Envio, como a aba Custos os lê (`POST /analytics/jobs`).

Cada Envio guarda os registros do `cost_tracker` do motor em `custos/<jobId>/costs.jsonl` (`envio.py`). As linhas e o
resumo são os que o painel lê: as chaves e as regras (o texto em `cardUsd`; o juiz e a triagem de imagem pela Palavra `[image_judge]`/`[image_guard]`;
as imagens pelos registros `image` e `image_pipeline`), só com a biblioteca padrão. O Envio que o plano do ChatGPT escreveu
leva `plan` (`cards`, `wouldCostUsd`: o que a chave teria cobrado, #159); sem Cartão do plano, a linha não tem a chave `plan`.
A correção das frases da Criação (#169) é um registro à parte (`correction_tokens`): `costs.correctionUsd`, que entra no total; sem correção
no período, `costs` não tem a chave.
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


def anotar_a_voz(pasta, modelo, letras, dolares_por_mil_letras):
    """Anota no Envio o custo de uma voz paga que falou (a de reserva, #174), no formato dos registros do motor: cai em `otherUsd`."""
    os.makedirs(pasta, exist_ok=True)
    registro = {"date": date.today().isoformat(), "type": "tts", "model": modelo, "characters": letras,
                "cost_usd": round(letras * dolares_por_mil_letras / 1000, 6)}
    with open(os.path.join(pasta, "costs.jsonl"), "a", encoding="utf-8") as arquivo:
        arquivo.write(json.dumps(registro, ensure_ascii=False) + "\n")


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
    """O resumo dos registros de um Envio no período."""
    custos, imagens, dos_registros = _custos_zerados(), _imagens_zeradas(), _imagens_zeradas()
    geradas_nos_registros = geradas_no_pipeline = 0.0
    no_pipeline = contados = 0
    do_plano, na_chave = set(), 0.0  # os Cartões que o plano fez (#159) e o que a chave teria cobrado por eles
    corrigiu, correcao = False, 0.0  # a correção das frases da Criação (#169)
    for registro in lidos:
        if not _no_periodo(dia(registro.get("date") or registro.get("createdAt")) or dia_do_envio, de, ate):
            continue
        contados += 1
        tipo, custo = registro.get("type"), _custo(registro)
        if tipo == "tokens":
            palavra = str(registro.get("keyword") or "")
            custos["imageJudgeUsd" if palavra.startswith("[image_judge]") else "imageGuardUsd" if palavra.startswith("[image_guard]") else "cardUsd"] += custo
        elif tipo == "correction_tokens":
            corrigiu, correcao = True, correcao + custo
        elif tipo == "plan_tokens":
            do_plano.add(str(registro.get("keyword") or ""))
            na_chave += _custo(registro, "would_cost_usd")
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
    if corrigiu:
        custos["correctionUsd"] = correcao
    custos["totalUsd"] = sum(valor for chave, valor in custos.items() if chave != "totalUsd")
    total = imagens["total"]

    def pct(parte):
        return round(parte / total * 100, 1) if total else 0.0

    resumo = {
        "costs": {chave: round(valor, 6) for chave, valor in custos.items()},
        "images": dict(
            {chave: int(valor) for chave, valor in imagens.items() if chave != "savingsUsd"},
            savingsUsd=round(imagens["savingsUsd"], 6),
            realPct=pct(imagens["real"]), generatedPct=pct(imagens["generated"]), skippedPct=pct(imagens["skipped"]),
            failedPct=pct(imagens["failed"]), generatedAttemptPct=pct(imagens["generatedAttempted"]),
        ),
        "matchedRecords": contados,
    }
    if do_plano:
        resumo["plan"] = {"cards": len(do_plano), "wouldCostUsd": round(na_chave, 6)}
    return resumo


ARQUIVO_DA_FICHA = "ficha.json"
_CAMPOS_DA_FICHA = ("createdAt", "updatedAt", "lang", "deckName", "imageSource", "status", "stage", "requestedCards", "successfulCards", "failedCards", "lastError")


def ficha_valida(ficha):
    return isinstance(ficha, dict) and all(campo in ficha for campo in _CAMPOS_DA_FICHA) and isinstance(ficha["lang"], str)


def ficha_do_envio(item, pedido, estado):
    """O que a linha da aba Custos diz de um Envio fora os custos: de onde vêm o idioma, o baralho, o status e as contagens (só números e ids, nunca a Palavra nem a Frase).
    Quando a retenção apaga o Envio (`retencao_dos_envios.py`), isto fica em `custos/<jobId>/ficha.json` e a linha continua a mesma."""
    criado_em = pedido.get("createdAt") or item.get("createdAt")
    status = estado.get("status") or "unknown"
    pedidas = len({entrada.get("phraseId") for entrada in pedido.get("entries", [])})
    enviadas = len(set(estado.get("successfulPhraseIds") or []))
    falharam = len(set(estado.get("failedPhraseIds") or []))
    if status in ("failed", "partial"):
        falharam = max(falharam, pedidas - enviadas)
    return {
        "createdAt": criado_em, "updatedAt": estado.get("updatedAt") or item.get("updatedAt") or criado_em,
        "lang": pedido.get("lang") or item.get("lang") or "unknown", "deckName": pedido.get("deckName", ""), "imageSource": pedido.get("imageSource", ""),
        "status": status, "stage": estado.get("stage") or status,
        "requestedCards": pedidas, "successfulCards": enviadas, "failedCards": falharam, "lastError": estado.get("lastError"),
        # Só ids (#372): depois da retenção a extensão ainda marca estas Frases como enviadas, sem reenviar e pagar de novo.
        "successfulPhraseIds": sorted(set(estado.get("successfulPhraseIds") or [])),
        "duplicatePhraseIds": sorted(set(estado.get("duplicatePhraseIds") or [])),
    }


def linhas(fila, de, ate, lang):
    """Uma linha por Envio do período e do idioma, do mais novo ao mais velho: os da fila e os que a retenção apagou."""
    resultado = []
    for item in fila.envios_dos_custos():
        job_id = item["jobId"]
        ficha = item.get("ficha") or ficha_do_envio(item, fila.pedido(job_id) or {}, fila.estado(job_id))
        lidos = fila.registros_de_custo(job_id)
        do_envio = dia(ficha["createdAt"])
        if lang != "all" and ficha["lang"] != lang:
            continue
        if not _no_periodo(do_envio, de, ate) and not any(_no_periodo(dia(r.get("date") or r.get("createdAt")) or do_envio, de, ate) for r in lidos):
            continue
        resumo = resumir(lidos, do_envio, de, ate)
        resultado.append({
            "jobId": job_id, **{campo: valor for campo, valor in ficha.items() if campo not in ("successfulPhraseIds", "duplicatePhraseIds")}, "costs": resumo["costs"], "images": resumo["images"], "matchedRecords": resumo["matchedRecords"],
            **({"plan": resumo["plan"]} if "plan" in resumo else {}),
        })
    return sorted(resultado, key=lambda linha: linha["createdAt"] or "", reverse=True)
