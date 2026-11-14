/* ==========================================================================
   voiceverb — UI controller
   Vanilla ES module. Talks to ./audio.js through its public API.
   ========================================================================== */

"use strict";

/* --------------------------------------------------------------------------
   Constants & defaults
   -------------------------------------------------------------------------- */

const STORAGE = {
  state: "voiceverb-v2.state",
  devices: "voiceverb-v2.devices",
  preset: "voiceverb-v2.preset",
};

/* Engine units: mix 0..1, predelay in seconds, width 0..2. */
const DEFAULT_STATE = {
  mix: 0.22,
  decay: 1.4,
  predelay: 0.015,
  damping: 9000,
  width: 1,
  inputDb: 0,
  outputDb: -3,
  eq: { low: 0, mid: 1, high: 0 },
  comp: { threshold: -20, ratio: 3, makeup: 0 },
  gate: { on: true, threshold: -55, floor: -60 },
  pitch: 0,
  robot: 0,
  drive: 0,
  backing: { on: false, level: 35, interval: 4 },
  bypass: false,
};

const TAG_LABELS = {
  call: "Call",
  ambiente: "Ambiente",
  efeito: "Efeitos",
};

const TAG_ORDER = ["call", "ambiente", "efeito"];

const FEATURED_PRESET_RE = /call limpa|podcast|rob[oô]|grave/i;

/* Intervals available for the backing vocal (0 = just duplicate the voice). */
const BACK_INTERVALS = [0, 3, 4, 5, 7, 12, -3, -5];

function normalizeBackInterval(value) {
  const n = Number(value);
  return BACK_INTERVALS.includes(n) ? n : DEFAULT_STATE.backing.interval;
}

const SECTION_LABELS = {
  reverb: "Reverb",
  voice: "Voz",
  effects: "Efeitos",
  advanced: "Avançado",
};

const SECTION_DEFAULTS = {
  reverb: {
    mix: DEFAULT_STATE.mix,
    decay: DEFAULT_STATE.decay,
    predelay: DEFAULT_STATE.predelay,
    damping: DEFAULT_STATE.damping,
    width: DEFAULT_STATE.width,
  },
  voice: {
    eq: { ...DEFAULT_STATE.eq },
    inputDb: DEFAULT_STATE.inputDb,
  },
  effects: {
    pitch: DEFAULT_STATE.pitch,
    robot: DEFAULT_STATE.robot,
    drive: DEFAULT_STATE.drive,
    backing: { ...DEFAULT_STATE.backing },
  },
  advanced: {
    comp: { ...DEFAULT_STATE.comp },
    gate: { ...DEFAULT_STATE.gate },
    outputDb: DEFAULT_STATE.outputDb,
  },
};

/* --------------------------------------------------------------------------
   Formatting helpers
   -------------------------------------------------------------------------- */

const numberText = (value, digits = 0) =>
  Number(value).toFixed(digits).replace(".", ",");

const signedText = (value, digits = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return numberText(0, digits);
  const body = numberText(Math.abs(n), digits);
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
};

const format = {
  percent: (v) => `${Math.round(Number(v))}%`,
  seconds: (v) => `${numberText(v, 1)} s`,
  ms: (v) => `${Math.round(Number(v))} ms`,
  khz: (v) => `${numberText(Number(v) / 1000, 1)} kHz`,
  db: (v) => {
    const n = Number(v);
    const digits = Number.isInteger(n) ? 0 : 1;
    return `${signedText(n, digits)} dB`;
  },
  ratio: (v) => `${numberText(v, Number.isInteger(Number(v)) ? 0 : 1)}:1`,
  semitones: (v) => `${signedText(v, 0)} st`,
};

/* --------------------------------------------------------------------------
   Control map
   -------------------------------------------------------------------------- */

const CONTROLS = [
  {
    id: "mix", out: "mixOut", path: ["mix"], fallback: 0.22,
    toUi: (v) => v * 100, fromUi: (v) => v / 100,
    format: format.percent, section: "reverb",
  },
  { id: "decay", out: "decayOut", path: ["decay"], fallback: 1.4, format: format.seconds, section: "reverb" },
  {
    id: "predelay", out: "predelayOut", path: ["predelay"], fallback: 0.015,
    toUi: (v) => v * 1000, fromUi: (v) => v / 1000,
    format: format.ms, section: "reverb",
  },
  { id: "damping", out: "dampingOut", path: ["damping"], fallback: 9000, format: format.khz, section: "reverb" },
  {
    id: "width", out: "widthOut", path: ["width"], fallback: 1,
    toUi: (v) => v * 100, fromUi: (v) => v / 100,
    format: format.percent, section: "reverb",
  },

  { id: "eqLow", out: "eqLowOut", path: ["eq", "low"], fallback: 0, format: format.db, section: "voice" },
  { id: "eqMid", out: "eqMidOut", path: ["eq", "mid"], fallback: 0, format: format.db, section: "voice" },
  { id: "eqHigh", out: "eqHighOut", path: ["eq", "high"], fallback: 0, format: format.db, section: "voice" },
  { id: "inputGain", out: "inputGainOut", path: ["inputDb"], fallback: 0, format: format.db, section: "voice" },

  { id: "pitch", out: "pitchOut", path: ["pitch"], fallback: 0, format: format.semitones, section: "effects" },
  { id: "robot", out: "robotOut", path: ["robot"], fallback: 0, format: format.percent, section: "effects" },
  { id: "drive", out: "driveOut", path: ["drive"], fallback: 0, format: format.percent, section: "effects" },
  {
    id: "backLevel", out: "backLevelOut", path: ["backing", "level"], fallback: 35,
    format: format.percent, section: "effects",
  },

  { id: "compThreshold", out: "compThresholdOut", path: ["comp", "threshold"], fallback: -18, format: format.db, section: "advanced" },
  { id: "compRatio", out: "compRatioOut", path: ["comp", "ratio"], fallback: 4, format: format.ratio, section: "advanced" },
  { id: "compMakeup", out: "compMakeupOut", path: ["comp", "makeup"], fallback: 0, format: format.db, section: "advanced" },
  { id: "outputGain", out: "outputGainOut", path: ["outputDb"], fallback: -3, format: format.db, section: "advanced" },
  { id: "gateThreshold", out: "gateThresholdOut", path: ["gate", "threshold"], fallback: -55, format: format.db, section: "advanced" },
  { id: "gateFloor", out: "gateFloorOut", path: ["gate", "floor"], fallback: -60, format: format.db, section: "advanced" },
];

/* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const el = {
  engineError: $("engineError"),
  micError: $("micError"),
  statusChip: $("statusChip"),
  statusText: $("statusText"),

  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  bypassBtn: $("bypassBtn"),

  outputSelect: $("outputSelect"),
  inputSelect: $("inputSelect"),
  refreshOutputs: $("refreshOutputs"),
  refreshInputs: $("refreshInputs"),
  testOutputBtn: $("testOutputBtn"),
  supportBadge: $("supportBadge"),
  supportText: $("supportText"),
  supportExplain: $("supportExplain"),
  outputHint: $("outputHint"),
  inputHint: $("inputHint"),
  activeOutput: $("activeOutput"),
  labelsWarning: $("labelsWarning"),

  presetGroups: $("presetGroups"),
  presetStatus: $("presetStatus"),

  bypassMonitor: $("monitorBypass"),
  monoState: $("monoState"),
  meter: $("meter"),
  meterFill: $("meterFill"),
  meterPeak: $("meterPeak"),
  scope: $("scope"),
  clipPill: $("clipPill"),
  clipText: $("clipText"),

  recWebmBtn: $("recWebmBtn"),
  recWavBtn: $("recWavBtn"),
  recWebmLabel: $("recWebmLabel"),
  recWavLabel: $("recWavLabel"),
  recTimer: $("recTimer"),
  recNote: $("recNote"),

  toasts: $("toasts"),

  gateOn: $("gateOn"),
  backOn: $("backOn"),
  backInterval: $("backInterval"),
};

/* --------------------------------------------------------------------------
   Runtime state
   -------------------------------------------------------------------------- */

let engine = null;
let engineLoadError = null;
let engineReady = false;

let running = false;
let starting = false;
let recording = false;
let recordingFormat = null;
let recBusy = false;
let recStartedAt = 0;
let recTicker = 0;

let localState = normalizeState({});
let activePreset = null;
let presetOrder = [];
let presetInfoById = new Map();

let devices = { inputs: [], outputs: [] };
let labelsVisible = false;
let outputRouting = false;
let localDevices = { input: "", output: "default" };
let defaultInputLabel = "";

let savedStateRaw = null;
let hadSavedState = false;

let analyserNode = null;
let timeDomain = null;
let visualRaf = 0;
let clipUntil = 0;
let lastClipState = false;
let lastAriaMeter = -1;
let lastAriaAt = 0;

let stateSaveTimer = 0;
let deviceRefreshTimer = 0;

let webmSupported = false;

/* --------------------------------------------------------------------------
   Small utilities
   -------------------------------------------------------------------------- */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function getPath(object, path) {
  return path.reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function setPath(object, path, value) {
  let current = object;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (typeof current[key] !== "object" || current[key] === null) current[key] = {};
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage can be unavailable in private modes — ignore */
  }
}

function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const eq = source.eq && typeof source.eq === "object" ? source.eq : {};
  const comp = source.comp && typeof source.comp === "object" ? source.comp : {};
  const gate = source.gate && typeof source.gate === "object" ? source.gate : {};
  const backing = source.backing && typeof source.backing === "object" ? source.backing : {};

  return {
    mix: numOr(source.mix, DEFAULT_STATE.mix),
    decay: numOr(source.decay, DEFAULT_STATE.decay),
    predelay: numOr(source.predelay, DEFAULT_STATE.predelay),
    damping: numOr(source.damping, DEFAULT_STATE.damping),
    width: numOr(source.width, DEFAULT_STATE.width),
    inputDb: numOr(source.inputDb ?? source.input, DEFAULT_STATE.inputDb),
    outputDb: numOr(source.outputDb ?? source.output, DEFAULT_STATE.outputDb),
    eq: {
      low: numOr(eq.low, DEFAULT_STATE.eq.low),
      mid: numOr(eq.mid, DEFAULT_STATE.eq.mid),
      high: numOr(eq.high, DEFAULT_STATE.eq.high),
    },
    comp: {
      threshold: numOr(comp.threshold, DEFAULT_STATE.comp.threshold),
      ratio: numOr(comp.ratio, DEFAULT_STATE.comp.ratio),
      makeup: numOr(comp.makeup, DEFAULT_STATE.comp.makeup),
    },
    gate: {
      on: boolOr(gate.on ?? source.gateOn, DEFAULT_STATE.gate.on),
      threshold: numOr(gate.threshold, DEFAULT_STATE.gate.threshold),
      floor: numOr(gate.floor, DEFAULT_STATE.gate.floor),
    },
    pitch: numOr(source.pitch, DEFAULT_STATE.pitch),
    robot: numOr(source.robot, DEFAULT_STATE.robot),
    drive: numOr(source.drive, DEFAULT_STATE.drive),
    backing: {
      on: boolOr(backing.on ?? source.backOn, DEFAULT_STATE.backing.on),
      level: numOr(backing.level, DEFAULT_STATE.backing.level),
      interval: normalizeBackInterval(backing.interval),
    },
    bypass: boolOr(source.bypass, DEFAULT_STATE.bypass),
  };
}

async function maybeAwait(value) {
  if (value && typeof value.then === "function") return value;
  return value;
}

/* --------------------------------------------------------------------------
   Toasts & inline alerts
   -------------------------------------------------------------------------- */

function toast(message, type = "info") {
  if (!message || !el.toasts) return;

  const node = document.createElement("div");
  node.className = "toast";
  node.dataset.type = type;
  node.textContent = message;
  el.toasts.appendChild(node);

  while (el.toasts.children.length > 4) {
    el.toasts.firstElementChild?.remove();
  }

  window.setTimeout(() => {
    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), 240);
  }, 4400);
}

function showAlert(node, message) {
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
}

function clearAlert(node) {
  if (!node) return;
  node.textContent = "";
  node.hidden = true;
}

/* --------------------------------------------------------------------------
   Status & transport UI
   -------------------------------------------------------------------------- */

function setStatus(text, state) {
  if (el.statusText) el.statusText.textContent = text;
  if (el.statusChip) el.statusChip.dataset.state = state;
}

function updateMonitorState() {
  if (!el.monoState) return;
  if (recording) {
    el.monoState.dataset.state = "rec";
    el.monoState.textContent = "gravando";
  } else if (running) {
    el.monoState.dataset.state = "live";
    el.monoState.textContent = "ao vivo";
  } else {
    el.monoState.dataset.state = "off";
    el.monoState.textContent = "em espera";
  }
}

function updateTransportUI() {
  const canRun = Boolean(engine) && !engineLoadError;

  if (el.startBtn) {
    el.startBtn.disabled = running || starting || !canRun;
    el.startBtn.setAttribute("aria-busy", starting ? "true" : "false");
  }
  if (el.stopBtn) el.stopBtn.disabled = !running || starting;
  if (el.bypassBtn) el.bypassBtn.disabled = !canRun;

  if (el.refreshOutputs) el.refreshOutputs.disabled = !canRun;
  if (el.refreshInputs) el.refreshInputs.disabled = !canRun;
  if (el.testOutputBtn) {
    el.testOutputBtn.disabled = !canRun;
    el.testOutputBtn.title = running
      ? "Tocar um tom pela saída escolhida"
      : "Ligue o microfone para testar a saída";
  }
  if (el.outputSelect) el.outputSelect.disabled = !canRun || !outputRouting;
  if (el.inputSelect) el.inputSelect.disabled = !canRun;

  if (el.recWebmBtn && el.recWavBtn) {
    if (!running || recBusy || starting) {
      el.recWebmBtn.disabled = true;
      el.recWavBtn.disabled = true;
    } else if (recording) {
      el.recWebmBtn.disabled = recordingFormat !== "webm";
      el.recWavBtn.disabled = recordingFormat !== "wav";
    } else {
      el.recWebmBtn.disabled = !webmSupported;
      el.recWavBtn.disabled = false;
    }
  }
}

