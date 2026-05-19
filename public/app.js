const TARGET_SAMPLE_RATE = 16000;
const FFT_SIZE = 1024;
const HOP_SIZE = 512;
const BAND_COUNT = 96;
const CORE_VERSION = "0.12.10";
const FFMPEG_VERSION = "0.12.10";
const UTIL_VERSION = "0.12.1";
const FFMPEG_VENDOR_BASE_URL = new URL("./vendor/ffmpeg", import.meta.url).href.replace(/\/$/, "");
const FFMPEG_CORE_CDN_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
const LOG_LINE_LIMIT = 200;

const SPEC_COLOR_STOPS = [
  [15, 22, 34],
  [27, 71, 95],
  [36, 141, 136],
  [224, 168, 76],
  [244, 230, 178]
];

const dom = {
  appStatus: document.querySelector("#appStatus"),
  isolationStatus: document.querySelector("#isolationStatus"),
  mediaState: document.querySelector("#mediaState"),
  analysisState: document.querySelector("#analysisState"),
  exportState: document.querySelector("#exportState"),
  videoInput: document.querySelector("#videoInput"),
  audioInput: document.querySelector("#audioInput"),
  videoMeta: document.querySelector("#videoMeta"),
  audioMeta: document.querySelector("#audioMeta"),
  videoPreview: document.querySelector("#videoPreview"),
  videoPlaceholder: document.querySelector("#videoPlaceholder"),
  decodeButton: document.querySelector("#decodeButton"),
  estimateButton: document.querySelector("#estimateButton"),
  refineTempoButton: document.querySelector("#refineTempoButton"),
  loadFfmpegButton: document.querySelector("#loadFfmpegButton"),
  candidateList: document.querySelector("#candidateList"),
  candidateCount: document.querySelector("#candidateCount"),
  trimMetric: document.querySelector("#trimMetric"),
  tempoMetric: document.querySelector("#tempoMetric"),
  scoreMetric: document.querySelector("#scoreMetric"),
  playButton: document.querySelector("#playButton"),
  stopButton: document.querySelector("#stopButton"),
  currentTime: document.querySelector("#currentTime"),
  durationTime: document.querySelector("#durationTime"),
  playheadSlider: document.querySelector("#playheadSlider"),
  previewMode: document.querySelector("#previewMode"),
  videoSpectrogram: document.querySelector("#videoSpectrogram"),
  trackSpectrogram: document.querySelector("#trackSpectrogram"),
  trackOverview: document.querySelector("#trackOverview"),
  spectrogramStack: document.querySelector("#spectrogramStack"),
  videoDrop: document.querySelector("#videoDrop"),
  audioDrop: document.querySelector("#audioDrop"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  trimStartInput: document.querySelector("#trimStartInput"),
  trimStartSlider: document.querySelector("#trimStartSlider"),
  tempoInput: document.querySelector("#tempoInput"),
  tempoSlider: document.querySelector("#tempoSlider"),
  gainInput: document.querySelector("#gainInput"),
  gainSlider: document.querySelector("#gainSlider"),
  loopToggle: document.querySelector("#loopToggle"),
  loopInInput: document.querySelector("#loopInInput"),
  loopOutInput: document.querySelector("#loopOutInput"),
  resetButton: document.querySelector("#resetButton"),
  renderButton: document.querySelector("#renderButton"),
  downloadLink: document.querySelector("#downloadLink"),
  ffmpegLog: document.querySelector("#ffmpegLog")
};

const state = {
  videoFile: null,
  audioFile: null,
  videoUrl: null,
  renderUrl: null,
  videoAudio: null,
  trackAudio: null,
  trackPlaybackBuffer: null,
  videoSpec: null,
  trackSpec: null,
  videoFeatures: null,
  trackFeatures: null,
  trimStart: 0,
  tempo: 1,
  gain: 0.95,
  playhead: 0,
  loopIn: 0,
  loopOut: 0,
  zoom: 1,
  analysisMode: "balanced",
  candidates: [],
  selectedCandidate: -1,
  ffmpeg: null,
  ffmpegReady: false,
  ffmpegModules: null,
  audioContext: null,
  previewSource: null,
  previewGain: null,
  animationFrame: null
};

const specOffscreenCache = new WeakMap();
const canvasRectCache = new WeakMap();
const logLines = [];

class FFT {
  constructor(size) {
    if ((size & (size - 1)) !== 0) {
      throw new Error("FFT size must be a power of two");
    }
    this.size = size;
    this.levels = Math.log2(size);
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    this.reverse = new Uint32Array(size);

    for (let i = 0; i < size / 2; i += 1) {
      const angle = (2 * Math.PI * i) / size;
      this.cos[i] = Math.cos(angle);
      this.sin[i] = Math.sin(angle);
    }

    for (let i = 0; i < size; i += 1) {
      let value = i;
      let reversed = 0;
      for (let bit = 0; bit < this.levels; bit += 1) {
        reversed = (reversed << 1) | (value & 1);
        value >>= 1;
      }
      this.reverse[i] = reversed;
    }
  }

  transform(real, imag) {
    const n = this.size;
    for (let i = 0; i < n; i += 1) {
      const j = this.reverse[i];
      if (j > i) {
        const realValue = real[i];
        real[i] = real[j];
        real[j] = realValue;
        const imagValue = imag[i];
        imag[i] = imag[j];
        imag[j] = imagValue;
      }
    }

    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const tableStep = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfSize; j += 1, k += tableStep) {
          const tReal = real[j + halfSize] * this.cos[k] + imag[j + halfSize] * this.sin[k];
          const tImag = -real[j + halfSize] * this.sin[k] + imag[j + halfSize] * this.cos[k];
          real[j + halfSize] = real[j] - tReal;
          imag[j + halfSize] = imag[j] - tImag;
          real[j] += tReal;
          imag[j] += tImag;
        }
      }
    }
  }
}

const fft = new FFT(FFT_SIZE);
const hann = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i += 1) {
  hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
}

