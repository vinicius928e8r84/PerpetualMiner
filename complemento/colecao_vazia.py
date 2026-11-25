from . import baralhos


class SemColecao:
    def perfis(self):
        return []

    def perfil_aberto(self):
        return None

    def fixar_o_perfil(self, fixo):
        pass

    def entrar_no_perfil_fixo(self):
        return False

    trocar_para_o_perfil_fixo = entrar_no_perfil_fixo

    def nomes_dos_baralhos(self, *_):
        raise baralhos.ColecaoIndisponivel("collection_unavailable")

    cartoes_do_baralho = tipo_de_nota = guids_existentes = adicionar_nota = gravar_cartao = nomes_dos_baralhos
