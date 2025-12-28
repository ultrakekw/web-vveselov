// game.js

let currentLevel = 1;
let currentRound = 1;
let maxRoundsPerLevel = 3;

let score = 0;
let levelScore = 0;

let timerInterval = null;
let levelTimeLeft = 0;

// Для анимации
let animationFrameId = null;
let lastTimestamp = null;

// Состояние уровня
let levelState = {};

// ======================================================
// ======================= КОНСТАНТЫ =====================
// ======================================================

// --- Параметры уровня 1 ---
const LEVEL1_MIN_DISTANCE = 50;
const LEVEL1_MAX_DISTANCE = 150;

const LEVEL1_MIN_TIME = 4;   // сек
const LEVEL1_MAX_TIME = 12;  // сек

// ширина дорожки (px) в зависимости от distance
const LEVEL1_MIN_TRACK_PX = 420;
const LEVEL1_MAX_TRACK_PX = 860;

// скорость управления машинкой на заезде L1 (масштабируется под теоретическое время)
const LEVEL1_BACKWARD_RATIO = 0.65;   // скорость назад от базовой
const LEVEL1_ACCEL_BONUS = 0.35;      // ArrowUp => +35%
const LEVEL1_BRAKE_PENALTY = 0.35;    // ArrowDown => -35%

// ✅ базовое ускорение машинки на заезде L1
const LEVEL1_SPEED_MULT = 1.35;

// --- Уровень 3 управление ---
const LEVEL3_MOVE_SPEED = 260;  // px/s (стрелки)
const LEVEL3_FAIL_PENALTY = -25;
const LEVEL3_BASE_SCORE = 150;

// --- Уровень 3 препятствия ---
const LEVEL3_OBSTACLE_MIN_TTL = 1;  // сек
const LEVEL3_OBSTACLE_MAX_TTL = 5;  // сек
const LEVEL3_OBSTACLE_THICKNESS = 18; // толщина "перекрытия"
const LEVEL3_MAX_OBSTACLES = 6;
// как часто появляются новые препятствия
const LEVEL3_OBSTACLE_SPAWN_MIN = 0.5; // сек
const LEVEL3_OBSTACLE_SPAWN_MAX = 1.2; // сек

// Для стрелок на уровне 3
const level3Keys = { up: false, down: false, left: false, right: false };

document.addEventListener('DOMContentLoaded', () => {
  const init = async () => {
    const playerName = getCurrentPlayerName();
    if (!playerName) {
      goTo('index.html');
      return;
    }

    document.getElementById('player-label').textContent = `Игрок: ${playerName}`;

    // ✅ Стартуем с выбранного уровня (для тестирования)
    currentLevel = getStartLevel();
    currentRound = 1;

    // ✅ Проставим значение в селекте уровня в шапке
    const levelJump = document.getElementById('level-jump');
    if (levelJump) {
      levelJump.value = String(currentLevel);

      levelJump.addEventListener('change', async () => {
        const target = Number(levelJump.value) || 1;
        if (target < 1 || target > 3) return;

        const ok = await showConfirm(
          `Перейти на уровень ${target}? Текущий прогресс уровня/раунда будет сброшен (для тестирования).`,
          'Переход на уровень',
          'Перейти',
          'Отмена'
        );

        if (!ok) {
          levelJump.value = String(currentLevel);
          return;
        }

        currentLevel = target;
        currentRound = 1;
        setStartLevel(target);
        startLevel();
      });
    }

    document.getElementById('btn-exit').addEventListener('click', async () => {
      const ok = await showConfirm(
        'Вы уверены, что хотите выйти? Прогресс текущей игры будет потерян.',
        'Выход в меню',
        'Выйти',
        'Отмена'
      );
      if (ok) {
        resetCurrentGameState();
        goTo('index.html');
      }
    });

    document.getElementById('btn-end-level').addEventListener('click', async () => {
      const ok = await showConfirm(
        'Завершить уровень досрочно? Очки за него будут меньше.',
        'Завершить уровень',
        'Завершить',
        'Отмена'
      );
      if (ok) {
        void finishLevel(false, true);
      }
    });

    document.getElementById('btn-next-level').addEventListener('click', () => {
      if (currentLevel < 3) {
        currentLevel++;
        currentRound = 1;
        setStartLevel(currentLevel);
        if (levelJump) levelJump.value = String(currentLevel);
        startLevel();
      }
    });

    document.getElementById('btn-restart-level').addEventListener('click', () => {
      currentRound = 1;
      startLevel();
    });

    startLevel();
  };

  void init();
});

function tuneLayoutForLevel(level) {
  // ✅ Ужимаем вертикаль для уровня 3, чтобы canvas точно влазил на 15"
  const instructions = document.getElementById('instructions');
  const instructionsHint = instructions ? instructions.querySelector('.small') : null;
  const gameArea = document.getElementById('game-area');
  const gameMain = document.querySelector('.game-main');

  if (level === 3) {
    if (instructions) {
      instructions.style.padding = '14px 18px';
      instructions.style.marginTop = '10px';
    }
    if (instructionsHint) instructionsHint.style.display = 'none';

    if (gameArea) gameArea.style.padding = '8px';
    if (gameMain) gameMain.style.gap = '8px';
  } else {
    if (instructions) {
      instructions.style.padding = '';
      instructions.style.marginTop = '';
    }
    if (instructionsHint) instructionsHint.style.display = '';
    if (gameArea) gameArea.style.padding = '';
    if (gameMain) gameMain.style.gap = '';
  }
}