function setStatus(message) {
  dom.appStatus.textContent = message;
}

function setLog(message) {
  logLines.length = 0;
  if (message) logLines.push(message);
  dom.ffmpegLog.textContent = message;
}

function appendLog(message) {
  logLines.push(message);
  if (logLines.length > LOG_LINE_LIMIT) {
    logLines.splice(0, logLines.length - LOG_LINE_LIMIT);
  }
  dom.ffmpegLog.textContent = logLines.join("\n");
  dom.ffmpegLog.scrollTop = dom.ffmpegLog.scrollHeight;
}

function formatSeconds(value, digits = 3) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}s`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateIsolationStatus() {
  const isolated = window.crossOriginIsolated === true;
  dom.isolationStatus.textContent = isolated ? "Isolated" : "Not isolated";
}

function ensureAudioContext() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
  }
  return state.audioContext;
}

async function decodeAudioFile(file) {
  const audioContext = ensureAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return {
      analysis: audioBufferToAnalysis(decoded),
      playbackBuffer: decoded
    };
  } catch {
    appendLog(`Web Audio decode failed for ${file.name}; trying FFmpeg extraction.`);
    const extracted = await extractAudioWithFfmpeg(file, "track-input", 48000);
    return {
      analysis: {
        samples: resampleLinear(extracted.samples, extracted.sampleRate, TARGET_SAMPLE_RATE),
        sampleRate: TARGET_SAMPLE_RATE,
        duration: extracted.duration
      },
      playbackBuffer: analysisToAudioBuffer(extracted)
    };
  }
}

function audioBufferToAnalysis(buffer) {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return {
    samples: resampleLinear(mono, buffer.sampleRate, TARGET_SAMPLE_RATE),
    sampleRate: TARGET_SAMPLE_RATE,
    duration: buffer.duration
  };
}

function analysisToAudioBuffer(audio) {
  const audioContext = ensureAudioContext();
  const buffer = audioContext.createBuffer(1, audio.samples.length, audio.sampleRate);
  buffer.copyToChannel(audio.samples, 0);
  return buffer;
}

function resampleLinear(samples, sourceRate, targetRate) {
  if (sourceRate === targetRate) return samples.slice();
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourceIndex - left;
    output[i] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

function parsePcmS16Mono(bytes, sampleRate) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const tag = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    if (tag === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0) throw new Error("WAV data chunk missing");
  const frames = Math.floor(dataSize / 2);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  }
  return { samples, sampleRate, duration: frames / sampleRate };
}

async function loadFfmpeg() {
  if (state.ffmpegReady) return state.ffmpeg;
  setStatus("Loading FFmpeg WASM");
  dom.loadFfmpegButton.disabled = true;

  const ffmpegBaseURL = `${FFMPEG_VENDOR_BASE_URL}/ffmpeg/${FFMPEG_VERSION}/dist/esm`;
  const utilBaseURL = `${FFMPEG_VENDOR_BASE_URL}/util/${UTIL_VERSION}/dist/esm`;
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import(`${ffmpegBaseURL}/index.js`),
    import(`${utilBaseURL}/index.js`)
  ]);

  state.ffmpegModules = { fetchFile };
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => appendLog(message));
  ffmpeg.on("progress", ({ progress }) => {
    if (Number.isFinite(progress)) {
      dom.exportState.textContent = `${Math.max(0, Math.min(100, progress * 100)).toFixed(0)}%`;
    }
  });

  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${FFMPEG_CORE_CDN_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${FFMPEG_CORE_CDN_BASE_URL}/ffmpeg-core.wasm`, "application/wasm")
  ]);
  await ffmpeg.load({
    classWorkerURL: `${ffmpegBaseURL}/worker.js`,
    coreURL,
    wasmURL
  });

  state.ffmpeg = ffmpeg;
  state.ffmpegReady = true;
  dom.loadFfmpegButton.disabled = false;
  setStatus("FFmpeg ready");
  return ffmpeg;
}

async function cleanupFfmpegFiles(ffmpeg, ...names) {
  await Promise.allSettled(names.map((name) => ffmpeg.deleteFile(name)));
}

async function extractAudioWithFfmpeg(file, prefix, sampleRate = TARGET_SAMPLE_RATE) {
  const ffmpeg = await loadFfmpeg();
  const { fetchFile } = state.ffmpegModules;
  const inputName = `${prefix}-${Date.now()}-${safeName(file.name)}`;
  const outputName = `${prefix}-audio.wav`;
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i", inputName,
      "-map", "0:a:0",
      "-ac", "1",
      "-ar", String(sampleRate),
      "-c:a", "pcm_s16le",
      outputName
    ]);
    const output = await ffmpeg.readFile(outputName);
    return parsePcmS16Mono(output, sampleRate);
  } finally {
    await cleanupFfmpegFiles(ffmpeg, inputName, outputName);
  }
}

function safeName(name) {
  return name.replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 80) || "file";
}

function makeBandEdges(sampleRate) {
  const minHz = 80;
  const maxHz = Math.min(7200, sampleRate / 2 - 1);
  const edges = new Float32Array(BAND_COUNT + 1);
  const minLog = Math.log(minHz);
  const maxLog = Math.log(maxHz);
  for (let i = 0; i <= BAND_COUNT; i += 1) {
    edges[i] = Math.exp(minLog + (i / BAND_COUNT) * (maxLog - minLog));
  }
  return edges;
}

