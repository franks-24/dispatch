const menu = document.querySelector('.f24-menu');
const navigation = document.getElementById('f24-navigation');
document.documentElement.classList.add('f24-shell-ready');
function closeMenu(restoreFocus = false) {
  if (!menu || !navigation) return;
  const wasOpen = menu.getAttribute('aria-expanded') === 'true';
  menu.setAttribute('aria-expanded', 'false'); navigation.removeAttribute('data-open');
  if (restoreFocus && wasOpen) menu.focus();
}
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open)); navigation.toggleAttribute('data-open', open);
});
navigation?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(true); });
matchMedia('(max-width:720px)').addEventListener('change', () => closeMenu());

const groups = Array.from(document.querySelectorAll('[data-panel-group]'));
function showPanel(group, id, {focus = false, updateHash = false} = {}) {
  const buttons = Array.from(group.querySelectorAll('[data-f24-tab]'));
  const selected = buttons.find(button => button.dataset.f24Tab === id);
  if (!selected) return false;
  for (const button of buttons) {
    const active = button === selected;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(button.dataset.f24Tab);
    if (panel) {
      if (!active && !panel.hidden) document.dispatchEvent(new CustomEvent('franks24:panel-deactivate', {detail:{id:panel.id}}));
      panel.hidden = !active;
    }
  }
  group.dataset.selectedPanel = id;
  if (focus) selected.focus();
  if (updateHash) history.replaceState(null, '', '#' + id);
  return true;
}
function revealHash() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  if (!id) return;
  const target = document.getElementById(id);
  const panel = target?.closest('[data-f24-panel]');
  const group = panel?.closest('[data-panel-group]');
  if (group) showPanel(group, panel.id);
  let ancestor = target;
  while (ancestor) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
}
for (const group of groups) {
  const buttons = Array.from(group.querySelectorAll('[data-f24-tab]'));
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => showPanel(group, button.dataset.f24Tab, {updateHash:true}));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next !== undefined) { event.preventDefault(); showPanel(group, buttons[next].dataset.f24Tab, {focus:true,updateHash:true}); }
    });
  });
  showPanel(group, group.dataset.defaultPanel || buttons[0]?.dataset.f24Tab);
}
window.addEventListener('hashchange', revealHash);
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link) queueMicrotask(revealHash);
});
document.addEventListener('franks24:workspace-ready', () => {
  for (const group of groups) showPanel(group, group.dataset.selectedPanel || group.dataset.defaultPanel);
  revealHash();
});
document.addEventListener('franks24:show-panel', event => {
  for (const group of groups) if (showPanel(group, event.detail?.id, {updateHash:true})) break;
});
revealHash();