function setBypassUI(on) {
  if (el.bypassBtn) el.bypassBtn.setAttribute("aria-pressed", on ? "true" : "false");
  if (el.bypassMonitor) {
    el.bypassMonitor.textContent = on ? "Bypass — voz direta" : "Efeitos ativos";
    el.bypassMonitor.classList.toggle("is-bypassed", on);
  }
}

/* --------------------------------------------------------------------------
   State <-> controls
   -------------------------------------------------------------------------- */

function syncControlsFromState(state) {
  localState = state;

  for (const control of CONTROLS) {
    const input = $(control.id);
    const output = $(control.out);
    if (!input || !output) continue;

    const rawValue = getPath(state, control.path);
    const engineValue = Number.isFinite(Number(rawValue)) ? Number(rawValue) : control.fallback;
    const uiValue = control.toUi ? control.toUi(engineValue) : engineValue;
    input.value = String(uiValue);

    /* The browser clamps range values — format the clamped value, not the raw one. */
    const clampedUi = Number(input.value);
    const text = control.format(clampedUi);
    output.textContent = text;
    input.setAttribute("aria-valuetext", text);
  }

  if (el.gateOn) el.gateOn.checked = Boolean(state.gate?.on);
  if (el.backOn) el.backOn.checked = Boolean(state.backing?.on);
  if (el.backInterval) {
    el.backInterval.value = String(normalizeBackInterval(state.backing?.interval));
  }
  setBypassUI(Boolean(state.bypass));
}

function stateFromControls() {
  const next = clone(localState);

  for (const control of CONTROLS) {
    const input = $(control.id);
    if (!input) continue;
    const uiValue = Number(input.value);
    setPath(next, control.path, control.fromUi ? control.fromUi(uiValue) : uiValue);
  }

  next.gate.on = Boolean(el.gateOn?.checked);
  next.backing = {
    ...(next.backing || {}),
    on: Boolean(el.backOn?.checked),
    interval: normalizeBackInterval(el.backInterval?.value),
  };
  next.bypass = el.bypassBtn?.getAttribute("aria-pressed") === "true";

  return next;
}

function renderControlOutputs() {
  for (const control of CONTROLS) {
    const input = $(control.id);
    const output = $(control.out);
    if (!input || !output) continue;
    /* The range input already holds the UI value (%, ms, %). */
    const text = control.format(Number(input.value));
    output.textContent = text;
    input.setAttribute("aria-valuetext", text);
  }
}

/* --------------------------------------------------------------------------
   Persistence
   -------------------------------------------------------------------------- */

function saveStateNow() {
  writeJSON(STORAGE.state, localState);
}

function saveStateSoon() {
  window.clearTimeout(stateSaveTimer);
  stateSaveTimer = window.setTimeout(saveStateNow, 260);
}

function saveDevices() {
  writeJSON(STORAGE.devices, {
    input: localDevices.input || "",
    output: localDevices.output || "default",
  });
}

function savePreset(id) {
  writeJSON(STORAGE.preset, id || null);
}

function pushStateToEngine(state) {
  if (!engine?.setState) return;
  try {
    const result = engine.setState(state);
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.warn("[voiceverb] setState:", error));
    }
  } catch (error) {
    console.warn("[voiceverb] setState:", error);
  }
}

function markCustomPreset() {
  if (!activePreset) return;
  activePreset = null;
  setPresetActive(null);
  updatePresetStatus();
  savePreset(null);
}

/* --------------------------------------------------------------------------
   Presets
   -------------------------------------------------------------------------- */

function getPresetList() {
  if (Array.isArray(engine?.presetList) && engine.presetList.length) {
    return engine.presetList
      .filter((preset) => preset && preset.id)
      .map((preset) => {
        const id = String(preset.id);
        return {
          id,
          /* The engine calls this preset "Natural"; in the UI it is "Call limpa". */
          name: id === "natural" ? "Call limpa" : String(preset.name || id),
          description: String(preset.description || ""),
          tag: preset.tag === "ambiente" || preset.tag === "efeito" ? preset.tag : "call",
        };
      });
  }

  if (engine?.presets && typeof engine.presets === "object") {
    return Object.entries(engine.presets).map(([id, preset]) => ({
      id,
      name: id === "natural" ? "Call limpa" : String(preset?.name || id),
      description: String(preset?.description || ""),
      tag: preset?.tag === "ambiente" || preset?.tag === "efeito" ? preset.tag : "call",
    }));
  }

  return [];
}

function renderPresets() {
  if (!el.presetGroups) return;

  const list = getPresetList();
  presetOrder = list.map((preset) => preset.id);
  presetInfoById = new Map(list.map((preset) => [preset.id, preset]));
  el.presetGroups.textContent = "";

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "preset-empty";
    empty.textContent = "O motor não expôs presets. Ajuste os controles manualmente.";
    el.presetGroups.appendChild(empty);
    updatePresetStatus();
    return;
  }

  for (const tag of TAG_ORDER) {
    const groupItems = list.filter((preset) => preset.tag === tag);
    if (!groupItems.length) continue;

    const group = document.createElement("div");
    group.className = "preset-group";

    const label = document.createElement("span");
    label.className = "preset-group-label";
    label.textContent = TAG_LABELS[tag] || tag;
    group.appendChild(label);

    const chips = document.createElement("div");
    chips.className = "chips";

    for (const preset of groupItems) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.preset = preset.id;
      chip.dataset.tag = preset.tag;
      chip.textContent = preset.name;
      chip.setAttribute("aria-pressed", "false");
      if (preset.description) chip.title = preset.description;
      if (FEATURED_PRESET_RE.test(preset.name)) chip.dataset.featured = "true";
      chips.appendChild(chip);
    }

    group.appendChild(chips);
    el.presetGroups.appendChild(group);
  }

  if (activePreset && presetInfoById.has(activePreset)) {
    setPresetActive(activePreset);
  } else if (activePreset) {
    activePreset = null;
    savePreset(null);
  }

  updatePresetStatus();
}

