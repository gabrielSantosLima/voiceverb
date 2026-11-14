/**
 * voiceverb — audio engine (ES module, no build step).
 *
 * Chain:
 *   mic -> inputGain -> highpass(80 Hz) -> [pitch worklet | bypass]
 *       -> backing vocal (2 harmony worklets in parallel) -> drive
 *       -> robot (ring mod) -> 3-band EQ -> compressor + makeup -> gate
 *       -> { dry | predelay -> convolver -> damping -> M/S width } -> mix
 *       -> crossfade bypass -> output -> limiter -> analyser / destination /
 *          recording (WebM or WAV)
 *
 * Pitch: AudioWorklet defined through a Blob URL (two Hann grains, delay lines).
 * If AudioWorklet fails, the clean path keeps working (pass-through).
 */

/* ------------------------------------------------------------------ */
/* Presets and default state                                           */
/* ------------------------------------------------------------------ */

export const DEFAULT_STATE = {
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
  inputId: "",
  outputDevice: "",
};

export const presets = {
  natural: {
    mix: 0.2, decay: 1.4, predelay: 0.015, damping: 9000, width: 1,
    inputDb: 0, outputDb: -3,
    eq: { low: 0, mid: 1, high: 0 },
    comp: { threshold: -20, ratio: 3, makeup: 0 },
    gate: { on: true, threshold: -55, floor: -60 },
  },
  podcast: {
    mix: 0.14, decay: 0.8, predelay: 0.008, damping: 12000, width: 0.95,
    inputDb: 2, outputDb: -3,
    eq: { low: -1, mid: 2, high: 0.5 },
    comp: { threshold: -24, ratio: 4, makeup: 3 },
    gate: { on: true, threshold: -52, floor: -62 },
  },
  sala: {
    mix: 0.22, decay: 1.1, predelay: 0.012, damping: 9000, width: 1,
    inputDb: 0, outputDb: -3,
    eq: { low: 0, mid: 1, high: 0 },
    comp: { threshold: -20, ratio: 3, makeup: 0 },
    gate: { on: true, threshold: -55, floor: -60 },
  },
  placa: {
    mix: 0.38, decay: 2.2, predelay: 0.028, damping: 6500, width: 1.15,
    inputDb: 0, outputDb: -3,
    eq: { low: -1, mid: 1.5, high: 0.5 },
    comp: { threshold: -20, ratio: 4, makeup: 1 },
    gate: { on: true, threshold: -55, floor: -60 },
  },
  hall: {
    mix: 0.46, decay: 3.6, predelay: 0.045, damping: 5200, width: 1.35,
    inputDb: 0, outputDb: -4,
    eq: { low: -2, mid: 2, high: 0 },
    comp: { threshold: -22, ratio: 4, makeup: 2 },
    gate: { on: true, threshold: -52, floor: -62 },
  },
  catedral: {
    mix: 0.58, decay: 6.5, predelay: 0.075, damping: 3800, width: 1.5,
    inputDb: 0, outputDb: -5,
    eq: { low: -3, mid: 2.5, high: -1 },
    comp: { threshold: -24, ratio: 5, makeup: 3 },
    gate: { on: true, threshold: -50, floor: -65 },
  },
  robo: {
    mix: 0.18, decay: 1.2, predelay: 0.01, damping: 8000, width: 1,
    inputDb: 0, outputDb: -3,
    eq: { low: -2, mid: 2, high: 0 },
    comp: { threshold: -24, ratio: 4, makeup: 2 },
    gate: { on: true, threshold: -55, floor: -65 },
    robot: 75, pitch: -2, drive: 18,
  },
  grave: {
    mix: 0.24, decay: 1.8, predelay: 0.02, damping: 6000, width: 1.05,
    inputDb: 0, outputDb: -3,
    eq: { low: 3, mid: 0, high: -2 },
    comp: { threshold: -22, ratio: 4, makeup: 2 },
    gate: { on: true, threshold: -55, floor: -62 },
    pitch: -5, drive: 6,
  },
  agudo: {
    mix: 0.2, decay: 1.4, predelay: 0.015, damping: 11000, width: 1.05,
    inputDb: 0, outputDb: -3,
    eq: { low: -3, mid: 1, high: 3 },
    comp: { threshold: -22, ratio: 4, makeup: 2 },
    gate: { on: true, threshold: -55, floor: -62 },
    pitch: 5, drive: 4,
  },
  telefone: {
    mix: 0.12, decay: 0.6, predelay: 0.005, damping: 3400, width: 0.8,
    inputDb: 1, outputDb: -3,
    eq: { low: -15, mid: 8, high: -15 },
    comp: { threshold: -28, ratio: 6, makeup: 4 },
    gate: { on: true, threshold: -50, floor: -65 },
    drive: 20,
  },
  radio: {
    mix: 0.2, decay: 1.4, predelay: 0.018, damping: 7000, width: 1,
    inputDb: 0, outputDb: -3,
    eq: { low: -6, mid: 5, high: -8 },
    comp: { threshold: -26, ratio: 5, makeup: 5 },
    gate: { on: true, threshold: -52, floor: -65 },
    drive: 45,
  },
  fantasma: {
    mix: 0.65, decay: 5, predelay: 0.12, damping: 3000, width: 1.6,
    inputDb: 0, outputDb: -5,
    eq: { low: -2, mid: 1, high: -3 },
    comp: { threshold: -24, ratio: 4, makeup: 2 },
    gate: { on: true, threshold: -55, floor: -70 },
    pitch: -7, robot: 25, drive: 10,
  },
  backvocal: {
    mix: 0.26, decay: 1.7, predelay: 0.022, damping: 8200, width: 1.15,
    inputDb: 0, outputDb: -4,
    eq: { low: -1, mid: 1.5, high: 0 },
    comp: { threshold: -22, ratio: 4, makeup: 2 },
    gate: { on: true, threshold: -55, floor: -62 },
    backing: { on: true, level: 45, interval: 4 },
  },
};

