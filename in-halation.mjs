/**
 * NOISEGEN — standalone Web Audio engine (one file, no imports).
 * Site: https://noisegen.figma.site/
 * Recovered from assets/index-B-9N0JJh.js on 2026-11-20.
 *
 * CONTENTS / OWNERSHIP
 * 1. @amplib/music-theory: Note, Interval, Mode, Scale, OCTAVES, STEPS.
 *    Vendored from npm @amplib/music-theory@0.1.0, preserving its comments.
 *    Only the modules used by this site are included. Chord and parseChord
 *    are not used by the published sound engine and are not included.
 * 2. Adapter aliases for the short identifiers in the published bundle.
 * 3. Noisegen application: scene generation, voice palette, Web Audio
 *    synthesis, defaults, and URL parameter parsing. This is NOT part of
 *    @amplib/music-theory. Published internal names remain unchanged.
 * 4. Named exports for using the engine without React.
 * 5. Dependency Apache-2.0 license, reproduced at the end of this file.
 *
 * The site bundle omitted dependency comments. The dependency section below
 * restores the matching public package source and its existing comments.
 * The installed package version cannot be proven from the site bundle.
 * Original app TypeScript, comments, and source maps were not exposed.
 * Added here: this guide, section markers, named exports, and a search
 * argument for the original URL parser. The synthesis logic is preserved.
 * No license for the Noisegen application code was found in its bundle.
 *
 * USE IN A BROWSER MODULE
 *   import {engine, generateScene, parseSceneQuery} from './in-halation.mjs';
 *   const {traits, seed} = parseSceneQuery(
 *     'seed=0.623339&mood=meditate&volume=0.78&motifDensity=0.18'
 *   );
 *   const scene = generateScene(traits, seed);
 *   // Run play from a click or another user gesture:
 *   await engine.play(scene, traits);
 *   engine.setGain(0.5); // live output gain, no scene rebuild
 *   engine.pause();    // 2.4-second fade; does not suspend AudioContext
 *
 * API
 *   new NoiseEngine()              independent engine instance
 *   engine                         shared engine instance
 *   DEFAULT_TRAITS                 defaults; copy before editing
 *   MOODS                          {value,label,description} entries
 *   VOICE_PALETTE                  oscillator/filter/overtone definitions
 *   parseSceneQuery(search = '')   returns {traits,seed}; clamps URL values
 *   generateScene(traits,seed?)     pure scene description (default random seed)
 *   engine.play(scene,traits)       Promise<void>; creates/resumes AudioContext
 *                                  and crossfades the preceding session
 *   engine.setGain(number)         clamps 0..1.5; smooths over 0.06 seconds
 *   engine.pause()                 fades and stops sources; keeps context open
 *   engine.playing                 running context plus active current session
 *   engine.getSpectrum()           Uint8Array (128 bins) or undefined
 *   engine.getVisualState()        {voices,touches,noise}; waveform readout
 *
 * PARAMETERS (URL key = traits key; old URL key accepted; default; range)
 *   seed           (seed)    random  0.000001..0.999999  separate from traits
 *   mood           (mood)    0       numeric id = index into MOODS (0 auto, 1 meditate, 2 focus,
 *                                    3 clarity, 4 still, 5 flow, 6 dusk, 7 friction, 8 pulse);
 *                                    mood names (old and new) are also accepted
 *   volume         (gain)    0.78    0..1.5   overall output gain
 *   brightness     (grain)   0.42    0..1     filter cutoff and resonance
 *   padLength      (1 - speed) 0.72  0..1     chord length: 0 short (7 beats) .. 1 long (12)
 *   padDrift       (speed, motion) 0.28 0..1  pad waver rate and depth, voicing wander
 *   padOverlap     (overlap, space) 0.74 0..1 chord crossfades, scene fade, noise Q
 *   noiseLevel     (noise)   0.28    0..1     filtered stereo noise-bed level
 *   padOctaveLow   (octaveLow, low)   2  1..6 integer
 *   padOctaveHigh  (octaveHigh, high) 5  1..6 integer; forced >= padOctaveLow
 *   padWidth       (spread, poles) 0.35 0..1  how far voicings reach to the range edges
 *   motifDensity   (phrases, touch) 0.18 0..1 melodic phrase probability, length, level
 *   phraseSoftness (attack)  0.72    0..1     phrase attack, glide and release
 *   padRevoice     always true (Vary chords is no longer a setting): a new voicing each cycle
 *   exposure / contrast / visual     visual settings; no sound effect
 *
 * MOOD VALUES (= display names; old values accepted)
 *   auto, meditate (calm), focus (contemplative), clarity (confident),
 *   still (delicate), flow (playful), dusk (solemn), friction (agitated),
 *   pulse (urgent). Auto chooses among the first six.
 *
 * BRIGHTNESS FIX (2026-11-20)
 * Pad and phrase filter glides now keep the brightness factor
 * (0.82 + b*0.36 for pads, 0.62 + b*0.36 for phrases). Before, it only
 * applied to each filter's starting cutoff and was lost at the first glide.
 *
 * UPDATE BEHAVIOR
 * Gain can change live with setGain. For other sound traits, regenerate
 * the scene and call play again; play handles the transition. Pass a full
 * traits object. Direct API inputs are not fully clamped; use the parser.
 * parseSceneQuery takes a query string, not a complete URL. For a full URL,
 * pass new URL(url).search. Missing values use DEFAULT_TRAITS.
 *
 * SCENE OUTPUT
 * {seed,name,mood,key,tempo,voiceCount,profile,texture,melodicPool,
 *  voicePalette,progression,waveform}
 * progression: four {label,voicings,characters} objects. Each voicing has
 * three frequencies in Hz. revoice creates 16 voicings per chord;
 * otherwise one. melodicPool contains scale-note frequencies in range.
 * Seed fixes scene structure, intervention scheduling and the noise bed:
 * each stereo noise buffer uses seededRandom(seed + 0.953 + side * 0.017).
 *
 * WEB AUDIO GRAPH
 * Pad: Oscillator (+ sine overtone) -> voice gain -> BiquadFilter ->
 *      Analyser -> StereoPanner -> chord envelope -> session gain.
 * LFO: Oscillator -> depth gain -> pad oscillator detune (cents).
 * Noise: looped 4-second mono AudioBuffer, separately generated for each
 *        stereo side -> lowpass -> gain -> StereoPanner -> session gain.
 * Interventions: Oscillator (+ sine overtone) -> character BiquadFilter ->
 *        lowpass -> Analyser -> phrase envelope -> StereoPanner -> session gain.
 * Output: session gain -> DynamicsCompressor -> Analyser -> destination.
 * Compressor: threshold -18 dB, knee 18 dB, ratio 3, attack .04 s, release .5 s.
 * No remote audio files, HTTP API, AudioWorklet, or external service needed.
 *
 * TIMING / LIMITS PRESERVED FROM THE SITE
 * chordSeconds = max(7, (60 / scene.tempo) * (12 - (1 - padLength) * 5))
 * chordFade = min(5.8, chordSeconds * (0.34 + padOverlap * 0.32))
 * sceneTransition = 5 + padOverlap * 7 seconds
 * drift LFO = 0.025 + padDrift * 0.08 Hz; depth = 4 + padDrift * 14 cents
 * Each play pre-schedules 160 progression cycles and 180 intervention
 * opportunities. This is a finite schedule, not an infinite scheduler.
 * Noise sources keep looping until retired. Add rolling scheduling if
 * you need continuous evolving music beyond the existing event horizon.
 * The gain floor is 0.0001, so gain=0 is near-silence, not exact zero.
 * retire(session,seconds) is internal. For complete disposal, pause first,
 * let its 2.6-second cleanup finish, then close the instance's context.
 *
 * PUBLIC DEPENDENCY SOURCE
 * https://registry.npmjs.org/@amplib/music-theory/-/music-theory-0.1.0.tgz
 * https://github.com/another-machine/public-library/tree/main/packages/amplib-music-theory
 */