function computeSpectrogram(audio) {
  const samples = audio.samples;
  const sampleRate = audio.sampleRate;
  const frameCount = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP_SIZE) + 1);
  const edges = makeBandEdges(sampleRate);
  const binHz = sampleRate / FFT_SIZE;
  const values = new Float32Array(frameCount * BAND_COUNT);
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);
  const bandCounts = new Uint16Array(BAND_COUNT);
  const binBand = new Int16Array(FFT_SIZE / 2);

  for (let bin = 1; bin < FFT_SIZE / 2; bin += 1) {
    const hz = bin * binHz;
    let band = -1;
    for (let i = 0; i < BAND_COUNT; i += 1) {
      if (hz >= edges[i] && hz < edges[i + 1]) {
        band = i;
        break;
      }
    }
    binBand[bin] = band;
    if (band >= 0) bandCounts[band] += 1;
  }

  let max = -Infinity;
  let min = Infinity;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * HOP_SIZE;
    real.fill(0);
    imag.fill(0);
    for (let i = 0; i < FFT_SIZE; i += 1) {
      real[i] = (samples[start + i] || 0) * hann[i];
    }
    fft.transform(real, imag);

    const rowStart = frame * BAND_COUNT;
    for (let bin = 1; bin < FFT_SIZE / 2; bin += 1) {
      const band = binBand[bin];
      if (band < 0) continue;
      values[rowStart + band] += Math.hypot(real[bin], imag[bin]);
    }

    for (let band = 0; band < BAND_COUNT; band += 1) {
      const index = rowStart + band;
      const normalized = Math.log1p(values[index] / Math.max(1, bandCounts[band]));
      values[index] = normalized;
      max = Math.max(max, normalized);
      min = Math.min(min, normalized);
    }
  }

  return {
    values,
    frames: frameCount,
    bands: BAND_COUNT,
    sampleRate,
    hopSeconds: HOP_SIZE / sampleRate,
    duration: audio.duration,
    min,
    max
  };
}

function buildFeatures(spec) {
  const frames = spec.frames;
  const bands = spec.bands;
  const data = new Float32Array(frames * bands);

  for (let frame = 1; frame < frames; frame += 1) {
    let mean = 0;
    for (let band = 0; band < bands; band += 1) {
      const value = Math.max(0, spec.values[frame * bands + band] - spec.values[(frame - 1) * bands + band]);
      data[frame * bands + band] = value;
      mean += value;
    }
    mean /= bands;

    let norm = 0;
    for (let band = 0; band < bands; band += 1) {
      const index = frame * bands + band;
      data[index] -= mean;
      norm += data[index] * data[index];
    }

    norm = Math.sqrt(norm) || 1;
    for (let band = 0; band < bands; band += 1) {
      data[frame * bands + band] /= norm;
    }
  }

  return {
    data,
    frames,
    bands,
    hopSeconds: spec.hopSeconds
  };
}

function featureWeight(time, duration) {
  if (state.analysisMode === "start") {
    if (time < 4) return 1.6;
    if (time < 18) return 1.25;
    if (time > duration - 5) return 0.35;
    return 0.75;
  }
  if (state.analysisMode === "interior") {
    if (time < 5 || time > duration - 5) return 0.25;
    if (time > 8 && time < duration - 8) return 1.55;
    return 1;
  }
  if (time < 3 || time > duration - 4) return 0.45;
  if (time > 8 && time < duration - 8) return 1.35;
  return 1;
}

function minimumOverlapFrames(videoFrames, hopSeconds) {
  const eightSeconds = Math.round(8 / hopSeconds);
  const partialVideo = Math.floor(videoFrames * 0.35);
  return Math.min(videoFrames, Math.max(eightSeconds, partialVideo, 1));
}

function trimBounds(tempo = state.tempo) {
  if (!state.videoAudio || !state.trackAudio) return { min: 0, max: 0 };
  return {
    min: -state.videoAudio.duration * tempo,
    max: Math.max(0, state.trackAudio.duration - state.videoAudio.duration * tempo)
  };
}

function scoreOffset(videoFeatures, trackFeatures, offsetFrame, stride = 2) {
  const { data: videoData, frames: videoFrames, bands, hopSeconds } = videoFeatures;
  const { data: trackData, frames: trackFrames } = trackFeatures;
  const startFrame = Math.max(0, -offsetFrame);
  const endFrame = Math.min(videoFrames, trackFrames - offsetFrame);
  if (endFrame - startFrame < minimumOverlapFrames(videoFrames, hopSeconds)) return -Infinity;

  let score = 0;
  let weightTotal = 0;
  const duration = videoFrames * hopSeconds;

  for (let frame = startFrame; frame < endFrame; frame += stride) {
    const weight = featureWeight(frame * hopSeconds, duration);
    let dot = 0;
    const videoBase = frame * bands;
    const trackBase = (offsetFrame + frame) * bands;
    for (let band = 0; band < bands; band += 1) {
      dot += videoData[videoBase + band] * trackData[trackBase + band];
    }
    score += dot * weight;
    weightTotal += weight;
  }

  return score / Math.max(weightTotal, 1);
}

function scoreOffsetTempo(videoFeatures, trackFeatures, startSeconds, tempo, stride = 4) {
  const { data: videoData, frames: videoFrames, bands, hopSeconds } = videoFeatures;
  const { data: trackData, frames: trackFrames } = trackFeatures;
  const duration = videoFrames * hopSeconds;
  let score = 0;
  let weightTotal = 0;
  let matchedFrames = 0;

  for (let frame = 0; frame < videoFrames; frame += stride) {
    const sourceTime = startSeconds + tempo * frame * hopSeconds;
    const sourceFrame = sourceTime / hopSeconds;
    const left = Math.floor(sourceFrame);
    const right = left + 1;
    if (left < 0 || right >= trackFrames) continue;
    const fraction = sourceFrame - left;
    const weight = featureWeight(frame * hopSeconds, duration);
    const videoBase = frame * bands;
    const leftBase = left * bands;
    const rightBase = right * bands;
    let dot = 0;
    for (let band = 0; band < bands; band += 1) {
      const interpolated = trackData[leftBase + band] * (1 - fraction) + trackData[rightBase + band] * fraction;
      dot += videoData[videoBase + band] * interpolated;
    }
    score += dot * weight;
    weightTotal += weight;
    matchedFrames += stride;
  }

  if (matchedFrames < minimumOverlapFrames(videoFrames, hopSeconds)) return -Infinity;
  return score / Math.max(weightTotal, 1);
}