export const presetList = [
  { id: "natural", name: "Natural", description: "Sala curta e discreta, voz limpa para reuniões.", tag: "call" },
  { id: "podcast", name: "Podcast", description: "Voz seca, compressor firme e presença — ótimo em calls.", tag: "call" },
  { id: "sala", name: "Sala", description: "Ambiente pequeno, resposta rápida e natural.", tag: "ambiente" },
  { id: "placa", name: "Placa", description: "Cauda metálica curta, estilo estúdio de locução.", tag: "ambiente" },
  { id: "hall", name: "Hall", description: "Salão amplo com cauda média e bom espalhamento.", tag: "ambiente" },
  { id: "catedral", name: "Catedral", description: "Caverna enorme, cauda longa e escura.", tag: "ambiente" },
  { id: "robo", name: "Robô", description: "Ring modulation com pitch grave: voz de máquina.", tag: "efeito" },
  { id: "grave", name: "Voz grave", description: "Pitch para baixo e graves reforçados.", tag: "efeito" },
  { id: "agudo", name: "Voz aguda", description: "Pitch para cima com brilho extra.", tag: "efeito" },
  { id: "telefone", name: "Telefone", description: "Banda estreita, sem graves nem agudos.", tag: "efeito" },
  { id: "radio", name: "Rádio", description: "Saturação de drive e compressão de transmissão AM.", tag: "efeito" },
  { id: "fantasma", name: "Fantasma", description: "Pitch grave, robot leve e reverb gigante.", tag: "efeito" },
  { id: "backvocal", name: "Back vocal", description: "Duas vozes de harmonia atrás da principal — refrão e playback.", tag: "efeito" },
];

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const dbToGain = (db) => Math.pow(10, db / 20);

function cloneState(src) {
  return {
    ...src,
    eq: { ...src.eq },
    comp: { ...src.comp },
    gate: { ...src.gate },
    backing: { ...(src.backing || DEFAULT_STATE.backing) },
  };
}

/** Applies a partial object to `target`, with validation and limits. */
function normalizeInto(target, partial) {
  if (!partial || typeof partial !== "object") return target;
  const p = { ...partial };

  // Compatibility with the old API (input/output instead of inputDb/outputDb).
  if (p.input !== undefined && p.inputDb === undefined) p.inputDb = p.input;
  if (p.output !== undefined && p.outputDb === undefined) p.outputDb = p.output;

  const numeric = {
    mix: [0, 1],
    decay: [0.1, 15],
    predelay: [0, 0.5],
    damping: [400, 20000],
    width: [0, 2],
    inputDb: [-30, 30],
    outputDb: [-60, 12],
    pitch: [-12, 12],
    robot: [0, 100],
    drive: [0, 100],
  };
  for (const key of Object.keys(numeric)) {
    if (p[key] !== undefined) {
      target[key] = clamp(p[key], numeric[key][0], numeric[key][1], target[key]);
    }
  }

  if (p.bypass !== undefined) target.bypass = Boolean(p.bypass);
  if (p.inputId !== undefined) target.inputId = String(p.inputId || "");
  if (p.outputDevice !== undefined) target.outputDevice = String(p.outputDevice || "");

  if (p.eq) {
    for (const key of ["low", "mid", "high"]) {
      if (p.eq[key] !== undefined) target.eq[key] = clamp(p.eq[key], -18, 18, target.eq[key]);
    }
  }
  if (p.comp) {
    if (p.comp.threshold !== undefined) {
      target.comp.threshold = clamp(p.comp.threshold, -60, 0, target.comp.threshold);
    }
    if (p.comp.ratio !== undefined) {
      target.comp.ratio = clamp(p.comp.ratio, 1, 20, target.comp.ratio);
    }
    if (p.comp.makeup !== undefined) {
      target.comp.makeup = clamp(p.comp.makeup, 0, 24, target.comp.makeup);
    }
  }
  if (p.gate) {
    if (p.gate.on !== undefined) target.gate.on = Boolean(p.gate.on);
    if (p.gate.threshold !== undefined) {
      target.gate.threshold = clamp(p.gate.threshold, -100, 0, target.gate.threshold);
    }
    if (p.gate.floor !== undefined) {
      target.gate.floor = clamp(p.gate.floor, -100, -1, target.gate.floor);
    }
    // The floor can never sit above the threshold (it would keep the gate closed).
    target.gate.floor = Math.min(target.gate.floor, target.gate.threshold - 1);
  }
  if (p.backing) {
    if (p.backing.on !== undefined) target.backing.on = Boolean(p.backing.on);
    if (p.backing.level !== undefined) {
      target.backing.level = clamp(p.backing.level, 0, 100, target.backing.level);
    }
    if (p.backing.interval !== undefined) {
      target.backing.interval = clamp(p.backing.interval, -12, 12, target.backing.interval);
    }
  }
  return target;
}

/** Creates a normalized tanh curve with level compensation. */
const DRIVE_K = 7;
const DRIVE_COMPENSATION =
  0.2 / (Math.tanh(DRIVE_K * 0.2) / Math.tanh(DRIVE_K)); // ~0.226

function buildDriveCurve(length = 2048) {
  const curve = new Float32Array(length);
  const norm = Math.tanh(DRIVE_K);
  for (let i = 0; i < length; i++) {
    const x = (i * 2) / (length - 1) - 1;
    curve[i] = Math.tanh(DRIVE_K * x) / norm;
  }
  return curve;
}

/** Generates a synthetic stereo IR with exponential decay. */
function buildImpulse(context, seconds, sampleRate) {
  const length = Math.max(1, Math.floor(sampleRate * Math.max(0.05, seconds)));
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const noise = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      last = last * 0.28 + noise * 0.72;
      data[i] = last;
    }
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) {
      for (let i = 0; i < length; i++) data[i] = (data[i] / peak) * 0.55;
    }
  }
  return impulse;
}

