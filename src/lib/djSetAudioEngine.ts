import { TransitionConfig, TransitionEnvelopes, TransitionPresetType, TrackDef } from '../types';
import { evaluateEnvelope } from './djMixerLogic';

export interface DeckState {
  track: TrackDef | null;
  volume: number; // 0..1
  eqLow: number;  // 0..1 (0 = -40dB, 1 = 0dB/unity, >1 = boost)
  eqMid: number;  // 0..1
  eqHigh: number; // 0..1
  filterCutoff: number; // Hz (20..20000)
  filterType: BiquadFilterType;
  filterQ: number;
}

export interface TransitionState {
  progress: number; // 0.0 (Deck A solo) -> 1.0 (Deck B solo)
  phaseLabel: string;
  deckA: DeckState;
  deckB: DeckState;
  isBassSwapped: boolean;
}

export class DjSetAudioEngine {
  private ctx: AudioContext | null = null;

  // Deck A Audio Nodes
  private audioA: HTMLAudioElement | null = null;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private lowA: BiquadFilterNode | null = null;
  private midA: BiquadFilterNode | null = null;
  private highA: BiquadFilterNode | null = null;
  private filterA: BiquadFilterNode | null = null;
  private gainA: GainNode | null = null;

  // Deck B Audio Nodes
  private audioB: HTMLAudioElement | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private lowB: BiquadFilterNode | null = null;
  private midB: BiquadFilterNode | null = null;
  private highB: BiquadFilterNode | null = null;
  private filterB: BiquadFilterNode | null = null;
  private gainB: GainNode | null = null;

  private masterGain: GainNode | null = null;

  private isPlaying = false;
  private currentProgress = 0; // 0..1
  private onStateChange?: (state: TransitionState) => void;

  constructor() {
    // Lazy AudioContext initialization on user gesture
  }

  public init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Deck A
    this.audioA = new Audio();
    this.audioA.crossOrigin = 'anonymous';
    this.sourceA = this.ctx.createMediaElementSource(this.audioA);
    this.lowA = this.ctx.createBiquadFilter();
    this.lowA.type = 'lowshelf';
    this.lowA.frequency.value = 150;
    this.midA = this.ctx.createBiquadFilter();
    this.midA.type = 'peaking';
    this.midA.frequency.value = 1000;
    this.midA.Q.value = 1.0;
    this.highA = this.ctx.createBiquadFilter();
    this.highA.type = 'highshelf';
    this.highA.frequency.value = 4000;
    this.filterA = this.ctx.createBiquadFilter();
    this.filterA.type = 'highpass';
    this.filterA.frequency.value = 20; // wide open
    this.filterA.Q.value = 1.0;
    this.gainA = this.ctx.createGain();

    this.sourceA.connect(this.lowA);
    this.lowA.connect(this.midA);
    this.midA.connect(this.highA);
    this.highA.connect(this.filterA);
    this.filterA.connect(this.gainA);
    this.gainA.connect(this.masterGain);

    // Deck B
    this.audioB = new Audio();
    this.audioB.crossOrigin = 'anonymous';
    this.sourceB = this.ctx.createMediaElementSource(this.audioB);
    this.lowB = this.ctx.createBiquadFilter();
    this.lowB.type = 'lowshelf';
    this.lowB.frequency.value = 150;
    this.midB = this.ctx.createBiquadFilter();
    this.midB.type = 'peaking';
    this.midB.frequency.value = 1000;
    this.midB.Q.value = 1.0;
    this.highB = this.ctx.createBiquadFilter();
    this.highB.type = 'highshelf';
    this.highB.frequency.value = 4000;
    this.filterB = this.ctx.createBiquadFilter();
    this.filterB.type = 'lowpass';
    this.filterB.frequency.value = 20000; // wide open
    this.filterB.Q.value = 1.0;
    this.gainB = this.ctx.createGain();

