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

// --- Параметры уровня 1 ---
const LEVEL1_MIN_DISTANCE = 50;
const LEVEL1_MAX_DISTANCE = 150;

const LEVEL1_MIN_TIME = 4;   // сек
const LEVEL1_MAX_TIME = 12;  // сек

// ширина дорожки (px) в зависимости от distance
const LEVEL1_MIN_TRACK_PX = 420;
const LEVEL1_MAX_TRACK_PX = 860;

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
    const playerName = getCurrentPlayerName();
    if (!playerName) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('player-label').textContent = `Игрок: ${playerName}`;

    document.getElementById('btn-exit').addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите выйти? Прогресс текущей игры будет потерян.')) {
            resetCurrentGameState();
            window.location.href = 'index.html';
        }
    });

    document.getElementById('btn-end-level').addEventListener('click', () => {
        if (confirm('Завершить уровень досрочно? Очки за него будут меньше.')) {
            finishLevel(false, true);
        }
    });

    document.getElementById('btn-next-level').addEventListener('click', () => {
        if (currentLevel < 3) {
            currentLevel++;
            currentRound = 1;
            startLevel();
        }
    });

    document.getElementById('btn-restart-level').addEventListener('click', () => {
        currentRound = 1;
        startLevel();
    });

    startLevel();
});

function startLevel() {
    cancelAnimation();
    clearInterval(timerInterval);
    timerInterval = null;

    // чистим обработчики
    document.removeEventListener('keydown', handleLevel1Key);
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

    // сброс клавиш
    level3Keys.up = level3Keys.down = level3Keys.left = level3Keys.right = false;

    levelScore = 0;
    updateUI();

    const titleEl = document.getElementById('level-title');
    const descEl = document.getElementById('level-description');
    const nextBtn = document.getElementById('btn-next-level');
    nextBtn.disabled = true;

    document.getElementById('round-label').textContent = `Раунд: ${currentRound}/${maxRoundsPerLevel}`;
    document.getElementById('btn-end-level').disabled = false;

    // Ограничение по времени и “ускорение” на уровнях
    if (currentLevel === 1) levelTimeLeft = 60;
    if (currentLevel === 2) levelTimeLeft = 50;
    if (currentLevel === 3) levelTimeLeft = 40;

    startTimer();

    if (currentLevel === 1) {
        titleEl.textContent = 'Уровень 1 — Скорость и время';
        descEl.textContent = 'Дважды щёлкните по машине, чтобы она поехала. Выберите время движения (в секундах), чтобы попасть как можно точнее в реальное время заезда.';
        setupLevel1();
    } else if (currentLevel === 2) {
        titleEl.textContent = 'Уровень 2 — Останови две машины';
        descEl.textContent = 'Две машины едут по дороге. Ваша задача — остановить каждую как можно ближе к заданному времени (пробел или клик по машине).';
        setupLevel2();
    } else if (currentLevel === 3) {
        titleEl.textContent = 'Уровень 3 — Один круг по трассе + препятствия';
        descEl.textContent = 'Управляйте машинкой мышью (перетаскивание) или стрелками. Проедьте 1 круг как можно быстрее и не съезжайте с дороги. Препятствия перекрывают дорогу и исчезают по таймеру.';
        setupLevel3();
    }
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
            finishLevel(false, false, 'Время уровня вышло!');
        }
    }, 1000);
}

function updateUI() {
    document.getElementById('score-label').textContent = score;
    document.getElementById('level-label').textContent = `Уровень: ${currentLevel}/3`;
}

// ---------- Анимация ----------

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

// ---------- Уровень 1 ----------