function startLevel() {
  cancelAnimation();
  stopLevel3Audio();
  clearInterval(timerInterval);
  timerInterval = null;

  // чистим обработчики
  document.removeEventListener('keydown', handleLevel1ChoiceKey);
  document.removeEventListener('keydown', handleLevel1DriveKeyDown);
  document.removeEventListener('keyup', handleLevel1DriveKeyUp);

  document.removeEventListener('keydown', handleLevel2Key);

  document.removeEventListener('keydown', handleLevel3KeyDown);
  document.removeEventListener('keyup', handleLevel3KeyUp);

  if (levelState?.canvas) {
    levelState.canvas.removeEventListener('mousedown', handleLevel3MouseDown);
    levelState.canvas.removeEventListener('mousemove', handleLevel3MouseMove);
    levelState.canvas.removeEventListener('mouseup', handleLevel3MouseUp);
    levelState.canvas.removeEventListener('mouseleave', handleLevel3MouseUp);
  }
  document.removeEventListener('mouseup', handleLevel3MouseUp);

  // сброс клавиш L3
  level3Keys.up = level3Keys.down = level3Keys.left = level3Keys.right = false;

  // сброс уровня
  levelScore = 0;
  updateUI();

  const titleEl = document.getElementById('level-title');
  const descEl = document.getElementById('level-description');
  const nextBtn = document.getElementById('btn-next-level');
  nextBtn.disabled = true;

  document.getElementById('round-label').textContent = `Раунд: ${currentRound}/${maxRoundsPerLevel}`;
  document.getElementById('btn-end-level').disabled = false;

  // Таймер уровня (общий)
  if (currentLevel === 1) levelTimeLeft = 60;
  if (currentLevel === 2) levelTimeLeft = 50;
  if (currentLevel === 3) levelTimeLeft = 40;

  startTimer();

  // ✅ подгоняем вертикальную компоновку
  tuneLayoutForLevel(currentLevel);

  if (currentLevel === 1) {
    titleEl.textContent = 'Уровень 1 — Сначала угадай время, потом проедь трассу';
    descEl.textContent =
      'Шаг 1: по скорости и расстоянию выберите время. ' +
      'Шаг 2: проедьте трассу стрелками так, чтобы время заезда было близко к теоретическому.';
    setupLevel1();
  } else if (currentLevel === 2) {
    titleEl.textContent = 'Уровень 2 — Останови две машины';
    descEl.textContent =
      'Остановите каждую машину как можно ближе к заданному времени. Горячие клавиши: 1 — Машина 1, 2 — Машина 2.';
    setupLevel2();
  } else if (currentLevel === 3) {
    titleEl.textContent = 'Уровень 3 — Один круг по трассе + препятствия';
    // ✅ короче, чтобы меньше занимало места
    descEl.textContent =
      'Проедьте 1 круг как можно быстрее. Управление: мышь (перетаскивание) или стрелки. Препятствия исчезают по таймеру. 🔊 Звук включится после первого клика/клавиши.';
    setupLevel3();
  }

  // синхронизация селекта уровней
  const levelJump = document.getElementById('level-jump');
  if (levelJump) levelJump.value = String(currentLevel);
}

function startTimer() {
  const timerLabel = document.getElementById('timer-label');
  timerLabel.textContent = levelTimeLeft;

  timerInterval = setInterval(() => {
    levelTimeLeft--;
    timerLabel.textContent = levelTimeLeft;

    if (levelTimeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      void finishLevel(false, false, 'Время уровня вышло!');
    }
  }, 1000);
}

function updateUI() {
  document.getElementById('score-label').textContent = score;
  document.getElementById('level-label').textContent = `Уровень: ${currentLevel}/3`;
}

// ======================================================
// ===================== АНИМАЦИЯ ========================
// ======================================================

function requestAnimation(loop) {
  cancelAnimation();
  lastTimestamp = null;

  function step(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    loop(dt);
    animationFrameId = window.requestAnimationFrame(step);
  }

  animationFrameId = window.requestAnimationFrame(step);
}