function pickMimeType() {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function micError(err) {
  const name = (err && err.name) || "";
  let message = "Não foi possível acessar o microfone.";
  if (name === "NotAllowedError" || name === "SecurityError") {
    message = "Permissão do microfone negada (ou origem insegura). Abra por http://localhost ou https.";
  } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    message = "Nenhum microfone encontrado.";
  } else if (name === "OverconstrainedError") {
    message = "O microfone escolhido não está disponível. Selecione outro dispositivo.";
  } else if (name === "NotReadableError" || name === "TrackStartError") {
    message = "Microfone ocupado por outro aplicativo.";
  } else if (name === "AbortError") {
    message = "A captura do microfone foi interrompida.";
  }
  const friendly = new Error(message);
  friendly.name = name || "Error";
  friendly.cause = err;
  return friendly;
}

/* ------------------------------------------------------------------ */
/* Pitch worklet (two Hann grains / delay lines)                       */
/* ------------------------------------------------------------------ */

const PITCH_WORKLET_SRC = `
class MRPitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: "semitones",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automationRate: "k-rate",
    }];
  }

  constructor(options) {
    super();
    const grainMs = Number(options?.processorOptions?.grainMs) || 55;
    this.grain = Math.max(128, Math.round((sampleRate * grainMs) / 1000));
    this.size = this.grain * 4 + 8;
    this.buffers = [new Float32Array(this.size), new Float32Array(this.size)];
    this.write = 0;
    this.phase = [0, 0.5];
    this.read = [0, 0];
    this.primed = false;
    this.hann = new Float32Array(this.grain + 1);
    for (let i = 0; i <= this.grain; i++) {
      this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.grain);
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    if (!output.length) return true;

    const frames = output[0].length;
    const semis = parameters.semitones[0];
    const ratio = Math.pow(2, semis / 12);

    const grain = this.grain;
    const size = this.size;
    const bufs = this.buffers;
    const inputChannels = Math.max(1, input.length);

    if (!this.primed) {
      this.read[0] = this.write - grain * ratio;
      this.read[1] = this.write - grain * ratio + grain * 0.5 * ratio;
      this.primed = true;
    }

    for (let i = 0; i < frames; i++) {
      // Writes the current sample into the delay line (mono feeds both channels).
      for (let ch = 0; ch < bufs.length; ch++) {
        const src = input[Math.min(ch, inputChannels - 1)];
        bufs[ch][this.write] = src ? src[i] : 0;
      }

      // Advances the grain phases. On a full turn, the grain restarts at the
      // oldest point needed to read "grain * ratio" samples.
      for (let g = 0; g < 2; g++) {
        this.phase[g] += 1 / grain;
        if (this.phase[g] >= 1) {
          this.phase[g] -= 1;
          this.read[g] = this.write - grain * ratio;
        }
      }

      let sum0 = 0;
      let sum1 = 0;

      for (let g = 0; g < 2; g++) {
        let rp = this.read[g];
        while (rp >= size) rp -= size;
        while (rp < 0) rp += size;

        const i0 = Math.floor(rp);
        const frac = rp - i0;
        const i1 = (i0 + 1) % size;
        const winIndex = Math.min(grain, Math.floor(this.phase[g] * grain));
        const win = this.hann[winIndex];

        const b0 = bufs[0];
        const b1 = bufs[1];
        sum0 += (b0[i0 % size] * (1 - frac) + b0[i1] * frac) * win;
        sum1 += (b1[i0 % size] * (1 - frac) + b1[i1] * frac) * win;

        this.read[g] += ratio;
        if (this.read[g] >= size) this.read[g] -= size;
      }

      output[0][i] = sum0;
      if (output.length > 1) output[1][i] = sum1;
      for (let ch = 2; ch < output.length; ch++) output[ch][i] = output[0][i];

      this.write++;
      if (this.write >= size) this.write = 0;
    }
    return true;
  }
}
registerProcessor("mr-pitch-shifter", MRPitchShifter);
`;

/* ------------------------------------------------------------------ */
/* Internal state                                                      */
/* ------------------------------------------------------------------ */

let state = cloneState(DEFAULT_STATE);

/** @type {AudioContext | null} */
let ctx = null;
/** @type {MediaStream | null} */
let stream = null;
/** @type {ReturnType<typeof buildGraph> | null} */
let graph = null;
let gateTimer = 0;
let irTimer = 0;
let lastIrDecay = null;
let startPromise = null;
let session = 0;
let pitchAvailable = false;
let testTone = null;
/** @type {null | { format: string }} */
let recording = null;

/* ------------------------------------------------------------------ */
/* Graph construction                                                  */
/* ------------------------------------------------------------------ */

