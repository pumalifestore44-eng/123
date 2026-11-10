import './conversation-search.js';
// Presentation-only enhancements; data fetching and business actions stay in app.js.
const panels = [...document.querySelectorAll('.tab-view-panel')];
const navButtons = [...document.querySelectorAll('.tab-nav-btn')];
function syncNavigation() {
  const current = panels.find(panel => panel.style.display !== 'none');
  if (!current) return;
  for (const button of navButtons) {
    const active = button.dataset.target === current.id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
const navigationObserver = new MutationObserver(syncNavigation);
panels.forEach(panel => navigationObserver.observe(panel, { attributes: true, attributeFilter: ['style'] }));
syncNavigation();

const menu = document.getElementById('mobileDropdownMenu');
const menuButton = document.getElementById('mobileMenuBtn');
if (menu && menuButton) {
  const syncMenu = () => menuButton.setAttribute('aria-expanded', String(getComputedStyle(menu).display !== 'none'));
  new MutationObserver(syncMenu).observe(menu, { attributes: true, attributeFilter: ['style', 'class'] });
  syncMenu();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && getComputedStyle(menu).display !== 'none') {
      menu.style.display = 'none';
      menuButton.focus();
    }
  });
}
// Give existing icon controls and search fields names without changing their handlers.
document.querySelectorAll('button[title]').forEach(button => {
  if (!button.hasAttribute('aria-label') && !button.textContent.trim()) button.setAttribute('aria-label', button.title);
});
document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(field => {
  if (!field.hasAttribute('aria-label') && !field.labels?.length) field.setAttribute('aria-label', field.placeholder);
});

// Preserve accessible names when mobile toolbar labels are hidden.
document.querySelectorAll('#orders-tab-content .orders-header-actions > button').forEach(button => {
  const label = button.textContent.trim();
  if (label) {
    button.setAttribute('aria-label', label);
    button.title = label;
  }
});
for (const [id, label, path] of [
  ['btnPrevOrdersPage', 'Trang trước', 'm10 4-6 4 6 4'],
  ['btnNextOrdersPage', 'Trang sau', 'm6 4 6 4-6 4']
]) {
  const button = document.getElementById(id);
  if (!button || button.querySelector('.compact-page-icon')) continue;
  const text = document.createElement('span');
  text.className = 'compact-page-label';
  text.textContent = button.textContent.trim();
  button.replaceChildren(text);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('class', 'compact-page-icon');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(svg.namespaceURI, 'path');
  line.setAttribute('d', path);
  svg.append(line);
  button.append(svg);
  button.setAttribute('aria-label', label);
  button.title = label;
}
