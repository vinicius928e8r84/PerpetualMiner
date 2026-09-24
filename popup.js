'use strict';

// A base compartilhada (catálogo da Voz e detecção de idioma) é carregada antes
// deste arquivo, pelo popup.html: a busca no catálogo é `PerpetualMiner.textoDaVoz`.
const { detectarIdioma } = PerpetualMiner;

// ─── Estado ───────────────────────────────────────────────────────────────────

let frasesSalvas  = [];
let selectedIds   = new Set();
let isRecording   = false;
let _recordHandle = null;
let hintOriginal  = null;   // “Aguardando…”, que volta a cada gravação
let autoMinerState = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  carregarFrases();
  carregarAtalhoAtual();
  carregarAutoMiner();

  document.getElementById('btnIrPainel').addEventListener('click', abrirPainel);
  document.getElementById('btnAddManual').addEventListener('click', adicionarManual);
  document.getElementById('btnRefresh').addEventListener('click', carregarFrases);
  document.getElementById('btnGravarAtalho').addEventListener('click', iniciarGravacao);
  document.getElementById('chkSelectAll').addEventListener('change', toggleSelectAll);
  document.getElementById('btnDeleteSelected').addEventListener('click', deletarSelecionados);
  document.getElementById('autoMinerEn').addEventListener('change', salvarAutoMiner);
  document.getElementById('autoMinerRu').addEventListener('change', salvarAutoMiner);
  document.getElementById('autoLimitEn').addEventListener('change', salvarAutoMiner);
  document.getElementById('autoLimitRu').addEventListener('change', salvarAutoMiner);

  document.getElementById('txtManual').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adicionarManual(); }
  });

  // Auto-atualiza a lista quando o storage mudar (ex: content.js salva nova frase)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.frases) {
      frasesSalvas = changes.frases.newValue || [];
      // Limpa seleção que pode ter ficado inválida
      selectedIds = new Set([...selectedIds].filter(
        id => frasesSalvas.some(f => f.id === id)
      ));
      renderizar();
    }
    if (area === 'local' && changes.pm_atalho) {
      exibirAtalhoAtual(changes.pm_atalho.newValue);
    }
    if (area === 'local' && changes.pm_auto_miner_state_view?.newValue) {
      autoMinerState = changes.pm_auto_miner_state_view.newValue;
      renderizarAutoMiner();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'AUTO_MINER_STATE_CHANGED') return;
    autoMinerState = message.state;
    renderizarAutoMiner();
  });
});

function carregarAutoMiner() {
  chrome.runtime.sendMessage({ type: 'AUTO_MINER_GET_STATE' }, response => {
    if (chrome.runtime.lastError || !response?.state) return;
    autoMinerState = response.state;
    renderizarAutoMiner();
  });
}

function renderizarAutoMiner() {
  const state = autoMinerState;
  if (!state) return;
  document.getElementById('autoMinerEn').checked = Boolean(state.settings?.en?.enabled);
  document.getElementById('autoMinerRu').checked = Boolean(state.settings?.ru?.enabled);
  document.getElementById('autoLimitEn').value = state.settings?.en?.dailyLimit || 20;
  document.getElementById('autoLimitRu').value = state.settings?.ru?.dailyLimit || 20;
  document.getElementById('autoCountEn').textContent = `${state.daily?.en?.count || 0}/${state.settings?.en?.dailyLimit || 20}`;
  document.getElementById('autoCountRu').textContent = `${state.daily?.ru?.count || 0}/${state.settings?.ru?.dailyLimit || 20}`;
}

function salvarAutoMiner() {
  const settings = {
    en: {
      enabled: document.getElementById('autoMinerEn').checked,
      dailyLimit: Number(document.getElementById('autoLimitEn').value || 20),
    },
    ru: {
      enabled: document.getElementById('autoMinerRu').checked,
      dailyLimit: Number(document.getElementById('autoLimitRu').value || 20),
    },
  };
  chrome.runtime.sendMessage({ type: 'AUTO_MINER_SET_SETTINGS', settings }, response => {
    if (chrome.runtime.lastError || !response?.state) return;
    autoMinerState = response.state;
    renderizarAutoMiner();
  });
}

// ─── Frases: carregar / renderizar ───────────────────────────────────────────

function carregarFrases() {
  const btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');

  chrome.storage.local.get({ frases: [] }, (data) => {
    frasesSalvas = data.frases || [];
    selectedIds.clear();
    renderizar();
    setTimeout(() => btn.classList.remove('spinning'), 400);
  });
}

function renderizar() {
  const container = document.getElementById('listaUltimas');
  const btnDelete = document.getElementById('btnDeleteSelected');
  const chkAll    = document.getElementById('chkSelectAll');

  const lista = frasesSalvas.slice(0, 5);

  if (lista.length === 0) {
    container.innerHTML = '<div class="empty-msg">Nenhuma frase salva ainda.</div>';
    btnDelete.style.display = 'none';
    chkAll.checked = false;
    return;
  }

  container.innerHTML = '';
  lista.forEach(f => {
    const div = document.createElement('div');
    div.className = 'card-frase';
    if (selectedIds.has(f.id)) div.classList.add('selected');

    const chk = document.createElement('input');
    chk.type      = 'checkbox';
    chk.className = 'chk-frase';
    chk.checked   = selectedIds.has(f.id);
    chk.dataset.id = String(f.id);  // guarda como string no dataset

    chk.addEventListener('change', () => {
      // Usa o id numérico original do item
      if (chk.checked) selectedIds.add(f.id);
      else             selectedIds.delete(f.id);
      div.classList.toggle('selected', chk.checked);
      atualizarControlesBulk();
    });

    const span = document.createElement('span');
    span.className   = 'frase-texto';
    span.textContent = f.texto;

    div.appendChild(chk);
    div.appendChild(span);
    container.appendChild(div);
  });

  atualizarControlesBulk();
}