function buildGraph() {
  const c = ctx;

  const input = c.createGain();

  // Removes rumble below ~80 Hz before any effect.
  const highpass = c.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 80;
  highpass.Q.value = 0.707;

  // Pitch stage: clean path + worklet path (in parallel).
  const pitchDirectGain = c.createGain();
  pitchDirectGain.gain.value = 1;
  const pitchShiftGain = c.createGain();
  pitchShiftGain.gain.value = 0;
  const pitchOut = c.createGain();

  // Backing vocal: two harmony voices in parallel, with a short delay so
  // they sit behind the lead voice.
  const harmonyTap = c.createGain();
  harmonyTap.gain.value = 1;
  const harmonySum = c.createGain();
  const harmonyTone = c.createBiquadFilter();
  harmonyTone.type = "lowpass";
  harmonyTone.frequency.value = 6800;
  harmonyTone.Q.value = 0.5;
  const backDelayA = c.createDelay(0.2);
  backDelayA.delayTime.value = 0.012;
  const backGainA = c.createGain();
  backGainA.gain.value = 0;
  const backDelayB = c.createDelay(0.2);
  backDelayB.delayTime.value = 0.024;
  const backGainB = c.createGain();
  backGainB.gain.value = 0;

  // Drive: tanh shaper in parallel with the clean signal.
  const driveDry = c.createGain();
  driveDry.gain.value = 1;
  const driveWet = c.createGain();
  driveWet.gain.value = 0;
  const driveShaper = c.createWaveShaper();
  driveShaper.curve = buildDriveCurve();
  driveShaper.oversample = "2x";
  const driveSum = c.createGain();

  // Robot: 55 Hz ring modulation added to the dry signal.
  const robotDry = c.createGain();
  robotDry.gain.value = 1;
  const robotWet = c.createGain();
  robotWet.gain.value = 0;
  const robotRing = c.createGain();
  robotRing.gain.value = 0; // the carrier is summed into this AudioParam
  const robotOsc = c.createOscillator();
  robotOsc.type = "sine";
  robotOsc.frequency.value = 55;
  const robotSum = c.createGain();

  // 3-band EQ.
  const eqLow = c.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.value = 120;
  const eqMid = c.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.value = 1000;
  eqMid.Q.value = 1;
  const eqHigh = c.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.value = 3500;

  // Voice compressor + makeup.
  const comp = c.createDynamicsCompressor();
  comp.knee.value = 6;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const makeup = c.createGain();

  // Envelope-controlled gate.
  const gate = c.createGain();
  gate.gain.value = 1;
  const gateDetect = c.createAnalyser();
  gateDetect.fftSize = 1024;
  gateDetect.smoothingTimeConstant = 0.4;
  const gateData = new Uint8Array(gateDetect.fftSize);

  // Reverb: equal-power dry/wet, predelay, convolver, damping, M/S width.
  const dry = c.createGain();
  const wet = c.createGain();
  const preDelay = c.createDelay(0.5);
  const convolver = c.createConvolver();
  convolver.normalize = true;
  convolver.buffer = buildImpulse(c, state.decay, c.sampleRate);
  lastIrDecay = state.decay;

  const damping = c.createBiquadFilter();
  damping.type = "lowpass";
  damping.frequency.value = state.damping;
  damping.Q.value = 0.6;

  const splitter = c.createChannelSplitter(2);
  const midL = c.createGain(); midL.gain.value = 0.5;
  const midR = c.createGain(); midR.gain.value = 0.5;
  const sideL = c.createGain(); sideL.gain.value = 0.5;
  const sideR = c.createGain(); sideR.gain.value = -0.5;
  const midSum = c.createGain();
  const sideSum = c.createGain();
  const widthPos = c.createGain();
  const widthNeg = c.createGain();
  const outL = c.createGain();
  const outR = c.createGain();
  const merger = c.createChannelMerger(2);
  const sink = c.createGain();

  // A/B crossfade: processed (sink) x raw microphone (post input gain).
  const bypassDry = c.createGain();
  bypassDry.gain.value = 0;
  const bypassWet = c.createGain();
  bypassWet.gain.value = 1;

  const output = c.createGain();
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  const analyser = c.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;

  // Recording bus (muted during the test tone).
  const recordGate = c.createGain();
  recordGate.gain.value = 1;
  const recordingDest = c.createMediaStreamDestination();

  // ---- connections ----
  input.connect(highpass);

  highpass.connect(pitchDirectGain);
  pitchDirectGain.connect(pitchOut);
  pitchShiftGain.connect(pitchOut);
  // highpass -> worklet -> pitchShiftGain is wired in setupPitch().

  pitchOut.connect(harmonyTap);
  harmonyTap.connect(driveDry).connect(driveSum);
  harmonyTap.connect(driveShaper).connect(driveWet).connect(driveSum);

  // The harmony voices are summed here (the worklets are wired in setupPitch).
  harmonySum.connect(harmonyTone);
  harmonyTone.connect(driveDry);
  harmonyTone.connect(driveShaper);

  driveSum.connect(robotDry).connect(robotSum);
  driveSum.connect(robotRing).connect(robotWet).connect(robotSum);
  robotOsc.connect(robotRing.gain);

  robotSum.connect(eqLow).connect(eqMid).connect(eqHigh).connect(comp).connect(makeup).connect(gate);
  makeup.connect(gateDetect);
  gate.connect(dry).connect(sink);
  gate.connect(preDelay).connect(convolver).connect(damping).connect(splitter);

  splitter.connect(midL, 0);
  splitter.connect(midR, 1);
  splitter.connect(sideL, 0);
  splitter.connect(sideR, 1);
  midL.connect(midSum);
  midR.connect(midSum);
  sideL.connect(sideSum);
  sideR.connect(sideSum);
  sideSum.connect(widthPos).connect(outL);
  sideSum.connect(widthNeg).connect(outR);
  midSum.connect(outL);
  midSum.connect(outR);
  outL.connect(merger, 0, 0);
  outR.connect(merger, 0, 1);
  merger.connect(wet).connect(sink);

  input.connect(bypassDry).connect(output);
  sink.connect(bypassWet).connect(output);

  output.connect(limiter);
  limiter.connect(c.destination);
  limiter.connect(analyser);
  limiter.connect(recordGate).connect(recordingDest);

  robotOsc.start();

  graph = {
    input, highpass,
    pitchDirectGain, pitchShiftGain, pitchOut, pitchNode: null,
    harmonyTap, harmonySum, harmonyTone,
    backDelayA, backGainA, backDelayB, backGainB,
    backNodeA: null, backNodeB: null,
    driveDry, driveWet, driveShaper, driveSum,
    robotDry, robotWet, robotRing, robotOsc, robotSum,
    eqLow, eqMid, eqHigh, comp, makeup, gate, gateDetect, gateData,
    dry, wet, preDelay, convolver, damping, splitter,
    widthPos, widthNeg, outL, outR, merger, sink,
    bypassDry, bypassWet, output, limiter, analyser,
    recordGate, recordingDest, source: null,
  };

  applyState(true);
  startLoops();
  return graph;
}

/* ------------------------------------------------------------------ */
/* Parameter application                                               */
/* ------------------------------------------------------------------ */

function ramp(param, value, timeConstant) {
  if (!param || !ctx) return;
  const now = ctx.currentTime;
  param.setTargetAtTime(value, now, Math.max(0.001, timeConstant));
}

