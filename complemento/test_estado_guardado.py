import collections
import json
import os

from complemento.test_comparar_com_o_contrato import igual_ao_do_contrato


def estado_guardado(conexao):
    arquivos = {}
    for pasta, _, nomes in os.walk(conexao.pasta):
        for nome in nomes:
            caminho = os.path.join(pasta, nome)
            if os.path.relpath(caminho, conexao.pasta) != os.path.join("logs", "complemento.log"):
                with open(caminho, "rb") as arquivo:
                    arquivos[os.path.relpath(caminho, conexao.pasta)] = arquivo.read()
    return {"arquivos": arquivos, "nuvem": json.loads(json.dumps(conexao.firestore.documentos))}


class PedidoFeito(collections.namedtuple("PedidoFeito", "resposta guardado")):
    @property
    def status(self):
        return self.resposta[0]

    @property
    def corpo(self):
        return self.resposta[2]


def confere_a_repeticao(caso, exemplo, primeiro, segundo):
    igual = segundo.status == primeiro.status and igual_ao_do_contrato(json.loads(segundo.corpo), exemplo["resposta"]["json"])
    intacto = primeiro.guardado == segundo.guardado
    if exemplo.get("repetivel") is False:
        caso.assertTrue(exemplo.get("porque"), 'O exemplo "%s" diz "repetivel": false sem o `porque`.' % exemplo["nome"])
        caso.assertFalse(
            igual and intacto,
            'O exemplo "%s" diz "repetivel": false, mas pedido duas vezes dá a mesma resposta e o mesmo estado: tire a exceção.' % exemplo["nome"],
        )
        return
    caso.assertEqual(segundo.status, primeiro.status, 'O mesmo POST de novo mudou o status no exemplo "%s".' % exemplo["nome"])
    caso.assertTrue(
        igual_ao_do_contrato(json.loads(segundo.corpo), exemplo["resposta"]["json"]),
        'O mesmo POST de novo respondeu outra coisa no exemplo "%s": %s. Se repetir de propósito muda a resposta ou o estado, '
        'declare no exemplo `"repetivel": false, "porque": …` (complemento/contrato/LEIA-ME.md).' % (exemplo["nome"], segundo.corpo.decode("utf-8")),
    )
    caso.assertEqual(
        primeiro.guardado, segundo.guardado,
        'O mesmo POST de novo mudou o que a Conexão guardou no exemplo "%s". Se é de propósito, declare '
        '`"repetivel": false, "porque": …` no exemplo (complemento/contrato/LEIA-ME.md).' % exemplo["nome"],
    )