function setPresetActive(id) {
  el.presetGroups?.querySelectorAll(".chip").forEach((chip) => {
    const isActive = Boolean(id) && chip.dataset.preset === id;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updatePresetStatus() {
  if (!el.presetStatus) return;
  if (activePreset && presetInfoById.has(activePreset)) {
    el.presetStatus.textContent = presetInfoById.get(activePreset).name;
  } else if (activePreset) {
    el.presetStatus.textContent = activePreset;
  } else {
    el.presetStatus.textContent = "Personalizado";
  }
}

function pickDefaultPresetId() {
  const list = getPresetList();
  const exact = list.find((preset) => /call\s*limpa/i.test(preset.name));
  if (exact) return exact.id;
  const call = list.find((preset) => preset.tag === "call");
  return call ? call.id : null;
}

async function applyPreset(id, options = {}) {
  const { silent = false } = options;
  if (!id) return;

  const info = presetInfoById.get(id);
  const definition = engine?.presets?.[id];
  const presetHasBacking = Boolean(definition?.backing);
  const previousBacking = { ...(localState.backing || DEFAULT_STATE.backing) };

  if (definition && typeof definition === "object") {
    localState = normalizeState(definition);
    /* The backing vocal is an extra on top of the preset. Only the "Back vocal"
       preset defines its own setting; the others keep whatever was already on. */
    if (!presetHasBacking) localState.backing = previousBacking;
    syncControlsFromState(localState);
  }

  if (engine?.applyPreset) {
    try {
      await maybeAwait(engine.applyPreset(id));
      if (!presetHasBacking && engine.setState) {
        await maybeAwait(engine.setState({ backing: previousBacking }));
      }
    } catch (error) {
      console.warn("[voiceverb] applyPreset:", error);
      if (!silent) toast("Não foi possível aplicar este preset no motor.", "error");
    }
  }

  if (running && engine?.getState) {
    try {
      localState = normalizeState(engine.getState());
      syncControlsFromState(localState);
    } catch {
      /* keep UI values */
    }
  }

  activePreset = id;
  setPresetActive(id);
  updatePresetStatus();
  savePreset(id);
  saveStateNow();

  if (!silent) {
    toast(`Preset “${info?.name || id}” aplicado.`, "ok");
  }
}

/* --------------------------------------------------------------------------
   Devices
   -------------------------------------------------------------------------- */

function normalizeDeviceList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((device) => {
      if (typeof device === "string") return { deviceId: device, label: "" };
      return {
        deviceId: String(device?.deviceId ?? device?.id ?? ""),
        label: String(device?.label ?? ""),
      };
    })
    .filter((device) => device.deviceId && device.deviceId !== "default");
}

function isVirtualName(name) {
  return /cable|blackhole|vb-audio|voicemeeter|virtual|loopback|soundflower/i.test(name || "");
}

function deviceLabel(device, index, kind) {
  const clean = (device.label || "").trim();
  if (clean) return clean;
  return kind === "output" ? `Saída ${index + 1}` : `Microfone ${index + 1}`;
}

function populateSelect(select, items, selected, kind) {
  if (!select) return;

  select.textContent = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = kind === "output" ? "default" : "";
  if (kind === "input" && defaultInputLabel) {
    const suffix = isVirtualName(defaultInputLabel) ? " · virtual" : "";
    defaultOption.textContent = `Padrão do sistema — ${defaultInputLabel}${suffix}`;
  } else {
    defaultOption.textContent = "Padrão do sistema";
  }
  select.appendChild(defaultOption);

  items.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    const label = deviceLabel(device, index, kind);
    option.textContent = isVirtualName(label) ? `${label} · virtual` : label;
    select.appendChild(option);
  });

  const exists =
    selected === (kind === "output" ? "default" : "") ||
    items.some((device) => device.deviceId === selected);

  select.value = exists ? selected : kind === "output" ? "default" : "";
}

function renderDeviceSelects() {
  const savedOutput = localDevices.output || "default";
  const savedInput = localDevices.input || "";

  const outputExists =
    savedOutput === "default" || devices.outputs.some((device) => device.deviceId === savedOutput);
  const inputExists =
    !savedInput || devices.inputs.some((device) => device.deviceId === savedInput);

  if (!outputExists) {
    localDevices.output = "default";
    saveDevices();
  }
  if (!inputExists) {
    localDevices.input = "";
    saveDevices();
  }

  populateSelect(el.outputSelect, devices.outputs, localDevices.output, "output");
  populateSelect(el.inputSelect, devices.inputs, localDevices.input, "input");

  updateDeviceHints();
  updateActiveOutput();
}

function updateDeviceHints() {
  if (el.labelsWarning) el.labelsWarning.hidden = labelsVisible;

  if (!el.inputHint) return;

  const label = selectedInputLabel();
  if (isSilentLoopbackName(label)) {
    el.inputHint.textContent = `Atenção: “${label}” é uma entrada virtual que fica muda, a menos que algo seja enviado a ela. Escolha o microfone físico acima.`;
    return;
  }

  el.inputHint.textContent = running
    ? "Trocar o microfone reinicia a captura."
    : "Permissão do microfone é pedida ao ligar.";
}

/* "CABLE Output", "Stereo Mix" and similar inputs are loopbacks: they only carry
   a signal if something is being sent to them. If they are the Windows default,
   capture ends up silent and it looks like the microphone is not working. */
function isSilentLoopbackName(name) {
  return /cable\s*out|out.*cable|loopback|stereo mix|mixagem est|what u hear|monitor of/i.test(
    name || ""
  );
}

function selectedInputLabel() {
  const selected = localDevices.input || "";
  if (selected) {
    const device = devices.inputs.find((item) => item.deviceId === selected);
    if (device?.label) return device.label;
    const option = el.inputSelect?.selectedOptions?.[0];
    return (option?.textContent || "").replace(/\s*·\s*virtual$/i, "");
  }
  return defaultInputLabel;
}

function activeOutputLabel() {
  if (!el.outputSelect) return "padrão do sistema";
  const option = el.outputSelect.selectedOptions?.[0];
  return (option?.textContent || "Padrão do sistema").replace(/\s*·\s*virtual$/i, "");
}

function updateActiveOutput() {
  if (!el.activeOutput) return;

  const label = activeOutputLabel();
  let text;

  if (!outputRouting) {
    text = "Saída ativa: padrão do sistema (roteamento indisponível)";
  } else if (running) {
    text = `Saída ativa: ${label}`;
    if (isVirtualName(label)) text += " · você não vai se ouvir";
  } else {
    const selected = localDevices.output || "default";
    text =
      selected === "default"
        ? "Saída selecionada: padrão do sistema"
        : `Saída selecionada: ${label} · aplicada ao ligar`;
  }

  el.activeOutput.textContent = text;
  el.activeOutput.title = text;
}

