'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// Sentinel retornado pelo modelo quando não há trechos marcados
const SENTINEL_VAZIO = 'NENHUM_TRECHO';

const PROMPT = `Analise a foto desta página de livro ou texto impresso.

TAREFA: encontre e transcreva APENAS os trechos que foram marcados manualmente pelo leitor.

Tipos de marcação a identificar:
1. Texto entre barras oblíquas → /texto marcado aqui/
2. Texto entre underscores → _texto marcado aqui_
3. Texto com sublinhado físico desenhado à mão abaixo das palavras
4. Texto circulado, entre colchetes [] ou com marcação lateral

REGRAS — siga à risca:
- Retorne APENAS o texto limpo de cada trecho, sem os símbolos de marcação
- Um trecho por linha, sem numeração, sem bullet points, sem explicações
- Preserve a frase exatamente como está, incluindo pontuação e capitalização
- Se não houver absolutamente nenhum trecho marcado, responda exatamente: ${SENTINEL_VAZIO}

Exemplo de saída correta (para uma página com 3 trechos marcados):
The quick brown fox jumps over the lazy dog
All that glitters is not gold
To be or not to be, that is the question`;

// ─── Estado Global ────────────────────────────────────────────────────────────

let imageQueue        = [];   // [{ base64, mimeType, fileName }]
let frasesEncontradas = [];   // string[] — nunca limpa ao receber novas fotos
let processingQueue   = [];   // fila para drops durante processamento
let isProcessing      = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  carregarConfiguracoes();
  setupDropzone();
  setupListeners();
});

// Garante que o Chrome nunca abra a imagem como link, independente de onde cair
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop',     e => e.preventDefault());

// ─── Listeners ────────────────────────────────────────────────────────────────

function setupListeners() {
  // Sidebar
  document.getElementById('btn-save-key').addEventListener('click', salvarApiKey);
  document.getElementById('btn-toggle-key').addEventListener('click', alternarVisibilidadeKey);
  document.getElementById('btn-voltar').addEventListener('click', voltarAoPainel);

  // Preview
  document.getElementById('btn-analisar').addEventListener('click', analisarImagem);
  document.getElementById('btn-nova-foto').addEventListener('click', resetarParaUpload);

  // Results
  document.getElementById('btn-nova-foto-2').addEventListener('click', resetarParaUpload);
  document.getElementById('btn-add-more').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('btn-select-all').addEventListener('click', () => definirSelecaoResultados(true));
  document.getElementById('btn-deselect-all').addEventListener('click', () => definirSelecaoResultados(false));
  document.getElementById('btn-salvar').addEventListener('click', salvarNoMiner);
  document.getElementById('results-list').addEventListener('change', (event) => {
    if (event.target.classList.contains('result-check')) atualizarBotoesSelecao();
  });
}

function setupDropzone() {
  const zone           = document.getElementById('upload-zone');
  const fileInput      = document.getElementById('file-input');
  const resultsSection = document.getElementById('results-section');
  const addMoreZone    = document.getElementById('add-more-zone');

  // ── Upload zone (fresh start) ─────────────────────────
  zone.addEventListener('click',      () => fileInput.click());
  zone.addEventListener('dragenter',  (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragover',   (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave',  (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
  zone.addEventListener('drop',       (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length > 0) carregarImagens(files);
    else mostrarErro('Nenhum arquivo de imagem. Use JPG, PNG, WEBP ou HEIC.');
  });

  // ── Results section drop (acumulativo sem mudar de estado) ────
  resultsSection.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    addMoreZone.classList.add('drag-over');
  });
  resultsSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    addMoreZone.classList.add('drag-over');
  });
  resultsSection.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!resultsSection.contains(e.relatedTarget)) {
      addMoreZone.classList.remove('drag-over');
    }
  });
  resultsSection.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    addMoreZone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      const imgs = await Promise.all(files.map(lerArquivo));
      enfileirarImagens(imgs);
    }
  });

  // ── Preview section drop (acumula na imageQueue, não substitui) ───
  const previewSection = document.getElementById('preview-section');
  previewSection.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); previewSection.classList.add('drag-over'); });
  previewSection.addEventListener('dragover',  (e) => { e.preventDefault(); e.stopPropagation(); previewSection.classList.add('drag-over'); });
  previewSection.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); if (!previewSection.contains(e.relatedTarget)) previewSection.classList.remove('drag-over'); });
  previewSection.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    previewSection.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const imgs = await Promise.all(files.map(lerArquivo));
    imageQueue.push(...imgs);                                        // acumula, não substitui
    document.getElementById('queue-count-text').textContent =
      `${imageQueue.length} fotos na fila · exibindo 1ª`;
    document.getElementById('queue-info').classList.remove('hidden');
  });

  // ── Loading section drop (enfileira para processar após o lote atual) ──
  const loadingSection = document.getElementById('loading-section');
  loadingSection.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); loadingSection.classList.add('drag-over-loading'); });
  loadingSection.addEventListener('dragover',  (e) => { e.preventDefault(); e.stopPropagation(); loadingSection.classList.add('drag-over-loading'); });
  loadingSection.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); if (!loadingSection.contains(e.relatedTarget)) loadingSection.classList.remove('drag-over-loading'); });
  loadingSection.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    loadingSection.classList.remove('drag-over-loading');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const imgs = await Promise.all(files.map(lerArquivo));
    processingQueue.push(...imgs);                                   // será processado via drainQueue após loading terminar
    atualizarHintLoading();
  });

  // ── File input: comportamento depende do estado atual ──
  fileInput.addEventListener('change', () => {
    if (!fileInput.files.length) return;
    const files = [...fileInput.files];
    const inResults = !resultsSection.classList.contains('hidden');
    if (inResults) {
      Promise.all(files.map(lerArquivo)).then(imgs => enfileirarImagens(imgs));
    } else {
      carregarImagens(files);
    }
    fileInput.value = '';
  });
}

