'use strict';

const semOuvinte = () => ({ addListener() {} });

const LEITURA_DO_MANIFESTO = () => ({ name: 'PerpetualMiner', version: '0' });

const comPromessaSemCallback = metodo => (...argumentos) => (typeof argumentos.at(-1) === 'function'
  ? metodo(...argumentos)
  : new Promise(resolver => metodo(...argumentos, resolver)));

const areaComPromessa = area => ({ ...area, get: comPromessaSemCallback(area.get), set: comPromessaSemCallback(area.set) });

function chromeDoServiceWorker({ contextMenus, runtime, storage, tabs, action, alarms }) {
  return {
    contextMenus: { create() {}, onClicked: semOuvinte(), ...contextMenus },
    runtime: { id: 'pm', onInstalled: semOuvinte(), onStartup: semOuvinte(), onMessage: semOuvinte(), lastError: null, getManifest: LEITURA_DO_MANIFESTO, ...runtime },
    storage: { onChanged: semOuvinte(), ...storage, local: areaComPromessa(storage.local) },
    tabs: { query: (_filtro, devolver) => devolver([]), ...tabs },
    action: { setBadgeText() {}, setTitle() {}, setBadgeBackgroundColor() {}, setBadgeTextColor() {}, ...action },
    alarms: { get: async () => null, create: async () => {}, clear: async () => {}, onAlarm: semOuvinte(), ...alarms },
  };
}

module.exports = { chromeDoServiceWorker };
