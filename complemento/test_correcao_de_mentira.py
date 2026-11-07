"""A correção da Criação (#169) na OpenAI de mentira: o que ela devolve a um pedido de correção (`engine/prompts/correcao_da_criacao.txt`) pelo chat da chave e
pela Responses API do plano. Não é um teste: é a parte de `test_openai_de_mentira.OpenAIDeMentira` que fala de correção, e fica fora do `.ankiaddon` pelo nome.

`correcao_de(escrita)` é o que a IA devolve para a frase que a pessoa escreveu (sem mudar nada, por padrão: a frase estava certa), `correcoes` guarda
(Authorization, a frase escrita, a Palavra) de cada pedido e `recusar_o_chat_de("[correcao]", status, código)` recusa o pedido pelo chat."""

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
        """(status, corpo) de `POST /v1/chat/completions` se o pedido é de correção (`erro` monta uma recusa), senão None."""
        if not corpo["messages"][0]["content"].startswith(COMECO_DO_PROMPT):
            return None
        recusa = self.recusas_do_chat.get("[correcao]")
        if recusa:
            return erro(recusa[0], "Incorrect API key provided: %s" % (autorizacao or ""), "x", recusa[1])
        texto = self._correcao(autorizacao, corpo["messages"][-1]["content"])
        return 200, {"choices": [{"message": {"role": "assistant", "content": texto}}], "usage": {"prompt_tokens": 300, "completion_tokens": 40}}

    def _texto_do_plano(self, autorizacao, corpo, cartao_de_mentira):
        """O texto que a Responses API do plano devolve a um pedido que não é do juiz: a correção, ou o Cartão que `cartao_de_mentira` faz."""
        if corpo["instructions"].startswith(COMECO_DO_PROMPT):
            return self._correcao(autorizacao, corpo["input"][-1]["content"])
        return cartao_de_mentira([{"content": corpo["input"][-1]["content"]}], corpo["instructions"])