function cancelAnimation() {
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// ======================================================
// ====================== AUDIO (L3) ====================
// ======================================================
// Звуковое сопровождение для 3 уровня сделано через WebAudio API,
// без внешних файлов — так оно одинаково работает и локально, и на GitHub Pages.
// ⚠️ В большинстве браузеров звук можно запустить только после действия пользователя
// (клик/нажатие клавиши). Поэтому мы делаем «разблокировку» при первом взаимодействии.

let audioCtx = null;
let level3Audio = {
  playing: false,
  master: null,
  engineOsc: null,
  engineGain: null,
  engineFilter: null,
  beatTimer: null,
};

function ensureAudioContext() {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function startLevel3Audio() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (level3Audio.playing) {
    // на всякий случай пытаемся «разбудить» контекст
    void ctx.resume?.();
    return;
  }

  const master = ctx.createGain();
  master.gain.value = 0.32; // общая громкость
  master.connect(ctx.destination);

  // «двигатель» — низкий пилообразный тон через low-pass фильтр
  const engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 90;

  const engineGain = ctx.createGain();
  engineGain.gain.value = 0.35;

  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 420;
  engineFilter.Q.value = 0.7;

  engineOsc.connect(engineGain);
  engineGain.connect(engineFilter);
  engineFilter.connect(master);
  engineOsc.start();

  // лёгкий «бит» раз в ~0.6 сек (поддержка ощущения темпа)
  const beatTimer = window.setInterval(() => {
    if (!audioCtx || audioCtx.state === 'closed') return;
    const t = ctx.currentTime + 0.01;

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(440, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    o.connect(g);
    g.connect(master);

    o.start(t);
    o.stop(t + 0.10);
  }, 600);

  level3Audio.playing = true;
  level3Audio.master = master;
  level3Audio.engineOsc = engineOsc;
  level3Audio.engineGain = engineGain;
  level3Audio.engineFilter = engineFilter;
  level3Audio.beatTimer = beatTimer;

  // попытка «разбудить» контекст (если был suspended)
  void ctx.resume?.();
}

function updateLevel3Audio(dt) {
  if (!level3Audio.playing || !audioCtx || audioCtx.state === 'closed') return;
  // Подстраиваем звук под скорость/движение машины, чтобы было живее.
  // Скорость оцениваем грубо: по изменению позиции за кадр.
  const car = levelState?.car;
  if (!car) return;

  // запоминаем прошлую позицию прямо в объекте машины (не мешает логике)
  const prevX = car.__prevX ?? car.x;
  const prevY = car.__prevY ?? car.y;
  const dx = car.x - prevX;
  const dy = car.y - prevY;
  car.__prevX = car.x;
  car.__prevY = car.y;

  const v = Math.sqrt(dx * dx + dy * dy) / Math.max(0.016, dt); // px/s
  const speedNorm = Math.min(1, v / 600); // нормализация

  const baseFreq = 80;
  const freq = baseFreq + speedNorm * 180;
  const filterF = 280 + speedNorm * 900;
  const vol = 0.20 + speedNorm * 0.25;

  // плавные изменения (без щелчков)
  const t = audioCtx.currentTime;
  try {
    level3Audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.03);
    level3Audio.engineFilter.frequency.setTargetAtTime(filterF, t, 0.03);
    level3Audio.engineGain.gain.setTargetAtTime(vol, t, 0.03);
  } catch (e) {
    // ignore
  }
}

function stopLevel3Audio() {
  if (!level3Audio.playing) return;

  if (level3Audio.beatTimer) {
    window.clearInterval(level3Audio.beatTimer);
    level3Audio.beatTimer = null;
  }

  try { level3Audio.engineOsc?.stop(); } catch (e) {}
  try { level3Audio.engineOsc?.disconnect(); } catch (e) {}
  try { level3Audio.engineGain?.disconnect(); } catch (e) {}
  try { level3Audio.engineFilter?.disconnect(); } catch (e) {}
  try { level3Audio.master?.disconnect(); } catch (e) {}

  level3Audio.playing = false;
  level3Audio.master = null;
  level3Audio.engineOsc = null;
  level3Audio.engineGain = null;
  level3Audio.engineFilter = null;
}


// ======================================================
// ====================== УРОВЕНЬ 1 ======================
// ======================================================
//
// Новый поток раунда L1:
// 1) выбор времени (очки как раньше)
// 2) заезд стрелочками (очки по близости к теоретическому времени distance/speed)
//

function setupLevel1() {
  const gameArea = document.getElementById('game-area');
  gameArea.innerHTML = '';

  const distance = randomInt(LEVEL1_MIN_DISTANCE, LEVEL1_MAX_DISTANCE);

  // скорость целая, время 4..12
  const minSpeed = Math.ceil(distance / LEVEL1_MAX_TIME);
  const maxSpeed = Math.floor(distance / LEVEL1_MIN_TIME);
  const speed = randomInt(minSpeed, maxSpeed);

  // "правильное" время по условию задачи
  const realTime = distance / speed;

  // дорожка с шириной, зависящей от distance
  const track = document.createElement('div');
  track.className = 'track';

  const ratio = (distance - LEVEL1_MIN_DISTANCE) / (LEVEL1_MAX_DISTANCE - LEVEL1_MIN_DISTANCE);
  const trackWidth = LEVEL1_MIN_TRACK_PX + ratio * (LEVEL1_MAX_TRACK_PX - LEVEL1_MIN_TRACK_PX);
  track.style.width = `${trackWidth}px`;
  track.style.margin = '10px auto';

  const centerLine = document.createElement('div');
  centerLine.className = 'track-line';
  track.appendChild(centerLine);

  const startMark = document.createElement('div');
  startMark.className = 'track-start';
  track.appendChild(startMark);

  const endMark = document.createElement('div');
  endMark.className = 'track-end';
  track.appendChild(endMark);

  // Машинка теперь "игрок", управляется стрелками
  const car = document.createElement('div');
  car.className = 'car player shadow';
  car.textContent = 'L1';
  car.style.left = '20px';

  // границы движения по px
  const startX = 20;
  const endX = trackWidth - 20;

  // базовая скорость в px/s так, чтобы при удержании ArrowRight ~ получалось realTime
  const baseSpeedPx = ((endX - startX) / realTime) * LEVEL1_SPEED_MULT;

  levelState = {
    phase: 'choice', // 'choice' | 'drive'
    track,
    car,
    distance,
    speed,
    realTime,

    // этап выбора
    chosenTime: null,
    guessScored: false,
    guessScore: 0,

    // этап заезда
    startX,
    endX,
    baseSpeedPx,
    driveStarted: false,
    driveFinished: false,
    driveElapsed: 0,

    // клавиши (L1)
    keys: { up: false, down: false, left: false, right: false },

    // DOM
    ui: {
      infoCard: null,
      driveInfo: null,
      startDriveBtn: null,
      timeOptions: null
    }
  };

  track.appendChild(car);
  gameArea.appendChild(track);

  // ---------- карточка управления ----------
  const controlsCard = document.createElement('div');
  controlsCard.className = 'card';

  const roundInfo = document.createElement('p');
  roundInfo.className = 'level-round-info';
  roundInfo.textContent = `Раунд ${currentRound} из ${maxRoundsPerLevel}`;
  controlsCard.appendChild(roundInfo);

  const title = document.createElement('h3');
  title.textContent = 'Шаг 1 — выберите время (в секундах)';
  controlsCard.appendChild(title);

  const desc = document.createElement('p');
  desc.innerHTML = `Длина дороги: <b>${distance} м</b>, скорость машины: <b>${speed} м/с</b>`;
  controlsCard.appendChild(desc);

  const optionsContainer = document.createElement('div');
  optionsContainer.id = 'time-options';
  optionsContainer.style.display = 'flex';
  optionsContainer.style.flexWrap = 'wrap';
  optionsContainer.style.gap = '8px';
  optionsContainer.style.marginTop = '8px';
  controlsCard.appendChild(optionsContainer);

  const hint = document.createElement('p');
  hint.className = 'small';
  hint.style.marginTop = '10px';
  hint.innerHTML = 'Выберите вариант кнопкой или цифрой <b>1..5</b>. Затем сделайте <b>двойной клик</b> по кнопке <b>Начать заезд (стрелки)</b>.';
  controlsCard.appendChild(hint);

  // кнопка старта заезда
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn primary';
  startBtn.textContent = 'Начать заезд (стрелки)';
  startBtn.style.marginTop = '10px';
  startBtn.addEventListener('dblclick', () => beginDriveLevel1());
  controlsCard.appendChild(startBtn);

  // блок статуса заезда
  const driveInfo = document.createElement('div');
  driveInfo.className = 'small';
  driveInfo.style.marginTop = '10px';
  driveInfo.textContent = 'Шаг 2 появится после двойного клика по кнопке «Начать заезд (стрелки)».';
  controlsCard.appendChild(driveInfo);

  gameArea.appendChild(controlsCard);

  levelState.ui.infoCard = controlsCard;
  levelState.ui.driveInfo = driveInfo;
  levelState.ui.startDriveBtn = startBtn;
  levelState.ui.timeOptions = optionsContainer;

  // ---------- варианты времени (по возрастанию) ----------
  const base = Math.max(1, Math.round(realTime));
  const seedOptions = [base - 2, base - 1, base, base + 1, base + 2].filter(v => v > 0);
  const optionsSet = new Set(seedOptions);
  while (optionsSet.size < 5) optionsSet.add(randomInt(1, base + 6));

  // ✅ по возрастанию
  const options = Array.from(optionsSet).sort((a, b) => a - b);

  options.forEach((val) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn secondary small';
    btn.textContent = `${val} с`;

    btn.addEventListener('click', () => {
      if (levelState.phase !== 'choice') return;
      levelState.chosenTime = val;
      btn.classList.add('selected');
      [...optionsContainer.children].forEach(b => {
        if (b !== btn) b.classList.remove('selected');
      });
    });

    optionsContainer.appendChild(btn);
  });

  // клавиатура: выбор 1..5
  document.addEventListener('keydown', handleLevel1ChoiceKey);
}

// --- Выбор времени 1..5 ---
function handleLevel1ChoiceKey(e) {
  if (!levelState || levelState.phase !== 'choice') return;

  const optionsContainer = levelState.ui?.timeOptions;
  if (!optionsContainer) return;

  const btns = [...optionsContainer.querySelectorAll('button')];
  const idx = (e.key >= '1' && e.key <= '5') ? (parseInt(e.key, 10) - 1) : -1;
  if (idx >= 0 && btns[idx]) btns[idx].click();
}