function updateSupportBadge() {
  if (!el.supportBadge || !el.supportText || !el.supportExplain) return;

  if (!engine) {
    el.supportBadge.dataset.state = "warn";
    el.supportText.textContent = "Motor de áudio indisponível";
    el.supportExplain.textContent =
      "A interface está pronta, mas audio.js não carregou. Recarregue a página.";
    if (el.outputHint) el.outputHint.textContent = "O motor de áudio não está disponível.";
    return;
  }

  if (outputRouting) {
    el.supportBadge.dataset.state = "ok";
    el.supportText.textContent = "Roteamento de saída disponível";
    el.supportExplain.textContent =
      "O áudio processado pode ir direto para o cabo virtual escolhido acima.";
    if (el.outputHint) {
      el.outputHint.textContent =
        "Escolha o cabo virtual (CABLE Input / BlackHole) para enviar a voz à call.";
    }
  } else {
    el.supportBadge.dataset.state = "warn";
    el.supportText.textContent = "Roteamento de saída não suportado";
    el.supportExplain.textContent =
      "Precisa de Chrome ou Edge em https/localhost. O app ainda toca no dispositivo padrão.";
    if (el.outputHint) {
      el.outputHint.textContent =
        "Seu navegador não permite escolher a saída. O áudio toca no padrão do sistema.";
    }
  }
}

async function refreshDevices(options = {}) {
  const { silent = true } = options;

  if (!engine?.listDevices) {
    updateSupportBadge();
    updateDeviceHints();
    return;
  }

  try {
    const result = await maybeAwait(engine.listDevices());

    devices = {
      inputs: normalizeDeviceList(result?.inputs),
      outputs: normalizeDeviceList(result?.outputs),
    };
    labelsVisible = Boolean(result?.labelsVisible);
    outputRouting =
      typeof engine.supportsOutputRouting === "function"
        ? Boolean(engine.supportsOutputRouting())
        : Boolean(engine.setOutputDevice);

    try {
      const allDevices = await navigator.mediaDevices?.enumerateDevices?.();
      const defaultDevice = allDevices?.find(
        (device) => device.kind === "audioinput" && device.deviceId === "default"
      );
      defaultInputLabel = (defaultDevice?.label || "").replace(
        /^(default|communications)\s*-\s*/i,
        ""
      );
    } catch {
      defaultInputLabel = "";
    }

    const missingSavedOutput =
      (localDevices.output || "default") !== "default" &&
      !devices.outputs.some((device) => device.deviceId === localDevices.output);

    renderDeviceSelects();
    updateSupportBadge();
    updateTransportUI();

    if (missingSavedOutput) {
      toast("A saída salva não está mais disponível. Usando o padrão do sistema.", "warn");
    }

    if (!silent) toast("Dispositivos atualizados.", "ok");
  } catch (error) {
    console.warn("[voiceverb] listDevices:", error);
    if (!silent) {
      toast("Não foi possível listar os dispositivos de áudio. Verifique a permissão do microfone.", "error");
    }
    updateSupportBadge();
  }
}

async function onOutputChange() {
  const previousOutput = localDevices.output || "default";
  const nextOutput = el.outputSelect.value || "default";
  localDevices.output = nextOutput;
  saveDevices();
  updateActiveOutput();

  if (!running) {
    toast(
      nextOutput === "default"
        ? "Saída padrão selecionada."
        : `Saída “${activeOutputLabel()}” será aplicada ao ligar.`,
      "info"
    );
    return;
  }

  if (!engine?.setOutputDevice || !outputRouting) {
    toast("Este navegador não permite trocar a saída de áudio.", "warn");
    return;
  }

  try {
    await maybeAwait(engine.setOutputDevice(nextOutput));
    updateActiveOutput();
    toast(`Saída ativa: ${activeOutputLabel()}.`, "ok");
  } catch (error) {
    console.warn("[voiceverb] setOutputDevice:", error);
    localDevices.output = previousOutput;
    saveDevices();
    if (el.outputSelect) el.outputSelect.value = previousOutput;
    updateActiveOutput();
    toast("Falha ao trocar a saída. Mantivemos o dispositivo anterior.", "error");
  }
}

async function onInputChange() {
  const nextInput = el.inputSelect.value || "";
  localDevices.input = nextInput;
  saveDevices();
  updateDeviceHints();

  if (!running || !engine?.start) return;
  if (recording) {
    toast("Pare a gravação antes de trocar o microfone.", "warn");
    return;
  }

  starting = true;
  updateTransportUI();
  setStatus("Trocando microfone…", "busy");

  try {
    /* "" means the system default; undefined would make the engine reuse its previous input. */
    await maybeAwait(engine.start({ inputId: nextInput }));
    await refreshDevices({ silent: true });
    setStatus("Ao vivo", "live");
    toast("Microfone atualizado.", "ok");
  } catch (error) {
    console.warn("[voiceverb] restart with input:", error);
    toast("Não foi possível usar este microfone. Tente outro dispositivo.", "error");
    if (typeof engine.isRunning === "function" && !engine.isRunning()) {
      running = false;
      setStatus("Desligado", "off");
    } else {
      setStatus(running ? "Ao vivo" : "Desligado", running ? "live" : "off");
    }
  } finally {
    starting = false;
    updateTransportUI();
    updateMonitorState();
  }
}

/* --------------------------------------------------------------------------
   Start / stop
   -------------------------------------------------------------------------- */

async function applySavedOutput() {
  const desired = localDevices.output || "default";

  if (!outputRouting || !engine?.setOutputDevice) return;

  try {
    await maybeAwait(engine.setOutputDevice(desired));
    updateActiveOutput();
  } catch (error) {
    console.warn("[voiceverb] applySavedOutput:", error);
    localDevices.output = "default";
    saveDevices();
    if (el.outputSelect) el.outputSelect.value = "default";
    updateActiveOutput();
    if (desired !== "default") {
      toast("A saída salva não pôde ser usada. Usando o padrão do sistema.", "warn");
    }
  }
}

function handleStartError(error) {
  const name = error?.name || "";
  let message = "Não foi possível ligar o microfone.";

  if (name === "NotAllowedError" || name === "SecurityError") {
    message =
      "Permissão negada. Permita o microfone no navegador e abra o app em https ou localhost.";
  } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    message = "Nenhum microfone encontrado. Conecte um dispositivo e tente de novo.";
  } else if (name === "NotReadableError" || name === "TrackStartError") {
    message = "O microfone está em uso por outro app. Feche o outro programa e tente de novo.";
  } else if (name === "OverconstrainedError") {
    message = "O microfone escolhido não está disponível. Selecione outro dispositivo.";
  } else if (error?.message) {
    message = `Não foi possível ligar o microfone: ${error.message}`;
  }

  showAlert(el.micError, message);
  toast(message, "error");
  console.error("[voiceverb] start:", error);
}

