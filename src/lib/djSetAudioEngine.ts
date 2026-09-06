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

export interface SetTimeUpdateEvent {
  setTimeSec: number;
  totalDurationSec: number;
  activeTrackIndex: number;
  activeTransitionId: string | null;
  transitionProgress: number;
  isPlaying: boolean;
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

  // Tracks currently loaded on the decks
  private currentDeckATrack: TrackDef | null = null;
  private currentDeckBTrack: TrackDef | null = null;

  // Multi-Track Continuous Set State
  private setTracks: TrackDef[] = [];
  private setTransitions: TransitionConfig[] = [];
  private setPlayheadSec: number = 0;
  private setRafId: number | null = null;
  private lastRafTimestamp: number = 0;
  private isSetMode: boolean = false;
  private onSetTimeUpdateCallback?: (event: SetTimeUpdateEvent) => void;

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

  public getTrackAudioUrl(track: TrackDef): string {
    if (track.url) return track.url;
    if (track.filePath) return `/api/tracks/audio?path=${encodeURIComponent(track.filePath)}`;
    return '';
  }

  public setCallback(cb: (state: TransitionState) => void) {
    this.onStateChange = cb;
  }

  public loadDeckA(track: TrackDef, cueTimeSec: number = 0) {
    this.init();
    this.currentDeckATrack = track;
    if (this.audioA) {
      const src = this.getTrackAudioUrl(track);
      if (this.audioA.src !== src) {
        this.audioA.src = src;
        this.audioA.load();
      }
      if (cueTimeSec >= 0) {
        this.audioA.currentTime = cueTimeSec;
      }
    }
  }

  public loadDeckB(track: TrackDef, cueTimeSec: number = 0) {
    this.init();
    this.currentDeckBTrack = track;
    if (this.audioB) {
      const src = this.getTrackAudioUrl(track);
      if (this.audioB.src !== src) {
        this.audioB.src = src;
        this.audioB.load();
      }
      if (cueTimeSec >= 0) {
        this.audioB.currentTime = cueTimeSec;
      }
    }
  }

  /**
   * Synchronizes tempo (pitch/speed) of Deck B relative to Deck A
   */
  public syncDecksTempo(bpmA: number = 130, bpmB: number = 130) {
    if (!this.audioB) return;
    if (bpmA > 0 && bpmB > 0) {
      const rate = Math.max(0.5, Math.min(2.0, bpmA / bpmB));
      this.audioB.playbackRate = rate;
    } else {
      this.audioB.playbackRate = 1.0;
    }
    if (this.audioA) {
      this.audioA.playbackRate = 1.0;
    }
  }