// --- Начало этапа "заезд" ---
function beginDriveLevel1() {
  if (!levelState || levelState.phase !== 'choice') return;

  // 1) начисляем очки за "угадай время" (как раньше)
  const guess = levelState.chosenTime;

  let guessScore = 0;
  if (guess === null) {
    guessScore = -10;
  } else {
    const diff = Math.abs(guess - levelState.realTime);
    if (diff < 0.5) guessScore = 50;
    else if (diff < 1.0) guessScore = 30;
    else if (diff < 2.0) guessScore = 10;
    else guessScore = -10;
  }

  levelState.guessScore = guessScore;
  levelState.guessScored = true;
  addScore(guessScore);

  // 2) переключаем фазу
  levelState.phase = 'drive';

  // фиксируем UI выбора
  if (levelState.ui?.startDriveBtn) levelState.ui.startDriveBtn.disabled = true;
  if (levelState.ui?.timeOptions) {
    [...levelState.ui.timeOptions.querySelectorAll('button')].forEach(b => b.disabled = true);
  }
  document.removeEventListener('keydown', handleLevel1ChoiceKey);

  // подготавливаем этап заезда
  levelState.driveStarted = false;
  levelState.driveFinished = false;
  levelState.driveElapsed = 0;

  // ставим машинку на старт
  levelState.car.style.left = `${levelState.startX}px`;

  // подсказка
  const chosenText = (guess === null) ? 'не выбрано' : `${guess} c`;
  levelState.ui.driveInfo.textContent =
    `Шаг 2 — проедьте трассу стрелками: ` +
    `цель (теория) ≈ ${levelState.realTime.toFixed(2)} c, ваш выбор: ${chosenText}. ` +
    `Текущее время заезда: 0.00 c. (Старт — как только начнёте движение)`;

  // навешиваем управление
  document.addEventListener('keydown', handleLevel1DriveKeyDown);
  document.addEventListener('keyup', handleLevel1DriveKeyUp);

  // запускаем анимационный цикл заезда
  requestAnimation((dt) => tickDriveLevel1(dt));
}

function handleLevel1DriveKeyDown(e) {
  if (!levelState || levelState.phase !== 'drive') return;

  if (e.key === 'ArrowUp') { levelState.keys.up = true; e.preventDefault(); }
  if (e.key === 'ArrowDown') { levelState.keys.down = true; e.preventDefault(); }
  if (e.key === 'ArrowLeft') { levelState.keys.left = true; e.preventDefault(); }
  if (e.key === 'ArrowRight') { levelState.keys.right = true; e.preventDefault(); }
}

function handleLevel1DriveKeyUp(e) {
  if (!levelState || levelState.phase !== 'drive') return;

  if (e.key === 'ArrowUp') { levelState.keys.up = false; e.preventDefault(); }
  if (e.key === 'ArrowDown') { levelState.keys.down = false; e.preventDefault(); }
  if (e.key === 'ArrowLeft') { levelState.keys.left = false; e.preventDefault(); }
  if (e.key === 'ArrowRight') { levelState.keys.right = false; e.preventDefault(); }
}

function tickDriveLevel1(dt) {
  if (!levelState || levelState.phase !== 'drive') return;
  if (levelState.driveFinished) return;

  const { keys, car, startX, endX, baseSpeedPx } = levelState;

  // старт гонки — когда впервые нажали движение (лево/право)
  const wantsMove = keys.left || keys.right;
  if (wantsMove && !levelState.driveStarted) {
    levelState.driveStarted = true;
    levelState.driveElapsed = 0;
  }

  // если стартовали — время идёт всегда до финиша (включая остановки)
  if (levelState.driveStarted) {
    levelState.driveElapsed += dt;
  }

  // множитель скорости по Up/Down
  let factor = 1.0;
  if (keys.up) factor += LEVEL1_ACCEL_BONUS;
  if (keys.down) factor -= LEVEL1_BRAKE_PENALTY;
  factor = Math.max(0.25, Math.min(1.6, factor));

  // движение (если стрелки не нажаты — машина стоит, но время может идти)
  let vx = 0;
  if (keys.right) vx += baseSpeedPx * factor;
  if (keys.left) vx -= baseSpeedPx * LEVEL1_BACKWARD_RATIO * factor;

  // текущая позиция (px)
  const currentX = parseFloat(car.style.left || `${startX}`) || startX;
  let nextX = currentX + vx * dt;

  // clamp
  if (nextX < startX) nextX = startX;
  if (nextX > endX) nextX = endX;

  car.style.left = `${nextX}px`;

  // UI таймера заезда
  if (levelState.ui?.driveInfo) {
    const guess = (levelState.chosenTime === null) ? 'не выбрано' : `${levelState.chosenTime} c`;
    const t = levelState.driveStarted ? levelState.driveElapsed : 0;
    levelState.ui.driveInfo.textContent =
      `Шаг 2 — проедьте трассу стрелками: ` +
      `цель (теория) ≈ ${levelState.realTime.toFixed(2)} c, ваш выбор: ${guess}. ` +
      `Текущее время заезда: ${t.toFixed(2)} c.`;
  }

  // финиш
  if (nextX >= endX) {
    levelState.driveFinished = true;
    cancelAnimation();
    void finishRoundLevel1();
  }
}

async function finishRoundLevel1() {
  // снять обработчики
  document.removeEventListener('keydown', handleLevel1DriveKeyDown);
  document.removeEventListener('keyup', handleLevel1DriveKeyUp);

  const tDrive = levelState.driveStarted ? levelState.driveElapsed : 0;
  const tTarget = levelState.realTime;

  // очки за заезд (по близости к теоретическому времени)
  const diff = Math.abs(tDrive - tTarget);
  let driveScore = 0;
  if (diff < 0.5) driveScore = 50;
  else if (diff < 1.0) driveScore = 30;
  else if (diff < 2.0) driveScore = 10;
  else driveScore = -10;

  addScore(driveScore);

  const guess = levelState.chosenTime;
  const guessText = (guess === null) ? 'не выбрано' : `${guess} c`;

  await showAlert(
    `Раунд завершён!\n\n` +
    `Шаг 1 (выбор времени):\n` +
    `  Теория ≈ ${tTarget.toFixed(2)} c\n` +
    `  Ваш выбор: ${guessText}\n` +
    `  Очки: ${levelState.guessScore}\n\n` +
    `Шаг 2 (заезд стрелками):\n` +
    `  Ваше время: ${tDrive.toFixed(2)} c\n` +
    `  Разница: ${diff.toFixed(2)} c\n` +
    `  Очки: ${driveScore}\n\n` +
    `Итого за раунд: ${levelState.guessScore + driveScore} очков.`,
    'Уровень 1 — результат'
  );

  nextRoundOrFinish();
}

