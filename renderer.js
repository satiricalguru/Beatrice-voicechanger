'use strict';

const fs   = require('fs');
const path = require('path');

// ── State ─────────────────────────────────────────────────────────────────────
let speakerProfiles    = [];
let activeSpeakerIndex = 0;
// Match Python backend startup state: bypass=false means DSP is ACTIVE
let voiceChangerBypass = false;
let devicesLoaded      = false;
let backendOnline      = false;

// ── DOM References ─────────────────────────────────────────────────────────────
const powerToggleBtn       = document.getElementById('power-toggle');
const bypassStatusEl       = document.getElementById('bypass-status');
const powerLabelEl         = document.getElementById('power-label');

const gateSlider           = document.getElementById('gate-slider');
const gateValSpan          = document.getElementById('gate-val');
const inputMeterFill       = document.getElementById('input-meter-fill');
const inputDbVal           = document.getElementById('input-db-val');

const pitchSlider          = document.getElementById('pitch-slider');
const pitchValSpan         = document.getElementById('pitch-val');

const formantSlider        = document.getElementById('formant-slider');
const formantValSpan       = document.getElementById('formant-val');

const volumeSlider         = document.getElementById('volume-slider');
const volumeValSpan        = document.getElementById('volume-val');
const outputMeterFill      = document.getElementById('output-meter-fill');
const outputDbVal          = document.getElementById('output-db-val');

const searchBox            = document.getElementById('search-box');
const searchCount          = document.getElementById('search-count');
const speakersGrid         = document.getElementById('speakers-grid');

const inputDeviceSelect    = document.getElementById('input-device-select');
const outputDeviceSelect   = document.getElementById('output-device-select');
const monitorDeviceSelect  = document.getElementById('monitor-device-select');
const hearYourselfToggle   = document.getElementById('hear-yourself-toggle');
const monitorContainer     = document.getElementById('monitor-container');

const connDot              = document.getElementById('conn-dot');
const connLabel            = document.getElementById('conn-label');
const streamDot            = document.getElementById('stream-dot');
const streamStatusText     = document.getElementById('stream-status-text');

// ── TOML Speaker Loader ───────────────────────────────────────────────────────

function loadSpeakerData() {
  try {
    const tomlPath = path.join(__dirname, 'beatrice_paraphernalia_jvs', 'beatrice_paraphernalia_jvs.toml');
    if (!fs.existsSync(tomlPath)) {
      showSpeakerError('Model config file not found. Please check beatrice_paraphernalia_jvs/');
      return;
    }
    const tomlText = fs.readFileSync(tomlPath, 'utf8');
    speakerProfiles = parseTOML(tomlText);

    if (speakerProfiles.length === 0) {
      showSpeakerError('No speaker profiles found in TOML config.');
      return;
    }

    renderSpeakers(speakerProfiles);
    updateSearchCount(speakerProfiles.length, speakerProfiles.length);
  } catch (err) {
    console.error('[Beatrice] Error loading speaker config:', err);
    showSpeakerError(`Failed to load speakers: ${err.message}`);
  }
}

function parseTOML(text) {
  const speakers = [];
  let cur = null;
  let inDesc = false;
  let descLines = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    // --- multi-line description accumulator ---
    if (inDesc) {
      if (line.endsWith('"""')) {
        descLines.push(line.slice(0, -3));
        if (cur) cur.description = descLines.join('\n').trim();
        inDesc = false;
        descLines = [];
      } else {
        descLines.push(rawLine);
      }
      continue;
    }

    // --- [voice.N] section header ---
    const voiceMatch = line.match(/^\[voice\.(\d+)\]$/);
    if (voiceMatch) {
      cur = { index: parseInt(voiceMatch[1], 10), name: '', description: '', average_pitch: 0 };
      speakers.push(cur);
      continue;
    }

    if (!cur) continue;

    // --- name field ---
    if (line.startsWith('name =')) {
      cur.name = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
      continue;
    }

    // --- average_pitch field ---
    if (line.startsWith('average_pitch =')) {
      const v = parseFloat(line.split('=')[1]);
      if (!isNaN(v)) cur.average_pitch = v;
      continue;
    }

    // --- description = """ (multi-line string start) ---
    if (line.startsWith('description = """')) {
      const afterOpen = line.slice('description = """'.length);
      // Single-line triple-quoted string
      if (afterOpen.endsWith('"""')) {
        cur.description = afterOpen.slice(0, -3).trim();
      } else {
        inDesc = true;
        descLines = [afterOpen];
      }
      continue;
    }
  }

  return speakers;
}

