"""O abridor que conserta sozinho (#152), o `meta.json` do Anki: liga o complemento que o Anki desativou.

    python3.9 complemento/test_conserto_meta.py

O mundo de mentira (`Mundo`: programas de mentira no lugar de `ps`, `curl`, `kill`, `sleep`, `date` e `open`, uma pasta temporária
no lugar da do Anki) é o de `test_conserto.py`. Nenhum processo de verdade é fechado, nenhum Anki é aberto.
"""

import json
import os
import tempfile
import unittest

from complemento.test_conserto import META_DESATIVADO, PID, CONSERTAR, Mundo  # noqa: E402,F401


@unittest.skipIf(os.name == "nt", "o script do Mac roda num sh")
class NoMacComMeta(unittest.TestCase):
    def setUp(self):
        self._raiz = tempfile.TemporaryDirectory()
        self.mundo = Mundo(self._raiz.name)

    def tearDown(self):
        self._raiz.cleanup()

    def test_complemento_desativado_fecha_pelo_caminho_normal_liga_no_meta_e_abre_nesta_ordem(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.assertEqual(self.mundo.consertar(), {"situacao": "ligado"})
        self.assertEqual(self.mundo.passos(), [
            "kill -TERM %d" % PID,
            "open -a %s --args -p Usuário 1" % self.mundo.pastas.app,
        ])
        self.assertNotIn("-KILL", " ".join(self.mundo.eventos()))

    def test_anki_que_a_pessoa_fecha_antes_do_term_continua_fechado_e_o_meta_json_nao_e_tocado(self):
        self.mundo.meta_com(META_DESATIVADO)
        antes = self.mundo.meta_atual()
        self.mundo.anki_some_na_chamada_do_ps(2)   # a 1ª é a do consertar, a 2ª a de quem acha os processos a fechar
        self.assertEqual(self.mundo.consertar(), {"situacao": "fechou"})
        self.assertEqual(self.mundo.meta_atual(), antes)
        self.assertEqual(self.mundo.passos(), [])
        self.assertEqual(os.listdir(self.mundo.pastas.abridor), ["abrir-o-anki.sh"])

    def test_ligar_so_vira_a_marca_desativado_e_deixa_o_resto_do_meta_json_como_estava(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.mundo.consertar()
        self.assertEqual(json.loads(self.mundo.meta_atual()), dict(META_DESATIVADO, disabled=False))

    def test_guarda_o_meta_json_de_antes_byte_a_byte_ao_lado_do_abridor(self):
        antes = json.dumps(META_DESATIVADO, indent=4) + "\n"
        self.mundo.meta_com(antes)
        self.mundo.consertar()
        copia = os.path.join(self.mundo.pastas.abridor, "meta.json.antes")
        with open(copia, encoding="utf-8") as arquivo:
            self.assertEqual(arquivo.read(), antes)

    def test_nao_deixa_arquivo_provisorio_para_tras_ao_gravar_o_meta_json(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.mundo.consertar()
        self.assertEqual(sorted(os.listdir(self.mundo.complemento)), ["__init__.py", "meta.json"])
        self.assertEqual(sorted(os.listdir(self.mundo.pastas.abridor)), ["abrir-o-anki.sh", "meta.json.antes"])

    def test_complemento_desativado_que_o_anki_nao_deixa_fechar_nao_mexe_no_meta_json(self):
        self.mundo.meta_com(META_DESATIVADO)
        self.mundo.kill_nao_funciona_com("-TERM")
        antes = self.mundo.meta_atual()
        self.assertEqual(self.mundo.consertar(espera_s=6), {"situacao": "falhou", "motivo": "nao_fechou"})
        self.assertEqual(self.mundo.meta_atual(), antes)
        self.assertNotIn("open", " ".join(self.mundo.passos()))

    def test_meta_json_ilegivel_nao_e_escrito_e_o_anki_nao_e_tocado(self):
        self.mundo.meta_com("{isto não é json")
        self.assertEqual(self.mundo.consertar(), {"situacao": "falhou", "motivo": "meta_ilegivel"})
        self.assertEqual(self.mundo.meta_atual(), "{isto não é json")
        self.assertEqual(self.mundo.passos(), [])

    def test_complemento_ligado_no_meta_json_nao_reescreve_nada(self):
        self.mundo.meta_com(dict(META_DESATIVADO, disabled=False))
        antes = self.mundo.meta_atual()
        self.mundo.conexao_responde_em(0)
        self.mundo.consertar()
        self.assertEqual(self.mundo.meta_atual(), antes)
        self.assertEqual(os.listdir(self.mundo.pastas.abridor), ["abrir-o-anki.sh"])

    def test_um_disabled_dentro_da_config_nao_conta_como_complemento_desativado(self):
        self.mundo.meta_com({"name": "PerpetualMiner", "config": {"disabled": True}})
        self.mundo.conexao_responde_em(0)
        self.assertEqual(self.mundo.consertar(), {"situacao": "respondeu"})

    def test_sem_meta_json_o_anki_conta_o_complemento_como_ligado(self):
        self.mundo.conexao_responde_em(0)
        self.assertEqual(self.mundo.consertar(), {"situacao": "respondeu"})



if __name__ == "__main__":
    unittest.main()
