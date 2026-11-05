// Protein Tracker – Fogerty Family
// Default: localStorage. Optional Google Sheet CSV or Apps Script endpoint.

const STORAGE_KEY = 'fogerty_protein_entries';
const CONFIG_KEY = 'fogerty_protein_config';
const DEFAULT_TARGET_G_PER_KG = 1.2;
const TARGET_RANGE = [1.0, 1.5];

let entries = [];
let chart = null;
let config = { sheetUrl: '' };

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) config = { ...config, ...JSON.parse(raw) };
  } catch (e) {}
  document.getElementById('sheetUrl').value = config.sheetUrl || '';
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
  return unit === 'lbs' ? weight * 0.453592 : weight;
}

function recommendedG(weightKg) {
  return Math.round(weightKg * DEFAULT_TARGET_G_PER_KG);
}

function rangeText(weightKg) {
  const lo = Math.round(weightKg * TARGET_RANGE[0]);
  const hi = Math.round(weightKg * TARGET_RANGE[1]);
  return `${lo}–${hi} g`;
}

function addEntry(person, date, weight, unit, protein, notes) {
  const weightKg = kgFromInput(Number(weight), unit);
  const entry = {
    id: Date.now(),
    person,
    date,
    weightKg: Math.round(weightKg * 10) / 10,
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

function clearAll() {
  if (confirm('Clear all local entries? This cannot be undone.')) {
    entries = [];
    saveEntries();
    render();
  }
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
    const met = list.filter(e => e.protein >= e.recommended).length;
    const pct = Math.round((met / list.length) * 100);
    const last = list[list.length - 1];
    const trend = list.length > 1
      ? (list[list.length - 1].protein >= list[0].protein ? '↑ or steady' : '↓')
      : '—';
    html += `<div class="person-stat">
      <strong>${person}</strong>: avg ${avg} g/day · ${pct}% of days at/above target · latest ${last.protein} g (target ${last.recommended} g) · trend ${trend}
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
    const ok = e.protein >= e.recommended;
    li.className = ok ? 'ok' : 'low';
    li.innerHTML = `<strong>${e.date}</strong> · ${e.person} · ${e.protein} g (target ${e.recommended} g) · ${e.weightKg} kg${e.notes ? ' · ' + e.notes : ''}`;
    ul.appendChild(li);
  });
}

function renderChart() {
  const ctx = document.getElementById('chart').getContext('2d');
  const labels = entries.map(e => e.date + ' ' + e.person);
  const data = entries.map(e => e.protein);
  const targets = entries.map(e => e.recommended);
  const colors = entries.map(e => e.protein >= e.recommended ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)');

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
          tension: 0.1
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
    // Simple CSV parse (Date,Person,WeightKg,ProteinG,Notes)
    const lines = text.trim().split('\n').slice(1);
    const loaded = [];
    lines.forEach(line => {
      const [date, person, weightKg, protein, notes] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (date && person && protein) {
        loaded.push({
          id: Date.now() + Math.random(),
          person,
          date,
          weightKg: Number(weightKg) || 70,
          protein: Number(protein),
          notes: notes || '',
          recommended: recommendedG(Number(weightKg) || 70),
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
  });

  document.getElementById('clearData').addEventListener('click', clearAll);
  document.getElementById('saveConfig').addEventListener('click', saveConfig);

  render();
  tryLoadFromSheet();
});