// ── Render Speakers ───────────────────────────────────────────────────────────

/**
 * Derive a short element tag from a speaker description.
 * Returns e.g. "Hydrogen (H)" or falls back to "JVS Voice".
 */
function extractElement(description) {
  const m = description.match(/Element:\s*\r?\n\s*(.+)/i);
  return m ? m[1].trim() : 'JVS Voice';
}

/**
 * Generate a deterministic hue from the periodic-table element symbol for
 * colour variety across the 100 cards.
 */
function elementHue(elementStr) {
  // Extract abbreviation, e.g. "Hydrogen (H)" → "H"
  const sym = (elementStr.match(/\(([^)]+)\)/) || [])[1] || elementStr;
  let hash = 0;
  for (let i = 0; i < sym.length; i++) {
    hash = (hash * 31 + sym.charCodeAt(i)) & 0xffff;
  }
  return hash % 360;
}

function renderSpeakers(profiles) {
  speakersGrid.innerHTML = '';

  if (profiles.length === 0) {
    speakersGrid.innerHTML = `
      <div class="empty-state" role="status">
        <div class="empty-state-icon" aria-hidden="true">🔍</div>
        <p>No voices match your search.</p>
        <small>Try a different name or element.</small>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  profiles.forEach((speaker, i) => {
    const elemStr = extractElement(speaker.description);
    const hue     = elementHue(elemStr);
    const jvsId   = `JVS-${String(speaker.index + 1).padStart(3, '0')}`;
    const isActive = speaker.index === activeSpeakerIndex;

    // First line of description (before the Element: block)
    const firstLine = speaker.description.split('\n').find(l => l.trim() && !l.trim().startsWith('Element:')) || '';

    const card = document.createElement('div');
    card.className = `card speaker-card${isActive ? ' active' : ''}`;
    card.id        = `speaker-card-${speaker.index}`;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(isActive));
    card.setAttribute('tabindex', '0');
    card.style.animationDelay = `${Math.min(i * 18, 600)}ms`;

    // Inline colour from element hue
    card.innerHTML = `
      <div class="speaker-elem-tag"
           style="--elem-hue:${hue};background:hsl(${hue},70%,50%,0.14);color:hsl(${hue},85%,72%);border-color:hsl(${hue},70%,60%,0.22);"
           aria-hidden="true">${elemStr}</div>
      <div class="speaker-id">${jvsId}</div>
      <div class="speaker-name">${speaker.name}</div>
      <div class="speaker-desc">${firstLine.trim()}</div>
      <div class="speaker-pitch">
        ♩&nbsp;<span class="speaker-pitch-val">${speaker.average_pitch.toFixed(1)} Hz</span>
      </div>`;

    // Click
    card.addEventListener('click', () => selectSpeaker(speaker.index));

    // Keyboard activation
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectSpeaker(speaker.index);
      }
    });

    frag.appendChild(card);
  });

  speakersGrid.appendChild(frag);
}

function showSpeakerError(msg) {
  speakersGrid.innerHTML = `
    <div class="empty-state" role="alert">
      <div class="empty-state-icon" aria-hidden="true">⚠️</div>
      <p>${msg}</p>
    </div>`;
}

// ── Backend Communication ─────────────────────────────────────────────────────

const BACKEND_URL = 'http://127.0.0.1:5005';

async function setBackendConfig(params) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BACKEND_URL}/set_config?${qs}`);
    if (!res.ok) console.warn('[Beatrice] Backend returned', res.status);
  } catch (err) {
    // Silently ignore — status poll will surface disconnect
  }
}

// ── Speaker Selection ─────────────────────────────────────────────────────────