function applyState(immediate = false) {
  if (!ctx || !graph) return;
  const g = graph;
  const t = ctx.currentTime;

  // immediate = true only on the initial build: values are applied directly,
  // without a ramp, to avoid a reverb "burst" in the first milliseconds.
  const set = (param, value, timeConstant) => {
    if (!param) return;
    if (immediate) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(value, t);
    } else {
      param.setTargetAtTime(value, t, Math.max(0.001, timeConstant));
    }
  };

  const mix = state.mix;
  set(g.dry.gain, Math.cos((mix * Math.PI) / 2), 0.03);
  set(g.wet.gain, Math.sin((mix * Math.PI) / 2), 0.03);
  set(g.preDelay.delayTime, state.predelay, 0.02);
  set(g.damping.frequency, state.damping, 0.02);
  set(g.widthPos.gain, state.width, 0.02);
  set(g.widthNeg.gain, -state.width, 0.02);
  set(g.input.gain, dbToGain(state.inputDb), 0.02);
  set(g.output.gain, dbToGain(state.outputDb), 0.02);

  set(g.eqLow.gain, state.eq.low, 0.02);
  set(g.eqMid.gain, state.eq.mid, 0.02);
  set(g.eqHigh.gain, state.eq.high, 0.02);

  set(g.comp.threshold, state.comp.threshold, 0.03);
  set(g.comp.ratio, state.comp.ratio, 0.03);
  set(g.makeup.gain, dbToGain(state.comp.makeup), 0.03);

  // Gate: when off, it opens fully.
  if (!state.gate.on) set(g.gate.gain, 1, 0.05);

  // Drive (equal-power mix between clean and tanh).
  const driveAmount = state.drive / 100;
  set(g.driveDry.gain, Math.cos((driveAmount * Math.PI) / 2), 0.03);
  set(
    g.driveWet.gain,
    Math.sin((driveAmount * Math.PI) / 2) * DRIVE_COMPENSATION,
    0.03
  );

  // Robot (equal-power mix).
  const robotAmount = state.robot / 100;
  set(g.robotDry.gain, Math.cos((robotAmount * Math.PI) / 2), 0.03);
  set(g.robotWet.gain, Math.sin((robotAmount * Math.PI) / 2), 0.03);

  // Pitch: 0 semitones = clean path; any other value = worklet.
  if (g.pitchNode) {
    const param = g.pitchNode.parameters.get("semitones");
    if (param) {
      if (immediate) {
        param.cancelScheduledValues(t);
        param.setValueAtTime(state.pitch, t);
      } else {
        param.setTargetAtTime(state.pitch, t, 0.03);
      }
    }
    const shifted = Math.abs(state.pitch) > 0.001 ? 1 : 0;
    set(g.pitchDirectGain.gain, shifted ? 0 : 1, 0.02);
    set(g.pitchShiftGain.gain, shifted ? 1 : 0, 0.02);
  } else {
    set(g.pitchDirectGain.gain, 1, 0.02);
    set(g.pitchShiftGain.gain, 0, 0.02);
  }

  // Backing vocal: gain of both voices + interval (semitones).
  const back = state.backing || DEFAULT_STATE.backing;
  const backLevel = back.on ? clamp(back.level, 0, 100, 0) / 100 : 0;
  set(g.backGainA.gain, backLevel * 0.45, 0.05);
  set(g.backGainB.gain, backLevel * 0.3, 0.05);

  const backVoices = [
    [g.backNodeA, 0],
    [g.backNodeB, 0.18],
  ];
  for (const [node, detune] of backVoices) {
    const param = node?.parameters.get("semitones");
    if (!param) continue;
    const semis = clamp(back.interval + detune, -12, 12, 0);
    if (immediate) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(semis, t);
    } else {
      param.setTargetAtTime(semis, t, 0.05);
    }
  }

  // A/B equal-power bypass (processed x raw).
  // Without bypass: only the processed path (wet). With bypass: only the raw path (dry).
  const bypassAngle = (state.bypass ? 0 : 1) * (Math.PI / 2);
  set(g.bypassDry.gain, Math.cos(bypassAngle), 0.015);
  set(g.bypassWet.gain, Math.sin(bypassAngle), 0.015);

  // The IR is only regenerated when the decay actually changes (with debounce).
  if (state.decay !== lastIrDecay) {
    lastIrDecay = state.decay;
    scheduleImpulseUpdate(state.decay);
  }
}

function scheduleImpulseUpdate(seconds) {
  if (!graph || !ctx) return;
  clearTimeout(irTimer);
  irTimer = setTimeout(() => {
    if (!graph || !ctx) return;
    graph.convolver.buffer = buildImpulse(ctx, seconds, ctx.sampleRate);
  }, 140);
}

/* ------------------------------------------------------------------ */
/* Gate and loops                                                      */
/* ------------------------------------------------------------------ */

function startLoops() {
  clearInterval(gateTimer);
  gateTimer = setInterval(applyGate, 50);
}

