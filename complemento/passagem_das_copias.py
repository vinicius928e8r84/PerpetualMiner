"""O que a passagem copia da Conexão de hoje para esta (#178). **Copia, nunca move**: nada é aberto para escrita nem apagado na origem.

`Antiga` é a Conexão de hoje como ela mesma se descreveu no `GET /health` (onde ficam a fila, o motor e os Envios dela). Cada
função daqui copia uma coisa e devolve o que fez; repetir a passagem não duplica nada (o que já está no destino não é tocado).
A chave nunca vai para o log nem para o que estas funções devolvem.
"""

import json
import os
import re
import shutil
import uuid
from collections import namedtuple

from . import envio
from .motor import PASTA as PASTA_DO_MOTOR

Antiga = namedtuple("Antiga", "pid raiz motor jobs_root fila")

# O `.env` do motor de hoje guarda `OPENAI_API_KEY`; uma chave tem esta forma (`rotas_da_chave`) e o exemplo do arquivo não é chave.
_FORMA_DA_CHAVE = re.compile(r"^[A-Za-z0-9._\-]{8,256}$")
_EXEMPLO_DO_ENV = "your-openai-api-key-here"
# Os custos de hoje levam a Palavra (`keyword`); os desta Conexão não: só o que a aba Custos separa pelo prefixo fica.
_MARCAS_DO_CUSTO = ("[image_judge]", "[image_guard]")
_NAMESPACE = uuid.UUID("4f0f3a9e-6d0a-4c43-9e53-8c0d6a1b7f10")


def _ler_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (OSError, ValueError):
        return padrao


def id_novo(id_antigo):
    """O id do Envio aqui: o mesmo se já é um UUID; senão sempre o mesmo UUID para o mesmo id de hoje (repetir não duplica)."""
    if envio.id_valido(id_antigo):
        return id_antigo
    return str(uuid.uuid5(_NAMESPACE, "perpetualminer-passagem:%s" % id_antigo))


def perfil_de_hoje(antiga):
    """O perfil do Anki da configuração de hoje (`bridge/config.json`): da configuração só ele é aproveitado."""
    nome = (_ler_json(os.path.join(antiga.raiz, "bridge", "config.json"), {}) or {}).get("anki_profile")
    return nome.strip() if isinstance(nome, str) and nome.strip() else None


def _chave_do_env(antiga):
    try:
        with open(os.path.join(antiga.motor, ".env"), encoding="utf-8") as arquivo:
            linhas = arquivo.read().splitlines()
    except OSError:
        return None
    for linha in linhas:
        linha = linha.strip()
        if linha.startswith("export "):
            linha = linha[len("export "):].strip()
        nome, _, valor = linha.partition("=")
        if nome.strip() == "OPENAI_API_KEY":
            valor = valor.strip()
            if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "'\"":
                valor = valor[1:-1]
            return valor if _FORMA_DA_CHAVE.match(valor) and valor != _EXEMPLO_DO_ENV else None
    return None


def copiar_a_chave(antiga, cofre):
    """A chave do `.env` de hoje para o cofre daqui, sem conferir na OpenAI e sem conta (fica só neste computador: subir para a
    nuvem da conta é a pessoa confirmando a chave nela, como qualquer chave colada). Uma chave que o cofre já tem fica como está.
    Devolve `"copiada"`, `"ja_havia"` ou `"sem_chave"`."""
    if cofre.ler("openai"):
        return "ja_havia"
    chave = _chave_do_env(antiga)
    if chave is None:
        return "sem_chave"
    return "copiada" if cofre.guardar("openai", chave, versao=cofre.documento("openai").get("versao", 0)) else "sem_chave"


def _custo_sem_a_palavra(linha):
    try:
        registro = json.loads(linha)
    except ValueError:
        return None
    if not isinstance(registro, dict):
        return None
    palavra = str(registro.get("keyword") or "")
    if "keyword" in registro:
        registro["keyword"] = next((marca for marca in _MARCAS_DO_CUSTO if palavra.startswith(marca)), "")
    return json.dumps(registro, ensure_ascii=False)


def copiar_os_custos(antiga, fila):
    """O histórico de custos de cada Envio de hoje (`<Envio>/log/costs.jsonl`) para `custos/<Envio>/costs.jsonl`, sem a Palavra.
    Devolve quantos Envios ganharam o histórico."""
    copiados = 0
    for pasta in sorted(os.listdir(antiga.jobs_root)) if os.path.isdir(antiga.jobs_root) else []:
        origem = os.path.join(antiga.jobs_root, pasta, "log", "costs.jsonl")
        destino_pasta = fila.pasta_dos_custos(id_novo(pasta))
        destino = os.path.join(destino_pasta, "costs.jsonl")
        if not os.path.isfile(origem) or os.path.exists(destino):
            continue
        try:
            with open(origem, encoding="utf-8") as arquivo:
                linhas = [limpa for limpa in (_custo_sem_a_palavra(linha) for linha in arquivo if linha.strip()) if limpa]
        except OSError:
            continue
        os.makedirs(destino_pasta, exist_ok=True)
        with open(destino + ".novo", "w", encoding="utf-8") as arquivo:
            arquivo.write("".join(linha + "\n" for linha in linhas))
        os.replace(destino + ".novo", destino)
        copiados += 1
    return copiados


def _texto_do_prompt(caminho):
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return arquivo.read().replace("\r\n", "\n").strip()
    except (OSError, ValueError):
        return None