// ======================================================
// ====================== УРОВЕНЬ 2 ======================
// ======================================================
//
// Требования:
// - целевые времена = целые секунды
// - трасса длиннее и ВИДИМАЯ (не узкая)
// - горячие клавиши разные: 1 для первой, 2 для второй
// - не зависать, если машина доехала до конца сама
//

function setupLevel2() {
  const gameArea = document.getElementById('game-area');
  gameArea.innerHTML = '';

  // ✅ целые секунды + гарантируем, что времена разные
  let targetTime1 = randomInt(4, 9);
  let targetTime2 = randomInt(4, 9);
  while (targetTime2 === targetTime1) {
    targetTime2 = randomInt(4, 9);
  }

  // ✅ надёжная ширина (clientWidth иногда может быть 0 при перерисовке)
  const areaW = Math.floor(gameArea.getBoundingClientRect().width || 0);
  const safeAreaW = areaW > 200 ? areaW : 920;
  const trackW = Math.max(760, Math.min(980, safeAreaW - 30));

  levelState = {
    targetTimes: [targetTime1, targetTime2],
    cars: [],
    evaluated: false,
    gameAreaWidth: trackW
  };

  const infoCard = document.createElement('div');
  infoCard.className = 'card';
  infoCard.innerHTML = `
    <p class="level-round-info">Раунд ${currentRound} из ${maxRoundsPerLevel}</p>
    <h3>Цель раунда</h3>
    <p>Остановите каждую машину как можно ближе к её времени:</p>
    <ul class="small" style="margin-left:18px; margin-top:6px;">
      <li><b>Машина 1:</b> ${targetTime1} с (клавиша <b>1</b>)</li>
      <li><b>Машина 2:</b> ${targetTime2} с (клавиша <b>2</b>)</li>
    </ul>
    <p class="small">
      Горячие клавиши: <b>1</b> — остановить Машину 1, <b>2</b> — остановить Машину 2.
      Также можно кликнуть по машине.
    </p>
  `;
  gameArea.appendChild(infoCard);

  for (let i = 0; i < 2; i++) {
    const track = document.createElement('div');
    track.className = 'track';

    // ✅ шире + толще, чтобы дорогу было видно
    track.style.width = `${levelState.gameAreaWidth}px`;
    track.style.margin = '14px auto';
    track.style.height = '110px';
    track.style.borderRadius = '55px';

    const line = document.createElement('div');
    line.className = 'track-line';
    // ✅ центральная линия толще
    line.style.height = '7px';
    track.appendChild(line);

    const startMark = document.createElement('div');
    startMark.className = 'track-start';
    track.appendChild(startMark);

    const endMark = document.createElement('div');
    endMark.className = 'track-end';
    track.appendChild(endMark);

    const car = document.createElement('div');
    car.className = 'car auto';
    car.textContent = `L2-${i + 1}`;
    car.style.left = '3%';
    car.classList.add('moving');

    // ✅ Делаем “заезд” дольше: увеличим дистанцию и время до финиша
    const distance = randomInt(900, 1400);
    const targetTime = levelState.targetTimes[i];

    // k > 2 => машинка едет дольше, чем целевое время (успеваешь нажать кнопку)
    const k = randomFloat(2.4, 3.2);
    const speed = distance / (targetTime * k);

    const carState = {
      track,
      car,
      targetTime,
      speed,
      distance,
      elapsed: 0,
      moving: true,
      stoppedTime: null,
      progress: 0
    };

    car.addEventListener('click', () => stopCarLevel2(carState));

    track.appendChild(car);
    gameArea.appendChild(track);
    levelState.cars.push(carState);
  }

  requestAnimation((dt) => {
    levelState.cars.forEach(cs => {
      if (!cs.moving) return;

      cs.elapsed += dt;

      const timeToFinish = cs.distance / cs.speed;
      cs.progress = Math.min(cs.elapsed / timeToFinish, 1);

      const pos = 3 + cs.progress * 94;
      cs.car.style.left = pos + '%';

      // ✅ если доехала до конца — считаем, что остановилась
      if (cs.progress >= 1 && cs.moving) {
        cs.moving = false;
        cs.stoppedTime = cs.elapsed;
        cs.car.classList.remove('moving');
        cs.car.classList.add('shadow');
      }
    });

    if (!levelState.evaluated && levelState.cars.every(c => !c.moving)) {
      levelState.evaluated = true;
      document.removeEventListener('keydown', handleLevel2Key);

      cancelAnimation();
      void evaluateRoundLevel2();
    }
  });

  document.addEventListener('keydown', handleLevel2Key);
}

function handleLevel2Key(e) {
  if (!levelState || !levelState.cars) return;

  if (e.key === '1') {
    e.preventDefault();
    const cs1 = levelState.cars[0];
    if (cs1) stopCarLevel2(cs1);
  }

  if (e.key === '2') {
    e.preventDefault();
    const cs2 = levelState.cars[1];
    if (cs2) stopCarLevel2(cs2);
  }
}

function stopCarLevel2(carState) {
  if (!carState.moving) return;

  carState.moving = false;
  carState.car.classList.remove('moving');
  carState.stoppedTime = carState.elapsed;
  carState.car.classList.add('shadow');

  if (!levelState.evaluated && levelState.cars.every(c => !c.moving)) {
    levelState.evaluated = true;
    document.removeEventListener('keydown', handleLevel2Key);

    cancelAnimation();
    void evaluateRoundLevel2();
  }
}

async function evaluateRoundLevel2() {
  let totalGained = 0;
  let msg =
    `Цели:\n` +
    `Машина 1: ${levelState.targetTimes[0]} с\n` +
    `Машина 2: ${levelState.targetTimes[1]} с\n\n`;

  levelState.cars.forEach((cs, idx) => {
    const target = cs.targetTime;
    const t = cs.stoppedTime ?? cs.elapsed;
    const diff = Math.abs(t - target);

    let gained = 0;
    if (diff < 0.3) gained = 60;
    else if (diff < 0.7) gained = 40;
    else if (diff < 1.2) gained = 15;
    else gained = -10;

    totalGained += gained;

    msg +=
      `Машина ${idx + 1}: остановка ${t.toFixed(2)} с ` +
      `(разница ${diff.toFixed(2)} с), очки: ${gained}\n`;

    if (gained < 0) shake(cs.car);
  });

  addScore(totalGained);

  await showAlert(msg + `\nИтого за раунд: ${totalGained} очков.`, 'Раунд завершён');
  nextRoundOrFinish();
}

