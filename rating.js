// rating.js

document.addEventListener('DOMContentLoaded', () => {
    const lastGameBlock = document.getElementById('last-game-content');
    const lastGame = getLastGameResult();

    if (lastGame) {
        lastGameBlock.innerHTML = `
            <p>Игрок: <b>${lastGame.name}</b></p>
            <p>Итоговый результат: <b>${lastGame.totalScore}</b> очков</p>
            <p>Дата: ${lastGame.date}</p>
        `;
    } else {
        lastGameBlock.innerHTML = `<p>Последних игр пока нет. Сыграйте, чтобы попасть в рейтинг.</p>`;
    }

    const rating = getRating();
    const tbody = document.querySelector('#rating-table tbody');
    tbody.innerHTML = '';

    if (rating.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = 'Рейтинг пока пуст.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    rating.forEach((r, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${r.name}</td>
            <td>${r.bestScore}</td>
            <td>${r.lastScore}</td>
            <td>${r.lastDate}</td>
        `;
        tbody.appendChild(tr);
    });
});
