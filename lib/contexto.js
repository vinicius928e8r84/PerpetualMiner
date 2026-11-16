'use strict';

(function (raiz) {
  const APELIDOS_DE_FONTE = { amazon: 'primevideo', hbomax: 'max', disney: 'disneyplus', star: 'starplus' };

  function chaveDaFonte(fonte) {
    return APELIDOS_DE_FONTE[fonte] || fonte;
  }

  function fonteDaFrase(f) {
    return chaveDaFonte(f.contexto?.fonte || f.streaming || '');
  }

  function nomeDaFonte(fonte) {
    const chave = chaveDaFonte(fonte);
    return Object.hasOwn(raiz.CATALOGO_DA_VOZ['PAI-29'], chave) ? raiz.textoDaVoz(`PAI-29.${chave}`) : fonte;
  }

  function rotuloDoDia(dataStr) {
    const partes = String(dataStr || '').split('/');
    if (partes.length !== 3) return dataStr || '';
    const dia  = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((hoje - dia) / 86400000);
    if (Number.isNaN(dias) || dias < 0) return dataStr;
    if (dias === 0) return raiz.textoDaVoz('PAI-11.hoje');
    if (dias === 1) return raiz.textoDaVoz('PAI-11.ontem');
    return raiz.textoDaVoz('PAI-11.diasAtras', { n: dias });
  }

  function haQuanto(momento) {
    const quando = new Date(momento);
    const agora = new Date();
    if (Number.isNaN(quando.getTime())) return '';
    if (quando.toDateString() !== agora.toDateString() && quando < agora) {
      return rotuloDoDia(quando.toLocaleDateString('pt-BR'));
    }
    const minutos = Math.floor((agora - quando) / 60000);
    if (!(minutos >= 1)) return raiz.textoDaVoz('ENV-08.agora');
    if (minutos < 60) return raiz.textoDaVoz('ENV-08.minutos', { n: minutos });
    return raiz.textoDaVoz('ENV-08.horas', { n: Math.floor(minutos / 60) });
  }

  function diaEHora(momento) {
    const quando = new Date(momento);
    if (Number.isNaN(quando.getTime())) return '';
    const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${rotuloDoDia(quando.toLocaleDateString('pt-BR'))}, ${hora}`;
  }

  raiz.Contexto = { fonteDaFrase, nomeDaFonte, rotuloDoDia, haQuanto, diaEHora };
})(globalThis.PerpetualMiner = globalThis.PerpetualMiner || {});
