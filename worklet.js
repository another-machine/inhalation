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
     * Randomization by section: `sections` is a bit mask (1 Mood, 2 Motifs, 4 Sound bed,
     * 8 Noise bed, 16 Mix levels, 32 Mix FX); `ranges` maps a setting to [low, high]: its
     * random value is placed inside that range (stored values, 0..1). Returns the query with
     * this seed; every other setting is kept.
     */
    randomizeQuery(query, seed, sections = 15, ranges = {}) {
      const size = 1024, buf = this.x.ih_alloc(size);
      let out;
      try {
        this.withString(query, (q) => this.x.ih_randomize_query(q, seed, sections, buf, size));
        out = this.string(buf);
      } finally { this.x.ih_free(buf); }
      return InHalationWasm.applyRanges(out, sections, ranges);
    }

    /** The specimen sheet: how many instruments of a kind (0 chord, 1 melody). */
    instrumentCount(kind) {
      return this.x.ih_instrument_count ? this.x.ih_instrument_count(kind) : 0;
    }

    /** Sets one field of an instrument (fields: see ih_set_instrument). Returns true if set. */
    setInstrument(kind, index, field, value) {
      return !!(this.x.ih_set_instrument && this.x.ih_set_instrument(kind, index, field, value));
    }

    /** The continuous settings of each random section (the ones a range can limit). */
    static get RANDOM_KEYS() {
      return {
        1: ['light', 'energy'],
        2: ['motifDensity', 'motifNoteLength', 'motifArticulation', 'motifReverb'],
        4: ['padLength', 'padDrift', 'padWidth', 'padOverlap'],
        8: ['noiseTone', 'noisePan', 'noiseWidth'],
        16: ['motifLevel', 'padLevel', 'noiseLevel'],
        32: ['motifFxAmount', 'padFxAmount', 'noiseFxAmount'],
      };
    }

    /** Maps each randomized value (0..1) into its range: low + value × (high − low). */
    // (Parsed by hand: the AudioWorklet scope may have no URLSearchParams.)
    static applyRanges(query, sections, ranges) {
      const pairs = query.split('&').map((pair) => pair.split('='));
      const at = (key) => pairs.find((kv) => kv[0] === key);
      for (const [bit, keys] of Object.entries(InHalationWasm.RANDOM_KEYS)) {
        if (!(sections & Number(bit))) continue;
        for (const key of keys) {
          const r = ranges[key], kv = at(key);
          if (!r || !kv) continue;
          const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
          kv[1] = String(Math.round((lo + Number(kv[1]) * (hi - lo)) * 1000) / 1000);
        }
      }
      // Octaves (whole numbers): ranges.motifOctaves / padOctaves = [lowest, highest] octave
      // allowed; the core's picks (1..max) are scaled into it, so low ≤ high still holds.
      for (const [bit, p, max] of [[2, 'motif', 7], [4, 'pad', 6]]) {
        const r = ranges[`${p}Octaves`];
        if (!(sections & bit) || !r) continue;
        const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
        for (const key of [`${p}OctaveLow`, `${p}OctaveHigh`]) {
          const kv = at(key);
          if (kv) kv[1] = String(lo + Math.round(((Number(kv[1]) - 1) / (max - 1)) * (hi - lo)));
        }
      }
      return pairs.map((kv) => kv.join('=')).join('&');
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
      this.sections = 0;      // sections randomized on each auto regen (bits; 0 = only the seed)
      this.ranges = {};       // their ranges
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
        } else if (msg.type === 'randomize') {
          this.sections = msg.sections | 0;
          this.ranges = msg.ranges || {};
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

    // A new seed with the same settings, like Regen (or, with Randomize on, random
    // settings too); the page catches up from the message.
    autoRegen() {
      this.autoLeft = this.autoFrames;
      const seed = Number((0.000001 + Math.random() * 0.999998).toFixed(6));
      this.query = this.sections ? this.ng.randomizeQuery(this.query, seed, this.sections, this.ranges)
                                 : this.query.replace(/seed=[^&]*/, `seed=${seed.toFixed(6)}`);
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