function estimateCandidates() {
  const videoFeatures = state.videoFeatures;
  const trackFeatures = state.trackFeatures;
  const bounds = trimBounds(1);
  const minOffsetFrame = Math.ceil(bounds.min / videoFeatures.hopSeconds);
  const maxOffsetFrame = Math.floor(bounds.max / videoFeatures.hopSeconds);
  const coarse = [];
  const step = 4;

  for (let offsetFrame = minOffsetFrame; offsetFrame <= maxOffsetFrame; offsetFrame += step) {
    const score = scoreOffset(videoFeatures, trackFeatures, offsetFrame, 3);
    if (Number.isFinite(score)) {
      coarse.push({ offsetFrame, score });
    }
  }
  coarse.sort((a, b) => b.score - a.score);

  const refined = [];
  for (const candidate of coarse.slice(0, 24)) {
    const start = Math.max(minOffsetFrame, candidate.offsetFrame - 36);
    const end = Math.min(maxOffsetFrame, candidate.offsetFrame + 36);
    let best = candidate;
    for (let offsetFrame = start; offsetFrame <= end; offsetFrame += 1) {
      const score = scoreOffset(videoFeatures, trackFeatures, offsetFrame, 1);
      if (score > best.score) best = { offsetFrame, score };
    }
    const seconds = best.offsetFrame * videoFeatures.hopSeconds;
    if (!refined.some((row) => Math.abs(row.seconds - seconds) < 1.2)) {
      refined.push({
        seconds,
        tempo: 1,
        score: best.score,
        label: "match"
      });
    }
  }

  refined.sort((a, b) => b.score - a.score);
  return refined.slice(0, 10);
}

function refineTempoAround(startSeconds) {
  let best = {
    seconds: startSeconds,
    tempo: state.tempo,
    score: scoreOffsetTempo(state.videoFeatures, state.trackFeatures, startSeconds, state.tempo, 3)
  };

  for (let start = startSeconds - 0.5; start <= startSeconds + 0.5; start += 0.016) {
    for (let tempo = 0.97; tempo <= 1.035; tempo += 0.001) {
      const bounds = trimBounds(tempo);
      if (start < bounds.min || start > bounds.max) continue;
      const score = scoreOffsetTempo(state.videoFeatures, state.trackFeatures, start, tempo, 4);
      if (score > best.score) {
        best = { seconds: start, tempo, score };
      }
    }
  }

  return best;
}

