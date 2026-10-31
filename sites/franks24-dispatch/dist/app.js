'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const menuToggle = $('.menu-toggle');
const mobileNav = $('#mobile-nav');
const tabs = $$('[data-tab]');
const dialog = $('#plan-dialog');
let deliveryPlan = null;
let toastTimer;

function setTab(name, focus = false) {
  tabs.forEach(tab => {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $('#' + tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); setTab(tabs[next].dataset.tab, true); }
  });
});

function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
  mobileNav.hidden = true;
}
menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
  mobileNav.hidden = isOpen;
});
$$('#mobile-nav a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
$$('[data-show-tab]').forEach(link => link.addEventListener('click', () => setTab(link.dataset.showTab)));
$$('[data-service]').forEach(button => button.addEventListener('click', () => {
  setTab('plan');
  $('#timing').value = button.dataset.service;
  $('#planner').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  $('#collect-from').focus({ preventScroll: true });
}));

function normalized(value) { return String(value).trim().replace(/\s+/g, ' '); }
$$('#plan-form input, #tracking-reference').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
$('#plan-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const from = normalized(form.get('from'));
  const to = normalized(form.get('to'));
  if (from.length < 2) { $('#collect-from').setCustomValidity('Enter a collection suburb or city.'); $('#collect-from').reportValidity(); return; }
  if (to.length < 2) {
    $('#deliver-to').setCustomValidity('Enter a delivery suburb or city.');
    $('#deliver-to').reportValidity(); return;
  }
  deliveryPlan = { from, to, parcel: form.get('parcel'), preference: form.get('timing') };
  const summary = $('#plan-summary');
  summary.replaceChildren();
  [['Collect from', from], ['Deliver to', to], ['Your parcel', deliveryPlan.parcel], ['Preference', deliveryPlan.preference]].forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    row.append(dt, dd); summary.append(row);
  });
  dialog.showModal();
});
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

$('#download-plan').addEventListener('click', () => {
  if (!deliveryPlan) return;
  const text = ['FRANKS24 / DISPATCH', 'DELIVERY PLAN — SERVICE PREVIEW', '', `Collect from: ${deliveryPlan.from}`, `Deliver to: ${deliveryPlan.to}`, `Parcel: ${deliveryPlan.parcel}`, `Preference: ${deliveryPlan.preference}`, '', 'PREPARE BEFORE BOOKING', '• Parcel weight and dimensions', '• Collection date and time', '• Collection and delivery address details', '', 'This is not a quote, booking or coverage confirmation.', 'No operator has received this plan. Pricing and availability require confirmation.', 'Customer preview: https://dispatch.franks24.com/deliveries/', 'Draft delivery policies: https://dispatch.franks24.com/deliveries/policies.html'].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Franks24-delivery-plan.txt'; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast('Your delivery plan is ready to save.');
});

$('#track-form').addEventListener('submit', event => {
  event.preventDefault();
  const reference = normalized($('#tracking-reference').value);
  if (reference.length < 3) { $('#tracking-reference').setCustomValidity('Enter at least 3 characters.'); $('#tracking-reference').reportValidity(); return; }
  const result = $('#tracking-result');
  result.replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = 'Live tracking is not connected yet.';
  const paragraph = document.createElement('p'); paragraph.textContent = `Reference ${reference} has not been looked up. Open the tracking desk preview to explore the planned workflow.`;
  const link = document.createElement('a'); link.href = 'https://dispatch.franks24.com/deliveries/#tracking'; link.className = 'quiet-link'; link.textContent = 'Open tracking preview ↗';
  result.append(heading, paragraph, link); result.hidden = false;
});

function showToast(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast'); toast.textContent = message; toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}