// ─── Carregar Imagens ─────────────────────────────────────────────────────────

function carregarImagens(files) {
  Promise.all(files.map(lerArquivo)).then(imgs => {
    imageQueue = imgs;
    if (imgs.length > 1) {
      // Múltiplas fotos: pula preview e entra direto no processamento em fila
      analisarImagem();
    } else {
      // Foto única: mostra preview para confirmar antes de analisar
      document.getElementById('preview-img').src =
        `data:${imgs[0].mimeType};base64,${imgs[0].base64}`;
      document.getElementById('queue-info').classList.add('hidden');
      mostrarSecao('preview');
    }
  });
}

function lerArquivo(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve({
      base64:   e.target.result.split(',')[1],
      mimeType: file.type || 'image/jpeg',
      fileName: file.name,
    });
    reader.readAsDataURL(file);
  });
}

// ─── Análise via Gemini Vision — lote inicial (via botão Analisar) ───────────

async function analisarImagem() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!apiKey) { mostrarErro('Insira sua Gemini API Key nas configurações à esquerda.'); return; }
  if (imageQueue.length === 0) { mostrarErro('Carregue ao menos uma imagem primeiro.'); return; }

  // Nunca limpa resultados anteriores — sempre acumula
  const prevCount = frasesEncontradas.length;

  mostrarSecao('loading');

  const total   = imageQueue.length;
  const titleEl = document.getElementById('loading-title');
  const subEl   = document.getElementById('loading-sub');
  const wrapEl  = document.getElementById('progress-wrap');
  const barEl   = document.getElementById('progress-bar');
  const labelEl = document.getElementById('progress-label');

  if (total > 1) {
    subEl.textContent = 'Processando imagens em sequência…';
    wrapEl.classList.remove('hidden');
  } else {
    subEl.textContent = prevCount > 0
      ? 'Adicionando ao histórico de frases…'
      : 'O Gemini está identificando os trechos marcados';
    wrapEl.classList.add('hidden');
  }

  const acumuladas = [];

  for (let i = 0; i < total; i++) {
    const img = imageQueue[i];
    titleEl.textContent = total > 1
      ? `Processando imagem ${i + 1} de ${total}…`
      : 'Analisando a imagem…';
    if (total > 1) {
      barEl.style.width   = `${Math.round((i / total) * 100)}%`;
      labelEl.textContent = img.fileName || `Foto ${i + 1}`;
    }
    try {
      const frases = await chamarGemini(apiKey, img.base64, img.mimeType);
      acumuladas.push(...frases);
    } catch (err) {
      mostrarErro(`Imagem ${i + 1}: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (total > 1) barEl.style.width = '100%';

  imageQueue = [];
  document.getElementById('loading-queue-hint')?.remove();
  frasesEncontradas.push(...acumuladas);
  renderizarResultados(frasesEncontradas, prevCount);
  atualizarContador();
  mostrarSecao('results');
  // Drena fotos que chegaram via drop durante o loading
  if (processingQueue.length > 0 && !isProcessing) drainQueue();
}

// ─── Fila de processamento em segundo plano (drops na tela de resultados) ────

function enfileirarImagens(imgs) {
  processingQueue.push(...imgs);
  if (!isProcessing) drainQueue();
}

async function drainQueue() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!apiKey) { mostrarErro('Insira sua Gemini API Key nas configurações à esquerda.'); return; }

  isProcessing = true;
  atualizarStatusDropZone();

  while (processingQueue.length > 0) {
    const img        = processingQueue.shift();
    const startIndex = frasesEncontradas.length;
    atualizarStatusDropZone();
    try {
      const frases = await chamarGemini(apiKey, img.base64, img.mimeType);
      frasesEncontradas.push(...frases);
      renderizarResultados(frasesEncontradas, startIndex);
      atualizarContador();
    } catch (err) {
      mostrarErro(`Erro ao processar foto: ${err.message}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  isProcessing = false;
  atualizarStatusDropZone();
}

function atualizarHintLoading() {
  let hint = document.getElementById('loading-queue-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.id = 'loading-queue-hint';
    hint.style.cssText = 'font-size:12px;color:#a78bfa;margin-top:2px;';
    document.querySelector('.loading-box')?.appendChild(hint);
  }
  const n = processingQueue.length;
  hint.textContent = `+${n} foto${n !== 1 ? 's' : ''} na fila aguardando`;
}

function atualizarStatusDropZone() {
  const addMoreZone = document.getElementById('add-more-zone');
  const span        = addMoreZone.querySelector('span');
  const icon        = addMoreZone.querySelector('.add-more-icon');
  const spinner     = addMoreZone.querySelector('.add-more-spinner');
  if (!span) return;

  if (isProcessing) {
    addMoreZone.classList.add('processing');
    icon?.classList.add('hidden');
    spinner?.classList.remove('hidden');
    const naFila = processingQueue.length;
    span.textContent = naFila > 0
      ? `Processando foto... ${naFila} na fila · pode arrastar mais!`
      : 'Processando foto... você pode arrastar mais enquanto isso';
  } else {
    addMoreZone.classList.remove('processing');
    icon?.classList.remove('hidden');
    spinner?.classList.add('hidden');
    span.textContent = 'Arraste mais fotos aqui para acumular resultados';
  }
}

function atualizarContador() {
  const n      = frasesEncontradas.length;
  const plural = n !== 1;
  document.getElementById('results-count').textContent =
    `Total acumulado: ${n} trecho${plural ? 's' : ''} prontos para salvar`;
  document.getElementById('btn-salvar').disabled = n === 0;
}

// ─── Chamada Gemini (única imagem) ───────────────────────────────────────────

async function chamarGemini(apiKey, base64, mimeType) {
  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: PROMPT },
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }
  const data  = await response.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (!texto) return [];
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith(SENTINEL_VAZIO));
}