function getSpecOffscreen(spec) {
  const cached = specOffscreenCache.get(spec);
  if (cached) return cached;

  const w = spec.frames;
  const h = spec.bands;
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { alpha: false });
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const min = spec.min;
  const range = Math.max(0.0001, spec.max - spec.min);

  for (let x = 0; x < w; x += 1) {
    const colBase = x * spec.bands;
    for (let y = 0; y < h; y += 1) {
      const band = spec.bands - 1 - y;
      const normalized = clamp((spec.values[colBase + band] - min) / range, 0, 1);
      const scaled = normalized * (SPEC_COLOR_STOPS.length - 1);
      const idx = Math.min(SPEC_COLOR_STOPS.length - 2, Math.floor(scaled));
      const f = scaled - idx;
      const a = SPEC_COLOR_STOPS[idx];
      const b = SPEC_COLOR_STOPS[idx + 1];
      const di = (y * w + x) * 4;
      data[di] = Math.round(a[0] * (1 - f) + b[0] * f);
      data[di + 1] = Math.round(a[1] * (1 - f) + b[1] * f);
      data[di + 2] = Math.round(a[2] * (1 - f) + b[2] * f);
      data[di + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  specOffscreenCache.set(spec, canvas);
  return canvas;
}

function getCanvasPixelSize(canvas) {
  let rect = canvasRectCache.get(canvas);
  if (!rect) {
    rect = canvas.getBoundingClientRect();
    canvasRectCache.set(canvas, rect);
  }
  const scale = window.devicePixelRatio || 1;
  return {
    width: Math.max(2, Math.floor(rect.width * scale)),
    height: Math.max(2, Math.floor(rect.height * scale)),
    scale
  };
}

function drawSpectrogram(canvas, spec, options = {}) {
  const { width, height, scale } = getCanvasPixelSize(canvas);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  const off = getSpecOffscreen(spec);
  const start = options.start ?? 0;
  const duration = options.duration ?? spec.duration;
  const mapTime = options.mapTime;
  const srcStart = mapTime ? mapTime(start) : start;
  const srcEnd = mapTime ? mapTime(start + duration) : start + duration;
  const silentColor = `rgb(${SPEC_COLOR_STOPS[0].join(",")})`;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";

  if (srcEnd <= 0 || srcStart >= spec.duration) {
    ctx.fillStyle = silentColor;
    ctx.fillRect(0, 0, width, height);
  } else if (srcStart < 0) {
    const splitX = (-srcStart / (srcEnd - srcStart)) * width;
    ctx.fillStyle = silentColor;
    ctx.fillRect(0, 0, splitX, height);
    const srcXEnd = clamp(srcEnd / spec.hopSeconds, 0, spec.frames);
    ctx.drawImage(off, 0, 0, Math.max(1, srcXEnd), spec.bands, splitX, 0, width - splitX, height);
  } else if (srcEnd > spec.duration) {
    const splitX = ((spec.duration - srcStart) / (srcEnd - srcStart)) * width;
    const srcXStart = clamp(srcStart / spec.hopSeconds, 0, spec.frames);
    ctx.drawImage(off, srcXStart, 0, Math.max(1, spec.frames - srcXStart), spec.bands, 0, 0, splitX, height);
    ctx.fillStyle = silentColor;
    ctx.fillRect(splitX, 0, width - splitX, height);
  } else {
    const srcXStart = srcStart / spec.hopSeconds;
    const srcXEnd = srcEnd / spec.hopSeconds;
    ctx.drawImage(off, srcXStart, 0, Math.max(1, srcXEnd - srcXStart), spec.bands, 0, 0, width, height);
  }

  drawGrid(ctx, width, height, duration, start, scale);

  if (options.playhead !== undefined) {
    const x = ((options.playhead - start) / duration) * width;
    if (x >= 0 && x <= width) drawMarker(ctx, x, height);
  }

  if (options.windowStart !== undefined && options.windowEnd !== undefined) {
    const x1 = clamp(options.windowStart / spec.duration, 0, 1) * width;
    const x2 = clamp(options.windowEnd / spec.duration, 0, 1) * width;
    ctx.fillStyle = "rgba(102, 211, 198, 0.16)";
    ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
    ctx.strokeStyle = "rgba(244, 180, 88, 0.92)";
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeRect(x1, 1, Math.max(1, x2 - x1), height - 2);
  }
}

function drawGrid(ctx, width, height, duration, start, scale) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = Math.max(1, scale * 0.75);
  const step = duration > 80 ? 10 : duration > 30 ? 5 : 1;
  const first = Math.ceil(start / step) * step;
  for (let time = first; time <= start + duration; time += step) {
    const x = ((time - start) / duration) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMarker(ctx, x, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();
}

function getViewWindow() {
  const total = state.videoAudio.duration;
  const viewDuration = total / state.zoom;
  const viewStart = clamp(state.playhead - viewDuration / 2, 0, Math.max(0, total - viewDuration));
  return { viewStart, viewDuration };
}

function redraw() {
  if (!state.videoSpec || !state.trackSpec) {
    clearCanvas(dom.videoSpectrogram);
    clearCanvas(dom.trackSpectrogram);
    clearCanvas(dom.trackOverview);
    dom.spectrogramStack.classList.remove("has-data");
    return;
  }
  dom.spectrogramStack.classList.add("has-data");

  const { viewStart, viewDuration } = getViewWindow();
  drawSpectrogram(dom.videoSpectrogram, state.videoSpec, {
    start: viewStart,
    duration: viewDuration,
    playhead: state.playhead
  });
  drawSpectrogram(dom.trackSpectrogram, state.trackSpec, {
    start: viewStart,
    duration: viewDuration,
    playhead: state.playhead,
    mapTime: (time) => state.trimStart + state.tempo * time
  });
  drawSpectrogram(dom.trackOverview, state.trackSpec, {
    windowStart: Math.max(0, state.trimStart),
    windowEnd: Math.min(state.trackAudio.duration, state.trimStart + state.tempo * state.videoAudio.duration)
  });
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function currentScore() {
  if (state.selectedCandidate < 0) return null;
  return state.candidates[state.selectedCandidate]?.score ?? null;
}

const DISABLED_NEEDS_FILES = "Load a video and audio track first";
const DISABLED_NEEDS_ANALYSIS = "Decode media first";
const REFINE_TEMPO_TITLE = "Search ±0.5s and ±3.5% tempo around the current alignment";

function updateControls() {
  const hasFiles = Boolean(state.videoFile && state.audioFile);
  const hasAnalysis = Boolean(state.videoAudio && state.trackAudio);
  const { min: minTrim, max: maxTrim } = hasAnalysis ? trimBounds() : { min: 0, max: 0 };

  dom.decodeButton.disabled = !hasFiles;
  dom.estimateButton.disabled = !hasAnalysis;
  dom.refineTempoButton.disabled = !hasAnalysis;
  dom.playButton.disabled = !hasAnalysis;
  dom.stopButton.disabled = !hasAnalysis;
  dom.renderButton.disabled = !hasAnalysis;
  dom.playheadSlider.disabled = !hasAnalysis;
  dom.trimStartSlider.disabled = !hasAnalysis;

  dom.decodeButton.title = hasFiles ? "" : DISABLED_NEEDS_FILES;
  dom.estimateButton.title = hasAnalysis ? "" : DISABLED_NEEDS_ANALYSIS;
  dom.refineTempoButton.title = hasAnalysis ? REFINE_TEMPO_TITLE : DISABLED_NEEDS_ANALYSIS;
  dom.renderButton.title = hasAnalysis ? "" : DISABLED_NEEDS_ANALYSIS;

  dom.trimStartSlider.min = String(minTrim);
  dom.trimStartInput.min = String(minTrim);
  dom.trimStartSlider.max = String(maxTrim);
  dom.trimStartInput.max = String(maxTrim);
  state.trimStart = clamp(state.trimStart, minTrim, maxTrim);
  dom.trimStartSlider.value = String(state.trimStart);
  dom.trimStartInput.value = state.trimStart.toFixed(3);
  dom.tempoInput.value = state.tempo.toFixed(4);
  dom.tempoSlider.value = String(state.tempo);
  dom.gainInput.value = state.gain.toFixed(2);
  dom.gainSlider.value = String(state.gain);

  if (hasAnalysis) {
    dom.playheadSlider.max = String(state.videoAudio.duration);
    dom.playheadSlider.value = String(state.playhead);
    dom.currentTime.textContent = formatSeconds(state.playhead);
    dom.durationTime.textContent = formatSeconds(state.videoAudio.duration);
    dom.loopOutInput.value = state.loopOut.toFixed(3);
    dom.loopInInput.value = state.loopIn.toFixed(3);
  }

  dom.trimMetric.textContent = formatSeconds(state.trimStart);
  dom.tempoMetric.textContent = formatTempo(state.tempo);
  const score = currentScore();
  dom.scoreMetric.textContent = score === null ? "-" : score.toFixed(4);
}

function formatTempo(value) {
  if (value === 1) return value.toFixed(4);
  const pct = (value - 1) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${value.toFixed(4)} (${sign}${pct.toFixed(2)}%)`;
}

function updateTimeReadout() {
  if (!state.videoAudio) return;
  dom.playheadSlider.value = String(state.playhead);
  dom.currentTime.textContent = formatSeconds(state.playhead);
}

function renderCandidateList() {
  dom.candidateCount.textContent = String(state.candidates.length);
  if (state.candidates.length === 0) {
    dom.candidateList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="list-filter"></i>
        <p>No candidates</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  dom.candidateList.innerHTML = "";
  state.candidates.forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `candidate${index === state.selectedCandidate ? " active" : ""}`;
    button.dataset.index = String(index);
    button.innerHTML = `
      <span>
        <strong>${candidate.seconds.toFixed(3)}s</strong>
        <span>tempo ${candidate.tempo.toFixed(4)}</span>
      </span>
      <span>${candidate.score.toFixed(4)}</span>
    `;
    dom.candidateList.append(button);
  });
}

function syncCandidateSelection() {
  const buttons = dom.candidateList.querySelectorAll(".candidate");
  buttons.forEach((node, index) => {
    node.classList.toggle("active", index === state.selectedCandidate);
  });
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function loadMedia() {
  if (!state.videoFile || !state.audioFile) return;
  stopPreview();
  setStatus("Decoding media");
  dom.mediaState.textContent = "Loading";
  dom.analysisState.textContent = "Decoding";
  setLog("");

  const videoAudioPromise = extractAudioWithFfmpeg(state.videoFile, "video-input", TARGET_SAMPLE_RATE);
  const trackAudioPromise = decodeAudioFile(state.audioFile);
  const [videoAudio, trackDecoded] = await Promise.all([videoAudioPromise, trackAudioPromise]);

  state.videoAudio = {
    samples: videoAudio.samples,
    sampleRate: videoAudio.sampleRate,
    duration: Math.min(videoAudio.duration, Number.isFinite(dom.videoPreview.duration) ? dom.videoPreview.duration : videoAudio.duration)
  };
  state.trackAudio = trackDecoded.analysis;
  state.trackPlaybackBuffer = trackDecoded.playbackBuffer;
  state.trimStart = 0;
  state.tempo = 1;
  state.playhead = 0;
  state.loopIn = 0;
  state.loopOut = state.videoAudio.duration;
  state.candidates = [];
  state.selectedCandidate = -1;

  setStatus("Building spectrograms");
  await nextFrame();
  state.videoSpec = computeSpectrogram(state.videoAudio);
  state.trackSpec = computeSpectrogram(state.trackAudio);
  state.videoFeatures = buildFeatures(state.videoSpec);
  state.trackFeatures = buildFeatures(state.trackSpec);

  dom.mediaState.textContent = "Loaded";
  dom.analysisState.textContent = "Ready";
  setStatus("Ready");
  updateControls();
  renderCandidateList();
  redraw();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function applyCandidate(index) {
  const candidate = state.candidates[index];
  if (!candidate) return;
  state.selectedCandidate = index;
  state.trimStart = candidate.seconds;
  state.tempo = candidate.tempo;
  updateControls();
  syncCandidateSelection();
  redraw();
}

async function estimateMatch() {
  if (!state.videoFeatures || !state.trackFeatures) return;
  stopPreview();
  setStatus("Estimating match");
  dom.analysisState.textContent = "Analyzing";
  await nextFrame();
  state.candidates = estimateCandidates();
  state.selectedCandidate = state.candidates.length ? 0 : -1;
  renderCandidateList();
  if (state.candidates.length) applyCandidate(0);
  else updateControls();
  dom.analysisState.textContent = "Done";
  setStatus("Estimate complete");
}

async function refineTempo() {
  if (!state.videoFeatures || !state.trackFeatures) return;
  stopPreview();
  setStatus("Refining tempo");
  dom.analysisState.textContent = "Refining";
  await nextFrame();
  const refined = refineTempoAround(state.trimStart);
  state.trimStart = refined.seconds;
  state.tempo = refined.tempo;
  const candidate = {
    seconds: refined.seconds,
    tempo: refined.tempo,
    score: refined.score,
    label: "tempo"
  };
  state.candidates = [candidate, ...state.candidates.filter((row) => Math.abs(row.seconds - candidate.seconds) > 0.25)].slice(0, 10);
  state.selectedCandidate = 0;
  updateControls();
  renderCandidateList();
  redraw();
  dom.analysisState.textContent = "Done";
  setStatus("Tempo refined");
}

function setPlaying(isPlaying) {
  dom.playButton.classList.toggle("is-playing", isPlaying);
  dom.playButton.setAttribute("aria-label", isPlaying ? "Pause preview" : "Play preview");
}

function scheduleCleanSource(source, audioContext, videoTime) {
  const audioOffsetTarget = state.trimStart + state.tempo * videoTime;
  const maxOffset = Math.max(0, state.trackPlaybackBuffer.duration - 0.05);
  if (audioOffsetTarget >= 0) {
    source.start(0, clamp(audioOffsetTarget, 0, maxOffset));
  } else {
    const delay = -audioOffsetTarget / state.tempo;
    source.start(audioContext.currentTime + delay, 0);
  }
}

function reseekCleanAudio() {
  if (!state.previewSource || !state.previewGain || !state.trackPlaybackBuffer) return;
  const audioContext = ensureAudioContext();
  try {
    state.previewSource.stop();
  } catch {
    // Already stopped.
  }
  const source = audioContext.createBufferSource();
  source.buffer = state.trackPlaybackBuffer;
  source.playbackRate.value = state.tempo;
  source.connect(state.previewGain);
  const currentTime = clamp(dom.videoPreview.currentTime || 0, 0, state.videoAudio.duration);
  scheduleCleanSource(source, audioContext, currentTime);
  state.previewSource = source;
}

function startPreview() {
  if (!state.videoAudio || !state.trackPlaybackBuffer) return;
  stopPreview(false);
  const audioContext = ensureAudioContext();
  const mode = dom.previewMode.value;
  const cleanEnabled = mode === "clean" || mode === "blend";
  const originalEnabled = mode === "original" || mode === "blend";
  const currentTime = clamp(state.playhead, 0, state.videoAudio.duration);

  dom.videoPreview.currentTime = currentTime;
  dom.videoPreview.muted = !originalEnabled;
  dom.videoPreview.volume = mode === "blend" ? 0.25 : 1;
  dom.videoPreview.play().catch(() => {});

  if (cleanEnabled) {
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    source.buffer = state.trackPlaybackBuffer;
    source.playbackRate.value = state.tempo;
    gain.gain.value = state.gain;
    source.connect(gain).connect(audioContext.destination);
    scheduleCleanSource(source, audioContext, currentTime);
    state.previewSource = source;
    state.previewGain = gain;
  }

  setPlaying(true);
  tickPreview();
}

function stopPreview(syncPlayhead = true) {
  if (state.previewSource) {
    try {
      state.previewSource.stop();
    } catch {
      // Already stopped.
    }
  }
  state.previewSource = null;
  state.previewGain = null;
  dom.videoPreview.pause();
  if (syncPlayhead && state.videoAudio) {
    state.playhead = clamp(dom.videoPreview.currentTime || state.playhead, 0, state.videoAudio.duration);
  }
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = null;
  setPlaying(false);
  updateControls();
  redraw();
}

function tickPreview() {
  if (!state.videoAudio) return;
  state.playhead = clamp(dom.videoPreview.currentTime || 0, 0, state.videoAudio.duration);
  if (dom.loopToggle.checked && state.playhead >= state.loopOut) {
    state.playhead = state.loopIn;
    startPreview();
    return;
  }
  if (state.playhead >= state.videoAudio.duration - 0.02 || dom.videoPreview.paused) {
    stopPreview();
    return;
  }
  updateTimeReadout();
  redraw();
  state.animationFrame = requestAnimationFrame(tickPreview);
}

function buildAudioFilter(sourceDuration) {
  const tempo = state.tempo.toFixed(5);
  const cap = state.videoAudio.duration.toFixed(3);
  const gain = state.gain.toFixed(3);
  if (state.trimStart >= 0) {
    return `[1:a]atrim=start=${state.trimStart.toFixed(3)}:duration=${sourceDuration.toFixed(3)},asetpts=PTS-STARTPTS,atempo=${tempo},atrim=duration=${cap},asetpts=PTS-STARTPTS,volume=${gain}[a]`;
  }
  const delayMs = Math.round((-state.trimStart / state.tempo) * 1000);
  return `[1:a]atempo=${tempo},adelay=${delayMs}:all=1,atrim=duration=${cap},asetpts=PTS-STARTPTS,volume=${gain}[a]`;
}

async function renderOutput() {
  if (!state.videoFile || !state.audioFile || !state.videoAudio) return;
  stopPreview();
  const ffmpeg = await loadFfmpeg();
  const { fetchFile } = state.ffmpegModules;
  const videoName = `video-${safeName(state.videoFile.name)}`;
  const audioName = `track-${safeName(state.audioFile.name)}`;
  const outputName = "synced-output.mp4";
  const sourceDuration = state.videoAudio.duration * state.tempo + 0.2;

  dom.exportState.textContent = "Rendering";
  dom.downloadLink.classList.add("hidden");
  setStatus("Rendering output");
  setLog("");

  try {
    await ffmpeg.writeFile(videoName, await fetchFile(state.videoFile));
    await ffmpeg.writeFile(audioName, await fetchFile(state.audioFile));
    await ffmpeg.exec([
      "-i", videoName,
      "-i", audioName,
      "-filter_complex",
      buildAudioFilter(sourceDuration),
      "-map", "0:v:0",
      "-map", "[a]",
      "-map_metadata", "0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      outputName
    ]);

    const output = await ffmpeg.readFile(outputName);
    const blob = new Blob([output], { type: "video/mp4" });
    if (state.renderUrl) URL.revokeObjectURL(state.renderUrl);
    state.renderUrl = URL.createObjectURL(blob);
    dom.downloadLink.href = state.renderUrl;
    dom.downloadLink.download = `${state.videoFile.name.replace(/\.[^.]+$/, "")}-synced.mp4`;
    dom.downloadLink.classList.remove("hidden");
    dom.exportState.textContent = "Done";
    setStatus("Render complete");
  } finally {
    await cleanupFfmpegFiles(ffmpeg, videoName, audioName, outputName);
  }
}

function bindVideoInput() {
  dom.videoInput.addEventListener("change", () => {
    const file = dom.videoInput.files?.[0];
    if (!file) return;
    state.videoFile = file;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);
    dom.videoPreview.src = state.videoUrl;
    dom.videoPlaceholder.classList.add("hidden");
    dom.videoMeta.textContent = `${file.name} - ${formatBytes(file.size)}`;
    dom.videoDrop.classList.add("has-file");
    updateControls();
  });
}

function bindAudioInput() {
  dom.audioInput.addEventListener("change", () => {
    const file = dom.audioInput.files?.[0];
    if (!file) return;
    state.audioFile = file;
    dom.audioMeta.textContent = `${file.name} - ${formatBytes(file.size)}`;
    dom.audioDrop.classList.add("has-file");
    updateControls();
  });
}

function bindDropZone(zone, input) {
  const hasFiles = (event) => event.dataTransfer?.types?.includes("Files");
  zone.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
    zone.classList.remove("is-dragover");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragover");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change"));
  });
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey) return;
    if (event.target.matches("input, select, textarea, [contenteditable=true]")) return;
    if (!state.videoAudio) return;

    if (event.key === " ") {
      event.preventDefault();
      if (dom.videoPreview.paused) startPreview();
      else stopPreview();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const magnitude = event.shiftKey ? 1 : event.altKey ? 1 / 30 : 0.1;
      setTrimStart(state.trimStart + direction * magnitude);
      return;
    }
    if (event.key === "l" || event.key === "L") {
      event.preventDefault();
      dom.loopToggle.checked = !dom.loopToggle.checked;
    }
  });
}

function setTrimStart(value) {
  const min = Number.parseFloat(dom.trimStartSlider.min || "0");
  const max = Number.parseFloat(dom.trimStartSlider.max || "0");
  state.trimStart = clamp(Number(value) || 0, min, max);
  state.selectedCandidate = -1;
  reseekCleanAudio();
  updateControls();
  syncCandidateSelection();
  redraw();
}

function setTempo(value) {
  state.tempo = clamp(Number(value) || 1, 0.95, 1.05);
  state.selectedCandidate = -1;
  if (state.previewSource) {
    state.previewSource.playbackRate.value = state.tempo;
  }
  updateControls();
  syncCandidateSelection();
  redraw();
}

function setGain(value) {
  state.gain = clamp(Number(value) || 0, 0, 1.5);
  if (state.previewGain) state.previewGain.gain.value = state.gain;
  updateControls();
}

function setPlayhead(value) {
  state.playhead = clamp(Number(value) || 0, 0, state.videoAudio?.duration ?? 0);
  dom.videoPreview.currentTime = state.playhead;
  reseekCleanAudio();
  updateControls();
  redraw();
}

function setZoom(multiplier) {
  state.zoom = clamp(state.zoom * multiplier, 1, 12);
  redraw();
}

function bindNumericPair(input, slider, setter) {
  input.addEventListener("change", (event) => setter(event.target.value));
  slider.addEventListener("input", (event) => setter(event.target.value));
}

function bindCanvasDrag(canvas, handlers) {
  let active = false;
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.videoAudio || !state.trackAudio) return;
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    active = true;
    handlers.onDown?.(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (active) handlers.onMove?.(event);
  });
  const release = (event) => {
    if (!active) return;
    active = false;
    canvas.classList.remove("is-dragging");
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Capture already released.
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

function bindPlayheadScrub(canvas) {
  const apply = (event) => {
    const rect = canvas.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const { viewStart, viewDuration } = getViewWindow();
    setPlayhead(viewStart + ratio * viewDuration);
  };
  bindCanvasDrag(canvas, { onDown: apply, onMove: apply });
}

function bindTrimDrag(canvas) {
  let startX = 0;
  let startTrim = 0;
  let canvasWidth = 1;
  bindCanvasDrag(canvas, {
    onDown: (event) => {
      startX = event.clientX;
      startTrim = state.trimStart;
      canvasWidth = canvas.getBoundingClientRect().width || 1;
    },
    onMove: (event) => {
      const { viewDuration } = getViewWindow();
      const deltaTrim = -(event.clientX - startX) * state.tempo * viewDuration / canvasWidth;
      setTrimStart(startTrim + deltaTrim);
    }
  });
}

function bindOverviewDrag(canvas) {
  const apply = (event) => {
    const rect = canvas.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setTrimStart(ratio * state.trackAudio.duration);
  };
  bindCanvasDrag(canvas, { onDown: apply, onMove: apply });
}

function resetAdjustment() {
  stopPreview();
  state.trimStart = 0;
  state.tempo = 1;
  state.gain = 0.95;
  state.selectedCandidate = -1;
  updateControls();
  syncCandidateSelection();
  redraw();
}

function invalidateCanvasRects() {
  canvasRectCache.delete(dom.videoSpectrogram);
  canvasRectCache.delete(dom.trackSpectrogram);
  canvasRectCache.delete(dom.trackOverview);
}

function bindEvents() {
  bindVideoInput();
  bindAudioInput();
  bindDropZone(dom.videoDrop, dom.videoInput);
  bindDropZone(dom.audioDrop, dom.audioInput);
  bindKeyboard();
  dom.loadFfmpegButton.addEventListener("click", () => {
    setLog("");
    loadFfmpeg().catch(handleError);
  });
  dom.decodeButton.addEventListener("click", () => loadMedia().catch(handleError));
  dom.estimateButton.addEventListener("click", () => estimateMatch().catch(handleError));
  dom.refineTempoButton.addEventListener("click", () => refineTempo().catch(handleError));
  dom.renderButton.addEventListener("click", () => renderOutput().catch(handleError));
  dom.playButton.addEventListener("click", () => {
    if (dom.videoPreview.paused) startPreview();
    else stopPreview();
  });
  dom.stopButton.addEventListener("click", () => stopPreview());
  dom.playheadSlider.addEventListener("input", (event) => setPlayhead(event.target.value));
  bindNumericPair(dom.trimStartInput, dom.trimStartSlider, setTrimStart);
  bindNumericPair(dom.tempoInput, dom.tempoSlider, setTempo);
  bindNumericPair(dom.gainInput, dom.gainSlider, setGain);
  dom.loopInInput.addEventListener("change", (event) => {
    state.loopIn = clamp(Number(event.target.value) || 0, 0, state.videoAudio?.duration ?? 0);
    updateControls();
  });
  dom.loopOutInput.addEventListener("change", (event) => {
    state.loopOut = clamp(Number(event.target.value) || 0, state.loopIn, state.videoAudio?.duration ?? 0);
    updateControls();
  });
  dom.previewMode.addEventListener("change", () => {
    if (!dom.videoPreview.paused) startPreview();
  });
  dom.candidateList.addEventListener("click", (event) => {
    const button = event.target.closest(".candidate");
    if (!button) return;
    applyCandidate(Number(button.dataset.index));
  });
  dom.resetButton.addEventListener("click", resetAdjustment);
  dom.zoomInButton.addEventListener("click", () => setZoom(1.5));
  dom.zoomOutButton.addEventListener("click", () => setZoom(1 / 1.5));
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-mode]").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      state.analysisMode = button.dataset.mode;
    });
  });
  document.querySelectorAll("[data-nudge]").forEach((button) => {
    button.addEventListener("click", () => setTrimStart(state.trimStart + Number(button.dataset.nudge)));
  });
  bindPlayheadScrub(dom.videoSpectrogram);
  bindTrimDrag(dom.trackSpectrogram);
  bindOverviewDrag(dom.trackOverview);
  window.addEventListener("resize", () => {
    invalidateCanvasRects();
    redraw();
  });
}

function handleError(error) {
  console.error(error);
  setStatus("Error");
  dom.analysisState.textContent = "Error";
  dom.exportState.textContent = "Error";
  appendLog(error?.message ?? String(error));
  updateControls();
}

updateIsolationStatus();
bindEvents();
updateControls();
redraw();
refreshIcons();
