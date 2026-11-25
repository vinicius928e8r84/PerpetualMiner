import re

COMECO_DO_PROMPT = "You correct a language learner"


class CorrecaoDeMentira:
    correcao_de = staticmethod(lambda escrita: escrita)

    @property
    def correcoes(self):
        return self.__dict__.setdefault("_correcoes", [])

    def _correcao(self, autorizacao, usuario):
        escrita = re.search(r"Learner's sentence: (.*)", usuario, re.S).group(1).strip()
        self.correcoes.append((autorizacao, escrita, re.search(r"Word: (.*)", usuario).group(1).strip()))
        return self.correcao_de(escrita)

    def _correcao_pelo_chat(self, autorizacao, corpo, erro):
        if not corpo["messages"][0]["content"].startswith(COMECO_DO_PROMPT):
            return None
        recusa = self.recusas_do_chat.get("[correcao]")
        if recusa:
            return erro(recusa[0], "Incorrect API key provided: %s" % (autorizacao or ""), "x", recusa[1])
        texto = self._correcao(autorizacao, corpo["messages"][-1]["content"])
        return 200, {"choices": [{"message": {"role": "assistant", "content": texto}}], "usage": {"prompt_tokens": 300, "completion_tokens": 40}}

    def _texto_do_plano(self, autorizacao, corpo, cartao_de_mentira):
        if corpo["instructions"].startswith(COMECO_DO_PROMPT):
            return self._correcao(autorizacao, corpo["input"][-1]["content"])
        return cartao_de_mentira([{"content": corpo["input"][-1]["content"]}], corpo["instructions"])
