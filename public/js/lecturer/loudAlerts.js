// Opvallende meldingen: een grote banner bovenaan en een systeemmelding, die ook boven
// een PowerPoint op volledig scherm verschijnt. De lector zet dit aan of uit; de keuze wordt onthouden.
import { $ } from '../shared/dom.js';
import { alertDetail, alertHeadline } from './view.js';

const STORAGE_KEY = 'frank-loud-alerts';
const BANNER_MS = 30_000;
const toggle = $('#loud-alerts');
const banner = $('#alert-banner');
let hideTimer = null;

function loadChoice() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveChoice(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Opslaan lukt niet (bv. privévenster): de keuze geldt dan enkel voor deze les.
  }
}

function hideBanner() {
  banner.hidden = true;
  clearTimeout(hideTimer);
}

// Moet opgeroepen worden vanuit een klik: browsers vragen alleen dan om toestemming.
export function requestNotificationPermission() {
  if (toggle.checked && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function setupLoudAlerts() {
  toggle.checked = loadChoice();
  toggle.addEventListener('change', () => {
    saveChoice(toggle.checked);
    if (toggle.checked) requestNotificationPermission();
    else hideBanner();
  });
  $('#alert-banner-close').addEventListener('click', hideBanner);
}

export function announce(alert) {
  if (!toggle.checked) return;

  $('#alert-banner-title').textContent = alertHeadline(alert);
  $('#alert-banner-detail').textContent = alertDetail(alert);
  banner.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideBanner, BANNER_MS);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(alertHeadline(alert), { body: alertDetail(alert), tag: 'frank-alert' });
  }
}
