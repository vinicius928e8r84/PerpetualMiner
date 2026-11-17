# Conferir a versão da Conexão antes de lançar

Entre o merge de uma PR e o commit de `complemento/versao_no_merge.py` a main está sempre com a versão atrasada. Por isso o push da main
não cobra os testes de versão de `complemento/test_pacote.py` (`PM_VERSAO_NO_LANCAMENTO=1` em `.github/workflows/testes.yml`): o
hash das fontes bate com `complemento/versoes.json` e `conexao/perpetualminer.ankiaddon` instala o complemento de hoje. A main
vermelha por isso escondia as quebras de verdade.

Eles continuam sendo cobrados em dois lugares:

- no commit de versão: `versao_no_merge.py` roda todos os testes do complemento, sem a variável;
- no lançamento: o workflow `Lançamento` (`.github/workflows/lancamento.yml`, manual em Actions ou ao publicar um release) roda
  só eles, no Python 3.9 e no 3.13. Rode-o no commit que vai para a loja ou para o AnkiWeb antes de enviar
  (`docs/publicar-chrome-web-store.md`). Reprovou: falta dar a versão, `python3 complemento/versao_no_merge.py` na main.

Na sua máquina: `CI=1 node scripts/testar.mjs complemento -- -k test_as_fontes_de_hoje_sao_as_que_a_versao_do_complemento_registrou -k test_o_arquivo_da_extensao_instala_o_complemento_de_hoje`.
