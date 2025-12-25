// common.js

const STORAGE_KEYS = {
  CURRENT_PLAYER: 'carGameCurrentPlayer',
  LAST_GAME: 'carGameLastGame',
  RATING: 'carGameRating',
  START_LEVEL: 'carGameStartLevel'
};

function getCurrentPlayerName() {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_PLAYER) || '';
}

function setCurrentPlayerName(name) {
  localStorage.setItem(STORAGE_KEYS.CURRENT_PLAYER, name);
}

function resetCurrentGameState() {
  localStorage.removeItem(STORAGE_KEYS.LAST_GAME);
}

function setStartLevel(level) {
  const v = Number(level);
  const safe = (v >= 1 && v <= 3) ? v : 1;
  localStorage.setItem(STORAGE_KEYS.START_LEVEL, String(safe));
}

function getStartLevel() {
  const v = Number(localStorage.getItem(STORAGE_KEYS.START_LEVEL));
  if (v >= 1 && v <= 3) return v;
  return 1;
}

// ✅ Универсальная навигация (работает и локально, и на GitHub Pages)
function goTo(pageFile) {
  const url = new URL(pageFile, window.location.href);
  window.location.assign(url.toString());
}

// --------------------
// ✅ Popup / Modal API (замена alert/confirm)
// --------------------

let __popupInitialized = false;
let __popupResolve = null;
let __popupHasCancel = false;

function ensurePopup() {
  if (__popupInitialized) return;

  const overlay = document.createElement('div');
  overlay.id = 'popup-overlay';
  overlay.className = 'popup-overlay hidden';

  overlay.innerHTML = `
    <div class="popup-dialog" role="dialog" aria-modal="true" aria-labelledby="popup-title">
      <h3 id="popup-title" class="popup-title"></h3>
      <div id="popup-message" class="popup-message"></div>
      <div id="popup-buttons" class="popup-buttons"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  // клик по фону — закрываем только если есть cancel (confirm)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && __popupHasCancel) {
      closePopup(false);
    }
  });

  // Esc / Enter
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;

    if (e.key === 'Escape' && __popupHasCancel) {
      e.preventDefault();
      closePopup(false);
    }

    if (e.key === 'Enter') {
      // Enter = нажать primary кнопку, если есть
      const primaryBtn = overlay.querySelector('button[data-primary="1"]');
      if (primaryBtn) {
        e.preventDefault();
        primaryBtn.click();
      }
    }
  });

  __popupInitialized = true;
}

function openPopup({ title = 'Сообщение', message = '', isHtml = false, buttons = [] }) {
  ensurePopup();

  const overlay = document.getElementById('popup-overlay');
  const titleEl = document.getElementById('popup-title');
  const msgEl = document.getElementById('popup-message');
  const btnsEl = document.getElementById('popup-buttons');

  titleEl.textContent = title;

  if (isHtml) {
    msgEl.innerHTML = message;
  } else {
    msgEl.textContent = message;
  }

  btnsEl.innerHTML = '';

  __popupHasCancel = buttons.some(b => b.value === false);

  buttons.forEach((b, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.className || 'btn primary';
    btn.textContent = b.text || 'OK';
    if (b.primary) btn.dataset.primary = '1';

    btn.addEventListener('click', () => closePopup(b.value));
    btnsEl.appendChild(btn);

    // фокус на первой primary, иначе на первой кнопке
    if (idx === 0 && !buttons.some(x => x.primary)) btn.dataset.primary = '1';
  });

  overlay.classList.remove('hidden');
  document.body.classList.add('modal-open');

  // фокус
  setTimeout(() => {
    const focusBtn = overlay.querySelector('button[data-primary="1"]') || overlay.querySelector('button');
    if (focusBtn) focusBtn.focus();
  }, 0);

  return new Promise((resolve) => {
    __popupResolve = resolve;
  });
}

function closePopup(result) {
  const overlay = document.getElementById('popup-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  overlay.classList.add('hidden');
  document.body.classList.remove('modal-open');

  const resolve = __popupResolve;
  __popupResolve = null;
  __popupHasCancel = false;

  if (resolve) resolve(result);
}

// ✅ аналоги alert / confirm
function showAlert(message, title = 'Сообщение') {
  return openPopup({
    title,
    message,
    isHtml: false,
    buttons: [
      { text: 'OK', value: true, className: 'btn primary', primary: true }
    ]
  });
}

function showConfirm(message, title = 'Подтверждение', okText = 'Да', cancelText = 'Отмена') {
  return openPopup({
    title,
    message,
    isHtml: false,
    buttons: [
      { text: cancelText, value: false, className: 'btn secondary', primary: false },
      { text: okText, value: true, className: 'btn primary', primary: true }
    ]
  }).then(Boolean);
}

// Авто-инициализация (чтобы popup был доступен на всех страницах)
(function initPopupOnReady() {
  const run = () => ensurePopup();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

// --------------------
// Storage / rating
// --------------------

function saveGameResult(result) {
  localStorage.setItem(STORAGE_KEYS.LAST_GAME, JSON.stringify(result));

  let rating = [];
  const stored = localStorage.getItem(STORAGE_KEYS.RATING);
  if (stored) {
    try { rating = JSON.parse(stored); } catch { rating = []; }
  }

  const existing = rating.find(r => r.name === result.name);
  if (existing) {
    existing.lastScore = result.totalScore;
    existing.lastDate = result.date;
    if (result.totalScore > existing.bestScore) existing.bestScore = result.totalScore;
  } else {
    rating.push({
      name: result.name,
      bestScore: result.totalScore,
      lastScore: result.totalScore,
      lastDate: result.date
    });
  }

  rating.sort((a, b) => b.bestScore - a.bestScore);
  localStorage.setItem(STORAGE_KEYS.RATING, JSON.stringify(rating));
}

function getLastGameResult() {
  const data = localStorage.getItem(STORAGE_KEYS.LAST_GAME);
  if (!data) return null;
  try { return JSON.parse(data); } catch { return null; }
}

function getRating() {
  const stored = localStorage.getItem(STORAGE_KEYS.RATING);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}
