import json
import re

COMECO_DO_PROMPT = "You find the Terms of one line"

TERMOS_DA_MENTIRA = {
    "She can't put up with him": [{"words": [2, 3, 4], "type": "phrasal_verb", "common": True}],
    "Tell Walter I'm here": [{"words": [1], "type": "nome", "common": False}],
    "That's lit": [{"words": [1], "type": "giria", "common": True}],
}
RESPOSTA_QUEBRADA = "isto não é JSON"
ERROS_DO_COMPORTAMENTO = {
    "recusa": (401, "invalid_api_key"),
    "sem_credito": (429, "insufficient_quota"),
    "limite_de_uso": (429, "rate_limit_exceeded"),
    "fora_do_ar": (503, None),
}


def _palavras_do_pedido(usuario):
    return re.findall(r"^(\d+) ", usuario.split("Words:", 1)[1], re.M)


def termos_de_mentira(usuario):
    linha = re.search(r"^Line: (.*)$", usuario, re.M).group(1)
    termos = TERMOS_DA_MENTIRA.get(linha) or [{"words": [int(i)], "type": "palavra", "common": True} for i in _palavras_do_pedido(usuario)]
    return json.dumps({"terms": termos})


class TermosDeMentira:
    termos_de = None
    uso_dos_termos = (300, 60)

    @property
    def termos(self):
        return self.__dict__.setdefault("_termos", [])

    def _texto_dos_termos(self, usuario):
        if self.comportamento == "resposta_quebrada":
            return RESPOSTA_QUEBRADA
        linha = re.search(r"^Line: (.*)$", usuario, re.M).group(1)
        return self.termos_de(linha) if self.termos_de else termos_de_mentira(usuario)

    def _termos_pelo_chat(self, autorizacao, corpo, erro):
        if not corpo["messages"][0]["content"].startswith(COMECO_DO_PROMPT):
            return None
        self.termos.append((autorizacao, corpo))
        if self.comportamento in ERROS_DO_COMPORTAMENTO:
            status, codigo = ERROS_DO_COMPORTAMENTO[self.comportamento]
            return erro(status, "Incorrect API key provided: %s" % (autorizacao or ""), "x", codigo)
        entrada, saida = self.uso_dos_termos
        texto = self._texto_dos_termos(corpo["messages"][-1]["content"])
        return 200, {"choices": [{"message": {"role": "assistant", "content": texto}}], "usage": {"prompt_tokens": entrada, "completion_tokens": saida}}

    def _termos_pelo_plano(self, autorizacao, corpo):
        self.termos.append((autorizacao, corpo))
        return self._texto_dos_termos(corpo["input"][-1]["content"])