// ======================================================
// ====================== УРОВЕНЬ 3 ======================
// ======================================================
//
// Требования:
// - всё должно влезать на 15" (без скролла)
// - убрать лишний текст внутри поля, поднять всё выше
// - машинка ярко-красная и КВАДРАТНАЯ
//

function getCarRadius(car) {
  if (typeof car.size === 'number') return car.size / 2;
  return car.r ?? 9;
}

function setupLevel3() {
  const gameArea = document.getElementById('game-area');
  gameArea.innerHTML = '';

  // ✅ Canvas занимает максимум места, без доп. карточек внутри game-area
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.margin = '6px auto 0';
  canvas.style.borderRadius = '12px';
  canvas.style.background = 'rgba(0,0,0,0.25)';

  gameArea.appendChild(canvas);

  // 🔊 L3 звук: пробуем включить сразу (если вход на уровень был по клику),
  // а если браузер заблокировал автозапуск — включим при первом действии пользователя.
  let l3AudioUnlocked = false;
  const unlockL3Audio = () => {
    if (l3AudioUnlocked) return;
    l3AudioUnlocked = true;
    startLevel3Audio();
    canvas.removeEventListener('mousedown', unlockL3Audio);
    canvas.removeEventListener('touchstart', unlockL3Audio);
    document.removeEventListener('keydown', unlockL3Audio);
  };

  // попытка автозапуска
  try { unlockL3Audio(); } catch (e) {}

  // fallback: первый клик/тап по полю или любая клавиша
  canvas.addEventListener('mousedown', unlockL3Audio);
  canvas.addEventListener('touchstart', unlockL3Audio, { passive: true });
  document.addEventListener('keydown', unlockL3Audio, { once: true });

  // --- Размеры canvas так, чтобы влезало на 15" ---
  const headerH = document.querySelector('.top-bar')?.getBoundingClientRect().height || 0;
  const instructionsH = document.getElementById('instructions')?.getBoundingClientRect().height || 0;
  const footerH = document.querySelector('.game-footer')?.getBoundingClientRect().height || 0;

  // ширина по контейнеру
  const areaW = Math.floor(gameArea.getBoundingClientRect().width || 0);
  const safeW = areaW > 200 ? areaW : 920;
  const canvasW = Math.max(680, Math.min(920, safeW - 16));

  // высота — остаток экрана (минус хедер/инструкции/футер и небольшие зазоры)
  const gaps = 26; // общий зазор между блоками
  const availableH = Math.floor(window.innerHeight - headerH - instructionsH - footerH - gaps);

  // canvasH — максимально возможная, но с нижним/верхним пределом
  const canvasH = Math.max(300, Math.min(520, availableH));

  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const baseR = Math.min(canvas.width, canvas.height) * 0.33;
  const roadWidth = 46;

  const points = generateRandomClosedCurve(cx, cy, baseR, 1.15, 240, canvas.width, canvas.height);
  const startPoint = points[0];

  // ✅ машинка: ярко-красный квадрат
  const car = { x: startPoint.x, y: startPoint.y, size: 18 };

  levelState = {
    canvas,
    ctx,
    cx, cy,
    roadWidth,
    points,
    car,
    startPoint,
    time: 0,
    dragging: false,
    leftStart: false,
    finished: false,

    obstacles: [],
    nextObstacleIn: randomFloat(LEVEL3_OBSTACLE_SPAWN_MIN, LEVEL3_OBSTACLE_SPAWN_MAX)
  };

  for (let i = 0; i < 3; i++) spawnObstacleLevel3();

  canvas.addEventListener('mousedown', handleLevel3MouseDown);
  canvas.addEventListener('mousemove', handleLevel3MouseMove);
  canvas.addEventListener('mouseup', handleLevel3MouseUp);
  canvas.addEventListener('mouseleave', handleLevel3MouseUp);
  document.addEventListener('mouseup', handleLevel3MouseUp);

  document.addEventListener('keydown', handleLevel3KeyDown);
  document.addEventListener('keyup', handleLevel3KeyUp);

  renderLevel3();

  requestAnimation((dt) => {
    if (levelState.finished) return;

    // 🔊 обновляем звук под текущую скорость/движение
    updateLevel3Audio(dt);

    levelState.time += dt;

    updateObstaclesLevel3(dt);

    const prevX = levelState.car.x;
    const prevY = levelState.car.y;

    applyKeyboardMoveLevel3(dt);

    if (isCarTouchingObstacles(levelState.car, levelState.obstacles)) {
      levelState.car.x = prevX;
      levelState.car.y = prevY;
      void failRoundLevel3('Вы врезались в препятствие!');
      return;
    }

    if (!isCarOnRoad(levelState.car, levelState.points, levelState.roadWidth)) {
      void failRoundLevel3('Вы съехали с дороги!');
      return;
    }

    if (!levelState.leftStart) {
      const ds = dist(levelState.car.x, levelState.car.y, levelState.startPoint.x, levelState.startPoint.y);
      if (ds > levelState.roadWidth * 1.7) levelState.leftStart = true;
    }

    if (levelState.leftStart) {
      const ds = dist(levelState.car.x, levelState.car.y, levelState.startPoint.x, levelState.startPoint.y);
      if (ds <= levelState.roadWidth * 0.45) {
        void finishRoundLevel3();
        return;
      }
    }

    renderLevel3();
  });
}

