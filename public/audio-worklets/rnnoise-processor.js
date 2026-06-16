/**
 * RNNoise AudioWorkletProcessor — production noise suppression.
 * - 48 kHz, 480 samples per frame, mono.
 * - No allocations in process(); ring buffer + pre-allocated Float32Arrays.
 * - WASM loaded from /rnnoise.wasm; passthrough until loaded.
 * - If process_frame takes too long, skip frame (do not block).
 */

const FRAME_SIZE = 480;
const SAMPLE_RATE = 48000;

let wasmInstance = null;
let wasmMemory = null;
let processFrameFn = null;
let wasmInputOffset = 0;
let wasmOutputOffset = 0;
let wasmHeapF32 = null;

// AudioWorklet has no fetch. WASM must be passed from main thread via processorOptions.wasmBytes.
// If wasmBytes is not provided, we run in passthrough (no noise suppression).
function initWasmFromBytes(wasmBytes) {
  if (!wasmBytes || !(wasmBytes instanceof ArrayBuffer)) return;
  WebAssembly.instantiate(wasmBytes)
    .then((result) => {
      if (!result) return;
      const { instance } = result;
      const exports = instance.exports;
      if (!exports.memory) return;
      wasmMemory = exports;
      if (typeof exports.process_frame === 'function') {
        processFrameFn = exports.process_frame;
      } else if (typeof exports._rnnoise_process_frame === 'function') {
        processFrameFn = exports._rnnoise_process_frame;
      } else if (typeof exports.rnnoise_process_frame === 'function') {
        processFrameFn = exports.rnnoise_process_frame;
      }
      if (processFrameFn) {
        const byteLength = exports.memory.buffer.byteLength;
        wasmInputOffset = byteLength - FRAME_SIZE * 4 * 2;
        wasmOutputOffset = wasmInputOffset + FRAME_SIZE * 4;
        wasmHeapF32 = new Float32Array(exports.memory.buffer);
      } else {
        processFrameFn = null;
      }
    })
    .catch(() => {});
}

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const bytes = options && options.processorOptions && options.processorOptions.wasmBytes;
    if (bytes) initWasmFromBytes(bytes);
    this.inputRing = new Float32Array(FRAME_SIZE);
    this.outputRing = new Float32Array(FRAME_SIZE);
    this.frameIn = new Float32Array(FRAME_SIZE);
    this.frameOut = new Float32Array(FRAME_SIZE);
    this.inputWritePos = 0;
    this.inputCount = 0;
    this.outputReadPos = 0;
    this.outputCount = 0;
    this.dcX1 = 0;
    this.dcY1 = 0;
  }

  postFilter(sample) {
    // DC blocker (single-pole HPF) + soft clip to avoid harsh clipping artifacts.
    const hp = sample - this.dcX1 + 0.995 * this.dcY1;
    this.dcX1 = sample;
    this.dcY1 = hp;
    const clipped = hp / (1 + Math.abs(hp));
    return Math.max(-0.98, Math.min(0.98, clipped * 0.9));
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !output || !output.length) return true;

    const inCh0 = input[0];
    const inCh1 = input.length > 1 ? input[1] : null;
    const outCh0 = output[0];
    const numFrames = inCh0 ? inCh0.length : 128;

    if (!inCh0 || !outCh0) return true;

    if (inCh1 && inCh1.length === numFrames) {
      for (let i = 0; i < numFrames; i++) {
        this.inputRing[(this.inputWritePos + i) % FRAME_SIZE] = 0.5 * (inCh0[i] + inCh1[i]);
      }
    } else {
      for (let i = 0; i < numFrames; i++) {
        this.inputRing[(this.inputWritePos + i) % FRAME_SIZE] = inCh0[i];
      }
    }
    this.inputWritePos = (this.inputWritePos + numFrames) % FRAME_SIZE;
    this.inputCount = Math.min(FRAME_SIZE, this.inputCount + numFrames);

    if (this.inputCount === FRAME_SIZE) {
      if (this.outputCount > 0) {
        this.inputCount = 0;
      } else {
        for (let i = 0; i < FRAME_SIZE; i++) {
          this.frameIn[i] = this.inputRing[(this.inputWritePos + i) % FRAME_SIZE];
        }
        this.inputCount = 0;

        if (processFrameFn && wasmHeapF32) {
          try {
            const baseIn = wasmInputOffset / 4;
            const baseOut = wasmOutputOffset / 4;
            for (let i = 0; i < FRAME_SIZE; i++) wasmHeapF32[baseIn + i] = this.frameIn[i];
            processFrameFn(wasmInputOffset, wasmOutputOffset);
            for (let i = 0; i < FRAME_SIZE; i++) this.frameOut[i] = wasmHeapF32[baseOut + i];
          } catch (_) {
            this.frameOut.set(this.frameIn);
          }
        } else {
          this.frameOut.set(this.frameIn);
        }

        for (let i = 0; i < FRAME_SIZE; i++) {
          this.outputRing[(this.outputReadPos + i) % FRAME_SIZE] = this.frameOut[i];
        }
        this.outputCount = FRAME_SIZE;
      }
    }

    const toOutput = Math.min(numFrames, this.outputCount);
    const outCh1 = output.length > 1 ? output[1] : null;
    for (let i = 0; i < toOutput; i++) {
      const sample = this.postFilter(this.outputRing[(this.outputReadPos + i) % FRAME_SIZE]);
      outCh0[i] = sample;
      if (outCh1) outCh1[i] = sample;
    }
    for (let i = toOutput; i < numFrames; i++) {
      outCh0[i] = 0;
      if (outCh1) outCh1[i] = 0;
    }
    this.outputReadPos = (this.outputReadPos + toOutput) % FRAME_SIZE;
    this.outputCount -= toOutput;

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