function applyGate() {
  if (!graph || !ctx) return;
  const g = graph;

  if (!state.gate.on) {
    ramp(g.gate.gain, 1, 0.05);
    return;
  }

  const buffer = g.gateData;
  if (!buffer) return;
  g.gateDetect.getByteTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.abs(buffer[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  const db = peak > 0 ? 20 * Math.log10(peak) : -100;
  const open = db > state.gate.threshold;
  const target = open ? 1 : dbToGain(state.gate.floor);
  ramp(g.gate.gain, target, open ? 0.004 : 0.12);
}

/* ------------------------------------------------------------------ */
/* Pitch worklet                                                       */
/* ------------------------------------------------------------------ */

async function setupPitch() {
  pitchAvailable = false;
  if (!ctx || !graph) return;
  if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined" || typeof Blob === "undefined") {
    return; // silent pass-through
  }

  let url = "";
  try {
    url = URL.createObjectURL(new Blob([PITCH_WORKLET_SRC], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);

    if (!ctx || !graph) return;

    const node = new AudioWorkletNode(ctx, "mr-pitch-shifter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });

    attachPitchNode(node);
    attachHarmonyNodes();
  } catch (err) {
    // CSP, old browser, blocked worklet etc. Never breaks the chain.
    console.warn("[MR_AUDIO] Pitch shift unavailable; using pass-through.", err);
    pitchAvailable = false;
  } finally {
    if (url) {
      try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
    }
  }
}

function attachPitchNode(node) {
  if (!graph || !ctx) {
    try { node.disconnect(); } catch (_) { /* ignore */ }
    return;
  }
  const g = graph;
  const param = node.parameters.get("semitones");
  if (param) {
    param.cancelScheduledValues(ctx.currentTime);
    param.setValueAtTime(state.pitch, ctx.currentTime);
  }

  // If the processor breaks at runtime, fall back to the clean path without
  // taking down the rest of the chain.
  node.onprocessorerror = () => {
    console.warn("[MR_AUDIO] Pitch worklet error; falling back to pass-through.");
    try { node.disconnect(); } catch (_) { /* ignore */ }
    if (graph) {
      graph.pitchNode = null;
      applyState(false);
    }
    pitchAvailable = false;
  };

  g.highpass.connect(node);
  node.connect(g.pitchShiftGain);
  g.pitchNode = node;
  pitchAvailable = true;
  applyState(false);
}

/** Creates the two backing-vocal harmony voices (same worklet, smaller grain). */
function attachHarmonyNodes() {
  if (!graph || !ctx) return;

  const g = graph;
  const make = (grainMs) =>
    new AudioWorkletNode(ctx, "mr-pitch-shifter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { grainMs },
    });

  const wire = (node, delay, gain, slot) => {
    node.onprocessorerror = () => {
      console.warn("[MR_AUDIO] Backing-vocal worklet error; turning the voice off.");
      try { node.disconnect(); } catch (_) { /* ignore */ }
      if (graph) graph[slot] = null;
    };
    g.harmonyTap.connect(node);
    node.connect(delay).connect(gain).connect(g.harmonySum);
    return node;
  };

  try {
    g.backNodeA = wire(make(32), g.backDelayA, g.backGainA, "backNodeA");
    g.backNodeB = wire(make(38), g.backDelayB, g.backGainB, "backNodeB");
    applyState(false);
  } catch (err) {
    console.warn("[MR_AUDIO] Backing vocal unavailable.", err);
    g.backNodeA = null;
    g.backNodeB = null;
  }
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

function AudioContextClass() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function supportsOutputRouting() {
  const AC = AudioContextClass();
  if (!AC) return false;
  try {
    return (
      typeof AC.prototype.setSinkId === "function" &&
      typeof window !== "undefined" &&
      window.isSecureContext === true
    );
  } catch (_) {
    return false;
  }
}

function outputErrorMessage(err) {
  const name = (err && err.name) || "";
  if (name === "NotAllowedError") {
    return "Permissão de saída negada. Autorize o acesso ao dispositivo de áudio e tente novamente.";
  }
  if (name === "NotFoundError") {
    return "Dispositivo de saída não encontrado. Ele pode ter sido desconectado.";
  }
  if (name === "NotSupportedError") {
    return "Este navegador não permite escolher a saída de áudio. Use Chrome ou Edge no desktop.";
  }
  if (name === "InvalidStateError") {
    return "O contexto de áudio não está ativo. Ligue o microfone antes de escolher a saída.";
  }
  return "Não foi possível selecionar a saída de áudio" + (name ? " (" + name + ")." : ".");
}

export async function setOutputDevice(deviceId) {
  if (!supportsOutputRouting()) {
    throw new Error(
      "Roteamento de saída não suportado neste navegador. Use Chrome/Edge no desktop e um cabo virtual (VB-CABLE ou BlackHole)."
    );
  }

  const id = !deviceId || deviceId === "default" ? "" : String(deviceId);

  // No context: store the choice and apply it on the next start().
  if (!ctx) {
    state.outputDevice = id;
    return id;
  }

  try {
    await ctx.setSinkId(id);
  } catch (err) {
    const friendly = new Error(outputErrorMessage(err));
    friendly.name = (err && err.name) || "Error";
    friendly.cause = err;
    throw friendly;
  }

  state.outputDevice = id;
  return id;
}

export function getOutputDevice() {
  return state.outputDevice || "";
}

async function reapplyOutputDevice() {
  if (!ctx || !state.outputDevice) return;
  if (!supportsOutputRouting()) return;
  try {
    await ctx.setSinkId(state.outputDevice);
  } catch (err) {
    // Does not stop the microphone from starting; the user can pick another output.
    console.warn("[MR_AUDIO] Could not reapply the saved output.", err);
  }
}

export async function listDevices() {
  const empty = { inputs: [], outputs: [], labelsVisible: false };
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return empty;

  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (_) {
    return empty;
  }

  const inputs = [];
  const outputs = [];
  for (const device of devices) {
    if (device.kind === "audioinput") {
      inputs.push({ deviceId: device.deviceId, label: device.label || "" });
    } else if (device.kind === "audiooutput") {
      outputs.push({ deviceId: device.deviceId, label: device.label || "" });
    }
  }

  const labelsVisible = inputs.length > 0 && inputs.every((d) => d.label.length > 0);
  return { inputs, outputs, labelsVisible };
}

/* ------------------------------------------------------------------ */
/* Start / stop / input switch                                         */
/* ------------------------------------------------------------------ */

function micConstraints(inputId) {
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  if (inputId) audio.deviceId = { exact: inputId };
  return { audio, video: false };
}

export async function start(options = {}) {
  if (startPromise) return startPromise;
  startPromise = doStart(options).finally(() => {
    startPromise = null;
  });
  return startPromise;
}

async function doStart({ inputId } = {}) {
  const mySession = ++session;

  if (isRunning()) {
    const requested = inputId === undefined ? state.inputId || "" : String(inputId || "");
    const changed = inputId !== undefined && requested !== (state.inputId || "");
    if (changed) await switchInput(requested);
    if (mySession === session) await reapplyOutputDevice();
    return getState();
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("API de microfone indisponível neste navegador.");
  }

  const requested = inputId === undefined ? state.inputId || "" : String(inputId || "");
  let localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia(micConstraints(requested));
  } catch (err) {
    throw micError(err);
  }

  // stop() was called while the user was deciding on the permission.
  if (mySession !== session) {
    for (const track of localStream.getTracks()) track.stop();
    return getState();
  }

  const AC = AudioContextClass();
  if (!AC) {
    for (const track of localStream.getTracks()) track.stop();
    throw new Error("Web Audio API indisponível neste navegador.");
  }

  let localCtx;
  try {
    localCtx = new AC({ latencyHint: "interactive" });
  } catch (err) {
    for (const track of localStream.getTracks()) track.stop();
    throw new Error("Não foi possível criar o contexto de áudio.");
  }

  ctx = localCtx;
  stream = localStream;

  try {
    await ctx.resume().catch(() => {});
    if (mySession !== session) throw new Error("__aborted__");

    buildGraph();
    const source = ctx.createMediaStreamSource(localStream);
    source.connect(graph.input);
    graph.source = source;
    state.inputId = requested;

    await setupPitch();
    if (mySession !== session) throw new Error("__aborted__");

    await reapplyOutputDevice();
    if (mySession !== session) throw new Error("__aborted__");

    return getState();
  } catch (err) {
    if (err && err.message === "__aborted__") {
      for (const track of localStream.getTracks()) track.stop();
      return getState();
    }
    // Build failure: clean everything up so no context/tracks are left orphaned.
    for (const track of localStream.getTracks()) track.stop();
    const dead = ctx;
    ctx = null;
    stream = null;
    graph = null;
    if (dead) {
      try { await dead.close(); } catch (_) { /* ignore */ }
    }
    throw err;
  }
}

async function switchInput(inputId) {
  if (!ctx || !graph) return;
  const mySession = session;

  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia(micConstraints(inputId));
  } catch (err) {
    throw micError(err);
  }

  if (mySession !== session || !ctx || !graph) {
    for (const track of newStream.getTracks()) track.stop();
    return;
  }

  let newSource;
  try {
    newSource = ctx.createMediaStreamSource(newStream);
    newSource.connect(graph.input);
  } catch (err) {
    for (const track of newStream.getTracks()) track.stop();
    throw new Error("Não foi possível trocar a entrada de microfone.");
  }

  const oldSource = graph.source;
  const oldStream = stream;
  if (oldSource) {
    try { oldSource.disconnect(); } catch (_) { /* ignore */ }
  }
  if (oldStream) {
    for (const track of oldStream.getTracks()) track.stop();
  }

  stream = newStream;
  graph.source = newSource;
  state.inputId = inputId || "";
}

export async function stop() {
  session++;
  abortRecording();
  stopTestTone();

  clearInterval(gateTimer);
  gateTimer = 0;
  clearTimeout(irTimer);
  irTimer = 0;
  lastIrDecay = null;

  const dying = graph;
  graph = null;

  if (dying) {
    if (dying.source) {
      try { dying.source.disconnect(); } catch (_) { /* ignore */ }
    }
    if (dying.robotOsc) {
      try { dying.robotOsc.stop(); } catch (_) { /* ignore */ }
    }
    for (const node of Object.values(dying)) {
      if (node && typeof node.disconnect === "function") {
        try { node.disconnect(); } catch (_) { /* ignore */ }
      }
    }
    try { dying.recordingDest.stream.getTracks().forEach((t) => t.stop()); } catch (_) { /* ignore */ }
  }

  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }

  const dyingCtx = ctx;
  ctx = null;
  pitchAvailable = false;
  if (dyingCtx) {
    try { await dyingCtx.close(); } catch (_) { /* ignore */ }
  }
}