function renderLevel3() {
  const { ctx, canvas, points, roadWidth, car, startPoint, time, obstacles } = levelState;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawRoad(ctx, points, roadWidth);
  drawObstaclesLevel3(ctx, obstacles, time);

  // стартовая метка
  ctx.save();
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(startPoint.x, startPoint.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ✅ машинка: ярко-красный квадрат
  ctx.save();
  ctx.fillStyle = '#ff0000';
  const half = car.size / 2;
  ctx.fillRect(car.x - half, car.y - half, car.size, car.size);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(car.x - half, car.y - half, car.size, car.size);
  ctx.restore();

  ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';

    // ✅ короче плашка: было 260 → стало 170
    ctx.fillRect(12, 12, 170, 32);

    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui';

    // ✅ короче текст: "Время:" вместо "Время круга:"
    ctx.fillText(`Время: ${time.toFixed(2)} c`, 20, 34);

    ctx.restore();

}

function updateObstaclesLevel3(dt) {
  for (let i = levelState.obstacles.length - 1; i >= 0; i--) {
    levelState.obstacles[i].ttl -= dt;
    if (levelState.obstacles[i].ttl <= 0) {
      levelState.obstacles.splice(i, 1);
    }
  }

  levelState.nextObstacleIn -= dt;

  if (levelState.nextObstacleIn <= 0 && levelState.obstacles.length < LEVEL3_MAX_OBSTACLES) {
    const toSpawn = Math.random() < 0.35 ? 2 : 1;
    for (let k = 0; k < toSpawn; k++) spawnObstacleLevel3();
    levelState.nextObstacleIn = randomFloat(LEVEL3_OBSTACLE_SPAWN_MIN, LEVEL3_OBSTACLE_SPAWN_MAX);
  }
}

function spawnObstacleLevel3() {
  const points = levelState.points;
  const n = points.length;

  for (let attempt = 0; attempt < 50; attempt++) {
    const idx = randomInt(0, n - 1);

    const nearStart = idx < 28 || idx > n - 28;
    if (nearStart) continue;

    const p = points[idx];

    if (dist(p.x, p.y, levelState.car.x, levelState.car.y) < 130) continue;

    let ok = true;
    for (const ob of levelState.obstacles) {
      const c = getObstacleCenter(ob);
      if (dist(c.x, c.y, p.x, p.y) < 110) { ok = false; break; }
    }
    if (!ok) continue;

    const pPrev = points[(idx - 1 + n) % n];
    const pNext = points[(idx + 1) % n];
    const tx = pNext.x - pPrev.x;
    const ty = pNext.y - pPrev.y;
    const ang = Math.atan2(ty, tx);

    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);

    const halfLen = levelState.roadWidth / 2 + 16;

    const ax = p.x - nx * halfLen;
    const ay = p.y - ny * halfLen;
    const bx = p.x + nx * halfLen;
    const by = p.y + ny * halfLen;

    const ttl = randomFloat(LEVEL3_OBSTACLE_MIN_TTL, LEVEL3_OBSTACLE_MAX_TTL);

    levelState.obstacles.push({
      ax, ay, bx, by,
      thickness: LEVEL3_OBSTACLE_THICKNESS,
      ttl,
      ttlMax: ttl,
      phase: randomFloat(0, Math.PI * 2),
      wobble: randomFloat(0.03, 0.08)
    });

    return;
  }
}