async function startMic() {
  if (running || starting) return;

  if (!engine) {
    toast("O motor de áudio (audio.js) não carregou. Recarregue a página.", "error");
    return;
  }

  starting = true;
  clearAlert(el.micError);
  setStatus("Pedindo microfone…", "busy");
  updateTransportUI();

  try {
    /* "" means the system default; undefined would make the engine reuse its previous input. */
    await maybeAwait(engine.start({ inputId: localDevices.input || "" }));

    if (typeof engine.isRunning === "function" && !engine.isRunning()) {
      throw new Error("O motor não ficou pronto.");
    }

    running = true;
    updateMonitorState();

    await refreshDevices({ silent: true });
    await applySavedOutput();

    if (!hadSavedState && activePreset) {
      await applyPreset(activePreset, { silent: true });
    } else {
      pushStateToEngine(localState);
      syncControlsFromState(localState);
    }

    hadSavedState = true;
    saveStateNow();

    setStatus("Ao vivo", "live");
    updateMonitorState();
    updateActiveOutput();
    updateTransportUI();

    toast(
      isVirtualName(activeOutputLabel())
        ? "Ao vivo. Saída virtual ativa — você não vai se ouvir, isso é esperado."
        : "Ao vivo. Use fones ao monitorar para evitar realimentação.",
      "ok"
    );

    const chosenInput = selectedInputLabel();
    if (isSilentLoopbackName(chosenInput)) {
      toast(
        `A entrada “${chosenInput}” é um cabo virtual e fica muda. Selecione o microfone físico no campo Entrada.`,
        "warn"
      );
    }
  } catch (error) {
    running = false;
    handleStartError(error);
    setStatus("Desligado", "off");
    updateMonitorState();
    try {
      await maybeAwait(engine.stop?.());
    } catch {
      /* ignore */
    }
  } finally {
    starting = false;
    updateTransportUI();
    updateMonitorState();
  }
}

async function stopMic(options = {}) {
  const { silent = false } = options;
  if (starting) return;
  if (!running && !engine?.isRunning?.()) {
    updateTransportUI();
    return;
  }

  if (recording) {
    await finishRecording({ download: true, silent: true });
  }

  try {
    await maybeAwait(engine?.stop?.());
  } catch (error) {
    console.warn("[voiceverb] stop:", error);
  }

  running = false;
  analyserNode = null;
  timeDomain = null;
  clipUntil = 0;
  setStatus("Desligado", "off");
  updateMonitorState();
  updateTransportUI();
  updateActiveOutput();
  updateDeviceHints();

  if (!silent) toast("Microfone desligado. Seus ajustes foram mantidos.", "info");
}

/* --------------------------------------------------------------------------
   Bypass
   -------------------------------------------------------------------------- */

async function toggleBypass(forceValue, options = {}) {
  const { silent = false } = options;
  const currentlyOn = el.bypassBtn?.getAttribute("aria-pressed") === "true";
  const next = typeof forceValue === "boolean" ? forceValue : !currentlyOn;

  setBypassUI(next);
  localState.bypass = next;
  saveStateSoon();

  if (engine?.setState) {
    try {
      await maybeAwait(engine.setState({ bypass: next }));
    } catch (error) {
      console.warn("[voiceverb] bypass:", error);
      if (!silent) toast("Não foi possível alternar o bypass.", "error");
      return;
    }
  }

  if (!silent) {
    toast(
      next
        ? "Bypass ligado: a voz segue sem efeitos."
        : "Bypass desligado: os efeitos estão de volta.",
      next ? "warn" : "ok"
    );
  }
}

/* --------------------------------------------------------------------------
   Test tone
   -------------------------------------------------------------------------- */

async function testOutput() {
  if (!engine?.playTestTone) {
    toast("Teste de saída indisponível neste motor.", "error");
    return;
  }

  if (!running) {
    toast("Ligue o microfone para testar a saída de áudio.", "warn");
    return;
  }

  toast(`Tocando tom de teste em ${activeOutputLabel()}…`, "info");

  try {
    await maybeAwait(engine.playTestTone());
  } catch (error) {
    console.warn("[voiceverb] playTestTone:", error);
    toast(
      "Não foi possível tocar o teste. Verifique se a saída existe e se o microfone está ligado.",
      "error"
    );
  }
}

/* --------------------------------------------------------------------------
   Recording
   -------------------------------------------------------------------------- */