def copiar_os_prompts_editados(antiga, pasta_dos_prompts):
    """Só os prompts de hoje (`<motor>/prompts/*.txt`) que diferem dos padrões que o complemento traz, para a pasta de prompts da pasta
    de dados, com o mesmo nome (lá o arquivo do dono vale no lugar do padrão). O que já está lá não é tocado. Devolve os nomes copiados."""
    de_hoje = os.path.join(antiga.motor, "prompts")
    copiados = []
    for nome in sorted(os.listdir(de_hoje)) if os.path.isdir(de_hoje) else []:
        destino = os.path.join(pasta_dos_prompts, nome)
        texto = _texto_do_prompt(os.path.join(de_hoje, nome))
        if not nome.endswith(".txt") or not texto or os.path.exists(destino):
            continue
        if texto == _texto_do_prompt(os.path.join(PASTA_DO_MOTOR, "prompts", nome)):
            continue  # é o padrão, não foi editado
        os.makedirs(pasta_dos_prompts, exist_ok=True)
        shutil.copyfile(os.path.join(de_hoje, nome), destino + ".novo")
        os.replace(destino + ".novo", destino)
        copiados.append(nome)
    return copiados


def _envios_de_hoje(antiga):
    """(id, pedido, estado, status na fila) de cada Envio de hoje, do mais antigo ao mais novo."""
    status_na_fila = {item.get("jobId"): item.get("status") for item in (_ler_json(antiga.fila, {}) or {}).get("jobs", []) if isinstance(item, dict)}
    envios = []
    for pasta in sorted(os.listdir(antiga.jobs_root)) if os.path.isdir(antiga.jobs_root) else []:
        pedido = _ler_json(os.path.join(antiga.jobs_root, pasta, "job.json"), None)
        estado = _ler_json(os.path.join(antiga.jobs_root, pasta, "state.json"), None)
        if isinstance(pedido, dict) and isinstance(estado, dict) and not pedido.get("wiped"):
            envios.append((pasta, pedido, estado, status_na_fila.get(pasta) or estado.get("status")))
    return sorted(envios, key=lambda envio_: str(envio_[1].get("createdAt") or ""))


_frases = envio.ids_unicos


def _historico(id_, pedido, estado, status):
    """Um Envio que terminou, só para a aba Custos: sem as Frases (as linhas ficam em hoje), como um Envio de depois do Apagar tudo."""
    certas, erradas = _frases(estado.get("successfulPhraseIds")), _frases(estado.get("failedPhraseIds"))
    cartoes = {envio.id_do_cartao(frase, 0): {"phraseId": frase, "status": envio.ADICIONADO, "error": None} for frase in certas}
    cartoes.update({envio.id_do_cartao(frase, 0): {"phraseId": frase, "status": envio.FALHOU, "error": envio.CARTOES_FALHARAM} for frase in erradas})
    criado = str(pedido.get("createdAt") or estado.get("updatedAt") or "")
    novo = {
        "jobId": id_, "lang": pedido.get("lang"), "deckName": str(pedido.get("deckName") or ""), "imageSource": str(pedido.get("imageSource") or "1"),
        "tts": {}, "createdAt": criado, "wiped": True,
        "entries": [{"phraseId": frase, "noAnki": {envio.id_do_cartao(frase, 0): envio.ADICIONADO}} if frase in certas else {"phraseId": frase}
                    for frase in _frases(entrada.get("phraseId") for entrada in pedido.get("entries", []) if isinstance(entrada, dict))],
    }
    final = {
        "jobId": id_, "status": status, "stage": status, "completedStages": [], "progress": {}, "successfulPhraseIds": certas,
        "failedPhraseIds": erradas, "duplicatePhraseIds": [], "lastError": None if status == envio.COMPLETED else envio.CARTOES_FALHARAM,
        "updatedAt": str(estado.get("updatedAt") or criado), "cards": cartoes, "wiped": True,
    }
    return novo, final


def _gravar_no_historico(fila, pedido, estado):
    with fila.tranca:
        if fila.item_da_fila(pedido["jobId"]) is not None:
            return False
        envio._gravar_json(fila._arquivo_do_pedido(pedido["jobId"]), pedido)
        envio._gravar_json(fila._arquivo_do_estado(pedido["jobId"]), estado)
        fila._entrar_na_fila(pedido)
    return True


def passar_a_fila(antiga, fila):
    """Os Envios de hoje para esta fila. Os que terminaram entram como histórico (só para a aba Custos); os que ainda têm Frases a
    enviar (`queued` ou `running`, menos as que já chegaram ao Anki) entram na fila como `queued`, com a linha de cada Frase: um
    Cartão pronto não é refeito. Devolve `{"historico": n, "fila": n, "recusados": [ids]}`."""
    historico, passados, recusados = 0, 0, []
    envios = _envios_de_hoje(antiga)
    for id_, pedido, estado, status in envios:
        if status in envio.FIM:
            historico += _gravar_no_historico(fila, *_historico(id_novo(id_), pedido, estado, status))
    for id_, pedido, estado, status in envios:
        if status in envio.FIM:
            continue
        prontas = set(_frases(estado.get("successfulPhraseIds")))
        faltam = [entrada for entrada in pedido.get("entries", []) if isinstance(entrada, dict) and entrada.get("phraseId") not in prontas]
        if not faltam:
            continue
        resposta, _ = fila.criar({
            "jobId": id_novo(id_), "lang": pedido.get("lang"), "deckName": pedido.get("deckName"), "imageSource": pedido.get("imageSource"),
            "tts": pedido.get("tts"), "entries": faltam,
        })
        if resposta == 201:
            passados += 1
        else:
            recusados.append(id_)
    return {"historico": historico, "fila": passados, "recusados": recusados}