export function isRunning() {
  return Boolean(ctx && graph);
}

export function getContext() {
  return ctx;
}

export function getAnalyser() {
  return graph ? graph.analyser : null;
}

/** Graph access for debugging/measurement (not part of the minimal contract). */
export function getGraph() {
  return graph;
}

export function getStream() {
  return stream;
}

/* ------------------------------------------------------------------ */
/* Public state                                                        */
/* ------------------------------------------------------------------ */

export function getState() {
  return cloneState(state);
}

export function setState(partial) {
  normalizeInto(state, partial);
  if (graph) applyState(false);
  return getState();
}

export function applyPreset(nameOrId) {
  const key = String(nameOrId || "").toLowerCase();
  let id = presets[key] ? key : "";
  if (!id) {
    const found = presetList.find((p) => p.name.toLowerCase() === key);
    if (found) id = found.id;
  }
  if (!id) return getState();

  const next = cloneState(DEFAULT_STATE);
  normalizeInto(next, presets[id]);
  // Presets do not change device routing.
  next.inputId = state.inputId;
  next.outputDevice = state.outputDevice;
  // The backing vocal is an "extra" on top of the preset: changing presets does
  // not turn it off, unless the preset itself defines the backing vocal.
  if (!presets[id].backing) next.backing = { ...state.backing };
  state = next;

  if (graph) applyState(false);
  return getState();
}

export function reset() {
  const next = cloneState(DEFAULT_STATE);
  // reset() restores the sound but keeps the chosen microphone/output.
  next.inputId = state.inputId;
  next.outputDevice = state.outputDevice;
  state = next;
  if (graph) applyState(false);
  return getState();
}

/* ------------------------------------------------------------------ */
/* Test tone                                                           */
/* ------------------------------------------------------------------ */

export function stopTestTone() {
  if (!testTone) return;
  const t = testTone;
  testTone = null;
  try { t.stop(); } catch (_) { /* ignore */ }
}

