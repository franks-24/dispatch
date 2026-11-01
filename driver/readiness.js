// Preparation metadata only. Never persist identity, screening results or bank data.
const form = document.getElementById('readiness-form');
const remember = document.getElementById('save-readiness');
const message = document.getElementById('save-readiness-status');
const storageKey = 'franks24:courier-readiness:v1';
const vehicles = ['bicycle', 'motorbike', 'car', 'bakkie', 'van'];
const checks = ['eligibility', 'licence', 'vehicle', 'screening', 'agreement', 'payout'];
function vehicleGuidance() {
  const vehicle = new FormData(form).get('previewVehicle');
  const bicycle = vehicle === 'bicycle';
  document.getElementById('vehicle-guidance').textContent = !vehicle ? 'Choose a vehicle to see relevant document guidance.' : bicycle ?
    'Bicycle courier: prepare identity, right-to-work, bicycle permission and safety evidence. A motor driving licence is not required for a pedal bicycle.' :
    'Motor courier: prepare the correct driving licence, vehicle permission, safety evidence and insurance covering courier use.';
  document.getElementById('licence-guidance').textContent = bicycle ?
    'For a pedal bicycle, motor driving licence and PrDP checks are not applicable. A reviewer still checks your identity and bicycle safety.' :
    'A PrDP is not automatically required for every courier. Goods vehicles exceeding 3,500 kg gross vehicle mass fall within the government PrDP categories. A reviewer confirms all applicable categories and your licence code.';
  document.getElementById('licence-label').textContent = bicycle ?
    'I understand motor driving licence and PrDP checks do not apply to a pedal bicycle.' :
    'I can provide a valid licence and permit where required for my vehicle and service.';
}
function save() {
  if (!remember.checked) return;
  const data = new FormData(form);
  try {
    localStorage.setItem(storageKey, JSON.stringify({vehicle: data.get('previewVehicle'), checks: checks.filter(key => data.has(key))}));
    message.textContent = 'Checklist saved on this device. No documents or personal details are stored.';
  } catch { message.textContent = 'This browser cannot save progress. You can continue without saving.'; }
}
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (vehicles.includes(saved.vehicle)) form.querySelector(`input[value="${saved.vehicle}"]`).checked = true;
    if (Array.isArray(saved.checks)) for (const key of checks) form.elements[key].checked = saved.checks.includes(key);
    remember.checked = true;
    message.textContent = 'Saved preparation checklist restored. This is not verification or approval.';
  }
} catch { message.textContent = 'Saved progress is unavailable. Start a new checklist below.'; }
remember.addEventListener('change', () => {
  if (remember.checked) save();
  else {
    try { localStorage.removeItem(storageKey); message.textContent = 'Device saving turned off and saved progress removed.'; }
    catch { message.textContent = 'Could not remove saved progress. Clear this site’s browser data on a shared device.'; }
  }
});
form.addEventListener('change', event => {
  if (event.target.name === 'previewVehicle') {
    // A different vehicle needs a fresh licence and safety acknowledgement.
    form.elements.licence.checked = false; form.elements.vehicle.checked = false;
  }
  vehicleGuidance(); save();
});
document.getElementById('clear-readiness').addEventListener('click', () => {
  remember.checked = false; form.reset(); vehicleGuidance();
  document.getElementById('readiness-status').textContent = 'Select your vehicle and check what you can provide.';
  try { localStorage.removeItem(storageKey); message.textContent = 'Checklist cleared from this device.'; }
  catch { message.textContent = 'Visible checklist reset. Clear this site’s browser data to remove saved progress.'; }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const pending = checks.filter(key => !data.has(key));
  document.getElementById('readiness-status').textContent = pending.length ?
    `Readiness preview only. Still to prepare: ${pending.length} checklist items. Use Back to review.` :
    'Readiness checklist complete. This is not verification or approval. Applications, document verification, signed archive and human approval are separate steps.';
  save();
});
vehicleGuidance();