function setupLevel1() {
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '';

    const distance = randomInt(LEVEL1_MIN_DISTANCE, LEVEL1_MAX_DISTANCE);

    // скорость целая, время 4..12
    const minSpeed = Math.ceil(distance / LEVEL1_MAX_TIME);
    const maxSpeed = Math.floor(distance / LEVEL1_MIN_TIME);
    const speed = randomInt(minSpeed, maxSpeed);
    const realTime = distance / speed;

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

    const car = document.createElement('div');
    car.className = 'car auto shadow';
    car.textContent = 'L1';
    car.style.left = '20px';

    levelState = {
        track,
        car,
        progress: 0,
        isMoving: false,
        distance,
        speed,
        chosenTime: null,
        realTime,
        elapsed: 0
    };

    car.addEventListener('dblclick', () => {
        if (!levelState.isMoving) startCarLevel1();
    });

    car.addEventListener('mouseenter', () => {
        car.title = 'Дважды щёлкните, чтобы начать движение';
    });

    track.appendChild(car);
    gameArea.appendChild(track);

    const controlsCard = document.createElement('div');
    controlsCard.className = 'card';

    const roundInfo = document.createElement('p');
    roundInfo.className = 'level-round-info';
    roundInfo.textContent = `Раунд ${currentRound} из ${maxRoundsPerLevel}`;
    controlsCard.appendChild(roundInfo);

    const title = document.createElement('h3');
    title.textContent = 'Выберите время движения (в секундах)';
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
    hint.innerHTML = 'Выберите вариант <b>до</b> или <b>во время</b> движения. Выбор подсветится.';
    controlsCard.appendChild(hint);

    const base = Math.max(1, Math.round(realTime));
    const seedOptions = [base - 2, base - 1, base, base + 1, base + 2].filter(v => v > 0);
    const optionsSet = new Set(seedOptions);
    while (optionsSet.size < 5) optionsSet.add(randomInt(1, base + 6));
    const options = shuffleArray(Array.from(optionsSet));

    options.forEach(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn secondary small';
        btn.textContent = `${val} с`;

        btn.addEventListener('click', () => {
            levelState.chosenTime = val;
            btn.classList.add('selected');
            [...optionsContainer.children].forEach(b => {
                if (b !== btn) b.classList.remove('selected');
            });
        });

        optionsContainer.appendChild(btn);
    });

    gameArea.appendChild(controlsCard);

    document.addEventListener('keydown', handleLevel1Key);
}

function handleLevel1Key(e) {
    const optionsContainer = document.querySelector('#time-options');
    if (!optionsContainer) return;
    const btns = [...optionsContainer.querySelectorAll('button')];

    const idx = (e.key >= '1' && e.key <= '5') ? (parseInt(e.key, 10) - 1) : -1;
    if (idx >= 0 && btns[idx]) btns[idx].click();
}

function startCarLevel1() {
    levelState.car.classList.add('moving');
    levelState.isMoving = true;
    levelState.elapsed = 0;

    requestAnimation((dt) => {
        if (!levelState.isMoving) return;

        levelState.elapsed += dt;

        const time = levelState.realTime;
        const progress = Math.min(levelState.elapsed / time, 1);
        levelState.progress = progress;

        const trackWidth = levelState.track.clientWidth;
        const startX = 20;
        const endX = trackWidth - 20;

        const x = startX + progress * (endX - startX);
        levelState.car.style.left = `${x}px`;

        if (progress >= 1) {
            levelState.car.classList.remove('moving');
            levelState.isMoving = false;
            cancelAnimation();
            evaluateRoundLevel1();
        }
    });
}

function evaluateRoundLevel1() {
    document.removeEventListener('keydown', handleLevel1Key);

    const car = levelState.car;
    const realTime = levelState.realTime;
    const chosen = levelState.chosenTime;

    if (chosen === null) {
        addScore(-10);
        shake(car);
        alert('Вы не выбрали время. Штраф -10 очков.');
    } else {
        const diff = Math.abs(chosen - realTime);
        let gained = 0;
        if (diff < 0.5) gained = 50;
        else if (diff < 1.0) gained = 30;
        else if (diff < 2.0) gained = 10;
        else gained = -10;

        addScore(gained);
        alert(`Реальное время ≈ ${realTime.toFixed(2)} с, вы выбрали ${chosen} с. Итог за раунд: ${gained} очков.`);
    }

    nextRoundOrFinish();
}

// ---------- Уровень 2 ----------