function atualizarControlesBulk() {
  const btnDelete = document.getElementById('btnDeleteSelected');
  const chkAll    = document.getElementById('chkSelectAll');
  const lista     = frasesSalvas.slice(0, 5);

  const hasSelected = selectedIds.size > 0;
  btnDelete.style.display = hasSelected ? 'inline-flex' : 'none';
  if (hasSelected) {
    btnDelete.textContent = `Deletar (${selectedIds.size})`;
  }

  const allIds = lista.map(f => f.id);
  chkAll.checked = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
}

// ─── Bulk Delete ──────────────────────────────────────────────────────────────

function toggleSelectAll() {
  const chkAll = document.getElementById('chkSelectAll');
  const lista  = frasesSalvas.slice(0, 5);
  if (chkAll.checked) {
    lista.forEach(f => selectedIds.add(f.id));
  } else {
    lista.forEach(f => selectedIds.delete(f.id));
  }
  renderizar();
}

function deletarSelecionados() {
  // Copia o Set antes de limpar, para usar no filtro
  const idsParaDeletar = new Set(selectedIds);
  selectedIds.clear();
  frasesSalvas = frasesSalvas.filter(f => !idsParaDeletar.has(f.id));
  renderizar();

  // O service worker apaga na fila de gravação e grava o tombstone; com a conta
  // conectada, apaga também da nuvem — senão a frase volta na sincronização.
  chrome.runtime.sendMessage({ type: 'APAGAR_FRASES', ids: [...idsParaDeletar] }, response => {
    if (chrome.runtime.lastError || response?.ok === false) carregarFrases();
  });
}

// ─── Adição Manual ────────────────────────────────────────────────────────────

function adicionarManual() {
  const textarea = document.getElementById('txtManual');
  const texto    = textarea.value.trim();
  if (!texto) return;
  const idioma = detectarIdioma(texto);

  chrome.runtime.sendMessage({
    type: 'SALVAR_HISTORICO',
    texto,
    origem: 'manual',
    idioma,
    contexto: { fonte: 'manual', titulo: 'Manual Input', detalhe: '' },
  }, response => {
    if (chrome.runtime.lastError || response?.ok === false) return;
    textarea.value = '';
    if (response?.frase) {
      frasesSalvas = [response.frase, ...frasesSalvas.filter(f => f.id !== response.frase.id)];
      selectedIds.clear();
      renderizar();
    } else {
      carregarFrases();
    }
  });
}

// ─── Configurar Atalho ────────────────────────────────────────────────────────

function carregarAtalhoAtual() {
  chrome.storage.local.get({ pm_atalho: null }, (data) => {
    exibirAtalhoAtual(data.pm_atalho);
  });
}

function exibirAtalhoAtual(cfg) {
  const el = document.getElementById('atalhoAtual');
  el.textContent = cfg ? PerpetualMiner.Atalhos.rotuloDoAtalho(cfg) : 'Não configurado';
  el.className = 'atalho-badge' + (cfg ? ' atalho-badge--set' : '');
}

function iniciarGravacao() {
  if (isRecording) { pararGravacao(); return; }
  isRecording = true;

  const btn  = document.getElementById('btnGravarAtalho');
  const hint = document.getElementById('atalhoHint');
  btn.textContent = 'Cancelar gravação';
  btn.classList.add('recording');
  hintOriginal ??= hint.textContent;
  hint.textContent = hintOriginal;
  hint.style.display = 'block';

  // Grava como Configurações › Atalhos (lib/atalhos.js): só tecla com Ctrl, Alt
  // ou Shift, ou botão extra do mouse, e recusa o atalho que já é do Minerar
  // legenda (CFG-19), que senão minerava duas vezes. A gravação continua.
  _recordHandle = (e) => {
    const cfg = PerpetualMiner.Atalhos.atalhoDoEvento(e);
    if (!cfg) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    PerpetualMiner.Atalhos.lerAtalhos(({ legenda }) => {
      if (!isRecording) return;
      if (PerpetualMiner.Atalhos.mesmoAtalho(cfg, legenda)) {
        const { textoDaVoz } = PerpetualMiner;
        hint.textContent = textoDaVoz('CFG-19', { acao: textoDaVoz('CFG-11.minerarLegenda') });
        return;
      }
      chrome.storage.local.set({ pm_atalho: cfg }, () => {
        exibirAtalhoAtual(cfg);
        pararGravacao();
      });
    });
  };

  // Usa capture=true para interceptar antes de qualquer outro handler
  document.addEventListener('keydown',   _recordHandle, true);
  document.addEventListener('mousedown', _recordHandle, true);
}

function pararGravacao() {
  isRecording = false;
  const btn  = document.getElementById('btnGravarAtalho');
  const hint = document.getElementById('atalhoHint');
  btn.textContent = 'Clique aqui para gravar atalho';
  btn.classList.remove('recording');
  hint.style.display = 'none';

  if (_recordHandle) {
    document.removeEventListener('keydown',   _recordHandle, true);
    document.removeEventListener('mousedown', _recordHandle, true);
    _recordHandle = null;
  }
}


// ─── Navegação ────────────────────────────────────────────────────────────────

function abrirPainel() {
  const painelUrl = chrome.runtime.getURL('painel.html');
  chrome.tabs.query({ url: painelUrl }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: painelUrl });
    }
  });
}