function drawObstaclesLevel3(ctx, obstacles, nowTime) {
  for (const ob of obstacles) {
    const cx = (ob.ax + ob.bx) / 2;
    const cy = (ob.ay + ob.by) / 2;

    const baseAngle = Math.atan2(ob.by - ob.ay, ob.bx - ob.ax);
    const angle = baseAngle + ob.wobble * Math.sin(nowTime * 6 + ob.phase);

    const len = dist(ob.ax, ob.ay, ob.bx, ob.by);

    const pulse = 1 + 0.18 * Math.sin(nowTime * 7 + ob.phase);
    const thick = ob.thickness * pulse;

    const fade = Math.min(1, ob.ttl / 0.4);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.globalAlpha = 0.35 * fade;
    ctx.fillStyle = 'rgba(255, 87, 34, 1)';
    ctx.fillRect(-len / 2, -thick / 2 - 6, len, thick + 12);

    ctx.globalAlpha = 0.92 * fade;
    ctx.fillStyle = 'rgba(255, 87, 34, 1)';
    ctx.fillRect(-len / 2, -thick / 2, len, thick);

    ctx.globalAlpha = 0.55 * fade;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-len / 2, -thick / 2, len, thick);

    ctx.globalAlpha = 1.0 * fade;
    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(ob.ttl)}`, 0, 0);

    const ratio = Math.max(0, Math.min(1, ob.ttl / ob.ttlMax));
    ctx.globalAlpha = 0.95 * fade;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-20, thick / 2 + 6, 40, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(-20, thick / 2 + 6, 40 * ratio, 6);

    ctx.restore();
  }
}

function isCarTouchingObstacles(car, obstacles) {
  const nowTime = levelState.time || 0;
  const r = getCarRadius(car);

  for (const ob of obstacles) {
    const pulse = 1 + 0.18 * Math.sin(nowTime * 7 + ob.phase);
    const thick = ob.thickness * pulse;

    const d2 = distPointToSegmentSquared(car.x, car.y, ob.ax, ob.ay, ob.bx, ob.by);
    const d = Math.sqrt(d2);

    if (d <= (r + thick / 2)) return true;
  }
  return false;
}

function getObstacleCenter(ob) {
  return { x: (ob.ax + ob.bx) / 2, y: (ob.ay + ob.by) / 2 };
}

// --- мышь ---
function handleLevel3MouseDown(e) {
  if (!levelState || !levelState.canvas) return;
  levelState.dragging = true;
  moveCarToMouse(e);
}

function handleLevel3MouseMove(e) {
  if (!levelState || !levelState.dragging) return;
  moveCarToMouse(e);
}

function handleLevel3MouseUp() {
  if (!levelState) return;
  levelState.dragging = false;
}

function moveCarToMouse(e) {
  const rect = levelState.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const prevX = levelState.car.x;
  const prevY = levelState.car.y;

  levelState.car.x = mx;
  levelState.car.y = my;

  if (isCarTouchingObstacles(levelState.car, levelState.obstacles)) {
    levelState.car.x = prevX;
    levelState.car.y = prevY;
    void failRoundLevel3('Вы врезались в препятствие!');
    return;
  }
}

// --- клавиши ---
function handleLevel3KeyDown(e) {
  if (e.key === 'ArrowUp') level3Keys.up = true;
  if (e.key === 'ArrowDown') level3Keys.down = true;
  if (e.key === 'ArrowLeft') level3Keys.left = true;
  if (e.key === 'ArrowRight') level3Keys.right = true;
}

function handleLevel3KeyUp(e) {
  if (e.key === 'ArrowUp') level3Keys.up = false;
  if (e.key === 'ArrowDown') level3Keys.down = false;
  if (e.key === 'ArrowLeft') level3Keys.left = false;
  if (e.key === 'ArrowRight') level3Keys.right = false;
}

function applyKeyboardMoveLevel3(dt) {
  if (!levelState || !levelState.car) return;
  if (levelState.dragging) return;

  let vx = 0, vy = 0;
  if (level3Keys.up) vy -= 1;
  if (level3Keys.down) vy += 1;
  if (level3Keys.left) vx -= 1;
  if (level3Keys.right) vx += 1;

  if (vx === 0 && vy === 0) return;

  const len = Math.sqrt(vx * vx + vy * vy);
  vx /= len;
  vy /= len;

  levelState.car.x += vx * LEVEL3_MOVE_SPEED * dt;
  levelState.car.y += vy * LEVEL3_MOVE_SPEED * dt;
}

async function finishRoundLevel3() {
  levelState.finished = true;
  cancelAnimation();
  stopLevel3Audio();

  const t = levelState.time;
  let gained = Math.round(LEVEL3_BASE_SCORE - t * 12);
  if (gained < 20) gained = 20;

  addScore(gained);
  await showAlert(
    `✅ Круг пройден!\nВремя: ${t.toFixed(2)} сек\nОчки: +${gained}\n\nНачинается следующий раунд.`,
    'Уровень 3'
  );
  nextRoundOrFinish();
}

async function failRoundLevel3(reasonText) {
  if (levelState.finished) return;

  levelState.finished = true;
  cancelAnimation();
  stopLevel3Audio();

  addScore(LEVEL3_FAIL_PENALTY);
  await showAlert(
    `❌ ${reasonText}\nШтраф: ${LEVEL3_FAIL_PENALTY}\n\nНачинается следующий раунд.`,
    'Уровень 3'
  );
  nextRoundOrFinish();
}

// --- Рисование дороги ---
function drawRoad(ctx, points, roadWidth) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();

  ctx.strokeStyle = 'rgba(76, 175, 80, 0.45)';
  ctx.lineWidth = roadWidth;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.lineWidth = roadWidth + 10;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255, 235, 59, 0.55)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
}

// --- Коллизии: расстояние до замкнутой полилинии ---
function isCarOnRoad(car, points, roadWidth) {
  const d = distancePointToClosedPolyline(car.x, car.y, points);
  const r = getCarRadius(car);
  return d <= (roadWidth / 2 - r * 0.15);
}

function distancePointToClosedPolyline(px, py, points) {
  let minD2 = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d2 = distPointToSegmentSquared(px, py, a.x, a.y, b.x, b.y);
    if (d2 < minD2) minD2 = d2;
  }
  return Math.sqrt(minD2);
}

function distPointToSegmentSquared(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLen2 = abx * abx + aby * aby;
  let t = 0;
  if (abLen2 > 0) t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;

  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function generateRandomClosedCurve(cx, cy, baseR, wildness = 1.0, samples = 140, cw = 900, ch = 520) {
  const ctrlCount = randomInt(9, 15);

  const sx = randomFloat(0.65, 1.6);
  const sy = randomFloat(0.65, 1.6);
  const shx = randomFloat(-0.50, 0.50);
  const shy = randomFloat(-0.50, 0.50);

  const ox = randomFloat(-baseR * 0.22, baseR * 0.22);
  const oy = randomFloat(-baseR * 0.22, baseR * 0.22);

  const ctrl = [];
  for (let i = 0; i < ctrlCount; i++) {
    const baseA = (i / ctrlCount) * Math.PI * 2;
    const a = baseA + randomFloat(-1, 1) * (Math.PI * 2 / ctrlCount) * 0.65;
    const r = baseR * (0.45 + Math.random() * (1.25 * wildness));

    let x = r * Math.cos(a);
    let y = r * Math.sin(a);

    const wx = x * sx + y * shx + ox;
    const wy = y * sy + x * shy + oy;

    ctrl.push({ x: wx, y: wy });
  }

  const pts = [];
  const perSeg = Math.max(10, Math.floor(samples / ctrlCount));

  for (let i = 0; i < ctrlCount; i++) {
    const p0 = ctrl[(i - 1 + ctrlCount) % ctrlCount];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % ctrlCount];
    const p3 = ctrl[(i + 2) % ctrlCount];

    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg;
      const p = catmullRom(p0, p1, p2, p3, t);
      pts.push(p);
    }
  }

  const margin = 34;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;

  const scale = Math.min((cw - 2 * margin) / width, (ch - 2 * margin) / height);

  const out = pts.map(p => ({
    x: cx + (p.x - (minX + width / 2)) * scale,
    y: cy + (p.y - (minY + height / 2)) * scale
  }));

  return out;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: 0.5 * (
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    y: 0.5 * (
      2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    )
  };
}

// ======================================================
// ======================= ОБЩЕЕ =========================
// ======================================================

function nextRoundOrFinish() {
  currentRound++;
  if (currentRound <= maxRoundsPerLevel) {
    document.getElementById('round-label').textContent = `Раунд: ${currentRound}/${maxRoundsPerLevel}`;
    startLevel();
  } else {
    void finishLevel(true, false);
  }
}

async function finishLevel(completed, earlyExit = false, reason = '') {
  cancelAnimation();
  stopLevel3Audio();
  clearInterval(timerInterval);
  timerInterval = null;

  // снимаем слушатели
  document.removeEventListener('keydown', handleLevel1ChoiceKey);
  document.removeEventListener('keydown', handleLevel1DriveKeyDown);
  document.removeEventListener('keyup', handleLevel1DriveKeyUp);

  document.removeEventListener('keydown', handleLevel2Key);

  document.removeEventListener('keydown', handleLevel3KeyDown);
  document.removeEventListener('keyup', handleLevel3KeyUp);

  if (levelState?.canvas) {
    levelState.canvas.removeEventListener('mousedown', handleLevel3MouseDown);
    levelState.canvas.removeEventListener('mousemove', handleLevel3MouseMove);
    levelState.canvas.removeEventListener('mouseup', handleLevel3MouseUp);
    levelState.canvas.removeEventListener('mouseleave', handleLevel3MouseUp);
  }
  document.removeEventListener('mouseup', handleLevel3MouseUp);

  document.getElementById('btn-end-level').disabled = true;

  let baseMsg = `Уровень ${currentLevel} завершён. `;
  const success = completed && !earlyExit;

  if (!completed) {
    baseMsg = `Уровень ${currentLevel} не пройден. `;
    addScore(-20);
  }
  if (earlyExit) {
    baseMsg += 'Вы завершили его досрочно. ';
    addScore(-15);
  }
  if (reason) baseMsg += `Причина: ${reason} `;

  updateUI();

  const nextBtn = document.getElementById('btn-next-level');
  const restartBtn = document.getElementById('btn-restart-level');

  if (currentLevel === 3) {
    await endGame();
    return;
  }

  if (success) {
    baseMsg += '\nВы можете перейти к следующему уровню.';
    nextBtn.disabled = false;
  } else {
    baseMsg += '\nЧтобы перейти дальше, повторите уровень.';
    nextBtn.disabled = true;
  }
  restartBtn.disabled = false;

  await showAlert(baseMsg, 'Уровень завершён');
}

async function endGame() {
  const name = getCurrentPlayerName();
  const result = {
    name,
    totalScore: score,
    date: new Date().toLocaleString()
  };
  saveGameResult(result);
  await showAlert(`Игра завершена!\nВаши итоговые очки: ${score}.\nРезультат сохранён в рейтинг.`, 'Игра завершена');
  goTo('rating.html');
}

function addScore(delta) {
  score += delta;
  if (score < 0) score = 0;
  updateUI();
}

function shake(element) {
  element.classList.add('shake');
  setTimeout(() => element.classList.remove('shake'), 300);
}

function randomInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function randomFloat(a, b) {
  return Math.random() * (b - a) + a;
}

function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