export async function playTestTone() {
  if (!isRunning()) {
    throw new Error("Ligue o microfone antes de testar a saída de áudio.");
  }
  stopTestTone();

  const c = ctx;
  const g = graph;
  const at = c.currentTime + 0.02;

  const osc = c.createOscillator();
  osc.type = "sine";
  const env = c.createGain();
  env.gain.value = 0;

  osc.frequency.setValueAtTime(220, at);
  osc.frequency.exponentialRampToValueAtTime(880, at + 1.3);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.35, at + 0.06);
  env.gain.setValueAtTime(0.35, at + 1.3);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 1.55);

  osc.connect(env);
  env.connect(g.input);

  // The tone must not go into the recording.
  let recordWasMuted = false;
  try {
    g.recordGate.gain.cancelScheduledValues(at);
    g.recordGate.gain.setTargetAtTime(0, at, 0.01);
    recordWasMuted = true;
  } catch (_) { /* ignore */ }

  await new Promise((resolve) => {
    let finished = false;
    let timer = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (testTone && testTone.osc === osc) testTone = null;
      try { osc.stop(); } catch (_) { /* ignore */ }
      try { osc.disconnect(); } catch (_) { /* ignore */ }
      try { env.disconnect(); } catch (_) { /* ignore */ }
      if (recordWasMuted && ctx && graph === g) {
        try { g.recordGate.gain.setTargetAtTime(1, ctx.currentTime, 0.02); } catch (_) { /* ignore */ }
      }
      resolve();
    };

    testTone = {
      osc,
      stop: finish,
    };

    timer = setTimeout(finish, 1900);
    osc.onended = finish;
    try {
      osc.start(at);
      osc.stop(at + 1.6);
    } catch (_) {
      finish();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

function abortRecording() {
  if (!recording) return;
  const current = recording;
  recording = null;
  if (current.format === "webm" && current.recorder) {
    try {
      current.recorder.onstop = null;
      current.recorder.stop();
    } catch (_) { /* ignore */ }
  }
  if (current.format === "wav") {
    disconnectWav(current);
  }
}

function disconnectWav(current) {
  if (current.processor) {
    current.processor.onaudioprocess = null;
    try { current.processor.disconnect(); } catch (_) { /* ignore */ }
  }
  if (current.silent) {
    try { current.silent.disconnect(); } catch (_) { /* ignore */ }
  }
}

function mergeChunks(chunks) {
  let frames = 0;
  for (const c of chunks) frames += c.length;
  const out = new Float32Array(frames);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function startRecording(format = "webm") {
  if (!isRunning()) {
    throw new Error("Ligue o microfone antes de gravar.");
  }
  if (recording) {
    throw new Error("Já existe uma gravação em andamento.");
  }

  const fmt = String(format || "webm").toLowerCase();

  if (fmt === "webm") {
    if (typeof window === "undefined" || !window.MediaRecorder) {
      throw new Error("Gravação WebM não é suportada neste navegador.");
    }
    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(
        graph.recordingDest.stream,
        mimeType ? { mimeType } : undefined
      );
    } catch (err) {
      throw new Error("Falha ao iniciar a gravação WebM.");
    }

    const chunks = [];
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType || "audio/webm" }));
      };
    });

    try {
      recorder.start(250);
    } catch (err) {
      throw new Error("Falha ao iniciar a gravação WebM.");
    }

    recording = { format: "webm", recorder, chunks, done, mimeType };
    return;
  }

  if (fmt === "wav") {
    if (!ctx || typeof ctx.createScriptProcessor !== "function") {
      throw new Error("Gravação WAV não é suportada neste navegador.");
    }

    const processor = ctx.createScriptProcessor(4096, 2, 2);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    const left = [];
    const right = [];

    processor.onaudioprocess = (event) => {
      const buffer = event.inputBuffer;
      const l = buffer.getChannelData(0);
      const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
      left.push(new Float32Array(l));
      right.push(new Float32Array(r));
    };

    graph.recordGate.connect(processor);
    processor.connect(silent).connect(ctx.destination);

    recording = {
      format: "wav",
      processor,
      silent,
      left,
      right,
      sampleRate: ctx.sampleRate,
    };
    return;
  }

  throw new Error('Formato de gravação não suportado: "' + format + '". Use "webm" ou "wav".');
}

export async function stopRecording() {
  const current = recording;
  if (!current) return null;
  recording = null;

  if (current.format === "webm") {
    const { recorder, chunks, done, mimeType } = current;
    try {
      recorder.stop();
    } catch (_) {
      return new Blob(chunks, { type: mimeType || "audio/webm" });
    }
    // onstop usually fires within a few ms; the timeout avoids a hung promise.
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(new Blob(chunks, { type: mimeType || "audio/webm" }));
      }, 2500);
      done.then((blob) => {
        clearTimeout(timer);
        resolve(blob);
      });
    });
  }

  // WAV: disconnect the capture processor and build the stereo PCM.
  disconnectWav(current);
  const left = mergeChunks(current.left);
  const right = mergeChunks(current.right);
  if (!left.length) return new Blob([], { type: "audio/wav" });
  return encodeWav(left, right, current.sampleRate);
}

export function isRecording() {
  return Boolean(recording);
}

/* ------------------------------------------------------------------ */
/* WAV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * encodeWav(left, right, sampleRate) -> Blob
 * Also accepts the old encodeWav([left, right], sampleRate) shape.
 */
export function encodeWav(left, right, sampleRate) {
  let channels;
  let rate;

  if (Array.isArray(left) && typeof right === "number") {
    channels = left;
    rate = right;
  } else if (typeof right === "number" && sampleRate === undefined) {
    channels = [left];
    rate = right;
  } else {
    channels = right ? [left, right] : [left];
    rate = sampleRate;
  }

  if (!channels.length || !channels[0] || !channels[0].length) {
    return new Blob([], { type: "audio/wav" });
  }

  const frames = channels[0].length;
  const numChannels = channels.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const data = channels[channel];
      const sample = Math.max(-1, Math.min(1, data && i < data.length ? data[i] : 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

/* ------------------------------------------------------------------ */
/* Global API                                                          */
/* ------------------------------------------------------------------ */

export const api = {
  presets,
  presetList,
  DEFAULT_STATE,
  start,
  stop,
  isRunning,
  getState,
  setState,
  applyPreset,
  reset,
  getContext,
  getAnalyser,
  getGraph,
  supportsOutputRouting,
  listDevices,
  setOutputDevice,
  getOutputDevice,
  playTestTone,
  startRecording,
  stopRecording,
  isRecording,
  encodeWav,
  getStream,
  stopTestTone,
};

if (typeof window !== "undefined") {
  window.MR_AUDIO = api;
}