function selectSpeaker(index) {
  const prev = document.getElementById(`speaker-card-${activeSpeakerIndex}`);
  if (prev) {
    prev.classList.remove('active');
    prev.setAttribute('aria-selected', 'false');
  }

  activeSpeakerIndex = index;

  const next = document.getElementById(`speaker-card-${activeSpeakerIndex}`);
  if (next) {
    next.classList.add('active');
    next.setAttribute('aria-selected', 'true');
    // Scroll into view smoothly if needed
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  setBackendConfig({ speaker_index: index });
}

// ── Power Toggle ──────────────────────────────────────────────────────────────

powerToggleBtn.addEventListener('click', () => {
  voiceChangerBypass = !voiceChangerBypass;
  applyBypassUI(voiceChangerBypass);
  setBackendConfig({ bypass: voiceChangerBypass });
});

function applyBypassUI(bypass) {
  if (bypass) {
    powerToggleBtn.classList.add('active');        // red glow = bypassed
    powerToggleBtn.setAttribute('aria-pressed', 'false');
    bypassStatusEl.className  = 'bypass-indicator active';
    bypassStatusEl.textContent = 'BYPASSED';
    powerLabelEl.textContent  = 'BYPASSED';
  } else {
    powerToggleBtn.classList.remove('active');     // no glow = live processing
    powerToggleBtn.setAttribute('aria-pressed', 'true');
    bypassStatusEl.className  = 'bypass-indicator live';
    bypassStatusEl.textContent = 'LIVE';
    powerLabelEl.textContent  = 'LIVE';
  }
}

// ── Slider Bindings ───────────────────────────────────────────────────────────

gateSlider.addEventListener('input', () => {
  const val = parseFloat(gateSlider.value);
  gateValSpan.textContent = val.toFixed(3);
  gateSlider.setAttribute('aria-valuenow', val);
  setBackendConfig({ gate_threshold: val });
});

pitchSlider.addEventListener('input', () => {
  const val = parseFloat(pitchSlider.value);
  pitchValSpan.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} st`;
  pitchSlider.setAttribute('aria-valuenow', val);
  setBackendConfig({ pitch_shift: val });
});

formantSlider.addEventListener('input', () => {
  const val = parseFloat(formantSlider.value);
  formantValSpan.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}`;
  formantSlider.setAttribute('aria-valuenow', val);
  setBackendConfig({ formant_shift: val });
});

volumeSlider.addEventListener('input', () => {
  const val = parseFloat(volumeSlider.value);
  const pct = Math.round(val * 100);
  volumeValSpan.textContent = `${pct}%`;
  volumeSlider.setAttribute('aria-valuenow', pct);
  setBackendConfig({ volume: val });
});

// ── Search ────────────────────────────────────────────────────────────────────

let searchDebounce = null;

searchBox.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const query = searchBox.value.toLowerCase().trim();
    if (!query) {
      renderSpeakers(speakerProfiles);
      updateSearchCount(speakerProfiles.length, speakerProfiles.length);
      return;
    }
    const filtered = speakerProfiles.filter(s => {
      const id = `jvs-${String(s.index + 1).padStart(3, '0')}`;
      return (
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        id.includes(query)
      );
    });
    renderSpeakers(filtered);
    updateSearchCount(filtered.length, speakerProfiles.length);
  }, 120);
});

function updateSearchCount(shown, total) {
  if (shown === total) {
    searchCount.textContent = `${total} voices`;
  } else {
    searchCount.textContent = `${shown} / ${total}`;
  }
}

// ── Audio Device Loader ───────────────────────────────────────────────────────

async function loadAudioDevices() {
  try {
    const res     = await fetch(`${BACKEND_URL}/devices`);
    const devices = await res.json();

    const prevIn  = inputDeviceSelect.value;
    const prevOut = outputDeviceSelect.value;
    const prevMon = monitorDeviceSelect.value;

    inputDeviceSelect.innerHTML   = '<option value="null">Default Microphone</option>';
    outputDeviceSelect.innerHTML  = '<option value="null">Default Speaker</option>';
    monitorDeviceSelect.innerHTML = '<option value="null">Default Monitor</option>';

    devices.forEach(dev => {
      const makeOpt = () => {
        const o = document.createElement('option');
        o.value = dev.id;
        o.textContent = dev.name;
        return o;
      };
      if (dev.max_input_channels  > 0) inputDeviceSelect.appendChild(makeOpt());
      if (dev.max_output_channels > 0) {
        outputDeviceSelect.appendChild(makeOpt());
        monitorDeviceSelect.appendChild(makeOpt());
      }
    });

    if ([...inputDeviceSelect.options].some(o => o.value === prevIn))   inputDeviceSelect.value  = prevIn;
    if ([...outputDeviceSelect.options].some(o => o.value === prevOut)) outputDeviceSelect.value = prevOut;
    if ([...monitorDeviceSelect.options].some(o => o.value === prevMon)) monitorDeviceSelect.value = prevMon;
  } catch {
    // Backend not yet available
  }
}