function renderizarResultados(frases, startIndex = 0) {
  const lista     = document.getElementById('results-list');
  const btnSalvar = document.getElementById('btn-salvar');

  if (frases.length === 0) {
    lista.innerHTML = `
      <div class="empty-results">
        <svg width="40" height="40" fill="none" stroke="#d1d5db" stroke-width="1.5" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>Não encontrei trechos marcados nesta imagem.</p>
        <small>
          Certifique-se de que as marcações estão visíveis.<br>
          Use <code>/barras/</code>, <code>_underlines_</code> ou sublinhado físico.
        </small>
      </div>`;
    return;
  }

  const itemHtml = (frase, i) => `
    <div class="result-item">
      <input type="checkbox" class="result-check" id="rc-${i}" data-index="${i}" checked>
      <div class="result-content">
        <span class="result-quote">&ldquo;</span><span
          class="result-text"
          contenteditable="true"
          spellcheck="false"
          data-index="${i}"
        >${esc(frase)}</span><span class="result-quote">&rdquo;</span>
      </div>
    </div>`;

  if (startIndex === 0) {
    // Render completo (primeira vez ou reset)
    btnSalvar.innerHTML = `
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Salvar no PerpetualMiner`;
    lista.innerHTML = frases.map(itemHtml).join('');
  } else {
    // Append: só adiciona os novos itens sem re-renderizar os existentes (preserva edições)
    const novasHtml = frases.slice(startIndex).map((f, j) => itemHtml(f, startIndex + j)).join('');
    lista.insertAdjacentHTML('beforeend', novasHtml);
  }

  atualizarBotoesSelecao();
}

// ─── Salvar no Storage ────────────────────────────────────────────────────────

