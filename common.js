// common.js

const STORAGE_KEYS = {
    CURRENT_PLAYER: 'carGameCurrentPlayer',
    LAST_GAME: 'carGameLastGame',
    RATING: 'carGameRating'
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

// Сохранить результат завершённой игры
function saveGameResult(result) {
    localStorage.setItem(STORAGE_KEYS.LAST_GAME, JSON.stringify(result));

    let rating = [];
    const stored = localStorage.getItem(STORAGE_KEYS.RATING);
    if (stored) {
        try {
            rating = JSON.parse(stored);
        } catch (e) {
            rating = [];
        }
    }

    // обновляем или добавляем игрока
    const existing = rating.find(r => r.name === result.name);
    if (existing) {
        existing.lastScore = result.totalScore;
        existing.lastDate = result.date;
        if (result.totalScore > existing.bestScore) {
            existing.bestScore = result.totalScore;
        }
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
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

function getRating() {
    const stored = localStorage.getItem(STORAGE_KEYS.RATING);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
}
