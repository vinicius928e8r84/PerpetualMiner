'use strict';

// Evidência opcional dos testes da mineração: a superfície real e o contrato
// persistido. PM_EVIDENCE_DIR aponta para a pasta de evidências da execução;
// sem ela, os testes não criam arquivos.
const fs = require('fs');
const path = require('path');

async function fotografar(alvo, nome) {
  if (!process.env.PM_EVIDENCE_DIR) return;
  await alvo.screenshot({ path: path.join(process.env.PM_EVIDENCE_DIR, nome), animations: 'disabled' });
}

async function registrarEstado(extensao, nome) {
  if (!process.env.PM_EVIDENCE_DIR) return;
  const storage = await extensao.lerStorage([
    'frases', 'pm_auto_miner_settings', 'pm_auto_miner_daily',
    'pm_auto_miner_state_view', 'pm_auto_miner_last_event',
  ]);
  const toolbar = await extensao.serviceWorker.evaluate(async () => ({
    badge: await chrome.action.getBadgeText({}),
    tooltip: await chrome.action.getTitle({}),
    proximoAlarme: await chrome.alarms.get('pm-virada-do-dia'),
  }));
  fs.writeFileSync(path.join(process.env.PM_EVIDENCE_DIR, nome), JSON.stringify({ storage, toolbar }, null, 2) + '\n');
}

module.exports = { fotografar, registrarEstado };
