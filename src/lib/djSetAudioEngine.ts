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
  currentTime?: number;
  totalDurationSec: number;
  activeTrackIndex: number;
  activeTrackId?: string;
  incomingTrackId?: string;
  activeTransitionId: string | null;
  transitionProgress: number;
  crossfaderPosition: number;
  isPlaying: boolean;
  transitionState?: TransitionState;
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
  private transitionMap: Map<string, TransitionConfig> = new Map();
  private setPlayheadSec: number = 0;
  private setRafId: number | null = null;
  private lastRafTimestamp: number = 0;
  private isSetMode: boolean = false;
  private onSetTimeUpdateCallback?: (event: SetTimeUpdateEvent) => void;
  private currentActiveTrackIndex: number = 0;
  private currentActiveTrackId?: string;
  private currentIncomingTrackId?: string;
  private currentActiveTransitionId: string | null = null;
  private currentCrossfaderPosition: number = 0;
  private currentSetTransitionState?: TransitionState;

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
      if (Math.abs(this.audioA.currentTime - targetTimeA) > 0.75) {
        this.audioA.currentTime = targetTimeA;
      }
    }

    if (this.audioB && this.audioB.src) {
      const targetTimeB = Math.max(0, targetMixInSec + (elapsedSec * (bpmA / bpmB)) + offsetB);
      if (Math.abs(this.audioB.currentTime - targetTimeB) > 0.75) {
        this.audioB.currentTime = targetTimeB;
      }
    }
  }

  private rebuildTransitionMap() {
    this.transitionMap.clear();
    for (const t of this.setTransitions) {
      if (t.sourceTrackId) {
        this.transitionMap.set(t.sourceTrackId, t);
        if (t.targetTrackId) {
          this.transitionMap.set(`${t.sourceTrackId}___${t.targetTrackId}`, t);
        }
      }
    }
  }

  // ================= MULTI-TRACK CONTINUOUS SET PLAYER =================

  public initSet(tracks: TrackDef[], transitions: TransitionConfig[], startSetTimeSec: number = 0) {
    this.setTracks = tracks;
    this.setTransitions = transitions;
    this.rebuildTransitionMap();
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
   *
   * Uses **real 2-deck alternation** like Traktor Pro / DJ.Studio:
   *   Even-indexed tracks (0, 2, 4…) → Deck A
   *   Odd-indexed tracks  (1, 3, 5…) → Deck B
   *
   * After each transition the finished deck is **stopped** and the
   * next-next track is **preloaded** onto it so it is ready for the
   * upcoming transition.
   */
  public applySetStateAtTime(timeSec: number) {
    if (this.setTracks.length === 0) return;

    // Build timeline layout
    interface TrackLayout {
      track: TrackDef;
      index: number;           // position in the ordered set (0-based)
      startSec: number;
      durationSec: number;
      endSec: number;
      transition?: TransitionConfig;       // outgoing transition to next track
      transitionStartSec?: number;         // absolute set-time where transition begins
      transitionEndSec?: number;           // absolute set-time where transition ends
      targetTimeSec: number;               // mixin offset inside THIS track (from incoming transition)
      deck: 'A' | 'B';                     // which physical deck this track is assigned to
    }

    const layouts: TrackLayout[] = [];
    let accumulatedTime = 0;

    for (let i = 0; i < this.setTracks.length; i++) {
      const track = this.setTracks[i];
      const duration = track.duration || 180;
      const nextTrack = this.setTracks[i + 1];

      // Incoming transition: determine targetTimeSec for this track
      let incomingTargetTimeSec = 0;
      if (i > 0) {
        const prevTrack = this.setTracks[i - 1];
        const prevTrans = this.transitionMap.get(`${prevTrack.id}___${track.id}`) || this.transitionMap.get(prevTrack.id);
        if (prevTrans?.targetTimeSec !== undefined) {
          incomingTargetTimeSec = prevTrans.targetTimeSec;
        }
      }

      // Outgoing transition to next track
      let trans: TransitionConfig | undefined;
      let transDurationSec = 0;

      if (nextTrack) {
        trans = this.transitionMap.get(`${track.id}___${nextTrack.id}`) || this.transitionMap.get(track.id);
        const bpm = track.bpm || 130;
        const beats = trans ? trans.durationBeats : 32;
        transDurationSec = beats * (60 / bpm);
      }

      const startSec = accumulatedTime;
      const naturalEndSec = startSec + (duration - incomingTargetTimeSec);

      const mixoutSec = trans?.sourceTimeSec !== undefined
        ? trans.sourceTimeSec
        : Math.max(0, duration - transDurationSec);
      // sourceTimeSec is relative to track-local time, convert to set-time
      const transStartSec = nextTrack ? startSec + Math.max(0, mixoutSec - incomingTargetTimeSec) : undefined;
      const transEndSec = nextTrack && transStartSec !== undefined ? transStartSec + transDurationSec : undefined;

      // When there is an outgoing transition, this track's role on the set timeline ends at transEndSec.
      // Keeping endSec at the raw audio duration would falsely retain this track as active
      // after the transition ends, resetting it to solo mode and blasting volume!
      const endSec = (nextTrack && transEndSec !== undefined) ? transEndSec : naturalEndSec;

      // Deck assignment: even index → A, odd index → B
      const deck: 'A' | 'B' = (i % 2 === 0) ? 'A' : 'B';

      layouts.push({
        track,
        index: i,
        startSec,
        durationSec: duration,
        endSec,
        transition: trans,
        transitionStartSec: transStartSec,
        transitionEndSec: transEndSec,
        targetTimeSec: incomingTargetTimeSec,
        deck,
      });

      // Accumulated time: the NEXT track starts at transStartSec (overlap begins)
      if (nextTrack && transStartSec !== undefined) {
        accumulatedTime = transStartSec;
      } else {
        accumulatedTime = endSec;
      }
    }

    // ─────────── Find active track at current set-time ───────────
    // Forward search: find the first track whose range (startSec→endSec) contains
    // the current time. During the overlap zone the outgoing track (lower index)
    // is the "active" one because it owns the transition.

    let activeTrackIdx = layouts.length - 1; // fallback to last track
    for (let i = 0; i < layouts.length; i++) {
      if (timeSec >= layouts[i].startSec && timeSec < layouts[i].endSec) {
        activeTrackIdx = i;
        break;
      }
      // Handle edge: exactly at the end of the last track
      if (i === layouts.length - 1 && timeSec >= layouts[i].startSec) {
        activeTrackIdx = i;
      }
    }

    const currentLayout = layouts[activeTrackIdx];
    if (!currentLayout) return;

    const nextLayout = layouts[activeTrackIdx + 1];
    const prevLayout = activeTrackIdx > 0 ? layouts[activeTrackIdx - 1] : undefined;

    // Helper: which deck plays a given track index
    const deckFor = (idx: number): 'A' | 'B' => (idx % 2 === 0) ? 'A' : 'B';

    // Helper: load track onto the correct deck
    const loadOnDeck = (deck: 'A' | 'B', track: TrackDef, cueTimeSec: number) => {
      if (deck === 'A') {
        if (this.currentDeckATrack?.id !== track.id) {
          this.loadDeckA(track, cueTimeSec);
        }
      } else {
        if (this.currentDeckBTrack?.id !== track.id) {
          this.loadDeckB(track, cueTimeSec);
        }
      }
    };

    const getAudio = (deck: 'A' | 'B') => deck === 'A' ? this.audioA : this.audioB;

    // ─────────── Check if we are inside a transition overlap ───────────

    const inTransition = (
      currentLayout.transition &&
      currentLayout.transitionStartSec !== undefined &&
      currentLayout.transitionEndSec !== undefined &&
      timeSec >= currentLayout.transitionStartSec &&
      timeSec <= currentLayout.transitionEndSec &&
      nextLayout
    );

    if (inTransition && nextLayout) {
      // ── TRANSITION OVERLAP ZONE: both decks active ──
      const trans = currentLayout.transition!;
      const transDurationSec = currentLayout.transitionEndSec! - currentLayout.transitionStartSec!;
      const progress = Math.max(0, Math.min(1, (timeSec - currentLayout.transitionStartSec!) / transDurationSec));

      const outgoingDeck = currentLayout.deck;
      const incomingDeck = nextLayout.deck;

      // Load outgoing track onto its deck (should already be loaded)
      const outgoingTrackTime = Math.max(0, timeSec - currentLayout.startSec + currentLayout.targetTimeSec);
      loadOnDeck(outgoingDeck, currentLayout.track, outgoingTrackTime);

      // Load incoming track onto its deck
      const incomingTargetTime = nextLayout.targetTimeSec;
      loadOnDeck(incomingDeck, nextLayout.track, incomingTargetTime);

      const sourceTimeSec = trans.sourceTimeSec !== undefined ? trans.sourceTimeSec : (currentLayout.durationSec - transDurationSec);
      const targetTimeSec = trans.targetTimeSec !== undefined ? trans.targetTimeSec : 0;

      // Use syncTransitionProgress but route to correct decks
      // outgoingDeck = "Track A" in transition logic, incomingDeck = "Track B"
      if (outgoingDeck === 'A') {
        // Normal: Deck A is outgoing (Track A), Deck B is incoming (Track B)
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
      } else {
        // Flipped: Deck B is outgoing (Track A), Deck A is incoming (Track B)
        // We need to swap the DSP application
        this.syncTransitionProgressFlipped(
          progress,
          trans.preset,
          trans.envelopes,
          trans.durationBeats,
          sourceTimeSec,
          targetTimeSec,
          currentLayout.track.bpm || 130,
          nextLayout.track.bpm || 130
        );
      }

      this.currentActiveTrackIndex = activeTrackIdx;
      this.currentActiveTrackId = currentLayout.track.id;
      this.currentIncomingTrackId = nextLayout.track.id;
      this.currentActiveTransitionId = trans.id;
      this.currentCrossfaderPosition = progress;
      this.currentSetTransitionState = this.computeTransitionState(
        progress,
        trans.preset,
        trans.envelopes,
        trans.durationBeats
      );

      if (this.isPlaying) {
        const audioOut = getAudio(outgoingDeck);
        const audioIn = getAudio(incomingDeck);
        if (audioOut && audioOut.paused) audioOut.play().catch(() => {});
        if (audioIn && audioIn.paused) audioIn.play().catch(() => {});
      }

    } else {
      // ── SOLO TRACK ZONE: only one deck plays ──

      const soloDeck = currentLayout.deck;
      const otherDeck: 'A' | 'B' = soloDeck === 'A' ? 'B' : 'A';

      // Ensure current track is on its assigned deck at the correct position
      const trackLocalTime = Math.max(0, timeSec - currentLayout.startSec + currentLayout.targetTimeSec);
      loadOnDeck(soloDeck, currentLayout.track, trackLocalTime);

      // Sync playback position
      const soloAudio = getAudio(soloDeck);
      if (soloAudio) {
        if (Math.abs(soloAudio.currentTime - trackLocalTime) > 0.75) {
          soloAudio.currentTime = trackLocalTime;
        }
        soloAudio.playbackRate = 1.0; // Solo: natural tempo
      }

      // The OTHER deck: pause it and preload the next upcoming track for that deck
      const otherAudio = getAudio(otherDeck);
      if (otherAudio && !otherAudio.paused) {
        otherAudio.pause();
      }

      // Preload: if we have a next track, it should go on the other deck
      if (nextLayout) {
        loadOnDeck(otherDeck, nextLayout.track, nextLayout.targetTimeSec);
      }

      // Set DSP: solo deck at unity, other deck muted
      if (soloDeck === 'A') {
        this.setProgress(0, 'bass-swap', undefined, 32);
      } else {
        // Deck B is the active solo deck → set progress to 1.0 (Deck B at unity)
        this.setProgress(1, 'bass-swap', undefined, 32);
      }

      this.currentActiveTrackIndex = activeTrackIdx;
      this.currentActiveTrackId = currentLayout.track.id;
      this.currentIncomingTrackId = nextLayout ? nextLayout.track.id : undefined;
      this.currentActiveTransitionId = null;
      this.currentCrossfaderPosition = soloDeck === 'A' ? 0 : 1;
      this.currentSetTransitionState = this.computeTransitionState(
        soloDeck === 'A' ? 0 : 1,
        'bass-swap',
        undefined,
        32
      );

      if (this.isPlaying && soloAudio && soloAudio.paused) {
        soloAudio.play().catch(() => {});
      }
    }
  }

  /**
   * Like syncTransitionProgress but with decks FLIPPED:
   * Deck B is the outgoing track (applies "A" envelopes to Deck B)
   * Deck A is the incoming track (applies "B" envelopes to Deck A)
   */
  public syncTransitionProgressFlipped(
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

    // Compute the transition state normally
    const state = this.computeTransitionState(p, preset, envelopes, durationBeats);

    // Apply FLIPPED: deckA state goes to physical Deck B, deckB state to physical Deck A
    if (this.ctx) {
      const now = this.ctx.currentTime;
      const ramp = 0.02;

      // Physical Deck B gets the "outgoing" (deckA) parameters
      const effectiveVolOut = (state.deckA.eqLow <= 0.01 && state.deckA.eqMid <= 0.01 && state.deckA.eqHigh <= 0.01)
        ? 0
        : state.deckA.volume;

      if (this.gainB) this.gainB.gain.setTargetAtTime(effectiveVolOut, now, ramp);
      if (this.lowB) this.lowB.gain.setTargetAtTime(state.deckA.eqLow > 0.005 ? 20 * Math.log10(state.deckA.eqLow) : -70, now, ramp);
      if (this.midB) this.midB.gain.setTargetAtTime(state.deckA.eqMid > 0.005 ? 20 * Math.log10(state.deckA.eqMid) : -70, now, ramp);
      if (this.highB) this.highB.gain.setTargetAtTime(state.deckA.eqHigh > 0.005 ? 20 * Math.log10(state.deckA.eqHigh) : -70, now, ramp);
      if (this.filterB) {
        this.filterB.type = state.deckA.filterType || 'highpass';
        this.filterB.frequency.setTargetAtTime(state.deckA.filterCutoff, now, ramp);
        this.filterB.Q.setTargetAtTime(state.deckA.filterQ, now, ramp);
      }

      // Physical Deck A gets the "incoming" (deckB) parameters
      const effectiveVolIn = (state.deckB.eqLow <= 0.01 && state.deckB.eqMid <= 0.01 && state.deckB.eqHigh <= 0.01)
        ? 0
        : state.deckB.volume;

      if (this.gainA) this.gainA.gain.setTargetAtTime(effectiveVolIn, now, ramp);
      if (this.lowA) this.lowA.gain.setTargetAtTime(state.deckB.eqLow > 0.005 ? 20 * Math.log10(state.deckB.eqLow) : -70, now, ramp);
      if (this.midA) this.midA.gain.setTargetAtTime(state.deckB.eqMid > 0.005 ? 20 * Math.log10(state.deckB.eqMid) : -70, now, ramp);
      if (this.highA) this.highA.gain.setTargetAtTime(state.deckB.eqHigh > 0.005 ? 20 * Math.log10(state.deckB.eqHigh) : -70, now, ramp);
      if (this.filterA) {
        this.filterA.type = state.deckB.filterType || 'lowpass';
        this.filterA.frequency.setTargetAtTime(state.deckB.filterCutoff, now, ramp);
        this.filterA.Q.setTargetAtTime(state.deckB.filterQ, now, ramp);
      }
    }

    // Sync tempo: outgoing deck (B) runs at source BPM, incoming deck (A) syncs to it
    if (this.audioB) this.audioB.playbackRate = 1.0;
    if (this.audioA && bpmA > 0 && bpmB > 0) {
      this.audioA.playbackRate = Math.max(0.5, Math.min(2.0, bpmA / bpmB));
    }

    // Sync playback positions
    const secondsPerBeat = 60 / bpmA;
    const totalTransitionDurationSec = durationBeats * secondsPerBeat;
    const elapsedSec = p * totalTransitionDurationSec;

    const offsetB = ((this.currentDeckBTrack?.beatgridOffsetMs || 0) / 1000);
    const offsetA = ((this.currentDeckATrack?.beatgridOffsetMs || 0) / 1000);

    // Deck B is outgoing: tracks sourceMixOutSec + elapsed
    if (this.audioB && this.audioB.src) {
      const targetTimeB = Math.max(0, sourceMixOutSec + elapsedSec + offsetB);
      if (Math.abs(this.audioB.currentTime - targetTimeB) > 0.75) {
        this.audioB.currentTime = targetTimeB;
      }
    }

    // Deck A is incoming: tracks targetMixInSec + elapsed (tempo-adjusted)
    if (this.audioA && this.audioA.src) {
      const targetTimeA = Math.max(0, targetMixInSec + (elapsedSec * (bpmA / bpmB)) + offsetA);
      if (Math.abs(this.audioA.currentTime - targetTimeA) > 0.75) {
        this.audioA.currentTime = targetTimeA;
      }
    }

    if (this.onStateChange) {
      this.onStateChange(state);
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
          const trans = this.transitionMap.get(`${this.setTracks[i].id}___${next.id}`) || this.transitionMap.get(this.setTracks[i].id);
          const bpm = this.setTracks[i].bpm || 130;
          transDur = (trans ? trans.durationBeats : 32) * (60 / bpm);
        }
        acc = next ? acc + dur - transDur : acc + dur;
      }
      totalDurationSec = acc;
    }

    this.onSetTimeUpdateCallback({
      setTimeSec: this.setPlayheadSec,
      currentTime: this.setPlayheadSec,
      totalDurationSec,
      activeTrackIndex: this.currentActiveTrackIndex,
      activeTrackId: this.currentActiveTrackId,
      incomingTrackId: this.currentIncomingTrackId,
      activeTransitionId: this.currentActiveTransitionId,
      transitionProgress: this.currentCrossfaderPosition,
      crossfaderPosition: this.currentCrossfaderPosition,
      isPlaying: this.isPlaying,
      transitionState: this.currentSetTransitionState,
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

      const hasCustomVolA = customEnvelopes.volumeA && customEnvelopes.volumeA.length > 0;
      const hasCustomVolB = customEnvelopes.volumeB && customEnvelopes.volumeB.length > 0;

      volA = hasCustomVolA
        ? evaluateEnvelope(customEnvelopes.volumeA!, currentBeat)
        : Math.min(1.0, Math.max(lowA, midA, highA));

      volB = hasCustomVolB
        ? evaluateEnvelope(customEnvelopes.volumeB!, currentBeat)
        : Math.min(1.0, Math.max(lowB, midB, highB));

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

    // Global EQ Killswitch:
    // When low, mid, and high EQ bands are zeroed (<= 0.01), force volume to 0.0
    // so no sound leaks through the Biquad filter pass-bands.
    if (lowA <= 0.01 && midA <= 0.01 && highA <= 0.01) {
      volA = 0.0;
    }
    if (lowB <= 0.01 && midB <= 0.01 && highB <= 0.01) {
      volB = 0.0;
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
    const effectiveVolA = (state.deckA.eqLow <= 0.01 && state.deckA.eqMid <= 0.01 && state.deckA.eqHigh <= 0.01)
      ? 0
      : state.deckA.volume;

    if (this.gainA) {
      this.gainA.gain.setTargetAtTime(effectiveVolA, now, ramp);
    }
    if (this.lowA) {
      const db = state.deckA.eqLow > 0.005 ? 20 * Math.log10(state.deckA.eqLow) : -70;
      this.lowA.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.midA) {
      const db = state.deckA.eqMid > 0.005 ? 20 * Math.log10(state.deckA.eqMid) : -70;
      this.midA.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.highA) {
      const db = state.deckA.eqHigh > 0.005 ? 20 * Math.log10(state.deckA.eqHigh) : -70;
      this.highA.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.filterA) {
      this.filterA.type = state.deckA.filterType || 'highpass';
      this.filterA.frequency.setTargetAtTime(state.deckA.filterCutoff, now, ramp);
      this.filterA.Q.setTargetAtTime(state.deckA.filterQ, now, ramp);
    }

    // Deck B DSP
    const effectiveVolB = (state.deckB.eqLow <= 0.01 && state.deckB.eqMid <= 0.01 && state.deckB.eqHigh <= 0.01)
      ? 0
      : state.deckB.volume;

    if (this.gainB) {
      this.gainB.gain.setTargetAtTime(effectiveVolB, now, ramp);
    }
    if (this.lowB) {
      const db = state.deckB.eqLow > 0.005 ? 20 * Math.log10(state.deckB.eqLow) : -70;
      this.lowB.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.midB) {
      const db = state.deckB.eqMid > 0.005 ? 20 * Math.log10(state.deckB.eqMid) : -70;
      this.midB.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.highB) {
      const db = state.deckB.eqHigh > 0.005 ? 20 * Math.log10(state.deckB.eqHigh) : -70;
      this.highB.gain.setTargetAtTime(db, now, ramp);
    }
    if (this.filterB) {
      this.filterB.type = state.deckB.filterType || 'lowpass';
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