// Lazy-load devices on first focus of any dropdown
[inputDeviceSelect, outputDeviceSelect, monitorDeviceSelect].forEach(sel => {
  sel.addEventListener('focus', loadAudioDevices, { once: false });
});

inputDeviceSelect.addEventListener('change', () =>
  setBackendConfig({ input_device_id: inputDeviceSelect.value }));

outputDeviceSelect.addEventListener('change', () =>
  setBackendConfig({ output_device_id: outputDeviceSelect.value }));

monitorDeviceSelect.addEventListener('change', () =>
  setBackendConfig({ monitor_device_id: monitorDeviceSelect.value }));

hearYourselfToggle.addEventListener('change', () => {
  const checked = hearYourselfToggle.checked;
  monitorContainer.style.display = checked ? 'flex' : 'none';
  monitorContainer.style.flexDirection = 'column';
  monitorContainer.setAttribute('aria-hidden', String(!checked));
  setBackendConfig({ hear_yourself: checked });
});

// ── Backend Status Polling ────────────────────────────────────────────────────

/**
 * Convert a linear 0-1 meter value to a dBFS string.
 * Returns "—" at silence.
 */
function linearToDb(linear) {
  if (linear <= 0.0001) return '—';
  const db = 20 * Math.log10(linear);
  return `${db.toFixed(0)} dB`;
}

function setBackendStatus(online) {
  if (online === backendOnline) return;
  backendOnline = online;

  if (online) {
    connDot.className = 'conn-dot connected';
    connLabel.textContent = 'Backend connected';
    streamDot.className  = 'status-dot live';
    streamStatusText.textContent = 'Audio Stream Active';
  } else {
    connDot.className = 'conn-dot error';
    connLabel.textContent = 'Backend offline';
    streamDot.className  = 'status-dot error';
    streamStatusText.textContent = 'Backend Offline';
    inputMeterFill.style.width  = '0%';
    outputMeterFill.style.width = '0%';
    inputDbVal.textContent  = '—';
    outputDbVal.textContent = '—';
  }
}

async function pollBackendStatus() {
  try {
    const res    = await fetch(`${BACKEND_URL}/status`, { signal: AbortSignal.timeout(800) });
    const status = await res.json();

    setBackendStatus(true);

    // One-time device sync on first successful poll
    if (!devicesLoaded) {
      await loadAudioDevices();
      if (status.input_device_id   != null) inputDeviceSelect.value  = String(status.input_device_id);
      if (status.output_device_id  != null) outputDeviceSelect.value = String(status.output_device_id);
      if (status.monitor_device_id != null) monitorDeviceSelect.value = String(status.monitor_device_id);
      if (typeof status.hear_yourself === 'boolean') {
        hearYourselfToggle.checked = status.hear_yourself;
        monitorContainer.style.display = status.hear_yourself ? 'flex' : 'none';
        monitorContainer.style.flexDirection = 'column';
        monitorContainer.setAttribute('aria-hidden', String(!status.hear_yourself));
      }
      devicesLoaded = true;
    }

    // VU meters — scale 0-1 linear → 0-100% bar width
    const inW  = Math.min(100, (status.input_meter  || 0) * 350);
    const outW = Math.min(100, (status.output_meter || 0) * 350);

    inputMeterFill.style.width  = `${inW}%`;
    outputMeterFill.style.width = `${outW}%`;

    inputDbVal.textContent  = linearToDb(status.input_meter  || 0);
    outputDbVal.textContent = linearToDb(status.output_meter || 0);

    // Sync bypass state if changed externally
    if (typeof status.bypass === 'boolean' && status.bypass !== voiceChangerBypass) {
      voiceChangerBypass = status.bypass;
      applyBypassUI(voiceChangerBypass);
    }
  } catch {
    setBackendStatus(false);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
loadSpeakerData();
applyBypassUI(voiceChangerBypass);   // initialise UI to correct state
setInterval(pollBackendStatus, 100);
