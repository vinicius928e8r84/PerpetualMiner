'use strict';

(function (raiz) {
  const CODIGO = Object.freeze({ CONEXAO_ANTIGA: 'outdated_connection', DE_OUTRA_CONTA: 'other_account_owner' });

  function daMarca(marca) {
    return { ultimos4: marca?.ultimos4 || '', contaDaChave: marca?.conta === undefined ? '' : marca.conta };
  }

  function daConta(usuario) {
    return { comConta: Boolean(usuario), uid: usuario?.uid || '' };
  }

  function chaveLegada({ contaDaChave, comConta }) {
    return contaDaChave === null || (comConta && !contaDaChave);
  }

  function deOutraConta({ uid, contaDaChave }) {
    return Boolean(uid && contaDaChave && contaDaChave !== uid);
  }

  function notaDaConta(chave) {
    if (chaveLegada(chave)) return 'CFG-42.legado';
    if (chave.comConta) return chave.contaDaChave !== chave.uid ? 'CFG-35.chaveDeOutraConta' : 'CFG-35.chaveNaConta';
    return chave.contaDaChave ? 'CFG-35.chaveSemContaVinculada' : 'CFG-35.chaveSemConta';
  }

  function notaDaCopia(copia) {
    if (copia === null) return null;
    return copia ? { texto: 'CFG-35.chaveCopiaNaConexao', copia: 'tem' } : { texto: 'CFG-35.chaveSemCopia', copia: 'falta' };
  }

  function detalhesDoErro(erro) {
    return erro?.codigo || erro?.name || 'storage_error';
  }

  function falhaAoConfirmar(erro) {
    const motivo = erro?.codigo === CODIGO.CONEXAO_ANTIGA ? 'conexao_antiga' : 'conexao_com_erro';
    return { ok: false, motivo, detalhes: detalhesDoErro(erro) };
  }

  function motivoAoApagar(codigo) {
    if (codigo === CODIGO.CONEXAO_ANTIGA) return 'conexao_antiga';
    return codigo === CODIGO.DE_OUTRA_CONTA ? 'outra_conta' : 'apagar_local';
  }

  function falhaAoApagar(erro) {
    return { motivo: motivoAoApagar(erro?.codigo), detalhes: detalhesDoErro(erro) };
  }

  function depoisDeApagar(dono, conexaoLigada) {
    return {
      ultimos4: dono.configurada ? dono.ultimos4 : '',
      contaDaChave: dono.conta,
      copia: conexaoLigada ? (dono.configurada || null) : null,
    };
  }

  raiz.RetratoDaChave = Object.freeze({
    daMarca, daConta, deOutraConta, notaDaConta, notaDaCopia, falhaAoConfirmar, falhaAoApagar, depoisDeApagar,
  });
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
