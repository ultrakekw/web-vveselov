// common.js

const STORAGE_KEYS = {
  CURRENT_PLAYER: 'carGameCurrentPlayer',
  LAST_GAME: 'carGameLastGame',
  RATING: 'carGameRating',
  START_LEVEL: 'carGameStartLevel'
};

// ✅ Безопасное хранилище: если localStorage недоступен (редко, но бывает) — fallback в память
const storage = (() => {
  try {
    const t = '__storage_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    const mem = {};
    return {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; }
    };
  }
})();

function getCurrentPlayerName() {
  return storage.getItem(STORAGE_KEYS.CURRENT_PLAYER) || '';
}

function setCurrentPlayerName(name) {
  storage.setItem(STORAGE_KEYS.CURRENT_PLAYER, name);
}

function resetCurrentGameState() {
  storage.removeItem(STORAGE_KEYS.LAST_GAME);
}

function getStartLevel() {
  const v = Number(storage.getItem(STORAGE_KEYS.START_LEVEL));
  if (v >= 1 && v <= 3) return v;
  return 1;
}

function setStartLevel(level) {
  const v = Number(level);
  if (v >= 1 && v <= 3) storage.setItem(STORAGE_KEYS.START_LEVEL, String(v));
}

// ✅ Базовая папка сайта: .../repo-name/ (на GitHub Pages) или ./ (локально)
function getSiteBaseUrl() {
  // Берём папку текущего файла: /repo/game.html -> /repo/
  const path = window.location.pathname;
  const dir = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
  return `${window.location.origin}${dir}`;
}

// ✅ Универсальная навигация (локально + GitHub Pages)
function goTo(pageFile) {
  const base = getSiteBaseUrl();
  const url = new URL(pageFile, base);
  window.location.assign(url.toString());
}

// ====== РЕЙТИНГ ======

function saveGameResult(result) {
  storage.setItem(STORAGE_KEYS.LAST_GAME, JSON.stringify(result));

  let rating = [];
  const stored = storage.getItem(STORAGE_KEYS.RATING);
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
  storage.setItem(STORAGE_KEYS.RATING, JSON.stringify(rating));
}

function getLastGameResult() {
  const data = storage.getItem(STORAGE_KEYS.LAST_GAME);
  if (!data) return null;
  try { return JSON.parse(data); } catch { return null; }
}

function getRating() {
  const stored = storage.getItem(STORAGE_KEYS.RATING);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}

// ====== МОДАЛКИ (замена alert/confirm) ======

function ensureModalRoot() {
  let root = document.getElementById('modal-root');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'modal-root';
  document.body.appendChild(root);
  return root;
}

function showAlert(message, title = 'Сообщение', okText = 'ОК') {
  return new Promise((resolve) => {
    const root = ensureModalRoot();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const h = document.createElement('h3');
    h.textContent = title;

    const body = document.createElement('pre');
    body.className = 'modal-body';
    body.textContent = String(message);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const okBtn = document.createElement('button');
    okBtn.className = 'btn primary';
    okBtn.type = 'button';
    okBtn.textContent = okText;

    function close() {
      overlay.remove();
      resolve();
    }

    okBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    modal.appendChild(h);
    modal.appendChild(body);
    actions.appendChild(okBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    root.appendChild(overlay);

    // focus
    setTimeout(() => okBtn.focus(), 0);
  });
}

function showConfirm(message, title = 'Подтверждение', okText = 'Да', cancelText = 'Отмена') {
  return new Promise((resolve) => {
    const root = ensureModalRoot();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const h = document.createElement('h3');
    h.textContent = title;

    const body = document.createElement('pre');
    body.className = 'modal-body';
    body.textContent = String(message);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.className = 'btn primary';
    okBtn.type = 'button';
    okBtn.textContent = okText;

    function close(val) {
      overlay.remove();
      resolve(val);
    }

    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    // ESC
    function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close(false);
      }
    }
    document.addEventListener('keydown', onKey);

    modal.appendChild(h);
    modal.appendChild(body);
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    root.appendChild(overlay);

    setTimeout(() => okBtn.focus(), 0);
  });
}

// чтобы точно были глобально доступны
window.goTo = goTo;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.getStartLevel = getStartLevel;
window.setStartLevel = setStartLevel;