function salvarNoMiner() {
  // Lê o texto atual do DOM (pode ter sido editado via contenteditable)
  const items = document.querySelectorAll('.result-item');
  const selecionadas = [];
  items.forEach(item => {
    const chk  = item.querySelector('.result-check');
    const text = item.querySelector('.result-text');
    if (chk?.checked && text) {
      const txt = text.textContent.trim();
      if (txt) selecionadas.push(txt);
    }
  });

  if (selecionadas.length === 0) {
    mostrarErro('Selecione ao menos um trecho para salvar.');
    return;
  }

  const tituloLivro = document.getElementById('book-title').value.trim() || 'Físico/Livro';
  Promise.all(selecionadas.map(texto => salvarTrechoNoBackground(texto, tituloLivro))).then(resultados => {
    const salvos = resultados.filter(Boolean).length;
    if (!salvos) {
      mostrarErro('Não foi possível salvar os trechos.');
      return;
    }
    const plural = salvos > 1;
    const btn    = document.getElementById('btn-salvar');
    btn.innerHTML = `
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      ${salvos} trecho${plural ? 's' : ''} salvo${plural ? 's' : ''}!`;
    btn.disabled = true;
    btn.classList.add('btn-saved');
    mostrarToast(`${salvos} trecho${plural ? 's' : ''} salvo${plural ? 's' : ''} no PerpetualMiner!`);
  });
}

function salvarTrechoNoBackground(texto, tituloLivro) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'SALVAR_HISTORICO',
      texto,
      origem: 'livro',
      idioma: detectarIdioma(texto),
      contexto: {
        fonte:   'livro',
        titulo:  tituloLivro,
        detalhe: '',
      },
    }, response => {
      resolve(!chrome.runtime.lastError && response?.ok !== false);
    });
  });
}

// ─── Ações de UI ─────────────────────────────────────────────────────────────

function definirSelecaoResultados(marcar) {
  const checks = document.querySelectorAll('.result-check');
  checks.forEach(c => { c.checked = marcar; });
  atualizarBotoesSelecao();
}

function atualizarBotoesSelecao() {
  const checks = [...document.querySelectorAll('.result-check')];
  const btnMarcar = document.getElementById('btn-select-all');
  const btnDesmarcar = document.getElementById('btn-deselect-all');
  const temItens = checks.length > 0;
  const todosMarcados = temItens && checks.every(c => c.checked);
  const todosDesmarcados = !temItens || checks.every(c => !c.checked);

  btnMarcar.disabled = todosMarcados;
  btnDesmarcar.disabled = todosDesmarcados;
}

function resetarParaUpload() {
  imageQueue        = [];
  frasesEncontradas = [];
  processingQueue   = [];
  isProcessing      = false;
  document.getElementById('file-input').value  = '';
  document.getElementById('preview-img').src   = '';
  document.getElementById('queue-info').classList.add('hidden');
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('error-bar').classList.add('hidden');
  mostrarSecao('upload');
  atualizarBotoesSelecao();
}

function voltarAoPainel() {
  // Tenta fechar aba; se não conseguir (aba não foi aberta por script), vai para painel.html
  const pode = history.length > 1;
  if (pode) history.back();
  else window.location.href = 'painel.html';
}

function alternarVisibilidadeKey() {
  const input = document.getElementById('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ─── State Machine ────────────────────────────────────────────────────────────

function mostrarSecao(secao) {
  ['upload', 'preview', 'loading', 'results'].forEach(s => {
    document.getElementById(`${s}-section`).classList.toggle('hidden', s !== secao);
  });
}

function mostrarErro(msg) {
  const bar = document.getElementById('error-bar');
  bar.textContent = msg;
  bar.classList.remove('hidden');
  setTimeout(() => bar.classList.add('hidden'), 5000);
}

function mostrarToast(msg) {
  document.getElementById('_toast')?.remove();
  const t = document.createElement('div');
  t.id = '_toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '28px', right: '28px',
    background: '#7c3aed', color: 'white',
    padding: '10px 20px', borderRadius: '8px',
    fontSize: '13px', fontFamily: 'inherit',
    zIndex: '9999', boxShadow: '0 4px 18px rgba(124,58,237,0.45)',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

// ─── Persistência de Configurações ───────────────────────────────────────────

function carregarConfiguracoes() {
  chrome.storage.local.get({ geminiApiKey: '', bookTitleDefault: '' }, (data) => {
    if (data.geminiApiKey)      document.getElementById('api-key-input').value = data.geminiApiKey;
    if (data.bookTitleDefault)  document.getElementById('book-title').value    = data.bookTitleDefault;
  });
}

function salvarApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { mostrarErro('Digite uma API Key antes de salvar.'); return; }
  chrome.storage.local.set({ geminiApiKey: key }, () => mostrarToast('API Key salva!'));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectarIdioma(texto) {
  return /[\u0400-\u04FF]/.test(texto) ? 'Russo' : 'Inglês';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