function setupLevel2() {
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '';

    let targetTime1 = randomFloat(3.5, 7.0);
    let targetTime2 = randomFloat(3.5, 7.0);
    while (Math.abs(targetTime1 - targetTime2) < 0.5) {
        targetTime2 = randomFloat(3.5, 7.0);
    }

    levelState = {
        targetTimes: [targetTime1, targetTime2],
        cars: [],
        evaluated: false
    };

    const infoCard = document.createElement('div');
    infoCard.className = 'card';
    infoCard.innerHTML = `
        <p class="level-round-info">Раунд ${currentRound} из ${maxRoundsPerLevel}</p>
        <h3>Цель раунда</h3>
        <p>Остановите каждую машину как можно ближе к её времени:</p>
        <ul class="small" style="margin-left:18px; margin-top:6px;">
            <li><b>Машина 1:</b> ${targetTime1.toFixed(1)} с</li>
            <li><b>Машина 2:</b> ${targetTime2.toFixed(1)} с</li>
        </ul>
        <p class="small">Нажмите <b>пробел</b> или кликните по машине, чтобы её остановить.</p>
    `;
    gameArea.appendChild(infoCard);

    for (let i = 0; i < 2; i++) {
        const track = document.createElement('div');
        track.className = 'track';

        const line = document.createElement('div');
        line.className = 'track-line';
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
        car.style.left = '5%';
        car.classList.add('moving');

        const distance = randomInt(380, 560);
        const targetTime = levelState.targetTimes[i];
        const k = randomFloat(1.7, 2.4);
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

            const pos = 5 + cs.progress * 90;
            cs.car.style.left = pos + '%';
        });

        if (!levelState.evaluated && levelState.cars.every(c => !c.moving)) {
            levelState.evaluated = true;
            document.removeEventListener('keydown', handleLevel2Key);
            evaluateRoundLevel2();
        }
    });

    document.addEventListener('keydown', handleLevel2Key);
}

function handleLevel2Key(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        const cs = levelState.cars.find(c => c.moving);
        if (cs) stopCarLevel2(cs);
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
        evaluateRoundLevel2();
    }
}

function evaluateRoundLevel2() {
    let totalGained = 0;
    let msg = `Цели:\nМашина 1: ${levelState.targetTimes[0].toFixed(2)} с\nМашина 2: ${levelState.targetTimes[1].toFixed(2)} с\n\n`;

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
        msg += `Машина ${idx + 1}: остановка ${t.toFixed(2)} с (разница ${diff.toFixed(2)} с), очки: ${gained}\n`;

        if (gained < 0) shake(cs.car);
    });

    addScore(totalGained);
    alert(msg + `\nИтого за раунд: ${totalGained} очков.`);

    nextRoundOrFinish();
}

// ---------- Уровень 3 (1 машинка, случайная замкнутая трасса + препятствия) ----------