function detectWebmSupport() {
  if (typeof window.MediaRecorder === "undefined") return false;
  if (typeof MediaRecorder.isTypeSupported !== "function") return true;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].some((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

function updateRecordingUI() {
  if (!el.recWebmBtn || !el.recWavBtn) return;

  const webmActive = recording && recordingFormat === "webm";
  const wavActive = recording && recordingFormat === "wav";

  el.recWebmBtn.setAttribute("aria-pressed", webmActive ? "true" : "false");
  el.recWavBtn.setAttribute("aria-pressed", wavActive ? "true" : "false");
  if (el.recWebmLabel) el.recWebmLabel.textContent = webmActive ? "Parar e baixar" : "Gravar WebM";
  if (el.recWavLabel) el.recWavLabel.textContent = wavActive ? "Parar e baixar" : "Gravar WAV";

  if (el.recTimer) el.recTimer.hidden = !recording;

  if (el.recNote) {
    el.recNote.classList.toggle("is-live", recording);
    el.recNote.classList.remove("is-error");

    if (recording) {
      el.recNote.textContent = `Gravando ${recordingFormat === "wav" ? "WAV (sem perdas)" : "WebM (Opus)"}. Clique de novo para parar e baixar.`;
    } else if (!webmSupported) {
      el.recNote.textContent = "WebM não é suportado neste navegador. Use WAV.";
    } else {
      el.recNote.textContent = "WebM (Opus) é menor; WAV é sem perdas. Um formato por vez.";
    }
  }

  updateTransportUI();
}

function recTick() {
  if (!el.recTimer) return;
  const seconds = Math.max(0, Math.floor((Date.now() - recStartedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  el.recTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function startRecTimer() {
  window.clearInterval(recTicker);
  recTick();
  recTicker = window.setInterval(recTick, 250);
}

function stopRecTimer() {
  window.clearInterval(recTicker);
  recTicker = 0;
}

function filenameStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function downloadBlob(blob, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `voiceverb-${filenameStamp()}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function startRecording(format) {
  if (!running) {
    toast("Ligue o microfone antes de gravar.", "warn");
    return;
  }

  if (recBusy) return;

  if (recording) {
    if (recordingFormat === format) await finishRecording({ download: true });
    else toast("Pare a gravação atual antes de iniciar outro formato.", "warn");
    return;
  }

  if (format === "webm" && !webmSupported) {
    toast("WebM não é suportado neste navegador. Use WAV.", "warn");
    return;
  }

  if (!engine?.startRecording) {
    toast("Gravação indisponível neste motor.", "error");
    return;
  }

  recBusy = true;
  updateTransportUI();

  try {
    await maybeAwait(engine.startRecording(format));

    if (typeof engine.isRecording === "function" && !engine.isRecording()) {
      throw new Error("O motor não iniciou a gravação.");
    }

    recording = true;
    recordingFormat = format;
    recStartedAt = Date.now();
    startRecTimer();
    setStatus("Gravando", "rec");
    updateMonitorState();
    updateRecordingUI();
  } catch (error) {
    console.warn("[voiceverb] startRecording:", error);
    recording = false;
    recordingFormat = null;
    setStatus(running ? "Ao vivo" : "Desligado", running ? "live" : "off");
    updateMonitorState();
    updateRecordingUI();

    if (el.recNote) {
      el.recNote.classList.add("is-error");
      el.recNote.textContent =
        nameToRecordingMessage(error) || "Não foi possível iniciar a gravação. Verifique o suporte do navegador.";
    }
    toast("Falha ao iniciar a gravação.", "error");
  } finally {
    recBusy = false;
    updateTransportUI();
  }
}

function nameToRecordingMessage(error) {
  if (error?.name === "NotSupportedError") return "Formato de gravação não suportado neste navegador.";
  if (error?.message) return error.message;
  return "";
}

async function finishRecording(options = {}) {
  const { download = true, silent = false } = options;
  if (!recording) return null;

  const format = recordingFormat || "webm";
  recording = false;
  recordingFormat = null;
  recBusy = true;
  stopRecTimer();
  updateRecordingUI();
  setStatus("Salvando gravação…", "busy");

  try {
    const blob = await maybeAwait(engine?.stopRecording?.());
    const formatLabel = format === "wav" ? "WAV" : "WebM";

    if (blob && blob.size > 0) {
      if (download) downloadBlob(blob, format === "wav" ? "wav" : "webm");
      if (!silent) {
        toast(
          `Gravação ${formatLabel} salva (${Math.max(1, Math.round(blob.size / 1024))} KB).`,
          "ok"
        );
      }
    } else if (!silent) {
      toast("Nenhum áudio foi capturado na gravação.", "warn");
    }

    return blob;
  } catch (error) {
    console.warn("[voiceverb] stopRecording:", error);
    if (!silent) toast("Não foi possível finalizar a gravação.", "error");
    return null;
  } finally {
    recBusy = false;
    setStatus(running ? "Ao vivo" : "Desligado", running ? "live" : "off");
    updateMonitorState();
    updateRecordingUI();
    updateTransportUI();
  }
}

/* --------------------------------------------------------------------------
   Meter & scope
   -------------------------------------------------------------------------- */

function prepareCanvas() {
  const canvas = el.scope;
  if (!canvas) return null;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth || 640);
  const height = Math.max(1, canvas.clientHeight || 120);

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  return { context, width, height };
}

function drawGrid(context, width, height) {
  context.lineWidth = 1;
  context.strokeStyle = "rgba(255, 255, 255, 0.045)";
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  context.strokeStyle = "rgba(255, 255, 255, 0.028)";
  context.beginPath();
  for (let i = 1; i < 4; i += 1) {
    const x = (width / 4) * i;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  context.stroke();
}

function drawIdle(timestamp) {
  const prepared = prepareCanvas();
  if (!prepared) return;

  const { context, width, height } = prepared;
  drawGrid(context, width, height);

  const time = timestamp / 1000;
  const amplitude = Math.max(2, height * 0.035);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(103, 232, 249, 0.05)");
  gradient.addColorStop(0.5, "rgba(167, 139, 250, 0.3)");
  gradient.addColorStop(1, "rgba(103, 232, 249, 0.05)");

  context.strokeStyle = gradient;
  context.lineWidth = 1.4;
  context.beginPath();

  for (let x = 0; x <= width; x += 2) {
    const phase = x / width;
    const y =
      height / 2 +
      Math.sin(phase * Math.PI * 4 + time * 0.85) *
        amplitude *
        Math.sin(phase * Math.PI) *
        (0.55 + 0.45 * Math.sin(time * 0.4));
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }

  context.stroke();
  updateMeterUI(0, false);
}

function drawWave(data, clipping) {
  const prepared = prepareCanvas();
  if (!prepared) return;

  const { context, width, height } = prepared;
  drawGrid(context, width, height);

  const gradient = context.createLinearGradient(0, 0, width, 0);
  if (clipping) {
    gradient.addColorStop(0, "#fb7185");
    gradient.addColorStop(1, "#f43f5e");
  } else {
    gradient.addColorStop(0, "#67e8f9");
    gradient.addColorStop(0.6, "#8be9fd");
    gradient.addColorStop(1, "#a78bfa");
  }

  context.strokeStyle = gradient;
  context.lineWidth = 1.6;
  context.beginPath();

  const step = data.length / width;

  for (let x = 0; x < width; x += 1) {
    const sample = data[Math.floor(x * step)] / 128 - 1;
    const y = height / 2 - sample * (height / 2 - 4);
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }

  context.stroke();
}

function updateMeterUI(peak, clipping) {
  const percent = Math.min(100, Math.max(0, peak * 118));

  if (el.meterFill) el.meterFill.style.width = `${percent.toFixed(1)}%`;
  if (el.meterPeak) {
    el.meterPeak.hidden = percent <= 1;
    el.meterPeak.style.left = `calc(${percent.toFixed(1)}% - 1px)`;
  }
  if (el.meter) el.meter.classList.toggle("clipping", clipping);

  if (clipping !== lastClipState) {
    lastClipState = clipping;
    if (el.clipPill) el.clipPill.dataset.clipping = clipping ? "true" : "false";
    if (el.clipText) el.clipText.textContent = clipping ? "Clip! reduza o ganho" : "Sem clip";
  }

  const now = performance.now();
  if (el.meter && now - lastAriaAt > 140) {
    lastAriaAt = now;
    const rounded = Math.round(percent);
    if (rounded !== lastAriaMeter) {
      lastAriaMeter = rounded;
      el.meter.setAttribute("aria-valuenow", String(rounded));
    }
  }
}

function visualFrame(timestamp) {
  const analyser = running && engine?.getAnalyser ? engine.getAnalyser() : null;

  if (analyser) {
    if (analyser !== analyserNode) {
      analyserNode = analyser;
      timeDomain = new Uint8Array(analyser.fftSize || 1024);
    }

    if (timeDomain && timeDomain.length !== analyser.fftSize) {
      timeDomain = new Uint8Array(analyser.fftSize);
    }

    analyser.getByteTimeDomainData(timeDomain);

    let peak = 0;
    for (let i = 0; i < timeDomain.length; i += 1) {
      const value = Math.abs(timeDomain[i] - 128) / 128;
      if (value > peak) peak = value;
    }

    if (peak > 0.985) clipUntil = timestamp + 900;
    const clipping = timestamp < clipUntil;
    updateMeterUI(peak, clipping);
    drawWave(timeDomain, clipping);
  } else {
    analyserNode = null;
    drawIdle(timestamp);
  }

  visualRaf = requestAnimationFrame(visualFrame);
}

function startVisualLoop() {
  cancelAnimationFrame(visualRaf);
  visualRaf = requestAnimationFrame(visualFrame);
}

/* --------------------------------------------------------------------------
   Sections
   -------------------------------------------------------------------------- */

function resetSection(section) {
  const defaults = SECTION_DEFAULTS[section];
  if (!defaults) return;

  const next = clone(localState);

  for (const [key, value] of Object.entries(defaults)) {
    if (value && typeof value === "object") {
      next[key] = { ...(next[key] || {}), ...value };
    } else {
      next[key] = value;
    }
  }

  localState = next;
  syncControlsFromState(localState);
  pushStateToEngine(localState);
  markCustomPreset();
  saveStateNow();
  toast(`Seção ${SECTION_LABELS[section]} redefinida.`, "info");
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, [contenteditable='true'], [contenteditable='']"));
}

function handleShortcut(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (isTypingTarget(event.target)) return;

  const key = event.key.toLowerCase();

  if (key === "m") {
    event.preventDefault();
    if (running) stopMic();
    else startMic();
    return;
  }

  if (key === "r") {
    event.preventDefault();
    void startRecording("webm");
    return;
  }

  if (key === "b") {
    event.preventDefault();
    void toggleBypass();
    return;
  }

  if (key === "v") {
    event.preventDefault();
    if (el.backOn) {
      el.backOn.checked = !el.backOn.checked;
      el.backOn.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    const id = presetOrder[index];
    if (!id) return;
    event.preventDefault();
    void applyPreset(id);
  }
}

function wireEvents() {
  el.startBtn?.addEventListener("click", () => void startMic());
  el.stopBtn?.addEventListener("click", () => void stopMic());
  el.bypassBtn?.addEventListener("click", () => void toggleBypass());

  el.refreshOutputs?.addEventListener("click", () => void refreshDevices({ silent: false }));
  el.refreshInputs?.addEventListener("click", () => void refreshDevices({ silent: false }));
  el.testOutputBtn?.addEventListener("click", () => void testOutput());

  el.outputSelect?.addEventListener("change", () => void onOutputChange());
  el.inputSelect?.addEventListener("change", () => void onInputChange());

  el.recWebmBtn?.addEventListener("click", () => {
    if (recording && recordingFormat === "webm") void finishRecording({ download: true });
    else void startRecording("webm");
  });

  el.recWavBtn?.addEventListener("click", () => {
    if (recording && recordingFormat === "wav") void finishRecording({ download: true });
    else void startRecording("wav");
  });

  for (const control of CONTROLS) {
    const input = $(control.id);
    input?.addEventListener("input", () => {
      renderControlOutputs();
      localState = stateFromControls();
      markCustomPreset();
      if (running) pushStateToEngine(localState);
      saveStateSoon();
    });
  }

  el.gateOn?.addEventListener("change", () => {
    localState = stateFromControls();
    markCustomPreset();
    if (running) pushStateToEngine(localState);
    saveStateSoon();
  });

  const onBackingChange = () => {
    localState = stateFromControls();
    markCustomPreset();
    if (running) pushStateToEngine(localState);
    saveStateSoon();
  };

  el.backOn?.addEventListener("change", onBackingChange);
  el.backInterval?.addEventListener("change", onBackingChange);

  document.querySelectorAll("[data-reset]").forEach((button) => {
    button.addEventListener("click", () => resetSection(button.dataset.reset));
  });

  el.presetGroups?.addEventListener("click", (event) => {
    const chip = event.target.closest?.(".chip[data-preset]");
    if (!chip) return;
    void applyPreset(chip.dataset.preset);
  });

  document.addEventListener("keydown", handleShortcut);

  navigator.mediaDevices?.addEventListener?.("devicechange", () => {
    window.clearTimeout(deviceRefreshTimer);
    deviceRefreshTimer = window.setTimeout(() => void refreshDevices({ silent: true }), 450);
  });

  window.addEventListener("pagehide", () => {
    saveStateNow();
    if (recording) {
      try {
        void engine?.stopRecording?.();
      } catch {
        /* ignore */
      }
    }
    try {
      void engine?.stop?.();
    } catch {
      /* ignore */
    }
  });
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function renderEngineError() {
  showAlert(
    el.engineError,
    "Não foi possível carregar o motor de áudio (audio.js). A interface continua disponível, mas o microfone e os presets ficam desligados. Recarregue a página ou confirme que audio.js está na mesma pasta."
  );

  if (el.presetGroups) {
    el.presetGroups.textContent = "";
    const empty = document.createElement("p");
    empty.className = "preset-empty";
    empty.textContent = "Presets indisponíveis: o motor de áudio não carregou.";
    el.presetGroups.appendChild(empty);
  }

  if (el.presetStatus) el.presetStatus.textContent = "Motor indisponível";
  setStatus("Motor indisponível", "off");
  updateSupportBadge();
  updateTransportUI();
}

async function boot() {
  savedStateRaw = readJSON(STORAGE.state);
  hadSavedState = Boolean(savedStateRaw);
  localState = normalizeState(savedStateRaw || {});

  const savedDevices = readJSON(STORAGE.devices);
  localDevices = {
    input: typeof savedDevices?.input === "string" ? savedDevices.input : "",
    output: typeof savedDevices?.output === "string" ? savedDevices.output : "default",
  };

  const savedPreset = readJSON(STORAGE.preset);
  activePreset = typeof savedPreset === "string" && savedPreset ? savedPreset : null;

  webmSupported = detectWebmSupport();

  try {
    engine = await import("./audio.js");
    engineReady = true;
  } catch (error) {
    engineLoadError = error;
    console.error("[voiceverb] audio.js import failed:", error);
  }

  if (engine && !activePreset && !hadSavedState) {
    activePreset = pickDefaultPresetId();
  }

  if (!hadSavedState && activePreset && engine?.presets?.[activePreset]) {
    localState = normalizeState(engine.presets[activePreset]);
  }

  syncControlsFromState(localState);
  wireEvents();
  updateRecordingUI();
  updateTransportUI();
  updateMonitorState();
  startVisualLoop();

  if (engine) {
    outputRouting =
      typeof engine.supportsOutputRouting === "function"
        ? Boolean(engine.supportsOutputRouting())
        : Boolean(engine.setOutputDevice);

    renderPresets();
    updateSupportBadge();
    await refreshDevices({ silent: true });
    updateSupportBadge();
    updateTransportUI();
    updateRecordingUI();
  } else {
    renderEngineError();
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showAlert(
      el.micError,
      "API de microfone indisponível. Abra o app por http://localhost ou https em um navegador atualizado."
    );
    if (el.startBtn) el.startBtn.disabled = true;
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline support is optional */
    });
  }
}

boot();
