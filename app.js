// Год в футере
document.getElementById('year').textContent = new Date().getFullYear();

// Мобильное меню
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');
if (navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  // Закрывать меню при клике по ссылке
  nav.addEventListener('click', e => {
    if (e.target.matches('a[data-link]')) nav.classList.remove('open');
  });
}

// Простейший hash-router: показывает нужную «страницу» (секцию)
const routes = Array.from(document.querySelectorAll('.route'));
const menuLinks = Array.from(document.querySelectorAll('.site-nav a[data-link]'));

function showRoute(path) {
  // По умолчанию /home
  if (!path || path === '#/' || path === '#') path = '#/home';
  const clean = path.replace('#', '');
  routes.forEach(sec => {
    sec.hidden = sec.dataset.route !== clean;
  });
  // Подсветка активного пункта меню
  menuLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === path));
  // Прокрутка к началу
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('hashchange', () => showRoute(location.hash));
showRoute(location.hash);

// Клавиатурный фокус на основном заголовке активного раздела
function focusActiveHeading(){
  const visible = routes.find(r => !r.hidden);
  if (!visible) return;
  const h = visible.querySelector('h1,h2');
  if (h) h.setAttribute('tabindex','-1'), h.focus({preventScroll:true});
}
setTimeout(focusActiveHeading, 100);