function setupLevel3() {
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '';

    const infoCard = document.createElement('div');
    infoCard.className = 'card';
    infoCard.innerHTML = `
        <p class="level-round-info">Раунд ${currentRound} из ${maxRoundsPerLevel}</p>
        <h3>Задача</h3>
        <p>Проедьте <b>1 круг</b> как можно быстрее по замкнутой трассе.</p>
        <p class="small">Управление: <b>стрелки</b> или <b>перетаскивание мышью</b>. Съезд с дороги = штраф и новый раунд.</p>
        <p class="small"><b>Препятствия</b> перекрывают дорогу и исчезают по таймеру (1–5 сек). Если задел препятствие — раунд заканчивается.</p>
    `;
    gameArea.appendChild(infoCard);

    const canvas = document.createElement('canvas');

    // БОЛЬШЕ И ДЛИННЕЕ: больше полотно => физически длиннее путь
    const w = Math.min(980, gameArea.clientWidth - 20);
    canvas.width = Math.max(760, w);
    canvas.height = 520;

    canvas.style.display = 'block';
    canvas.style.margin = '10px auto 0';
    canvas.style.borderRadius = '12px';
    canvas.style.background = 'rgba(0,0,0,0.25)';
    gameArea.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // побольше базовый размер + больше сэмплов => длиннее "кривая"
    const baseR = Math.min(canvas.width, canvas.height) * 0.33;

    // трасса немного поуже
    const roadWidth = 50;

    // больше точек (длина кривой больше)
    const points = generateRandomClosedCurve(cx, cy, baseR, 1.15, 240);

    const startPoint = points[0];

    const car = {
        x: startPoint.x,
        y: startPoint.y,
        r: 9
    };

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

    // стартовые препятствия (чтобы их было больше сразу)
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

        levelState.time += dt;

        updateObstaclesLevel3(dt);

        const prevX = levelState.car.x;
        const prevY = levelState.car.y;

        applyKeyboardMoveLevel3(dt);

        // ✅ НОВОЕ: если задел препятствие — раунд заканчивается
        if (isCarTouchingObstacles(levelState.car, levelState.obstacles)) {
            levelState.car.x = prevX;
            levelState.car.y = prevY;
            failRoundLevel3('Вы врезались в препятствие!');
            return;
        }

        // вне дороги = проигрыш
        if (!isCarOnRoad(levelState.car, levelState.points, levelState.roadWidth)) {
            failRoundLevel3('Вы съехали с дороги!');
            return;
        }

        // покинул стартовую область?
        if (!levelState.leftStart) {
            const ds = dist(levelState.car.x, levelState.car.y, levelState.startPoint.x, levelState.startPoint.y);
            if (ds > levelState.roadWidth * 1.7) levelState.leftStart = true;
        }

        // вернулся в стартовую область после того как уехал -> финиш
        if (levelState.leftStart) {
            const ds = dist(levelState.car.x, levelState.car.y, levelState.startPoint.x, levelState.startPoint.y);
            if (ds <= levelState.roadWidth * 0.45) {
                finishRoundLevel3();
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

    // старт/финиш
    ctx.save();
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.arc(startPoint.x, startPoint.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // машинка
    ctx.save();
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(car.x, car.y, car.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // HUD
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 260, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui';
    ctx.fillText(`Время круга: ${time.toFixed(2)} c`, 22, 35);
    ctx.restore();
}

function updateObstaclesLevel3(dt) {
    // обновляем TTL
    for (let i = levelState.obstacles.length - 1; i >= 0; i--) {
        levelState.obstacles[i].ttl -= dt;
        if (levelState.obstacles[i].ttl <= 0) {
            levelState.obstacles.splice(i, 1);
        }
    }

    // таймер спавна
    levelState.nextObstacleIn -= dt;

    if (levelState.nextObstacleIn <= 0 && levelState.obstacles.length < LEVEL3_MAX_OBSTACLES) {
        // иногда спавним 1, иногда 2 (чтобы было больше)
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

        // не ставим слишком близко к старту/финишу
        const nearStart = idx < 28 || idx > n - 28;
        if (nearStart) continue;

        const p = points[idx];

        // не ставим на машинку
        if (dist(p.x, p.y, levelState.car.x, levelState.car.y) < 130) continue;

        // не ставим слишком близко к другим препятствиям
        let ok = true;
        for (const ob of levelState.obstacles) {
            const c = getObstacleCenter(ob);
            if (dist(c.x, c.y, p.x, p.y) < 110) { ok = false; break; }
        }
        if (!ok) continue;

        // направление касательной (по соседним точкам)
        const pPrev = points[(idx - 1 + n) % n];
        const pNext = points[(idx + 1) % n];
        const tx = pNext.x - pPrev.x;
        const ty = pNext.y - pPrev.y;
        const ang = Math.atan2(ty, tx);

        // нормаль => перекрываем дорогу ПОПЕРЁК
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

            // параметры анимации
            phase: randomFloat(0, Math.PI * 2),
            wobble: randomFloat(0.03, 0.08)  // небольшая “дрожь” угла
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

        // пульсация толщины
        const pulse = 1 + 0.18 * Math.sin(nowTime * 7 + ob.phase);
        const thick = ob.thickness * pulse;

        // плавное исчезновение в последние 0.4 сек
        const fade = Math.min(1, ob.ttl / 0.4);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // “свечение” вокруг
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = 'rgba(255, 87, 34, 1)';
        ctx.fillRect(-len / 2, -thick / 2 - 6, len, thick + 12);

        // основное тело препятствия
        ctx.globalAlpha = 0.92 * fade;
        ctx.fillStyle = 'rgba(255, 87, 34, 1)';
        ctx.fillRect(-len / 2, -thick / 2, len, thick);

        // рамка
        ctx.globalAlpha = 0.55 * fade;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-len / 2, -thick / 2, len, thick);

        // таймер (цифра)
        ctx.globalAlpha = 1.0 * fade;
        ctx.fillStyle = '#fff';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.ceil(ob.ttl)}`, 0, 0);

        // полоска прогресса времени жизни
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

    for (const ob of obstacles) {
        // тот же pulse, что в отрисовке
        const pulse = 1 + 0.18 * Math.sin(nowTime * 7 + ob.phase);
        const thick = ob.thickness * pulse;

        const d2 = distPointToSegmentSquared(car.x, car.y, ob.ax, ob.ay, ob.bx, ob.by);
        const d = Math.sqrt(d2);

        if (d <= (car.r + thick / 2)) return true;
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

    // ✅ НОВОЕ: если при drag задел препятствие — конец раунда
    if (isCarTouchingObstacles(levelState.car, levelState.obstacles)) {
        levelState.car.x = prevX;
        levelState.car.y = prevY;
        failRoundLevel3('Вы врезались в препятствие!');
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

function finishRoundLevel3() {
    levelState.finished = true;
    cancelAnimation();

    const t = levelState.time;
    let gained = Math.round(LEVEL3_BASE_SCORE - t * 12);
    if (gained < 20) gained = 20;

    addScore(gained);
    alert(`✅ Круг пройден!\nВремя: ${t.toFixed(2)} сек\nОчки: +${gained}\n\nНачинается следующий раунд.`);
    nextRoundOrFinish();
}

function failRoundLevel3(reasonText) {
    if (levelState.finished) return;
    levelState.finished = true;
    cancelAnimation();

    addScore(LEVEL3_FAIL_PENALTY);
    alert(`❌ ${reasonText}\nШтраф: ${LEVEL3_FAIL_PENALTY}\n\nНачинается следующий раунд.`);
    nextRoundOrFinish();
}

// --- Рисование дороги ---
function drawRoad(ctx, points, roadWidth) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // цветная область дороги
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();

    ctx.strokeStyle = 'rgba(76, 175, 80, 0.45)';
    ctx.lineWidth = roadWidth;
    ctx.stroke();

    // мягкая окантовка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.lineWidth = roadWidth + 10;
    ctx.stroke();

    // центральная линия
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
    return d <= (roadWidth / 2 - car.r * 0.15);
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

// Генерация замкнутой "совершенно разной" формы (не только круг)
function generateRandomClosedCurve(cx, cy, baseR, wildness = 1.0, samples = 140) {
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

    const margin = 38; // меньше отступ => трасса больше на экране
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    const width = maxX - minX;
    const height = maxY - minY;

    const cw = (levelState?.canvas?.width) ?? 900;
    const ch = (levelState?.canvas?.height) ?? 520;

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

// ---------- Общее ----------

function nextRoundOrFinish() {
    currentRound++;
    if (currentRound <= maxRoundsPerLevel) {
        document.getElementById('round-label').textContent = `Раунд: ${currentRound}/${maxRoundsPerLevel}`;
        startLevel();
    } else {
        finishLevel(true, false);
    }
}

function finishLevel(completed, earlyExit = false, reason = '') {
    cancelAnimation();
    clearInterval(timerInterval);
    timerInterval = null;

    document.removeEventListener('keydown', handleLevel1Key);
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
        endGame();
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

    alert(baseMsg);
}

function endGame() {
    const name = getCurrentPlayerName();
    const result = {
        name,
        totalScore: score,
        date: new Date().toLocaleString()
    };
    saveGameResult(result);
    alert(`Игра завершена! Ваши итоговые очки: ${score}. Результат сохранён в рейтинг.`);
    window.location.href = 'rating.html';
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

function shuffleArray(arr) {
    return arr
        .map(v => ({ v, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(x => x.v);
}

function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}
