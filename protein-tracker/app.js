// Protein Tracker – Fogerty Family
// Default: localStorage. Optional Google Sheet CSV.

const STORAGE_KEY = 'fogerty_protein_entries';
const CONFIG_KEY = 'fogerty_protein_config';
const HIDE_WEIGHT_KEY = 'fogerty_hide_weight';
const DEFAULT_TARGET_G_PER_KG = 1.2;
const TARGET_RANGE = [1.0, 1.5];
const SHEET_ID = '1o8RNQzmCRWRzknJ3k2igtUit4pziaWpLiRz8wRr9KM0';

let entries = [];
let chart = null;
let config = { 
  sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRgHhuUoorXm_6P2JxJ4m9cHZFeLj5pydb-mNA2xtnD4OLXqVKrynmXnX002MV5lPqcesQEjuGCRnjA/pub?output=csv' 
};
let hideWeight = false;

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) config = { ...config, ...JSON.parse(raw) };
  } catch (e) {}
  // Pre-set sheet URL for automatic load; user can still override
  document.getElementById('sheetUrl').value = config.sheetUrl || '';
  hideWeight = localStorage.getItem(HIDE_WEIGHT_KEY) === '1';
  document.getElementById('hideWeight').checked = hideWeight;
  applyHideWeight();
}

function saveConfig() {
  config.sheetUrl = document.getElementById('sheetUrl').value.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  alert('Config saved. Reload the page to try loading from the sheet.');
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    entries = raw ? JSON.parse(raw) : [];
  } catch (e) {
    entries = [];
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function kgFromInput(weight, unit) {
  if (!weight) return null;
  return unit === 'lbs' ? weight * 0.453592 : weight;
}

function recommendedG(weightKg) {
  if (!weightKg) return null;
  return Math.round(weightKg * DEFAULT_TARGET_G_PER_KG);
}

function applyHideWeight() {
  const label = document.getElementById('weightLabel');
  if (hideWeight) {
    label.style.display = 'none';
  } else {
    label.style.display = 'flex';
  }
}

function addEntry(person, date, weight, unit, protein, notes) {
  const weightKg = weight ? kgFromInput(Number(weight), unit) : null;
  const entry = {
    id: Date.now(),
    person,
    date,
    weightKg: weightKg ? Math.round(weightKg * 10) / 10 : null,
    protein: Number(protein),
    notes: notes || '',
    recommended: recommendedG(weightKg),
    timestamp: new Date().toISOString()
  };
  entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  saveEntries();
  render();
}

function renderStats() {
  const el = document.getElementById('statsContent');
  if (!entries.length) {
    el.innerHTML = 'No data yet. Add an entry above.';
    return;
  }
  const byPerson = {};
  entries.forEach(e => {
    if (!byPerson[e.person]) byPerson[e.person] = [];
    byPerson[e.person].push(e);
  });

  let html = '';
  Object.keys(byPerson).forEach(person => {
    const list = byPerson[person];
    const avg = Math.round(list.reduce((s, e) => s + e.protein, 0) / list.length);
    const withTarget = list.filter(e => e.recommended);
    const met = withTarget.filter(e => e.protein >= e.recommended).length;
    const pct = withTarget.length ? Math.round((met / withTarget.length) * 100) : '—';
    const last = list[list.length - 1];
    const targetText = last.recommended ? `target ${last.recommended} g` : 'no weight set';
    html += `<div class="person-stat">
      <strong>${person}</strong>: avg ${avg} g/day · ${pct}% of days at/above target · latest ${last.protein} g (${targetText})
    </div>`;
  });
  el.innerHTML = html;
}

function renderHistory() {
  const ul = document.getElementById('historyList');
  ul.innerHTML = '';
  const recent = entries.slice().reverse().slice(0, 20);
  recent.forEach(e => {
    const li = document.createElement('li');
    const ok = e.recommended ? e.protein >= e.recommended : true;
    li.className = ok ? 'ok' : 'low';
    const weightPart = (!hideWeight && e.weightKg) ? ` · ${e.weightKg} kg` : '';
    const targetPart = e.recommended ? ` (target ${e.recommended} g)` : '';
    li.innerHTML = `<strong>${e.date}</strong> · ${e.person} · ${e.protein} g${targetPart}${weightPart}${e.notes ? ' · ' + e.notes : ''}`;
    ul.appendChild(li);
  });
}

function renderChart() {
  const ctx = document.getElementById('chart').getContext('2d');
  const labels = entries.map(e => e.date + ' ' + e.person);
  const data = entries.map(e => e.protein);
  const targets = entries.map(e => e.recommended || null);
  const colors = entries.map(e => {
    if (!e.recommended) return 'rgba(148,163,184,0.7)';
    return e.protein >= e.recommended ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)';
  });

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Protein intake (g)',
          data,
          backgroundColor: colors,
          borderWidth: 1
        },
        {
          label: 'Target (1.2 g/kg)',
          data: targets,
          type: 'line',
          borderColor: '#2563eb',
          borderWidth: 2,
          fill: false,
          pointRadius: 3,
          tension: 0.1,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index' }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Grams' } }
      }
    }
  });
}

function render() {
  renderStats();
  renderHistory();
  renderChart();
}

async function tryLoadFromSheet() {
  if (!config.sheetUrl) return;
  try {
    const res = await fetch(config.sheetUrl);
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.trim().split('\n').slice(1);
    const loaded = [];
    lines.forEach(line => {
      const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const [date, person, weightKg, protein, notes] = parts;
      if (date && person && protein) {
        const w = Number(weightKg) || null;
        loaded.push({
          id: Date.now() + Math.random(),
          person,
          date,
          weightKg: w,
          protein: Number(protein),
          notes: notes || '',
          recommended: recommendedG(w),
          timestamp: new Date().toISOString()
        });
      }
    });
    if (loaded.length) {
      entries = loaded;
      saveEntries();
      render();
    }
  } catch (e) {
    console.warn('Sheet load failed', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadEntries();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('date').value = today;

  document.getElementById('person').addEventListener('change', e => {
    document.getElementById('customName').style.display = e.target.value === 'custom' ? 'inline-block' : 'none';
  });

  document.getElementById('hideWeight').addEventListener('change', e => {
    hideWeight = e.target.checked;
    localStorage.setItem(HIDE_WEIGHT_KEY, hideWeight ? '1' : '0');
    applyHideWeight();
    render();
  });

  document.getElementById('entryForm').addEventListener('submit', e => {
    e.preventDefault();
    const personSel = document.getElementById('person').value;
    const person = personSel === 'custom'
      ? document.getElementById('customName').value.trim() || 'Custom'
      : personSel;
    const date = document.getElementById('date').value;
    const weight = document.getElementById('weight').value;
    const unit = document.getElementById('weightUnit').value;
    const protein = document.getElementById('protein').value;
    const notes = document.getElementById('notes').value;
    addEntry(person, date, weight, unit, protein, notes);
    e.target.reset();
    document.getElementById('date').value = today;
    document.getElementById('person').value = personSel;
    document.getElementById('hideWeight').checked = hideWeight;
  });

  document.getElementById('saveConfig').addEventListener('click', saveConfig);

  render();
  tryLoadFromSheet();
});