  /**
   * Starts playback. If Deck B has a source and we are within an active transition,
   * both audio tracks start playing simultaneously in beat-sync!
   */
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
      // Both decks play during transition overlap!
      if (this.audioB && this.audioB.src) {
        this.audioB.play().catch(() => {});
      }
    } catch (e) {}

    // Resume set loop if in set mode
    if (this.isSetMode) {
      this.startSetLoop();
    }
  }

  public pause() {
    this.isPlaying = false;
    if (this.audioA) this.audioA.pause();
    if (this.audioB) this.audioB.pause();
    this.stopSetLoop();
    if (this.onSetTimeUpdateCallback) {
      this.notifySetTime();
    }
  }

  public seekDeckA(sec: number) {
    if (this.audioA) this.audioA.currentTime = Math.max(0, sec);
  }

  public seekDeckB(sec: number) {
    if (this.audioB) this.audioB.currentTime = Math.max(0, sec);
  }

  /**
   * Nudges the beatgrid / playback phase of a deck in milliseconds
   */
  public nudgeBeatgrid(deck: 'A' | 'B', offsetMs: number) {
    const audio = deck === 'A' ? this.audioA : this.audioB;
    const track = deck === 'A' ? this.currentDeckATrack : this.currentDeckBTrack;
    if (audio) {
      const shiftSec = offsetMs / 1000;
      audio.currentTime = Math.max(0, audio.currentTime + shiftSec);
      if (track) {
        track.beatgridOffsetMs = (track.beatgridOffsetMs || 0) + offsetMs;
      }
    }
  }

  /**
   * Auto-phase locks Deck B's beat phase to Deck A's beat phase
   */
  public autoPhaseAlign(bpmA: number = 130, bpmB: number = 130) {
    if (!this.audioA || !this.audioB) return;
    const secondsPerBeatA = 60 / bpmA;
    const secondsPerBeatB = 60 / bpmB;

    // Phase in current beat (0.0 to 1.0)
    const phaseA = (this.audioA.currentTime % secondsPerBeatA) / secondsPerBeatA;
    const currentPhaseB = (this.audioB.currentTime % secondsPerBeatB) / secondsPerBeatB;

    // Phase difference
    let diffPhase = phaseA - currentPhaseB;
    if (diffPhase > 0.5) diffPhase -= 1.0;
    if (diffPhase < -0.5) diffPhase += 1.0;

    const shiftSec = diffPhase * secondsPerBeatB;
    this.audioB.currentTime = Math.max(0, this.audioB.currentTime + shiftSec);

    if (this.currentDeckBTrack) {
      this.currentDeckBTrack.beatgridOffsetMs = (this.currentDeckBTrack.beatgridOffsetMs || 0) + Math.round(shiftSec * 1000);
    }
  }

  public getAudioElements() {
    return { audioA: this.audioA, audioB: this.audioB };
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getSetPlayheadSec(): number {
    return this.setPlayheadSec;
  }

  /**
   * Synchronously sets transition progress and updates cue time for both decks
   */
  public syncTransitionProgress(
    progress: number,
    preset: TransitionPresetType,
    envelopes?: TransitionEnvelopes,
    durationBeats: number = 32,
    sourceMixOutSec: number = 0,
    targetMixInSec: number = 0,
    bpmA: number = 130,
    bpmB: number = 130
  ) {
    const p = Math.max(0, Math.min(1, progress));
    this.setProgress(p, preset, envelopes, durationBeats);
    this.syncDecksTempo(bpmA, bpmB);

    const secondsPerBeat = 60 / bpmA;
    const totalTransitionDurationSec = durationBeats * secondsPerBeat;
    const elapsedSec = p * totalTransitionDurationSec;

    const offsetA = ((this.currentDeckATrack?.beatgridOffsetMs || 0) / 1000);
    const offsetB = ((this.currentDeckBTrack?.beatgridOffsetMs || 0) / 1000);

    // Both audio elements track the elapsed transition time
    if (this.audioA && this.audioA.src) {
      const targetTimeA = Math.max(0, sourceMixOutSec + elapsedSec + offsetA);
      if (Math.abs(this.audioA.currentTime - targetTimeA) > 0.3) {
        this.audioA.currentTime = targetTimeA;
      }
    }

    if (this.audioB && this.audioB.src) {
      const targetTimeB = Math.max(0, targetMixInSec + (elapsedSec * (bpmA / bpmB)) + offsetB);
      if (Math.abs(this.audioB.currentTime - targetTimeB) > 0.3) {
        this.audioB.currentTime = targetTimeB;
      }
    }
  }

  // ================= MULTI-TRACK CONTINUOUS SET PLAYER =================

  public initSet(tracks: TrackDef[], transitions: TransitionConfig[], startSetTimeSec: number = 0) {
    this.setTracks = tracks;
    this.setTransitions = transitions;
    this.setPlayheadSec = startSetTimeSec;
    this.isSetMode = true;
    this.applySetStateAtTime(startSetTimeSec);
  }

  public seekSet(setTimeSec: number) {
    this.setPlayheadSec = Math.max(0, setTimeSec);
    this.applySetStateAtTime(this.setPlayheadSec);
    this.notifySetTime();
  }

  public async playSet(tracks: TrackDef[], transitions: TransitionConfig[], startSetTimeSec?: number) {
    this.initSet(tracks, transitions, startSetTimeSec !== undefined ? startSetTimeSec : this.setPlayheadSec);
    await this.play();
  }

  public onSetTimeUpdate(callback: (event: SetTimeUpdateEvent) => void) {
    this.onSetTimeUpdateCallback = callback;
    return () => {
      if (this.onSetTimeUpdateCallback === callback) {
        this.onSetTimeUpdateCallback = undefined;
      }
    };
  }

  private startSetLoop() {
    this.stopSetLoop();
    this.lastRafTimestamp = performance.now();

    const loop = (now: number) => {
      if (!this.isPlaying) return;
      const deltaSec = (now - this.lastRafTimestamp) / 1000;
      this.lastRafTimestamp = now;

      if (deltaSec > 0 && deltaSec < 1.0) {
        this.setPlayheadSec += deltaSec;
        this.applySetStateAtTime(this.setPlayheadSec);
        this.notifySetTime();
      }

      this.setRafId = requestAnimationFrame(loop);
    };

    this.setRafId = requestAnimationFrame(loop);
  }

  private stopSetLoop() {
    if (this.setRafId) {
      cancelAnimationFrame(this.setRafId);
      this.setRafId = null;
    }
  }

  /**
   * Computes which tracks and transitions are active at set time `t`
   * and synchronizes AudioContext DSP nodes and HTMLAudioElements.
   */
  public applySetStateAtTime(timeSec: number) {
    if (this.setTracks.length === 0) return;

    // Build timeline layout
    interface TrackLayout {
      track: TrackDef;
      startSec: number;
      durationSec: number;
      endSec: number;
      transition?: TransitionConfig;
      transitionStartSec?: number;
      transitionEndSec?: number;
    }

    const layouts: TrackLayout[] = [];
    let accumulatedTime = 0;

    for (let i = 0; i < this.setTracks.length; i++) {
      const track = this.setTracks[i];
      const duration = track.duration || 180;
      const nextTrack = this.setTracks[i + 1];

      let trans: TransitionConfig | undefined;
      let transDurationSec = 0;

      if (nextTrack) {
        trans = this.setTransitions.find(t => 
          (t.sourceTrackId === track.id && t.targetTrackId === nextTrack.id) ||
          (t.sourceTrackId === track.id)
        );
        const bpm = track.bpm || 130;
        const beats = trans ? trans.durationBeats : 32;
        transDurationSec = beats * (60 / bpm);
      }

      const startSec = accumulatedTime;
      const endSec = startSec + duration;

      layouts.push({
        track,
        startSec,
        durationSec: duration,
        endSec,
        transition: trans,
        transitionStartSec: nextTrack ? endSec - transDurationSec : undefined,
        transitionEndSec: nextTrack ? endSec : undefined,
      });

      accumulatedTime = nextTrack ? endSec - transDurationSec : endSec;
    }

    // Find active track/transition
    let activeTrackIdx = 0;
    for (let i = 0; i < layouts.length; i++) {
      if (timeSec >= layouts[i].startSec && timeSec <= layouts[i].endSec) {
        activeTrackIdx = i;
        break;
      }
    }

    const currentLayout = layouts[activeTrackIdx] || layouts[0];
    const nextLayout = layouts[activeTrackIdx + 1];

    // Check if within transition
    if (
      currentLayout.transition && 
      currentLayout.transitionStartSec !== undefined && 
      currentLayout.transitionEndSec !== undefined &&
      timeSec >= currentLayout.transitionStartSec &&
      timeSec <= currentLayout.transitionEndSec &&
      nextLayout
    ) {
      // IN TRANSITION OVERLAP ZONE: Both Deck A and Deck B active!
      const trans = currentLayout.transition;
      const transDurationSec = currentLayout.transitionEndSec - currentLayout.transitionStartSec;
      const progress = Math.max(0, Math.min(1, (timeSec - currentLayout.transitionStartSec) / transDurationSec));

      // Make sure Deck A is current track and Deck B is next track
      if (this.currentDeckATrack?.id !== currentLayout.track.id) {
        this.loadDeckA(currentLayout.track, timeSec - currentLayout.startSec);
      }
      if (this.currentDeckBTrack?.id !== nextLayout.track.id) {
        this.loadDeckB(nextLayout.track, 0);
      }

      const sourceTimeSec = trans.sourceTimeSec !== undefined ? trans.sourceTimeSec : (currentLayout.durationSec - transDurationSec);
      const targetTimeSec = trans.targetTimeSec !== undefined ? trans.targetTimeSec : 0;

      this.syncTransitionProgress(
        progress,
        trans.preset,
        trans.envelopes,
        trans.durationBeats,
        sourceTimeSec,
        targetTimeSec,
        currentLayout.track.bpm || 130,
        nextLayout.track.bpm || 130
      );

      if (this.isPlaying) {
        if (this.audioA && this.audioA.paused) this.audioA.play().catch(() => {});
        if (this.audioB && this.audioB.paused) this.audioB.play().catch(() => {});
      }
    } else {
      // SOLO TRACK ZONE: Track A plays solo
      if (this.currentDeckATrack?.id !== currentLayout.track.id) {
        this.loadDeckA(currentLayout.track, Math.max(0, timeSec - currentLayout.startSec));
      } else if (this.audioA) {
        const targetTrackTime = Math.max(0, timeSec - currentLayout.startSec);
        if (Math.abs(this.audioA.currentTime - targetTrackTime) > 0.4) {
          this.audioA.currentTime = targetTrackTime;
        }
      }

      // Preload Deck B for next track if upcoming
      if (nextLayout && this.currentDeckBTrack?.id !== nextLayout.track.id) {
        this.loadDeckB(nextLayout.track, 0);
      }

      // Set progress to 0 (Deck A solo unity, Deck B muted)
      this.setProgress(0, 'bass-swap', undefined, 32);
      if (this.audioB && !this.audioB.paused) {
        this.audioB.pause();
      }

      if (this.isPlaying && this.audioA && this.audioA.paused) {
        this.audioA.play().catch(() => {});
      }
    }
  }

  private notifySetTime() {
    if (!this.onSetTimeUpdateCallback) return;

    let totalDurationSec = 300;
    if (this.setTracks.length > 0) {
      let acc = 0;
      for (let i = 0; i < this.setTracks.length; i++) {
        const dur = this.setTracks[i].duration || 180;
        const next = this.setTracks[i + 1];
        let transDur = 0;
        if (next) {
          const trans = this.setTransitions.find(t => t.sourceTrackId === this.setTracks[i].id);
          const bpm = this.setTracks[i].bpm || 130;
          transDur = (trans ? trans.durationBeats : 32) * (60 / bpm);
        }
        acc = next ? acc + dur - transDur : acc + dur;
      }
      totalDurationSec = acc;
    }

    this.onSetTimeUpdateCallback({
      setTimeSec: this.setPlayheadSec,
      totalDurationSec,
      activeTrackIndex: 0,
      activeTransitionId: null,
      transitionProgress: this.currentProgress,
      isPlaying: this.isPlaying,
    });
  }

  /**
   * Calculates algorithmic transition parameters based on MixingTechniken or custom Waveform envelopes
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
        phaseLabel = `Waveform EQ-Blend (${Math.round(p * 100)}%)`;
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
        // 2. Der Bass-Swap (Instant Low-End Switch auf der Eins)
        if (p < 0.5) {
          phaseLabel = 'Vor dem Drop: Aufbau & Mitten-Fade';
          volA = 1.0;
          volB = p * 1.6; // Deck B Mitten/Höhen kommen schrittweise rein
          lowA = 1.0;
          lowB = 0.0; // Bass komplett gemutet
          midA = 1.0;
          midB = p * 1.5;
          highA = 1.0;
          highB = p * 1.5;
        } else {
          phaseLabel = 'BASS SWAP! Schlagartiger Low-End Switch ⚡';
          isBassSwapped = true;
          // Schlagartiger Tausch: Deck A Bass 0, Deck B Bass voll
          lowA = 0.0;
          lowB = 1.0;
          volA = Math.max(0, 1.0 - (p - 0.5) * 2);
          volB = 1.0;
          midA = Math.max(0, 1.0 - (p - 0.5) * 2);
          midB = 1.0;
          highA = Math.max(0, 1.0 - (p - 0.5) * 2);
          highB = 1.0;
        }
        break;
      }

      case 'filter-sweep': {
        // 3. Der HPF Filter-Sweep
        if (p < 0.7) {
          const pSweep = p / 0.7;
          phaseLabel = `HPF Sweep auf Deck A (${Math.round(hpfCutoffA)} Hz)`;
          // 20 Hz bis 2500 Hz Sweep
          hpfCutoffA = 20 * Math.pow(2500 / 20, pSweep);
          hpfQA = 1.0 + 3.0 * Math.sin(pSweep * Math.PI); // Resonanz-Peak am Break
          volA = 1.0;
          volB = Math.sin(pSweep * Math.PI / 2);
          lowA = Math.max(0, 1.0 - pSweep * 1.5);
          lowB = 0.0;
          midA = 1.0;
          midB = 0.8 * pSweep;
          highA = 1.0;
          highB = 0.8 * pSweep;
        } else {
          phaseLabel = 'DROP! Filter Cut & Bass Impact 💥';
          isBassSwapped = true;
          hpfCutoffA = 20;
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

      case 'cut-drop': {
        // 4. Der Cut / Drop (Harter Schnitt auf die Eins)
        if (p < 0.98) {
          phaseLabel = 'Spannungsaufbau vor Fader-Slam...';
          volA = 1.0;
          volB = 0.0;
          lowA = 1.0;
          lowB = 0.0;
          midA = 1.0;
          midB = 0.0;
          highA = 1.0;
          highB = 0.0;
        } else {
          phaseLabel = 'FADER SLAM! Drop auf Deck B 💥';
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
        track: this.currentDeckATrack,
        volume: volA,
        eqLow: lowA,
        eqMid: midA,
        eqHigh: highA,
        filterCutoff: hpfCutoffA,
        filterType: 'highpass',
        filterQ: hpfQA,
      },
      deckB: {
        track: this.currentDeckBTrack,
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
