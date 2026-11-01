// Progressive enhancement: without JS all existing fields remain available.
for (const form of document.querySelectorAll('[data-courier-wizard]')) {
  const steps = [...form.querySelectorAll('[data-step]')];
  const submit = form.querySelector('button[type="submit"]');
  let current = 0;
  const progress = document.createElement('p');
  progress.className = 'courier-progress';
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'polite');
  const meter = document.createElement('progress');
  meter.max = steps.length; meter.setAttribute('aria-label', 'Onboarding step progress');
  form.prepend(progress, meter);
  const actions = document.createElement('div');
  actions.className = 'courier-actions';
  const back = document.createElement('button');
  const next = document.createElement('button');
  back.type = next.type = 'button';
  back.textContent = 'Back'; next.textContent = 'Continue';
  actions.append(back, next); submit.before(actions);
  function show(focus = false) {
    steps.forEach((step, index) => { step.hidden = index !== current; });
    progress.textContent = `Step ${current + 1} of ${steps.length}`;
    meter.value = current + 1;
    back.hidden = current === 0;
    next.hidden = current === steps.length - 1;
    submit.hidden = current !== steps.length - 1;
    if (focus) {
      const legend = steps[current].querySelector('legend');
      legend.tabIndex = -1; legend.focus();
    }
  }
  next.addEventListener('click', () => {
    for (const input of steps[current].querySelectorAll('input,select,textarea')) {
      if (!input.reportValidity()) return;
    }
    current++; show(true);
  });
  back.addEventListener('click', () => { current--; show(true); });
  // Enter must advance the visible step rather than submit hidden requirements.
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input') && current < steps.length - 1) {
      event.preventDefault(); next.click();
    }
  });
  form.addEventListener('invalid', event => {
    const index = steps.findIndex(step => step.contains(event.target));
    if (index >= 0 && index !== current) { current = index; show(); }
  }, true);
  form.addEventListener('reset', () => { current = 0; show(); });
  show();
}
