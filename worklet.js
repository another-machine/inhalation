// JavaScript host for in-halation-core.wasm. Plain script (no imports/exports) so
// it can be inlined into an AudioWorklet and also loaded in Node for tests.
// Defines globalThis.InHalationWasm.
(function () {
  const VOICE_FLOATS = 68; // frequency, amplitude, pan, roughness/progress, waveform[64]

  function utf8Decode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i++];
      if (b < 0x80) out += String.fromCharCode(b);
      else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
      else if (b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
      else { i += 3; out += '\uFFFD'; }   // U+FFFD for bytes that aren't valid UTF-8
    }
    return out;
  }

  class InHalationWasm {
    constructor(module, sampleRate) {
      const self = this;
      const wasi = {
        fd_close: () => 0,
        fd_seek: () => 0,
        fd_write: (fd, iovs, count, written) => {
          new DataView(self.memory.buffer).setUint32(written, 0, true);
          return 0;
        },
      };
      this.instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi });
      this.x = this.instance.exports;
      this.memory = this.x.memory;
      if (this.x._initialize) this.x._initialize();
      this.engine = this.x.ih_engine_create(sampleRate);
      this.visual = this.x.ih_visual_state_create();
      this.leftPtr = this.x.ih_alloc(128 * 4);
      this.rightPtr = this.x.ih_alloc(128 * 4);
    }

    string(ptr) {
      const bytes = new Uint8Array(this.memory.buffer);
      let end = ptr;
      while (bytes[end]) end++;
      return utf8Decode(bytes.subarray(ptr, end));
    }

    withString(text, fn) {
      const bytes = [];
      for (const ch of text) {
        let c = ch.codePointAt(0);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      const ptr = this.x.ih_alloc(bytes.length + 1);
      const view = new Uint8Array(this.memory.buffer, ptr, bytes.length + 1);
      view.set(bytes);
      view[bytes.length] = 0;
      try { return fn(ptr); } finally { this.x.ih_free(ptr); }
    }

    moods() {
      const out = [];
      for (let i = 0; i < this.x.ih_mood_count(); i++) {
        out.push({ value: this.string(this.x.ih_mood_value(i)), label: this.string(this.x.ih_mood_label(i)),
                   description: this.string(this.x.ih_mood_description(i)) });
      }
      return out;
    }

    /** Parses a query string (new or old keys) into settings, like parseSceneQuery(). */
    parseQuery(query, randomSeed) {
      const ptr = this.x.ih_alloc(248);  // sizeof(ih_traits) on wasm32 (checked in in_halation_c.cpp)
      try {
        const seed = this.withString(query, (q) => this.x.ih_parse_query(q, randomSeed, ptr));
        const d = new DataView(this.memory.buffer, ptr, 248);
        const traits = {
          mood: d.getInt32(0, true), volume: d.getFloat64(8, true), brightness: d.getFloat64(16, true),
          padDrift: d.getFloat64(24, true), padOverlap: d.getFloat64(32, true), noiseLevel: d.getFloat64(40, true),
          padOctaveLow: d.getInt32(48, true), padOctaveHigh: d.getInt32(52, true), padWidth: d.getFloat64(56, true),
          motifDensity: d.getFloat64(64, true), phraseSoftness: d.getFloat64(72, true), padRevoice: true,
          noiseSweep: d.getInt32(84, true), useMap: d.getInt32(88, true) !== 0, light: d.getFloat64(96, true),
          energy: d.getFloat64(104, true), noiseTone: d.getFloat64(112, true),
          padTransition: d.getInt32(124, true), padLevel: d.getFloat64(128, true),
          motifLevel: d.getFloat64(136, true), motifNoteLength: d.getFloat64(144, true),
          motifArticulation: d.getFloat64(152, true),
          noisePan: d.getFloat64(168, true), noiseWidth: d.getFloat64(176, true),
          motifReverb: d.getFloat64(184, true),
          motifOctaveLow: d.getInt32(192, true), motifOctaveHigh: d.getInt32(196, true),
          motifFxAmount: d.getFloat64(200, true), padFxAmount: d.getFloat64(208, true), motifFx: d.getInt32(220, true),
          padFx: d.getInt32(232, true), noiseFx: d.getInt32(236, true), noiseFxAmount: d.getFloat64(240, true),
          padLength: d.getFloat64(224, true),   // has_pad_length (216) is always 1 here
        };
        return { traits, seed };
      } finally { this.x.ih_free(ptr); }
    }

    /**
     * Randomization by section (the iOS app; the web app uses sampleAllowed): `sections` is a
     * bit mask (1 Mood, 2 Motifs, 4 Sound bed, 8 Noise bed, 16 Mix levels, 32 Mix FX). Returns
     * the query with this seed; every other setting is kept.
     */
    randomizeQuery(query, seed, sections = 15) {
      const size = 1024, buf = this.x.ih_alloc(size);
      try {
        this.withString(query, (q) => this.x.ih_randomize_query(q, seed, sections, buf, size));
        return this.string(buf);
      } finally { this.x.ih_free(buf); }
    }

    /**
     * The allowed-values model: `spec` (an object or JSON text) has, per query key, a fixed
     * value, {pick: [...], weights: [...]} or {range: [lo, hi]}. Returns the query Regen plays
     * for this seed ("seed=…&…"), or null if the spec is bad.
     */
    sampleAllowed(spec, seed) {
      const text = typeof spec === 'string' ? spec : JSON.stringify(spec);
      const size = 4096, buf = this.x.ih_alloc(size);
      try {
        const n = this.withString(text, (s) => this.x.ih_sample_allowed(s, seed, buf, size));
        return n < 0 ? null : this.string(buf);
      } finally { this.x.ih_free(buf); }
    }

    /** The specimen sheet: how many instruments of a kind (0 chord, 1 melody). */
    instrumentCount(kind) {
      return this.x.ih_instrument_count ? this.x.ih_instrument_count(kind) : 0;
    }

    /** Sets one field of an instrument (fields: see ih_set_instrument). Returns true if set. */
    setInstrument(kind, index, field, value) {
      return !!(this.x.ih_set_instrument && this.x.ih_set_instrument(kind, index, field, value));
    }

    /** Parses a query (new or old keys), generates the scene and crossfades to it. */
    play(query, randomSeed) {
      const seed = this.withString(query, (q) => this.x.ih_engine_play_query(this.engine, q, randomSeed));
      return { ...this.scene(), seed };
    }
    /** Generates the scene for a query without playing it. */
    preview(query, randomSeed) {
      const seed = this.withString(query, (q) => this.x.ih_engine_preview_query(this.engine, q, randomSeed));
      return { ...this.scene(), seed };
    }
    setSweep(mode) { this.x.ih_engine_set_sweep(this.engine, mode); }
    setVolume(v) { this.x.ih_engine_set_volume(this.engine, v); }
    pause() { this.x.ih_engine_pause(this.engine); }
    touchBegin(id, frequency, character, pan) { this.x.ih_engine_touch_begin(this.engine, id, frequency, character, pan); }
    touchMove(id, frequency) { this.x.ih_engine_touch_move(this.engine, id, frequency); }
    touchEnd(id) { this.x.ih_engine_touch_end(this.engine, id); }
    get playing() { return this.x.ih_engine_is_playing(this.engine) !== 0; }
    collectGarbage() { this.x.ih_engine_collect_garbage(this.engine); }

    scene() {
      const x = this.x, e = this.engine;
      const chords = [];
      for (let i = 0; i < x.ih_scene_chord_count(e); i++) chords.push(this.string(x.ih_scene_chord_label(e, i)));
      const pool = [];
      for (let i = 0; i < x.ih_scene_pool_count(e); i++) pool.push(x.ih_scene_pool_at(e, i));
      return {
        name: this.string(x.ih_scene_name(e)), key: this.string(x.ih_scene_key(e)),
        mood: this.string(x.ih_scene_mood(e)), profile: this.string(x.ih_scene_profile(e)),
        texture: this.string(x.ih_scene_texture(e)), tempo: x.ih_scene_tempo(e), chords, pool,
      };
    }

    /** Renders 128 frames into two Float32Arrays. */
    render(left, right) {
      this.x.ih_engine_render(this.engine, this.leftPtr, this.rightPtr, 128);
      const buf = this.memory.buffer;
      left.set(new Float32Array(buf, this.leftPtr, 128));
      right.set(new Float32Array(buf, this.rightPtr, 128));
    }

    /** Latest visual snapshot, shaped like the web engine's getVisualState() + spectrum. */
    visualState() {
      const x = this.x, v = this.visual;
      const fresh = x.ih_engine_visual_state(this.engine, v) !== 0;
      const buf = this.memory.buffer;
      const read = (ptr) => {
        const f = new Float32Array(buf, ptr, VOICE_FLOATS);
        return [f[0], f[1], f[2], f[3], Array.from(f.subarray(4))];
      };
      const voices = [];
      for (let i = 0; i < x.ih_visual_voice_count(v); i++) {
        const [frequency, amplitude, pan, roughness, waveform] = read(x.ih_visual_voice_at(v, i));
        voices.push({ frequency, amplitude, pan, roughness, waveform });
      }
      const touches = [];
      for (let i = 0; i < x.ih_visual_touch_count(v); i++) {
        const [frequency, amplitude, pan, progress, waveform] = read(x.ih_visual_touch_at(v, i));
        touches.push({ frequency, amplitude, pan, progress, waveform });
      }
      const spectrum = x.ih_visual_has_spectrum(v)
        ? Array.from(new Uint8Array(buf, x.ih_visual_spectrum(v), 128)) : null;
      return { fresh, time: x.ih_visual_time(v), noise: x.ih_visual_noise(v), sweep: x.ih_visual_sweep(v),
               sweepNoise: x.ih_visual_sweep_noise(v), sweepRes: x.ih_visual_sweep_res(v), voices, touches, spectrum };
    }
  }

  globalThis.InHalationWasm = InHalationWasm;
})();
// AudioWorklet side: runs the WebAssembly engine on the audio rendering thread.
// Appended to host.js to make app/worklet.js (see web/wasm/build.sh).
if (typeof registerProcessor === 'function') {
  class InHalationProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.ng = null;
      this.blocks = 0;
      this.spare = new Float32Array(128);
      // Auto regen runs here, on the audio clock: phones freeze a hidden page's timers but
      // keep the audio thread running. Frames left until the next new seed (0 = off).
      this.autoFrames = 0;
      this.autoLeft = 0;
      this.playing = false;
      this.query = '';
      this.spec = null;       // the allowed values sampled on each auto regen (null = only the seed)
      this.extra = '';
      this.port.onmessage = (event) => this.handle(event.data);
    }

    handle(msg) {
      try {
        if (msg.type === 'init') {
          this.ng = new InHalationWasm(new WebAssembly.Module(msg.bytes), sampleRate);
          this.port.postMessage({ type: 'ready', sampleRate });
        } else if (!this.ng) {
          return;
        } else if (msg.type === 'play') {
          this.query = msg.query;
          this.playing = true;
          this.autoLeft = this.autoFrames;   // the countdown restarts when the scene changes
          this.port.postMessage({ type: 'scene', scene: this.ng.play(msg.query, msg.randomSeed) });
        } else if (msg.type === 'autoRegen') {
          this.autoFrames = Math.round(msg.seconds * sampleRate);
          this.autoLeft = this.autoFrames;
        } else if (msg.type === 'allowed') {
          // The allowed-values model: each auto regen samples this spec with a new seed.
          this.spec = msg.spec || null;
          this.extra = msg.extra || '';   // keys added to every sampled query (e.g. volume)
        } else if (msg.type === 'volume') {
          this.ng.setVolume(msg.value);
        } else if (msg.type === 'sweep') {
          this.ng.setSweep(msg.value);
        } else if (msg.type === 'pause') {
          this.playing = false;
          this.ng.pause();
        } else if (msg.type === 'touchBegin') {
          this.ng.touchBegin(msg.id, msg.frequency, msg.character, msg.pan);
        } else if (msg.type === 'touchMove') {
          this.ng.touchMove(msg.id, msg.frequency);
        } else if (msg.type === 'touchEnd') {
          this.ng.touchEnd(msg.id);
        } else if (msg.type === 'instrument') {
          // The specimen sheet: {kind, index, field, value}, or {kind, index, fields: {field: value}}.
          const f = msg.fields || { [msg.field]: msg.value };
          for (const k in f) this.ng.setInstrument(msg.kind, msg.index, Number(k), f[k]);
        } else if (msg.type === 'instrumentCount') {
          this.port.postMessage({ type: 'instrumentCount', chords: this.ng.instrumentCount(0), melody: this.ng.instrumentCount(1) });
        }
      } catch (error) {
        this.port.postMessage({ type: 'error', message: String(error && error.message || error) });
      }
    }

    // A new seed and a new pick inside the allowed values, like Regen; the page catches up
    // from the message.
    autoRegen() {
      this.autoLeft = this.autoFrames;
      const seed = Number((0.000001 + Math.random() * 0.999998).toFixed(6));
      const sampled = this.spec ? this.ng.sampleAllowed(this.spec, seed) : null;
      this.query = sampled ? sampled + this.extra : this.query.replace(/seed=[^&]*/, `seed=${seed.toFixed(6)}`);
      this.port.postMessage({ type: 'scene', auto: true, query: this.query, scene: this.ng.play(this.query, seed) });
    }

    process(inputs, outputs) {
      const out = outputs[0];
      if (!this.ng || !out || out.length === 0) return true;
      const left = out[0];
      const right = out.length > 1 ? out[1] : this.spare;
      if (left.length === 128) {
        this.ng.render(left, right);
      }
      if (this.playing && this.autoFrames > 0 && (this.autoLeft -= 128) <= 0) this.autoRegen();
      this.blocks += 1;
      if ((this.blocks & 1) === 0) {
        const v = this.ng.visualState();
        // autoLeft: seconds to the next auto regen on the audio clock (-1 = none), so the
        // page's countdown follows the worklet instead of the page's own clock.
        const autoLeft = this.playing && this.autoFrames > 0 ? this.autoLeft / sampleRate : -1;
        if (v.fresh) this.port.postMessage({ type: 'visual', visual: v, autoLeft });
      }
      if (this.blocks % 400 === 0) this.ng.collectGarbage();
      return true;
    }
  }
  registerProcessor('in-halation', InHalationProcessor);
}
