"""A correção da Criação no Envio (#169): depois dos Cartões, a IA corrige as frases que a pessoa escreveu na frente Criação (o gancho da revisão as
grava no campo “Frase escrita”, `criacao_na_revisao.py`). Cada correção vai para a nota (“Escrito antes” é a frase que a IA leu, “Correção” o que ela
devolveu) e o verso do Cartão passa a mostrar “Da última vez você escreveu … → correção”. Uma frase já lida não é pedida de novo (o adaptador só oferece
a que é diferente do “Escrito antes”); uma frase que a pessoa escreveu de novo é outra e vai no Envio seguinte.

É um extra do Envio: falhar não o derruba. O que a IA recusa, o plano que chega ao limite, o teto do mês, uma coleção ocupada ou o Anki sem os campos
deixam as frases que faltam para o próximo Envio, sem erro. O custo vai ao `costs.jsonl` do Envio à parte do custo dos Cartões (`correctionUsd`)."""

import re

from . import baralhos, tipo_de_nota
from .modelo_dos_cartoes import credencial
from .motor.openai_http import ErroDaOpenAI

LIMITE_POR_ENVIO = 20  # frases corrigidas por Envio: o custo de uma sessão de Criação não pode surpreender


class CorrecaoDaCriacao:
    """A parte do `Trabalho` que corrige as frases da Criação. Pede `self.fila`, `self.colecao`, `self.motor`, `self.cofre`, `self.chatgpt`, `self.modelos`,
    `self.plano`, `self.openai_base`, `self.teto` e `self.logger`."""

    def _corrigir_as_frases(self, job_id, pedido, config, parada):
        """Chamado depois do último Cartão com o código que parou o Envio, ou None: a chave que o parou não corrige nada."""
        if parada:
            return
        try:
            notas = self.colecao.frases_a_corrigir(pedido["lang"], LIMITE_POR_ENVIO)
        except baralhos.ColecaoIndisponivel:
            return
        except Exception as erro:  # um extra: o Cartão já está no Anki
            self.logger.warning("Envio %s: não deu para ler as frases da Criação (%s)", job_id, type(erro).__name__)
            return
        verso_em_dia = False
        for nota in notas:
            if self.fila.estado(job_id).get("wiped") or (self.teto is not None and self.teto.chegou()):
                return
            chave = credencial(self.chatgpt, self.cofre, self.plano, self.modelos, self.fila.estado(job_id).get("usingKey", False))
            if not isinstance(chave, dict):
                return  # sem chave, ou um plano que não serve agora
            palavra = re.split(r"\s+-\s+/", nota["palavra"])[0]  # o campo traz a pronúncia depois da Palavra
            try:
                correcao = self.motor.corrigir_frase.corrigir(dict(config, **chave), self.openai_base, palavra, nota["frase"], nota["escrita"])
            except ErroDaOpenAI as erro:
                self.logger.warning("Envio %s: a correção da Criação parou (%s)", job_id, erro.codigo)
                return
            except Exception as erro:
                self.logger.warning("Envio %s: a correção da Criação falhou (%s)", job_id, type(erro).__name__)
                return
            if not correcao:
                continue
            try:
                self.colecao.gravar_correcao(nota["guid"], nota["escrita"], correcao)
            except baralhos.ColecaoIndisponivel:
                return
            except Exception as erro:
                self.logger.warning("Envio %s: o Anki não gravou a correção (%s)", job_id, type(erro).__name__)
                return
            if not verso_em_dia:
                verso_em_dia = True
                self._atualizar_o_verso(job_id, pedido["lang"])

    def _atualizar_o_verso(self, job_id, lang):
        """O Cartão da Criação que a pessoa já tinha antes da correção não tem o “Da última vez você escreveu …” no verso: o modelo dele é regravado, como
        a troca da frente faz (`tipo_de_nota.trocar_a_frente`). Só se o tipo de nota ainda tem o nosso modelo Criação sozinho; a pessoa que o mexeu, ou que
        trocou de frente, fica como está."""
        try:
            nome = tipo_de_nota.definicao(lang, frente="criacao")["nome"]
            modelos = self.colecao.modelos_do_tipo_de_nota(nome)
            if modelos and len(modelos) == 1 and modelos[0]["nome"] == tipo_de_nota.NOMES_DAS_FRENTES["criacao"]:
                tipo_de_nota.trocar_a_frente(self.colecao, lang, "criacao")
        except Exception as erro:  # a correção já está na nota; o verso é o que falhou
            self.logger.warning("Envio %s: o verso da Criação não foi atualizado (%s)", job_id, type(erro).__name__)