// ===== BEGIN DEPENDENCY: @amplib/music-theory@0.1.0 =====
// Author: Another Machine. License: Apache-2.0 (full text below).
// Existing dependency comments follow unchanged.
// src/Note.ts
var Note = class _Note {
  /**
   * Frequency hz for this note
   */
  frequency;
  /**
   * A unique identifier for this note
   */
  id;
  /**
   * Global index of the note on a keyboard (
   * 0 through 107
   */
  index;
  /**
   * Primary notation for the note
   */
  notation;
  /**
   * Optional secondary notation for the note
   */
  notationAlternate;
  /**
   * Global octave number for the note
   * 0 through 8
   */
  octave;
  /**
   * Index of the note within the octave
   * 0 through 11
   */
  octaveIndex;
  constructor({ octave, step }) {
    const notation = _Note.notations[step];
    const alternate = _Note.notationsAlternate[step];
    this.frequency = _Note.octaveStepFrequencies[octave][step];
    this.id = _Note.noteIdFromNotationAndOctave(notation, octave);
    this.index = step + octave * 12;
    this.notation = notation;
    this.notationAlternate = alternate === this.notation ? void 0 : alternate;
    this.octave = octave;
    this.octaveIndex = step;
  }
  static notationIndex(notation) {
    const notationsIndex = _Note.notations.indexOf(notation);
    if (notationsIndex !== -1) {
      return notationsIndex;
    }
    const notationsAlternateIndex = _Note.notationsAlternate.indexOf(
      notation
    );
    if (notationsAlternateIndex !== -1) {
      return notationsAlternateIndex;
    }
    return -1;
  }
  static noteIdFromNotationAndOctave(notation, octave) {
    return `${notation}${octave}`;
  }
  static get notations() {
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  }
  static get notationsAlternate() {
    return ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  }
  static get notationsUnique() {
    return Array.from(/* @__PURE__ */ new Set([..._Note.notations, ..._Note.notationsAlternate]));
  }
  // prettier-ignore
  static get octaveStepFrequencies() {
    return {
      0: { 0: 16.352, 1: 17.324, 2: 18.354, 3: 19.445, 4: 20.602, 5: 21.827, 6: 23.125, 7: 24.5, 8: 25.957, 9: 27.5, 10: 29.135, 11: 30.868 },
      1: { 0: 32.703, 1: 34.648, 2: 36.708, 3: 38.891, 4: 41.203, 5: 43.654, 6: 46.249, 7: 48.999, 8: 51.913, 9: 55, 10: 58.27, 11: 61.735 },
      2: { 0: 65.406, 1: 69.296, 2: 73.416, 3: 77.782, 4: 82.407, 5: 87.307, 6: 92.499, 7: 97.999, 8: 103.826, 9: 110, 10: 116.541, 11: 123.471 },
      3: { 0: 130.813, 1: 138.591, 2: 146.832, 3: 155.563, 4: 164.814, 5: 174.614, 6: 184.997, 7: 195.998, 8: 207.652, 9: 220, 10: 233.082, 11: 246.942 },
      4: { 0: 261.626, 1: 277.183, 2: 293.665, 3: 311.127, 4: 329.628, 5: 349.228, 6: 369.994, 7: 391.995, 8: 415.305, 9: 440, 10: 466.164, 11: 493.883 },
      5: { 0: 523.251, 1: 554.365, 2: 587.33, 3: 622.254, 4: 659.255, 5: 698.456, 6: 739.989, 7: 783.991, 8: 830.609, 9: 880, 10: 932.328, 11: 987.767 },
      6: { 0: 1046.502, 1: 1108.731, 2: 1174.659, 3: 1244.508, 4: 1318.51, 5: 1396.913, 6: 1479.978, 7: 1567.982, 8: 1661.219, 9: 1760, 10: 1864.655, 11: 1975.533 },
      7: { 0: 2093.005, 1: 2217.461, 2: 2349.318, 3: 2489.016, 4: 2637.02, 5: 2793.826, 6: 2959.955, 7: 3135.963, 8: 3322.438, 9: 3520, 10: 3729.31, 11: 3951.066 },
      8: { 0: 4186.01, 1: 4434.92, 2: 4698.63, 3: 4978.03, 4: 5274.04, 5: 5587.65, 6: 5919.91, 7: 6271.93, 8: 6644.88, 9: 7040, 10: 7458.62, 11: 7902.13 }
    };
  }
  static stringIsNotation(string) {
    return _Note.notations.includes(string) || _Note.notationsAlternate.includes(string);
  }
};

// src/Interval.ts
var Interval = class _Interval {
  /**
   * Common representation of the interval
   */
  label;
  /**
   * Metadata
   */
  meta;
  /**
   * Primary identifier of the interval root note
   */
  notation;
  /**
   * Optional secondary identifier of the interval root note
   */
  notationAlternate;
  /**
   * Interval triad notes
   */
  notes;
  /**
   * Octave relative octave to first interval's root note.
   * 0 | 1
   */
  octave;
  /**
   * Interval step in the mode
   * 0 through 6
   */
  step;
  constructor(step, offset, type) {
    const index = offset % Note.notations.length;
    const octave = offset > Note.notations.length - 1 ? 1 : 0;
    const notation = Note.notations[index];
    const alternate = Note.notationsAlternate[index];
    this.label = `${notation} ${type}`;
    this.notation = notation;
    this.notationAlternate = alternate === notation ? void 0 : alternate;
    this.notes = _Interval.notesFromIndexOctaveAndType(index, octave, type);
    this.octave = octave;
    this.step = step;
    this.meta = {
      name: _Interval.nameFromType(type),
      numeral: _Interval.numeralFromType(step, type),
      type
    };
  }
  static intervalsFromModeType(mode) {
    switch (mode) {
      case "melodic":
        return ["min", "min", "aug", "maj", "maj", "dim", "dim"];
      case "harmonic":
        return ["min", "dim", "aug", "min", "maj", "maj", "dim"];
    }
  }
  static intervalsFromOffset(offset) {
    const base = [
      "maj",
      "min",
      "min",
      "maj",
      "maj",
      "min",
      "dim"
    ];
    const triads = [];
    for (let i = 0; i < base.length; i++) {
      triads.push(base[(i + offset) % base.length]);
    }
    return triads;
  }
  static nameFromType(type) {
    switch (type) {
      case "maj":
        return "Major";
      case "min":
        return "Minor";
      case "aug":
        return "Augmented";
      case "dim":
        return "Diminished";
    }
  }
  static numeralFromType(step, type) {
    const notation = ["i", "ii", "iii", "iv", "v", "vi", "vii"][step];
    switch (type) {
      case "maj":
        return notation.toUpperCase();
      case "min":
        return notation;
      case "aug":
        return `${notation.toUpperCase()}+`;
      case "dim":
        return `${notation}\xB0`;
    }
  }
  static notesFromIndexOctaveAndType(offset, octave, type) {
    const steps = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8]
    }[type];
    const notes = [];
    const roots = Note.notations;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const idx = (offset + step) % roots.length;
      const relative = offset + step > roots.length - 1 ? octave + 1 : octave;
      notes.push({ notation: roots[idx], octave: relative });
    }
    return notes;
  }
};

// src/Mode.ts
var Mode = class _Mode {
  intervals;
  name;
  steps;
  type;
  constructor({ type }) {
    this.type = type;
    this.name = _Mode.nameFromType(type);
    this.steps = _Mode.stepsFromType(type);
    this.intervals = _Mode.intervalsFromType(type);
  }
  static get types() {
    return [
      "ionian",
      "dorian",
      "phrygian",
      "lydian",
      "mixolydian",
      "aeolian",
      "locrian",
      "melodic",
      "harmonic",
      "major",
      "minor"
    ];
  }
  static intervalsFromType(type) {
    switch (type) {
      case "major":
      case "ionian":
        return Interval.intervalsFromOffset(0);
      case "dorian":
        return Interval.intervalsFromOffset(1);
      case "phrygian":
        return Interval.intervalsFromOffset(2);
      case "lydian":
        return Interval.intervalsFromOffset(3);
      case "mixolydian":
        return Interval.intervalsFromOffset(4);
      case "minor":
      case "aeolian":
        return Interval.intervalsFromOffset(5);
      case "locrian":
        return Interval.intervalsFromOffset(6);
      case "melodic":
        return Interval.intervalsFromModeType("melodic");
      case "harmonic":
        return Interval.intervalsFromModeType("harmonic");
    }
  }
  static nameFromType(type) {
    switch (type) {
      case "major":
      case "ionian":
        return "Ionian";
      case "dorian":
        return "Dorian";
      case "phrygian":
        return "Phrygian";
      case "lydian":
        return "Lydian";
      case "mixolydian":
        return "Mixolydian";
      case "minor":
      case "aeolian":
        return "Aeolian";
      case "locrian":
        return "Locrian";
      case "melodic":
        return "Melodic Minor";
      case "harmonic":
        return "Harmonic Minor";
    }
  }
  static stepsFromType(type) {
    switch (type) {
      case "major":
      case "ionian":
        return _Mode.stepsFromIncrements([2, 2, 1, 2, 2, 2, 1]);
      case "dorian":
        return _Mode.stepsFromIncrements([2, 1, 2, 2, 2, 1, 2]);
      case "phrygian":
        return _Mode.stepsFromIncrements([1, 2, 2, 2, 1, 2, 2]);
      case "lydian":
        return _Mode.stepsFromIncrements([2, 2, 2, 1, 2, 2, 1]);
      case "mixolydian":
        return _Mode.stepsFromIncrements([2, 2, 1, 2, 2, 1, 2]);
      case "minor":
      case "aeolian":
        return _Mode.stepsFromIncrements([2, 1, 2, 2, 1, 2, 2]);
      case "locrian":
        return _Mode.stepsFromIncrements([1, 2, 2, 1, 2, 2, 2]);
      case "melodic":
        return _Mode.stepsFromIncrements([2, 1, 2, 2, 2, 2, 1]);
      case "harmonic":
        return _Mode.stepsFromIncrements([2, 1, 2, 2, 1, 3, 1]);
    }
  }
  static stepsFromIncrements(increments) {
    const steps = [0];
    let step = 0;
    for (let i = 0; i < increments.length - 1; i++) {
      step += increments[i];
      steps.push(step);
    }
    return steps;
  }
  static stringIsModeType(string) {
    return _Mode.types.includes(string);
  }
};

// src/Scale.ts
var OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
var STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
var Scale = class _Scale {
  /**
   * Array of 7 intervals in the scale
   */
  intervals;
  /**
   * Common label for the scale's key.
   */
  label;
  /**
   * Library of all notes
   */
  library = _Scale.buildLibrary();
  /**
   * Scale's mode. Can be a vanity mode (minor, major)
   */
  mode;
  /**
   * Array of playable note ids in the scale
   */
  noteIds;
  /**
   * Notation or alternative notation for the root of the scale.
   */
  root;
  /**
   * Index of the root
   */
  rootOffset;
  constructor(params) {
    this.root = params.root;
    this.label = "";
    this.intervals = [];
    this.noteIds = [];
    this.mode = new Mode({ type: params.mode });
    this.root = params.root;
    this.rootOffset = Note.notationIndex(params.root);
    this.update(params);
  }
  update({ root, mode }) {
    this.mode = new Mode({ type: mode });
    this.root = root;
    this.rootOffset = Note.notationIndex(root);
    this.label = `${root} ${this.mode.name}`;
    this.intervals = this.mode.steps.map(
      (step, index) => new Interval(index, this.rootOffset + step, this.mode.intervals[index])
    );
    this.noteIds = [];
    const lastOctave = OCTAVES[OCTAVES.length - 1];
    OCTAVES.forEach((mainOctave) => {
      this.intervals.forEach(({ notation, octave }) => {
        const relOctave = octave + mainOctave;
        if (relOctave <= lastOctave) {
          this.noteIds.push(
            Note.noteIdFromNotationAndOctave(notation, relOctave)
          );
        }
      });
    });
  }
  static buildLibrary() {
    return OCTAVES.reduce((library, octave) => {
      STEPS.forEach((step) => {
        const note = new Note({ octave, step });
        library[note.id] = note;
      });
      return library;
    }, {});
  }
  /**
   * Array of playable notes in the scale.
   */
  get notes() {
    return this.noteIds.map((noteId) => this.library[noteId]);
  }
};