    this.sourceB.connect(this.lowB);
    this.lowB.connect(this.midB);
    this.midB.connect(this.highB);
    this.highB.connect(this.filterB);
    this.filterB.connect(this.gainB);
    this.gainB.connect(this.masterGain);
  }

  public setCallback(cb: (state: TransitionState) => void) {
    this.onStateChange = cb;
  }

  public loadDeckA(track: TrackDef) {
    this.init();
    if (this.audioA) {
      if (track.url) {
        this.audioA.src = track.url;
      } else if (track.filePath) {
        this.audioA.src = `/api/tracks/audio?path=${encodeURIComponent(track.filePath)}`;
      }
      this.audioA.load();
    }
  }

  public loadDeckB(track: TrackDef) {
    this.init();
    if (this.audioB) {
      if (track.url) {
        this.audioB.src = track.url;
      } else if (track.filePath) {
        this.audioB.src = `/api/tracks/audio?path=${encodeURIComponent(track.filePath)}`;
      }
      this.audioB.load();
    }
  }

  public async play() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.isPlaying = true;
    try {
      if (this.audioA && this.audioA.src) {
        this.audioA.play().catch(() => {});
      }
      if (this.audioB && this.audioB.src && this.currentProgress > 0) {
        this.audioB.play().catch(() => {});
      }
    } catch (e) {}
  }

  public pause() {
    this.isPlaying = false;
    if (this.audioA) this.audioA.pause();
    if (this.audioB) this.audioB.pause();
  }

  public seekDeckA(sec: number) {
    if (this.audioA) this.audioA.currentTime = sec;
  }

  public seekDeckB(sec: number) {
    if (this.audioB) this.audioB.currentTime = sec;
  }

  public getAudioElements() {
    return { audioA: this.audioA, audioB: this.audioB };
  }

  /**
   * Calculates algorithmic transition parameters based on MixingTechniken or custom MixMeister envelopes
   */
  public computeTransitionState(
    progress: number, 
    preset: TransitionPresetType,
    customEnvelopes?: TransitionEnvelopes,
    durationBeats: number = 32
  ): TransitionState {
    const p = Math.max(0, Math.min(1, progress));
    let volA = 1.0;
    let volB = 0.0;
    let lowA = 1.0;
    let lowB = 0.0;
    let midA = 1.0;
    let midB = 0.0;
    let highA = 1.0;
    let highB = 0.0;
    let hpfCutoffA = 20;
    let hpfQA = 1.0;
    let lpfCutoffB = 20000;
    let lpfQB = 1.0;
    let phaseLabel = 'Track A Solo';
    let isBassSwapped = false;

    if (customEnvelopes) {
      const currentBeat = p * durationBeats;
      lowA = evaluateEnvelope(customEnvelopes.lowA, currentBeat);
      lowB = evaluateEnvelope(customEnvelopes.lowB, currentBeat);
      midA = evaluateEnvelope(customEnvelopes.midA, currentBeat);
      midB = evaluateEnvelope(customEnvelopes.midB, currentBeat);
      highA = evaluateEnvelope(customEnvelopes.highA, currentBeat);
      highB = evaluateEnvelope(customEnvelopes.highB, currentBeat);
      volA = evaluateEnvelope(customEnvelopes.volumeA, currentBeat);
      volB = evaluateEnvelope(customEnvelopes.volumeB, currentBeat);

      isBassSwapped = lowB > lowA;
      if (p < 0.05) {
        phaseLabel = 'Track A Solo';
      } else if (p > 0.95) {
        phaseLabel = 'Track B Solo';
      } else if (isBassSwapped) {
        phaseLabel = 'BASS SWAP! Deck B Low-End ⚡';
      } else {
        phaseLabel = `MixMeister EQ-Blend (${Math.round(p * 100)}%)`;
      }
    } else {
      switch (preset) {
      case 'eq-blend': {
        // 1. Der klassische EQ-Wechsel (Equalizer Blend)
        if (p < 0.2) {
          phaseLabel = 'Phase 1: Intro (Mid/High Layering)';
          volA = 1.0;
          volB = p / 0.2;
          lowA = 1.0;
          lowB = 0.0;
          midA = 1.0;
          midB = 0.3 * (p / 0.2);
          highA = 1.0;
          highB = 0.3 * (p / 0.2);
        } else if (p < 0.8) {
          const pSub = (p - 0.2) / 0.6;
          phaseLabel = `Phase 2: EQ-Crossover (${Math.round(pSub * 100)}%)`;
          volA = Math.cos(pSub * Math.PI / 2);
          volB = Math.sin(pSub * Math.PI / 2);
          midA = 1.0 - 0.5 * pSub;
          midB = 0.3 + 0.5 * pSub;
          highA = 1.0 - 0.5 * pSub;
          highB = 0.3 + 0.5 * pSub;
          lowA = 1.0;
          lowB = 0.0;
        } else {
          const pOut = (p - 0.8) / 0.2;
          phaseLabel = 'Phase 3: BASS SWAP! ⚡';
          isBassSwapped = true;
          volA = Math.cos(1 * Math.PI / 2) * (1 - pOut);
          volB = 1.0;
          lowA = 0.0;
          lowB = 1.0;
          midA = 0.5 * (1 - pOut);
          midB = 0.8 + 0.2 * pOut;
          highA = 0.5 * (1 - pOut);
          highB = 0.8 + 0.2 * pOut;
        }
        break;
      }

      case 'bass-swap': {
        // 2. Der Bass-Swap (Instant Low-End Switch)
        if (p < 0.5) {
          phaseLabel = 'Vor dem Drop: Aufbau & Mitten-Fade';
          const pPre = p / 0.5;
          volA = 1.0;
          volB = Math.sin(pPre * Math.PI / 2) * 0.7;
          lowA = 1.0;
          lowB = 0.0;
          midA = 1.0;
          midB = pPre * 0.7;
          highA = 1.0;
          highB = pPre * 0.7;
        } else {
          phaseLabel = 'BASS SWAP! Schlagartiger Low-End Switch ⚡';
          isBassSwapped = true;
          const pPost = (p - 0.5) / 0.5;
          volA = Math.max(0, 1.0 - pPost * 1.5);
          volB = 1.0;
          lowA = 0.0;
          lowB = 1.0;
          midA = Math.max(0, 0.7 * (1 - pPost));
          midB = 1.0;
          highA = Math.max(0, 0.7 * (1 - pPost));
          highB = 1.0;
        }
        break;
      }

      case 'filter-sweep': {
        // 3. Der Filter-Sweep (HPF / LPF Transition)
        phaseLabel = `HPF Filter-Sweep (${Math.round(20 * Math.pow(100, p))} Hz) 🌊`;
        hpfCutoffA = 20 * Math.pow(100, p);
        hpfQA = 1.0 + p * 2.5;
        
        lpfCutoffB = 300 * Math.pow(66.6, p);
        lpfQB = 1.0;

        volA = Math.cos(p * Math.PI / 2);
        volB = Math.sin(p * Math.PI / 2);
        lowA = Math.max(0, 1.0 - p * 1.2);
        lowB = Math.min(1.0, p * 1.2);
        midA = 1.0;
        midB = 1.0;
        highA = 1.0;
        highB = 1.0;
        if (p > 0.6) isBassSwapped = true;
        break;
      }

      case 'cut-drop': {
        // 4. Der Cut / Drop (Fader Slam)
        if (p < 0.5) {
          phaseLabel = 'Break / Stille vor dem Drop...';
          volA = 1.0;
          volB = 0.0;
          lowA = 1.0;
          lowB = 0.0;
          midA = 1.0;
          midB = 0.0;
          highA = 1.0;
          highB = 0.0;
        } else {
          phaseLabel = '💥 FADER SLAM / DROP! Track B übernimmt';
          isBassSwapped = true;
          volA = 0.0;
          volB = 1.0;
          lowA = 0.0;
          lowB = 1.0;
          midA = 0.0;
          midB = 1.0;
          highA = 0.0;
          highB = 1.0;
        }
        break;
      }

      case 'equal-power':
      default: {
        // 5. Das Volume-Fading mit Kurven (Gain Crossfade / Equal-Power)
        phaseLabel = `Equal-Power Crossfade (${Math.round(p * 100)}%)`;
        volA = Math.cos(p * Math.PI / 2);
        volB = Math.sin(p * Math.PI / 2);
        lowA = volA;
        lowB = volB;
        midA = volA;
        midB = volB;
        highA = volA;
        highB = volB;
        if (p > 0.5) isBassSwapped = true;
        break;
      }
    }
    }

    return {
      progress: p,
      phaseLabel,
      isBassSwapped,
      deckA: {
        track: null,
        volume: volA,
        eqLow: lowA,
        eqMid: midA,
        eqHigh: highA,
        filterCutoff: hpfCutoffA,
        filterType: 'highpass',
        filterQ: hpfQA,
      },
      deckB: {
        track: null,
        volume: volB,
        eqLow: lowB,
        eqMid: midB,
        eqHigh: highB,
        filterCutoff: lpfCutoffB,
        filterType: 'lowpass',
        filterQ: lpfQB,
      }
    };
  }

  /**
   * Applies transition parameters to Web Audio API DSP Nodes
   */
  public applyTransitionState(state: TransitionState) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ramp = 0.02; // 20ms anti-pop ramp

    // Deck A DSP
    if (this.gainA) {
      this.gainA.gain.setTargetAtTime(state.deckA.volume, now, ramp);
    }
    if (this.lowA) {
      const db = state.deckA.eqLow > 0.01 ? 20 * Math.log10(state.deckA.eqLow) : -40;
      this.lowA.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.midA) {
      const db = state.deckA.eqMid > 0.01 ? 20 * Math.log10(state.deckA.eqMid) : -40;
      this.midA.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.highA) {
      const db = state.deckA.eqHigh > 0.01 ? 20 * Math.log10(state.deckA.eqHigh) : -40;
      this.highA.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.filterA) {
      this.filterA.frequency.setTargetAtTime(state.deckA.filterCutoff, now, ramp);
      this.filterA.Q.setTargetAtTime(state.deckA.filterQ, now, ramp);
    }

    // Deck B DSP
    if (this.gainB) {
      this.gainB.gain.setTargetAtTime(state.deckB.volume, now, ramp);
    }
    if (this.lowB) {
      const db = state.deckB.eqLow > 0.01 ? 20 * Math.log10(state.deckB.eqLow) : -40;
      this.lowB.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.midB) {
      const db = state.deckB.eqMid > 0.01 ? 20 * Math.log10(state.deckB.eqMid) : -40;
      this.midB.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.highB) {
      const db = state.deckB.eqHigh > 0.01 ? 20 * Math.log10(state.deckB.eqHigh) : -40;
      this.highB.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.filterB) {
      this.filterB.frequency.setTargetAtTime(state.deckB.filterCutoff, now, ramp);
      this.filterB.Q.setTargetAtTime(state.deckB.filterQ, now, ramp);
    }

    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }

  public setProgress(
    progress: number, 
    preset: TransitionPresetType = 'bass-swap',
    customEnvelopes?: TransitionEnvelopes,
    durationBeats: number = 32
  ) {
    this.currentProgress = progress;
    const state = this.computeTransitionState(progress, preset, customEnvelopes, durationBeats);
    this.applyTransitionState(state);
    return state;
  }
}

export const globalDjSetEngine = new DjSetAudioEngine();