// ===== END DEPENDENCY: @amplib/music-theory =====

// Adapter: published application aliases -> dependency symbols.
const y = Note, b = Interval, ee = Mode, ne = Scale;

// ===== BEGIN NOISEGEN APPLICATION: NOT @amplib/music-theory =====
// Scene naming, mood rules, voice synthesis, scheduling, and parameters.
var S = {
    meditate: [`Soft`, `Still`, `Open`, `Distant`],
    focus: [`Late`, `Hollow`, `Slow`, `Inner`],
    still: [`Glass`, `Silver`, `Fine`, `Pale`],
    dusk: [`Deep`, `Low`, `Grey`, `Ancient`],
    clarity: [`Clear`, `Steady`, `Lucid`, `Held`],
    flow: [`Loose`, `Dappled`, `Light`, `Turning`],
    friction: [`Rough`, `Broken`, `Tense`, `Friction`],
    pulse: [`Near`, `Rising`, `Quick`, `Forward`],
  },
  re = [`Current`, `Weather`, `Room`, `Field`, `Signal`, `Tide`],
  ie = [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`],
  C = {
    meditate: [`major`, `lydian`, `mixolydian`],
    focus: [`minor`, `dorian`],
    still: [`major`, `lydian`, `dorian`],
    dusk: [`minor`, `dorian`],
    clarity: [`major`, `mixolydian`],
    flow: [`major`, `lydian`, `mixolydian`],
    friction: [`minor`, `dorian`],
    pulse: [`minor`, `dorian`],
  },
  ae = {
    meditate: [48, 66],
    focus: [52, 72],
    still: [56, 76],
    dusk: [42, 60],
    clarity: [60, 78],
    flow: [68, 90],
    friction: [76, 104],
    pulse: [84, 112],
  },
  w = [`meditate`, `focus`, `clarity`, `still`, `flow`, `dusk`],
  oe = {
    meditate: [0, 5, 3, 1],
    focus: [0, 3, 5, 4],
    still: [0, 4, 1, 3],
    dusk: [0, 5, 2, 4],
    clarity: [0, 3, 4, 0],
    flow: [0, 1, 4, 5],
    friction: [0, 2, 5, 1],
    pulse: [0, 4, 5, 3],
  },
  // Mood map: scales from dark to bright; progressions from calm to active, ordered by
  // how much the chords move (dusk, meditate, still, clarity, focus, friction, pulse, flow).
  LADDER = [`phrygian`, `minor`, `dorian`, `mixolydian`, `major`, `lydian`],
  MAP_PROGRESSIONS = [
    [0, 5, 2, 4], [0, 5, 3, 1], [0, 4, 1, 3], [0, 3, 4, 0],
    [0, 3, 5, 4], [0, 2, 5, 1], [0, 4, 5, 3], [0, 1, 4, 5],
  ],
  T = [
    {
      label: `round sine`,
      wave: `sine`,
      filter: `lowpass`,
      cutoff: 920,
      overtone: 2,
      overtoneLevel: 0.06,
      detune: 2,
      registers: [`low`, `mid`],
      moods: [`meditate`, `focus`, `dusk`, `clarity`],
      light: 0.25,
      energy: 0.10,
    },
    {
      label: `drifting triangle`,
      wave: `triangle`,
      filter: `lowpass`,
      cutoff: 1650,
      overtone: 2,
      overtoneLevel: 0.14,
      detune: 11,
      registers: [`mid`, `high`],
      moods: [`meditate`, `focus`, `still`, `flow`],
      light: 0.60,
      energy: 0.35,
    },
    {
      label: `glass partials`,
      wave: `sine`,
      filter: `highpass`,
      cutoff: 190,
      overtone: 3,
      overtoneLevel: 0.3,
      detune: 5,
      registers: [`high`],
      moods: [`meditate`, `focus`, `still`, `flow`, `pulse`],
      light: 0.85,
      energy: 0.45,
    },
    {
      label: `low filtered saw`,
      wave: `sawtooth`,
      filter: `lowpass`,
      cutoff: 560,
      overtone: 2,
      overtoneLevel: 0.035,
      detune: 4,
      registers: [`low`],
      moods: [`focus`, `dusk`, `friction`, `pulse`],
      light: 0.15,
      energy: 0.70,
    },
    {
      label: `hollow fifth`,
      wave: `sine`,
      filter: `bandpass`,
      cutoff: 1100,
      overtone: 3,
      overtoneLevel: 0.2,
      detune: 7,
      registers: [`low`, `mid`],
      moods: [`meditate`, `focus`, `dusk`, `friction`],
      light: 0.40,
      energy: 0.40,
    },
    {
      label: `velvet pulse`,
      wave: `square`,
      filter: `lowpass`,
      cutoff: 680,
      overtone: 2,
      overtoneLevel: 0.025,
      detune: 3,
      registers: [`low`, `mid`],
      moods: [`meditate`, `dusk`, `clarity`, `pulse`],
      light: 0.30,
      energy: 0.45,
    },
    {
      label: `bowed wire`,
      wave: `triangle`,
      filter: `bandpass`,
      cutoff: 2100,
      overtone: 2,
      overtoneLevel: 0.11,
      detune: 14,
      registers: [`mid`, `high`],
      moods: [`focus`, `still`, `dusk`, `friction`],
      light: 0.55,
      energy: 0.85,
    },
    {
      label: `air reed`,
      wave: `sawtooth`,
      filter: `bandpass`,
      cutoff: 2700,
      overtone: 2,
      overtoneLevel: 0.045,
      detune: 8,
      registers: [`mid`, `high`],
      moods: [`meditate`, `focus`, `still`, `flow`, `pulse`],
      light: 0.70,
      energy: 0.70,
    },
    {
      label: `organ bloom`,
      wave: `sine`,
      filter: `lowpass`,
      cutoff: 1450,
      overtone: 2,
      overtoneLevel: 0.24,
      detune: 1,
      registers: [`low`, `mid`, `high`],
      moods: [`meditate`, `focus`, `dusk`, `clarity`],
      light: 0.45,
      energy: 0.15,
    },
    {
      label: `silver shimmer`,
      wave: `sine`,
      filter: `highpass`,
      cutoff: 320,
      overtone: 4,
      overtoneLevel: 0.22,
      detune: 9,
      registers: [`high`],
      moods: [`meditate`, `still`, `flow`, `clarity`],
      light: 0.90,
      energy: 0.25,
    },
    // Wide chorus pads (mood map only): each pad note gets two copies detuned by
    // `chorus` cents, spread left and right.
    { label: `wide choir`, wave: `sine`, filter: `lowpass`, cutoff: 1300, overtone: 2, overtoneLevel: 0.08,
      detune: 3, chorus: 14, registers: [`low`, `mid`], moods: [], light: 0.55, energy: 0.12, mapOnly: true },
    { label: `string ensemble`, wave: `sawtooth`, filter: `lowpass`, cutoff: 900, overtone: 2, overtoneLevel: 0.03,
      detune: 4, chorus: 12, registers: [`low`, `mid`, `high`], moods: [], light: 0.40, energy: 0.25, mapOnly: true },
    { label: `dark chorus`, wave: `triangle`, filter: `lowpass`, cutoff: 720, overtone: 3, overtoneLevel: 0.05,
      detune: 2, chorus: 10, registers: [`low`, `mid`], moods: [], light: 0.12, energy: 0.15, mapOnly: true },
    { label: `glass ensemble`, wave: `triangle`, filter: `highpass`, cutoff: 260, overtone: 4, overtoneLevel: 0.14,
      detune: 5, chorus: 18, registers: [`mid`, `high`], moods: [], light: 0.85, energy: 0.20, mapOnly: true },
  ];
function E(e) {
  let t = Math.max(1, Math.floor(e * 2147483647));
  return () => ((t = (t * 16807) % 2147483647) - 1) / 2147483646;
}
function se(e) {
  let t = 69 + 12 * Math.log2(e / 440);
  return Math.floor(t / 12) - 1;
}
function ce(e) {
  let t = 69 + 12 * Math.log2(e / 440);
  return Math.min(1.12, Math.max(0.42, 1.16 - (t - 36) * 0.013));
}
function le(e, t, n = 0, r = 1) {
  return Number.isFinite(e) ? Math.min(r, Math.max(n, e)) : t;
}
function ue(e) {
  let t = 1;
  for (let n = 0; n < e.length; n++) t = Math.max(t, Math.abs(e[n] - 128));
  return Array.from(
    { length: 64 },
    (n, r) => 0.5 + ((e[r * 2] - 128) / t) * 0.48,
  );
}
function de(e, t, n) {
  let r = e <= 2 ? `low` : e >= 5 ? `high` : `mid`,
    i = T.filter((e) => !e.mapOnly && e.registers.includes(r) && e.moods.includes(t)),
    a = T.filter((e) => !e.mapOnly && e.registers.includes(r)),
    o = i.length > 1 && n() < 0.72 ? i : a;
  return o[Math.floor(n() * o.length)];
}
// Mood map: a timbre for a register, weighted toward timbres near (light, energy).
// Same arithmetic, step by step, as the C++ core (which must not fuse multiply-adds).
function deMap(e, light, energy, n) {
  let r = e <= 2 ? `low` : e >= 5 ? `high` : `mid`,
    pool = T.filter((e) => e.registers.includes(r)),
    weights = pool.map((p) => {
      let dx = p.light - light,
        dy = p.energy - energy;
      return 1 / (1 + 12 * (dx * dx + dy * dy));
    }),
    total = 0;
  for (let w of weights) total += w;
  let x = n() * total;
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
function fe(e, t) {
  let n = Math.max(1, e.length),
    r = (t) => e.filter(t).length / n,
    i = (t) => e.reduce((e, n) => e + t(n), 0) / n,
    a = r((e) => e.wave === `sawtooth` || e.wave === `square`),
    o = r((e) => e.filter === `highpass`),
    s = r((e) => e.filter === `lowpass`),
    c = i((e) => e.cutoff),
    l = i((e) => e.overtoneLevel),
    u = i((e) => e.detune);
  return {
    profile:
      a >= 0.34
        ? `rich`
        : o >= 0.34 || c >= 1800
          ? `bright`
          : l <= 0.1
            ? `pure`
            : s >= 0.5
              ? `warm`
              : `dark`,
    texture:
      u >= 10 || a >= 0.45
        ? `rough`
        : o >= 0.34 && l >= 0.18
          ? `crystalline`
          : t >= 0.62
            ? `grainy`
            : `smooth`,
  };
}
function pe(e, t = Math.random()) {
  let map = !!e.useMap,
    n = map ? `` : e.mood === `auto` ? w[Math.floor(E(t + 0.271)() * w.length)] : e.mood,
    r = E(t + 0.113),
    i = E(t + 0.229),
    a = E(t + 0.371),
    o = ie[Math.floor(r() * ie.length)],
    c,
    f,
    prog;
  if (map) {
    // light: one of six scales; energy: tempo 42..112 (+-4 by seed) and a progression
    // within +-1 of energy's place in the calm..active order.
    c = LADDER[Math.min(5, Math.floor(e.light * 6))];
    f = Math.floor(42 + e.energy * 70 + (i() - 0.5) * 8 + 0.5);
    prog = MAP_PROGRESSIONS[Math.min(7, Math.max(0, Math.floor(e.energy * 7 + (r() - 0.5) * 2 + 0.5)))];
  } else {
    let s = C[n];
    c = s[Math.floor(r() * s.length)];
    let [u, d] = ae[n];
    f = Math.round(u + i() * (d - u));
    prog = oe[n];
  }
  let l = new ne({ root: o, mode: c }),
    p = () => {
      let t = a(),
        n = t < 0.5 ? (t * 2) ** 3 * 0.5 : 1 - ((1 - t) * 2) ** 3 * 0.5;
      return t * (1 - e.padWidth) + n * e.padWidth;
    },
    m = (e) => 69 + 12 * Math.log2(e / 440),
    h = 12 * (e.padOctaveLow + 1),
    g = 12 * (e.padOctaveHigh + 2) - 1,
    _ = (t, n) => {
      let r = 0.12 + e.padWidth * 0.83,
        i = a() < r,
        o = [`open`, `poles`, `drop`, `pedal`],
        s = i ? o[Math.floor(a() * o.length)] : `closed`,
        c = p(),
        u,
        d = [0.18, 0.18, 0.18];
      switch (s) {
        case `open`:
          u = [0.12, 0.5, 0.88];
          break;
        case `poles`:
          u = [0.03, 0.97, a() < 0.5 ? 0.12 : 0.88];
          break;
        case `drop`:
          u = [0.05, 0.5, 0.72];
          break;
        case `pedal`: {
          let e = Math.floor(a() * 3);
          ((u = [0.16, 0.5, 0.84]), (d[e] = 0.92));
          break;
        }
        default:
          ((u = [c, c, c]), (d = [0.5, 0.5, 0.5]));
      }
      if (s !== `closed`) {
        let e = Math.floor(a() * 3);
        u = u.map((t, n) => u[(n + e) % u.length]);
      }
      return [t, t + 2, t + 4].map((t, r) => {
        let i = t % 7,
          a = l.intervals[i].notation,
          o = l.notes.filter(
            (t) =>
              t.notation === a &&
              t.octave >= e.padOctaveLow &&
              t.octave <= e.padOctaveHigh,
          ),
          s = o.length > 0 ? o : l.notes.filter((e) => e.notation === a),
          c = h + u[r] * (g - h);
        if (n?.[r]) {
          let t = d[r] * (0.82 - e.padDrift * 0.45);
          c = c * (1 - t) + m(n[r]) * t;
        }
        return s.reduce((e, t) =>
          Math.abs(m(t.frequency) - c) < Math.abs(m(e.frequency) - c) ? t : e,
        ).frequency;
      });
    },
    v,
    y = prog.map((t) => {
      let r = l.intervals[t],
        i = r.meta.type === `min` ? `m` : r.meta.type === `dim` ? `°` : ``,
        o = e.padRevoice ? 16 : 1,
        s = [],
        c = v;
      for (let e = 0; e < o; e++) {
        let e = _(t, c);
        (s.push(e), (c = e));
      }
      return (
        (v = s[0]),
        {
          label: `${r.notation}${i}`,
          voicings: s,
          characters: s[0].map((t) => (map ? deMap(se(t), e.light, e.energy, a) : de(se(t), n, a))),
        }
      );
    }),
    b = y.flatMap((e) => e.characters),
    { profile: ee, texture: te } = fe(b, e.brightness),
    x = l.notes
      .filter((t) => t.octave >= e.padOctaveLow && t.octave <= e.padOctaveHigh)
      .map((e) => e.frequency),
    T = E(t + 0.613),
    ce = E(t + 0.797);
  return {
    seed: t,
    name: map ? `` : `${S[n][Math.floor(T() * 4)]} ${re[Math.floor(T() * re.length)]}`,
    mood: n,
    key: l.label,
    tempo: f,
    voiceCount: y[0]?.voicings[0]?.length ?? 0,
    profile: ee,
    texture: te,
    melodicPool: x,
    voicePalette: [...new Set(b.map((e) => e.label))],
    progression: y,
    waveform: Array.from({ length: 72 }, (t, n) => {
      let r = Math.sin((n / 71) * Math.PI);
      return (0.18 + ce() * (0.3 + e.brightness * 0.52)) * r;
    }),
  };
}
class NoiseEngine {
    context;
    current;
    sessions = new Set();
    get playing() {
      return this.context?.state === `running` && !!this.current;
    }
    getSpectrum() {
      if (!this.current) return;
      let e = new Uint8Array(this.current.analyser.frequencyBinCount);
      return (this.current.analyser.getByteFrequencyData(e), e);
    }
    getVisualState() {
      if (!this.context) return { voices: [], touches: [], noise: 0 };
      let e = this.context.currentTime,
        t = [],
        n = [],
        r = 0;
      return (
        this.sessions.forEach((i) => {
          let a = Math.min(1, i.output.gain.value);
          r = Math.max(r, i.traits.noiseLevel * a);
          let o = i.scene.progression.length,
            s = e - i.startedAt - 0.08,
            c = Math.floor(s / (i.chordDuration * o));
          for (let n = Math.max(0, c - 1); n <= c + 1; n++)
            i.scene.progression.forEach((r, s) => {
              let c = i.startedAt + 0.08 + (n * o + s) * i.chordDuration,
                l = c + i.chordDuration + i.crossfade * 1.8;
              if (e < c || e > l) return;
              let u =
                  n === 0 && s === 0 ? Math.min(1.2, i.crossfade) : i.crossfade,
                d = e - c,
                f =
                  d < u
                    ? d / u
                    : e > l - i.crossfade
                      ? (l - e) / i.crossfade
                      : 1;
              r.voicings[n % r.voicings.length].forEach((e, n) => {
                let o = r.characters[n],
                  c = i.voiceMonitors[s * 3 + n],
                  l = new Uint8Array(c.analyser.fftSize);
                c.analyser.getByteTimeDomainData(l);
                let u = 0,
                  d = 0;
                for (let e = 0; e < l.length; e++) {
                  let t = (l[e] - 128) / 128;
                  ((u += t * t), e && (d += Math.abs(l[e] - l[e - 1]) / 128));
                }
                let p = Math.sqrt(u / l.length),
                  m =
                    o.wave === `sine`
                      ? 0.08
                      : o.wave === `triangle`
                        ? 0.32
                        : o.wave === `square`
                          ? 0.72
                          : 0.9;
                t.push({
                  frequency: c.frequency.value || e,
                  amplitude: Math.max(0, f) * a * Math.min(1, p * 5),
                  pan: c.pan,
                  roughness: Math.min(
                    1,
                    m * 0.45 +
                      (d / Math.max(1, l.length - 1)) * 3 +
                      i.traits.brightness * 0.12,
                  ),
                  waveform: ue(l),
                });
              });
            });
          i.tactileEvents.forEach((t) => {
            if (e < t.start || e > t.stop) return;
            let r = new Uint8Array(t.analyser.fftSize);
            t.analyser.getByteTimeDomainData(r);
            let i =
                [...t.notes].reverse().find((t) => t.time <= e) ?? t.notes[0],
              o = Math.min(1, Math.max(0, (e - i.time) / i.duration));
            n.push({
              frequency: i.frequency,
              amplitude: Math.sin(o * Math.PI) * a,
              pan: t.pan,
              progress: (e - t.start) / (t.stop - t.start),
              waveform: ue(r),
            });
          });
        }),
        {
          voices: t.sort((e, t) => t.amplitude - e.amplitude).slice(0, 16),
          touches: n.slice(0, 8),
          noise: r,
        }
      );
    }
    setGain(e) {
      if (!this.context || !this.current) return;
      let t = this.context.currentTime,
        n = le(e, 0.78, 0, 1.5);
      (this.current.output.gain.cancelScheduledValues(t),
        this.current.output.gain.setTargetAtTime(Math.max(1e-4, n), t, 0.06));
    }
    async play(e, t) {
      ((this.context ||= new AudioContext()), await this.context.resume());
      let n = this.context.currentTime,
        r = 5 + le(t.padOverlap, 0.74) * 7,
        i = le(t.volume, 0.78, 0, 1.5),
        a = this.current;
      a && this.retire(a, r);
      // Brightness scales the pad/phrase filter cutoffs, including their glides.
      const padTone = 0.82 + t.brightness * 0.36,
        phraseTone = 0.62 + t.brightness * 0.36;
      let o = [],
        s = [],
        c = [],
        l = this.context.createGain(),
        u = this.context.createDynamicsCompressor(),
        d = this.context.createAnalyser();
      (l.gain.setValueAtTime(1e-4, n),
        l.gain.linearRampToValueAtTime(Math.max(1e-4, i), n + (a ? r : 1.2)),
        (u.threshold.value = -18),
        (u.knee.value = 18),
        (u.ratio.value = 3),
        (u.attack.value = 0.04),
        (u.release.value = 0.5),
        (d.fftSize = 256),
        (d.smoothingTimeConstant = 0.84),
        l.connect(u).connect(d).connect(this.context.destination));
      let f = this.context.sampleRate * 4,
        p = t.noiseLevel === 0 ? 0 : 0.001 + t.noiseLevel * 0.15,
        noiseSeed = e.seed,
        // Noise bed space: a centre (noisePan) and the two sides' distance from it (noiseWidth).
        noiseCentre = (t.noisePan ?? 0.5) * 2 - 1,
        noiseWidth = t.noiseWidth ?? 0.82;
      [
        Math.max(-1, Math.min(1, noiseCentre - noiseWidth)),
        Math.max(-1, Math.min(1, noiseCentre + noiseWidth)),
      ].forEach((e, n) => {
        let r = this.context.createBuffer(1, f, this.context.sampleRate),
          i = r.getChannelData(0),
          a = 0,
          // Seeded per side so native and web noise match sample for sample.
          nr = E(noiseSeed + 0.953 + n * 0.017);
        for (let e = 0; e < f; e++) {
          let t = nr() * 2 - 1;
          ((a = a * 0.985 + t * 0.015), (i[e] = a * 3.2));
        }
        let s = this.context.createBufferSource(),
          c = this.context.createBiquadFilter(),
          u = this.context.createGain(),
          d = this.context.createStereoPanner();
        ((s.buffer = r),
          (s.loop = !0),
          (c.type = `lowpass`),
          (c.frequency.value = (420 + t.brightness * 2400) * (n ? 1.12 : 0.88)),
          (c.Q.value = 0.5 + t.padOverlap * 2.4),
          (u.gain.value = p * 0.7),
          (d.pan.value = e),
          s.connect(c).connect(u).connect(d).connect(l),
          s.start(),
          o.push(s));
      });
      let m = Math.max(7, (60 / e.tempo) * (12 - (1 - t.padLength) * 5)),
        h = Math.min(5.8, m * (0.34 + t.padOverlap * 0.32)),
        g = (0.14 + t.padOverlap * 0.075) * (2 * (t.padLevel ?? 0.5)),   // sound bed level
        // Motif layer notes: the scene's scale over every octave, E1..C7 (bass included).
        motifPool = (() => {
          let inScale = new Set(e.melodicPool.map((f) => ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12)),
            out = [];
          for (let k = 28; k <= 96; k++) inScale.has(k % 12) && out.push(440 * 2 ** ((k - 69) / 12));
          return out;
        })(),
        // The motifs' own notes: the pool within the motif octaves.
        motifNotes = motifPool.filter((f) => {
          let m = Math.round(69 + 12 * Math.log2(f / 440));
          return m >= 12 * ((t.motifOctaveLow ?? 1) + 1) && m <= 12 * ((t.motifOctaveHigh ?? 7) + 2) - 1;
        }),
        // Stepped transitions: scale notes strictly between a and b, ordered from a to b.
        scaleBetween = (a, b) => {
          let lo = Math.min(a, b) * 1.01, hi = Math.max(a, b) / 1.01,
            out = motifPool.filter((f) => f > lo && f < hi);
          return b < a ? out.reverse() : out;
        },
        stepPath = (from, to) => {
          if (!(t.padTransition === 1) || from === undefined) return [to];
          let between = scaleBetween(from, to),
            available = Math.min(6, between.length);
          if (!available) return [to];
          let count = 1 + Math.floor(Math.random() * available),
            idx = between.map((_, k) => k);
          for (let k = 0; k < count; k++) {
            let j = k + Math.floor(Math.random() * (idx.length - k));
            [idx[k], idx[j]] = [idx[j], idx[k]];
          }
          return [...idx.slice(0, count).sort((x, y) => x - y).map((k) => between[k]), to];
        },
        _ = this.context.createOscillator(),
        v = this.context.createGain();
      if (
        ((_.frequency.value = 0.025 + t.padDrift * 0.08),
        (v.gain.value = 4 + t.padDrift * 14),
        _.connect(v),
        e.progression.forEach((r, i) => {
          let a = this.context.createGain(),
            s = [],
            u = [],
            d = [],
            chorusFilters = [];
          (a.gain.setValueAtTime(1e-4, n),
            a.connect(l),
            r.voicings[0].forEach((e, n) => {
              let l = r.characters[n],
                f = this.context.createOscillator(),
                p = this.context.createGain(),
                m = this.context.createBiquadFilter(),
                h = this.context.createAnalyser(),
                g = this.context.createStereoPanner();
              ((f.type = l.wave),
                (f.frequency.value = e),
                (f.detune.value = (n - 1) * l.detune + (i - 1.5) * 1.5));
              let _ =
                ((l.wave === `sawtooth` || l.wave === `square` ? 0.72 : 1) /
                (2.2 + n * 0.65)) * (l.chorus > 0 ? 0.62 : 1);
              if (
                ((p.gain.value = _ * ce(e)),
                (m.type = l.filter),
                (m.frequency.value = l.cutoff * padTone),
                (m.Q.value =
                  l.filter === `highpass` ? 0.7 : 1.1 + t.brightness * 1.8),
                (g.pan.value = (n - 1) * 0.42 + (i % 2 ? 0.08 : -0.08)),
                (h.fftSize = 128),
                (h.smoothingTimeConstant = 0.72),
                v.connect(f.detune),
                f.connect(p).connect(m).connect(h).connect(g).connect(a),
                f.start(),
                s.push({ node: f, multiplier: 1, voiceIndex: n }),
                u.push(m),
                d.push({ node: p, base: _, voiceIndex: n, multiplier: 1 }),
                c.push({
                  analyser: h,
                  frequency: f.frequency,
                  pan: g.pan.value,
                }),
                o.push(f),
                l.chorus > 0 &&
                  [-1, 1].forEach((side) => {
                    // Chorus copy: detuned by `chorus` cents, own filter, panned to one side.
                    let co = this.context.createOscillator(),
                      cg = this.context.createGain(),
                      cf = this.context.createBiquadFilter(),
                      cp = this.context.createStereoPanner();
                    ((co.type = l.wave),
                      (co.frequency.value = e),
                      (co.detune.value = f.detune.value + side * l.chorus),
                      (cg.gain.value = _ * ce(e)),
                      (cf.type = m.type),
                      (cf.frequency.value = m.frequency.value),
                      (cf.Q.value = m.Q.value),
                      (cp.pan.value = Math.max(-1, Math.min(1, g.pan.value + side * 0.55))),
                      v.connect(co.detune),
                      co.connect(cg).connect(cf).connect(cp).connect(a),
                      co.start(),
                      s.push({ node: co, multiplier: 1, voiceIndex: n }),
                      chorusFilters.push({ node: cf, voiceIndex: n }),
                      d.push({ node: cg, base: _, voiceIndex: n, multiplier: 1 }),
                      o.push(co));
                  }),
                l.overtoneLevel > 0)
              ) {
                let t = this.context.createOscillator(),
                  r = this.context.createGain();
                ((t.type = `sine`),
                  (t.frequency.value = e * l.overtone),
                  (t.detune.value = -f.detune.value * 0.5));
                let i = l.overtoneLevel / (1 + n * 0.25);
                ((r.gain.value = i * ce(e * l.overtone)),
                  v.connect(t.detune),
                  t.connect(r).connect(m),
                  t.start(),
                  s.push({ node: t, multiplier: l.overtone, voiceIndex: n }),
                  d.push({
                    node: r,
                    base: i,
                    voiceIndex: n,
                    multiplier: l.overtone,
                  }),
                  o.push(t));
              }
            }));
          for (let t = 0; t < 160; t++) {
            let o = n + 0.08 + (t * e.progression.length + i) * m,
              c = o + m + h * 1.8,
              l = r.voicings[t % r.voicings.length],
              prev = t > 0 ? r.voicings[(t - 1) % r.voicings.length] : null,
              glide = Math.min(2.5, h * 0.7),
              span = Math.min(3 * glide, m * 0.8),
              paths = [0, 1, 2].map((n) => stepPath(prev ? prev[n] : undefined, l[n])),
              // Stepped: each step is a quick change of pitch, not a slide.
              stepTau = t.padTransition === 1 && prev ? 0.025 : glide;
            a.gain.setValueAtTime(1e-4, o);
            let f = t === 0 && i === 0 ? Math.min(1.2, h) : h;
            (a.gain.linearRampToValueAtTime(g, o + f),
              a.gain.setValueAtTime(g, c - h),
              a.gain.linearRampToValueAtTime(1e-4, c),
              s.forEach(({ node: e, multiplier: t, voiceIndex: n }) => {
                let path = paths[n];
                path.forEach((f, k) =>
                  e.frequency.setTargetAtTime(f * t, o + (k * span) / path.length, stepTau));
              }),
              u.forEach((e, t) => {
                let n = r.characters[t],
                  i = se(l[t]) - 3,
                  a = Math.min(6400, Math.max(90, n.cutoff * padTone * 2 ** (i * 0.22)));
                e.frequency.setTargetAtTime(a, o, Math.min(3, h * 0.8));
              }),
              chorusFilters.forEach(({ node: e, voiceIndex: t }) => {
                let n = r.characters[t],
                  i = se(l[t]) - 3,
                  a = Math.min(6400, Math.max(90, n.cutoff * padTone * 2 ** (i * 0.22)));
                e.frequency.setTargetAtTime(a, o, Math.min(3, h * 0.8));
              }),
              d.forEach(
                ({ node: e, base: t, voiceIndex: n, multiplier: r }) => {
                  let path = paths[n];
                  path.forEach((f, k) =>
                    e.gain.setTargetAtTime(t * ce(f * r), o + (k * span) / path.length, stepTau));
                },
              ));
          }
        }),
        t.motifDensity > 0 && (t.motifLevel ?? 0.5) > 0 && motifNotes.length)
      ) {
        // Motif reverb: a convolver with a decaying-noise impulse (the core uses a delay
        // network; this is the fallback's version of it).
        let reverbIn = null,
          rv = t.motifReverb ?? 0.3;
        if (rv > 0) {
          let sr = this.context.sampleRate,
            seconds = 2.2 + 7.8 * rv,
            len = Math.floor(sr * (seconds * 0.7 + 0.022)),
            ir = this.context.createBuffer(2, len, sr),
            conv = this.context.createConvolver(),
            wet = this.context.createGain();
          for (let ch = 0; ch < 2; ch++) {
            let d = ir.getChannelData(ch), low = 0;
            for (let k = Math.floor(sr * 0.022); k < len; k++) {
              low += 0.3 * (Math.random() * 2 - 1 - low);
              d[k] = low * Math.pow(10, (-3 * (k / sr)) / seconds);
            }
          }
          conv.buffer = ir;
          wet.gain.value = rv * 0.5;
          conv.connect(wet).connect(l);
          reverbIn = conv;
        }
        let r = E(e.seed + 0.417),
          // Motif softness follows Articulation (legato is soft).
          i = 1 - le(t.motifArticulation ?? 1 - t.phraseSoftness, 0.28),
          a = Math.max(5, m * 0.72),
          // Motifs pick from the scene's pad timbres and these struck ones (strike, then
          // fade with `decay`); bells use an overtone that is not a whole multiple. With a
          // `tail` the strike drops to about half, then rings on (resonance), past the motif.
          // Motif timbres: bells, chimes and wind instruments only (the scene's pad timbres
          // are for the sound bed). Bells and chimes strike and fade with `decay` (and ring
          // with `tail`); winds are sustained, with `breath` noise.
          c = [
            { label: `glass bell`, wave: `sine`, filter: `highpass`, cutoff: 300, overtone: 2.76, overtoneLevel: 0.45, detune: 2, decay: 0.5, tail: 3 },
            { label: `deep bell`, wave: `sine`, filter: `lowpass`, cutoff: 3200, overtone: 2.4, overtoneLevel: 0.35, detune: 1, decay: 0.8, tail: 5 },
            { label: `tubular chime`, wave: `triangle`, filter: `highpass`, cutoff: 400, overtone: 5.4, overtoneLevel: 0.25, detune: 2, decay: 0.4, tail: 2.2 },
            // Mallets and wood (as engine.cpp; the vibraphone's tremolo is core only).
            { label: `marimba`, wave: `sine`, filter: `lowpass`, cutoff: 2600, overtone: 4, overtoneLevel: 0.3, detune: 1, decay: 0.22, tail: 0.7 },
            { label: `singing bowl`, wave: `sine`, filter: `lowpass`, cutoff: 2400, overtone: 2.71, overtoneLevel: 0.3, detune: 1, decay: 1.2, tail: 6 },
            { label: `soft vibraphone`, wave: `sine`, filter: `lowpass`, cutoff: 2200, overtone: 4, overtoneLevel: 0.1, detune: 1, decay: 0.8, tail: 4.5 },
            { label: `vibraphone`, wave: `sine`, filter: `lowpass`, cutoff: 4200, overtone: 4, overtoneLevel: 0.16, detune: 1, decay: 0.6, tail: 3.6 },
          ],
          // Bit crusher (bits only; the rate part needs the native core): a staircase curve.
          crushCurve = (() => {
            let bits = t.motifFx === 1 ? (t.motifFxAmount ?? 0) : 0;   // motif crush (drive: core only)
            if (!(bits > 0)) return null;
            let steps = 2 ** (11 - 6 * bits), n = 8192, curve = new Float32Array(n);   // 12 → 6 bits
            for (let k = 0; k < n; k++) {
              let x = (k / (n - 1)) * 2 - 1;
              curve[k] = Math.floor(x * steps + 0.5) / steps;
            }
            return curve;
          })(),
          // Breath: white noise, band-passed at the note (one shared buffer).
          breathBuffer = (() => {
            let b = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate),
              d = b.getChannelData(0);
            for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
            return b;
          })(),
          u = [-5, -3, -2, -1, 1, 2, 3, 5],
          d = [0.18, 0.28, 0.42, 0.65, 0.95, 1.4];
        for (let f = 0; f < 180; f++) {
          if (f > 0 && r() > 0.12 + t.motifDensity * 0.88) continue;
          let p = n + 0.8 + f * a + r() * a * 0.38,
            m = 4 + Math.floor(t.motifDensity * 10),
            // A phrase (as engine.cpp): a cell of 2 … 4 notes, repeated as a sequence, a held last note.
            h = r() < 0.05 ? 1 : Math.min(16, 3 + Math.floor(r() ** 1.2 * m)),
            g = c[Math.floor(r() * c.length)],
            breath = g.breath || 0,
            bn = null,
            bp = null,
            _ = r() > 0.5 ? 1 : -1,
            v = Math.floor(r() * motifNotes.length),
            cellLen = 2 + Math.floor(r() * 3),
            cell = Array.from({ length: cellLen }, () => {
              r() < 0.28 && (_ *= -1);
              return { step: u[Math.floor(r() * u.length)] * _, dur: d[Math.floor(r() * d.length)], gap: 0.94 + r() * 0.75 };
            }),
            shift = (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)),
            first = v,
            clampNote = (k) => Math.max(0, Math.min(motifNotes.length - 1, k)),
            y = this.context.createOscillator(),
            b = this.context.createOscillator(),
            ee = this.context.createGain(),
            te = this.context.createBiquadFilter(),
            x = this.context.createBiquadFilter(),
            ne = this.context.createAnalyser(),
            S = this.context.createGain(),
            re = this.context.createStereoPanner(),
            ie = [];
          ((y.type = g.wave),
            (y.detune.value = (r() - 0.5) * g.detune),
            (b.type = `sine`),
            (b.detune.value = -y.detune.value * 0.5),
            (ee.gain.value = g.overtoneLevel * (0.55 + t.brightness * 0.25)),
            (te.type = g.filter),
            (te.frequency.value = g.cutoff * phraseTone),
            (te.Q.value =
              g.filter === `highpass`
                ? 0.55
                : 0.65 + t.brightness * 1.1 + (1 - i) * t.motifDensity * 0.8),
            (x.type = `lowpass`),
            (x.frequency.value = 1100 + t.brightness * 1700 + (1 - i) * 350),
            (x.Q.value = 0.42),
            (ne.fftSize = 128),
            (ne.smoothingTimeConstant = 0.68),
            (re.pan.value = r() * 1.4 - 0.7),
            S.gain.setValueAtTime(1e-4, p));
          if (breath > 0) {
            bn = this.context.createBufferSource();
            bp = this.context.createBiquadFilter();
            let bg = this.context.createGain();
            bn.buffer = breathBuffer;
            bn.loop = !0;
            bp.type = `bandpass`;
            bp.Q.value = 0.8;
            bg.gain.value = breath * 3;
            // Pitch-synced: the noise pulses with the note's wave (0.5 + 0.5 × wave).
            let pulse = this.context.createGain(),
              depth = this.context.createGain();
            pulse.gain.value = 0.5;
            depth.gain.value = 0.5;
            y.connect(depth).connect(pulse.gain);
            bn.connect(pulse).connect(bp).connect(bg).connect(te);
          }
          let C = p,
            ae,
            rings = !!(g.decay && g.tail),
            lastStrike = p;
          for (let n = 0; n < h; n++) {
            let k = n % cellLen;
            n > 0 && k === 0 && (v = clampNote(first + Math.floor(n / cellLen) * shift));
            let a = motifNotes[v],
              o = cell[k].dur * (0.6 + 2.6 * (t.motifNoteLength ?? 0.65)) * (n === h - 1 && h > 1 ? 2 : 1),
              s = g.wave === `sawtooth` || g.wave === `square` ? 0.72 : 1,
              c = (0.035 + t.motifDensity * 0.065) * (2 * (t.motifLevel ?? 0.5)) * s * ce(a);
            if (
              (ie.push({ time: C, frequency: a, duration: o }), ae === void 0)
            )
              (y.frequency.setValueAtTime(a, C),
                b.frequency.setValueAtTime(a * g.overtone, C),
                bp && bp.frequency.setValueAtTime(a * 2, C));
            else {
              let e =
                Math.abs(12 * Math.log2(a / ae)) > 7
                  ? 0.008 + r() * 0.008
                  : 0.014 + i * 0.045 + r() * 0.012;
              (y.frequency.setTargetAtTime(a, C, g.decay ? 0.002 : e),
                b.frequency.setTargetAtTime(a * g.overtone, C, g.decay ? 0.002 : e),
                bp && bp.frequency.setTargetAtTime(a * 2, C, g.decay ? 0.002 : e));
            }
            ae = a;
            let l = se(a) - 3;
            if (
              (te.frequency.setTargetAtTime(
                Math.min(4600, Math.max(90, g.cutoff * phraseTone * 2 ** (l * 0.2))),
                C,
                0.04,
              ),
              g.decay)
            ) {
              // Struck: strike, then fade.
              n === 0 ? S.gain.linearRampToValueAtTime(c, C + 0.004) : S.gain.setTargetAtTime(c, C, 0.002);
              if (rings) {
                // Quick drop to about half, then the long resonant ring.
                let held = c * 0.4;
                S.gain.setTargetAtTime(held, C + 0.012, g.decay * 0.5);
                S.gain.setTargetAtTime(1e-4, C + 0.012 + g.decay, g.tail);
              } else S.gain.setTargetAtTime(1e-4, C + 0.012, g.decay);
              lastStrike = C;
            } else if (n === 0) {
              let e = Math.min(0.08 + i * 1.15, o * 0.62);
              S.gain.linearRampToValueAtTime(c, C + e);
            } else S.gain.setTargetAtTime(c, C, 0.12 + i * 0.38);
            // Articulation: detached notes above legato (staccato at 1).
            let art = t.motifArticulation ?? 1 - t.phraseSoftness;
            art > 0.3 && !rings && S.gain.setTargetAtTime(1e-4, C + o * (1 - 0.65 * art), 0.015 + 0.06 * (1 - art));
            C += o * cell[k].gap;
            let f = n >= cellLen && r() < 0.25 ? u[Math.floor(r() * u.length)] * _ : cell[k].step;
            v = clampNote(v + f);
          }
          let w = 0.3 + i * 1.5,
            oe = C + w;
          // A bell's last strike rings out, then a short fade.
          rings
            ? ((oe = lastStrike + 0.012 + g.decay + 4 * g.tail), S.gain.setTargetAtTime(1e-4, oe - 0.3, 0.06))
            : S.gain.setTargetAtTime(1e-4, C, w * 0.32);
          let crushed = x;
          if (crushCurve) {
            let ws = this.context.createWaveShaper();
            ws.curve = crushCurve;
            crushed = x.connect(ws);
          }
          (y
            .connect(te)
            .connect(x),
          crushed
            .connect(ne)
            .connect(S)
            .connect(re)
            .connect(l),
            reverbIn && re.connect(reverbIn),
            b.connect(ee).connect(te),
            y.start(p),
            b.start(p),
            y.stop(oe),
            b.stop(oe),
            bn && (bn.start(p), bn.stop(oe), o.push(bn)),
            o.push(y, b),
            s.push({
              start: p,
              stop: oe,
              pan: re.pan.value,
              analyser: ne,
              notes: ie,
            }));
        }
      }
      (_.start(), o.push(_));
      let y = {
        output: l,
        analyser: d,
        sources: o,
        scene: e,
        traits: t,
        startedAt: n,
        chordDuration: m,
        crossfade: h,
        tactileEvents: s,
        voiceMonitors: c,
      };
      (this.sessions.add(y), (this.current = y));
    }
    pause() {
      this.current &&= (this.retire(this.current, 2.4), void 0);
    }
    retire(e, t) {
      if (!this.context) return;
      let n = this.context.currentTime,
        r = Math.min(2.5, t * 0.28);
      (e.output.gain.cancelScheduledValues(n),
        e.output.gain.setValueAtTime(Math.max(1e-4, e.output.gain.value), n),
        e.output.gain.setValueAtTime(
          Math.max(1e-4, e.output.gain.value),
          n + r,
        ),
        e.output.gain.linearRampToValueAtTime(1e-4, n + t),
        window.setTimeout(
          () => {
            (e.sources.forEach((e) => {
              try {
                e.stop();
              } catch {}
            }),
              e.output.disconnect(),
              this.sessions.delete(e));
          },
          (t + 0.2) * 1e3,
        ));
    }
  }
const me = new NoiseEngine();
const xe = [
    {
      value: `auto`,
      label: `Auto`,
      description: `Picks a calm character from the scene seed.`,
    },
    { value: `meditate`, label: `Meditate`, description: `Slow, open and settled` },
    {
      value: `focus`,
      label: `Focus`,
      description: `Coherent, inward motion`,
    },
    { value: `clarity`, label: `Clarity`, description: `Stable and lucid` },
    {
      value: `still`,
      label: `Still`,
      description: `Fine, exposed textures`,
    },
    { value: `flow`, label: `Flow`, description: `Light and gently active` },
    { value: `dusk`, label: `Dusk`, description: `Low, dark and spacious` },
    {
      value: `friction`,
      label: `Friction`,
      description: `Rough and unsettled`,
    },
    {
      value: `pulse`,
      label: `Pulse`,
      description: `Forward, concentrated energy`,
    },
  ],
  k = {
    mood: `auto`,
    volume: 0.78,
    brightness: 0.42,
    // Sound bed Length (how long each chord lasts) and Drift were one setting, speed:
    // an old speed x opens as padLength = 1 - x and padDrift = x.
    padLength: 0.72,
    padDrift: 0.28,
    padOverlap: 0.74,
    noiseLevel: 0.28,
    padOctaveLow: 2,
    padOctaveHigh: 5,
    padWidth: 0.35,
    motifDensity: 0.18,
    phraseSoftness: 0.72,
    exposure: 0,
    contrast: 0,
    padRevoice: !0,
    noiseSweep: 0,
    visualize: !0,
    // Mood map (on when the query has light or energy) and the noise bed's own filter.
    useMap: !1,
    light: 0.6,
    energy: 0.3,
    noiseTone: 0.42,
    // Layers: sound bed and motif levels (0.5 = before), motif note length and
    // articulation (0 legato .. 1 staccato; old links get 1 - phraseSoftness), and how pad
    // voices move between chord notes (0 portamento, 1 stepped through the scale).
    padLevel: 0.5,
    motifLevel: 0.5,
    motifNoteLength: 0.65,
    motifArticulation: 0.28,
    padTransition: 0,
    // Noise bed space (0.5 centre; width 0.82 = the old placing) and motif reverb.
    noisePan: 0.5,
    noiseWidth: 0.82,
    motifReverb: 0.3,
    // Motif octaves: C(low) to the top of high, within E1..C7 (1..7 = all of it).
    motifOctaveLow: 1,
    motifOctaveHigh: 7,
    // Motif bit crusher, 0 = off: bits (12 → 6 bits) and rate (sample-and-hold; core only).
    // Layer FX: type 0 none, 1 crush, 2 drive, and an amount (motif crush was Grit). The
    // fallback plays only motif crush (bits); the rest needs the native core.
    motifFx: 0, motifFxAmount: 0.5, padFx: 0, padFxAmount: 0.5, noiseFx: 0, noiseFxAmount: 0.5,
  },
  // Old URL keys (renamed sections, the first app's keys) and mood values, still accepted
  // so shared links keep working; the new name wins. Names are only ever added here.
  PARAM_ALIASES = {
    volume: [`gain`],
    brightness: [`grain`],
    padDrift: [`speed`, `motion`],
    padOverlap: [`overlap`, `space`],
    noiseLevel: [`noise`],
    padOctaveLow: [`octaveLow`, `low`],
    padOctaveHigh: [`octaveHigh`, `high`],
    padWidth: [`spread`, `poles`],
    motifDensity: [`phrases`, `touch`],
    phraseSoftness: [`attack`],
    padRevoice: [`revoice`, `shift`],
    noiseSweep: [`sweep`],
    padLevel: [`chordLevel`],
    motifNoteLength: [`motifLength`],
    padTransition: [`transitionMode`],
    motifCrushBits: [`motifBits`],   // Grit's two old parts (read in the parser)
    motifCrushRate: [`motifRate`],
  },
  MOOD_ALIASES = {
    calm: `meditate`,
    contemplative: `focus`,
    confident: `clarity`,
    delicate: `still`,
    playful: `flow`,
    solemn: `dusk`,
    agitated: `friction`,
    urgent: `pulse`,
  };
function Se(search = "") {
  let e = new URLSearchParams(search),
    get = (key) => {
      if (e.has(key)) return e.get(key);
      for (const old of PARAM_ALIASES[key] ?? []) if (e.has(old)) return e.get(old);
      return null;
    },
    t = (key, n, r = 0, i = 1) => {
      let v = get(key);
      if (v === null) return n;
      let a = Number(v);
      return Number.isFinite(a) ? Math.min(i, Math.max(r, a)) : n;
    },
    m = e.get(`mood`),
    // Mood is a numeric id (index into MOODS: 0 auto, 1 meditate, …); names are still read.
    n = /^\d+$/.test(m ?? ``) ? xe[Number(m)]?.value : (MOOD_ALIASES[m] ?? m),
    r = {
      ...k,
      mood: xe.some((e) => e.value === n) ? n : k.mood,
      volume: t(`volume`, k.volume, 0, 1.5),
      brightness: t(`brightness`, k.brightness),
      padDrift: t(`padDrift`, k.padDrift),
      padOverlap: t(`padOverlap`, k.padOverlap),
      noiseLevel: t(`noiseLevel`, k.noiseLevel),
      padOctaveLow: Math.round(t(`padOctaveLow`, k.padOctaveLow, 1, 6)),
      padOctaveHigh: Math.round(t(`padOctaveHigh`, k.padOctaveHigh, 1, 6)),
      padWidth: t(`padWidth`, k.padWidth),
      motifDensity: t(`motifDensity`, k.motifDensity),
      phraseSoftness: t(`phraseSoftness`, k.phraseSoftness),
      exposure: t(`exposure`, k.exposure, -1, 1),
      contrast: t(`contrast`, k.contrast, -1, 1),
      padRevoice: !0,   // Vary chords is always on
      noiseSweep: Math.round(t(`noiseSweep`, 0, 0, 3)),   // 0 off, 1 slow, 2 fast, 3 medium; native core only
      visualize: e.get(`visual`) !== `0`,
      useMap: get(`light`) !== null || get(`energy`) !== null,
      light: t(`light`, k.light),
      energy: t(`energy`, k.energy),
      noiseTone: t(`noiseTone`, k.noiseTone),
      padLevel: t(`padLevel`, k.padLevel),
      motifLevel: t(`motifLevel`, k.motifLevel),
      motifNoteLength: t(`motifNoteLength`, k.motifNoteLength),
      padTransition: Math.round(t(`padTransition`, 0, 0, 1)),
      noisePan: t(`noisePan`, k.noisePan),
      noiseWidth: t(`noiseWidth`, k.noiseWidth),
      motifReverb: t(`motifReverb`, k.motifReverb),
      motifOctaveLow: Math.round(t(`motifOctaveLow`, k.motifOctaveLow, 1, 7)),
      motifOctaveHigh: Math.round(t(`motifOctaveHigh`, k.motifOctaveHigh, 1, 7)),
    };
  r.motifOctaveHigh = Math.max(r.motifOctaveLow, r.motifOctaveHigh);
  // Layer FX: motif crush was Grit (motifGrit), and before that two settings, bits and
  // rate: an old link with any of them above 0 opens as crush at that amount.
  const fxId = (key) => Math.round(t(key, 0, 0, 2));
  if (get(`motifFx`) !== null) {
    r.motifFx = fxId(`motifFx`);
    r.motifFxAmount = t(`motifFxAmount`, k.motifFxAmount);
  } else {
    const old = get(`motifGrit`) !== null ? t(`motifGrit`, 0) : Math.max(t(`motifCrushBits`, 0), t(`motifCrushRate`, 0));
    r.motifFx = old > 0 ? 1 : 0;
    r.motifFxAmount = old > 0 ? old : t(`motifFxAmount`, k.motifFxAmount);
  }
  r.padFx = fxId(`padFx`);
  r.padFxAmount = t(`padFxAmount`, k.padFxAmount);
  r.noiseFx = fxId(`noiseFx`);
  r.noiseFxAmount = t(`noiseFxAmount`, k.noiseFxAmount);
  // Length was the inverse of speed: an old speed or motion (no padLength) opens as
  // 1 - speed. A new link without padLength gets the default.
  r.padLength = get(`padLength`) !== null ? t(`padLength`, k.padLength)
    : !e.has(`padDrift`) && get(`padDrift`) !== null ? 1 - r.padDrift : k.padLength;
  r.motifArticulation =
    get(`motifArticulation`) !== null ? t(`motifArticulation`, k.motifArticulation) : 1 - r.phraseSoftness;
  return (
    (r.padOctaveHigh = Math.max(r.padOctaveLow, r.padOctaveHigh)),
    { traits: r, seed: t(`seed`, Math.random(), 1e-6, 0.999999) }
  );
}


// ===== END NOISEGEN APPLICATION =====

// Added public API aliases. No React or package install required.
export {
  NoiseEngine, me as engine, pe as generateScene, Se as parseSceneQuery,
  k as DEFAULT_TRAITS, xe as MOODS, T as VOICE_PALETTE, E as seededRandom,
  PARAM_ALIASES, MOOD_ALIASES,
  Note, Interval, Mode, Scale,
};

/*
===== LICENSE FOR @amplib/music-theory ONLY =====
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1.  Definitions.

    "License" shall mean the terms and conditions for use, reproduction,
    and distribution as defined by Sections 1 through 9 of this document.

    "Licensor" shall mean the copyright owner or entity authorized by
    the copyright owner that is granting the License.

    "Legal Entity" shall mean the union of the acting entity and all
    other entities that control, are controlled by, or are under common
    control with that entity. For the purposes of this definition,
    "control" means (i) the power, direct or indirect, to cause the
    direction or management of such entity, whether by contract or
    otherwise, or (ii) ownership of fifty percent (50%) or more of the
    outstanding shares, or (iii) beneficial ownership of such entity.

    "You" (or "Your") shall mean an individual or Legal Entity
    exercising permissions granted by this License.

    "Source" form shall mean the preferred form for making modifications,
    including but not limited to software source code, documentation
    source, and configuration files.

    "Object" form shall mean any form resulting from mechanical
    transformation or translation of a Source form, including but
    not limited to compiled object code, generated documentation,
    and conversions to other media types.

    "Work" shall mean the work of authorship, whether in Source or
    Object form, made available under the License, as indicated by a
    copyright notice that is included in or attached to the work
    (an example is provided in the Appendix below).

    "Derivative Works" shall mean any work, whether in Source or Object
    form, that is based on (or derived from) the Work and for which the
    editorial revisions, annotations, elaborations, or other modifications
    represent, as a whole, an original work of authorship. For the purposes
    of this License, Derivative Works shall not include works that remain
    separable from, or merely link (or bind by name) to the interfaces of,
    the Work and Derivative Works thereof.

    "Contribution" shall mean any work of authorship, including
    the original version of the Work and any modifications or additions
    to that Work or Derivative Works thereof, that is intentionally
    submitted to Licensor for inclusion in the Work by the copyright owner
    or by an individual or Legal Entity authorized to submit on behalf of
    the copyright owner. For the purposes of this definition, "submitted"
    means any form of electronic, verbal, or written communication sent
    to the Licensor or its representatives, including but not limited to
    communication on electronic mailing lists, source code control systems,
    and issue tracking systems that are managed by, or on behalf of, the
    Licensor for the purpose of discussing and improving the Work, but
    excluding communication that is conspicuously marked or otherwise
    designated in writing by the copyright owner as "Not a Contribution."

    "Contributor" shall mean Licensor and any individual or Legal Entity
    on behalf of whom a Contribution has been received by Licensor and
    subsequently incorporated within the Work.

2.  Grant of Copyright License. Subject to the terms and conditions of
    this License, each Contributor hereby grants to You a perpetual,
    worldwide, non-exclusive, no-charge, royalty-free, irrevocable
    copyright license to reproduce, prepare Derivative Works of,
    publicly display, publicly perform, sublicense, and distribute the
    Work and such Derivative Works in Source or Object form.

3.  Grant of Patent License. Subject to the terms and conditions of
    this License, each Contributor hereby grants to You a perpetual,
    worldwide, non-exclusive, no-charge, royalty-free, irrevocable
    (except as stated in this section) patent license to make, have made,
    use, offer to sell, sell, import, and otherwise transfer the Work,
    where such license applies only to those patent claims licensable
    by such Contributor that are necessarily infringed by their
    Contribution(s) alone or by combination of their Contribution(s)
    with the Work to which such Contribution(s) was submitted. If You
    institute patent litigation against any entity (including a
    cross-claim or counterclaim in a lawsuit) alleging that the Work
    or a Contribution incorporated within the Work constitutes direct
    or contributory patent infringement, then any patent licenses
    granted to You under this License for that Work shall terminate
    as of the date such litigation is filed.

4.  Redistribution. You may reproduce and distribute copies of the
    Work or Derivative Works thereof in any medium, with or without
    modifications, and in Source or Object form, provided that You
    meet the following conditions:

    (a) You must give any other recipients of the Work or
    Derivative Works a copy of this License; and

    (b) You must cause any modified files to carry prominent notices
    stating that You changed the files; and

    (c) You must retain, in the Source form of any Derivative Works
    that You distribute, all copyright, patent, trademark, and
    attribution notices from the Source form of the Work,
    excluding those notices that do not pertain to any part of
    the Derivative Works; and

    (d) If the Work includes a "NOTICE" text file as part of its
    distribution, then any Derivative Works that You distribute must
    include a readable copy of the attribution notices contained
    within such NOTICE file, excluding those notices that do not
    pertain to any part of the Derivative Works, in at least one
    of the following places: within a NOTICE text file distributed
    as part of the Derivative Works; within the Source form or
    documentation, if provided along with the Derivative Works; or,
    within a display generated by the Derivative Works, if and
    wherever such third-party notices normally appear. The contents
    of the NOTICE file are for informational purposes only and
    do not modify the License. You may add Your own attribution
    notices within Derivative Works that You distribute, alongside
    or as an addendum to the NOTICE text from the Work, provided
    that such additional attribution notices cannot be construed
    as modifying the License.

    You may add Your own copyright statement to Your modifications and
    may provide additional or different license terms and conditions
    for use, reproduction, or distribution of Your modifications, or
    for any such Derivative Works as a whole, provided Your use,
    reproduction, and distribution of the Work otherwise complies with
    the conditions stated in this License.

5.  Submission of Contributions. Unless You explicitly state otherwise,
    any Contribution intentionally submitted for inclusion in the Work
    by You to the Licensor shall be under the terms and conditions of
    this License, without any additional terms or conditions.
    Notwithstanding the above, nothing herein shall supersede or modify
    the terms of any separate license agreement you may have executed
    with Licensor regarding such Contributions.

6.  Trademarks. This License does not grant permission to use the trade
    names, trademarks, service marks, or product names of the Licensor,
    except as required for reasonable and customary use in describing the
    origin of the Work and reproducing the content of the NOTICE file.

7.  Disclaimer of Warranty. Unless required by applicable law or
    agreed to in writing, Licensor provides the Work (and each
    Contributor provides its Contributions) on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
    implied, including, without limitation, any warranties or conditions
    of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
    PARTICULAR PURPOSE. You are solely responsible for determining the
    appropriateness of using or redistributing the Work and assume any
    risks associated with Your exercise of permissions under this License.

8.  Limitation of Liability. In no event and under no legal theory,
    whether in tort (including negligence), contract, or otherwise,
    unless required by applicable law (such as deliberate and grossly
    negligent acts) or agreed to in writing, shall any Contributor be
    liable to You for damages, including any direct, indirect, special,
    incidental, or consequential damages of any character arising as a
    result of this License or out of the use or inability to use the
    Work (including but not limited to damages for loss of goodwill,
    work stoppage, computer failure or malfunction, or any and all
    other commercial damages or losses), even if such Contributor
    has been advised of the possibility of such damages.

9.  Accepting Warranty or Additional Liability. While redistributing
    the Work or Derivative Works thereof, You may choose to offer,
    and charge a fee for, acceptance of support, warranty, indemnity,
    or other liability obligations and/or rights consistent with this
    License. However, in accepting such obligations, You may act only
    on Your own behalf and on Your sole responsibility, not on behalf
    of any other Contributor, and only if You agree to indemnify,
    defend, and hold each Contributor harmless for any liability
    incurred by, or claims asserted against, such Contributor by reason
    of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

Copyright 2024-2026 Another Machine

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

===== END DEPENDENCY LICENSE =====
*/
