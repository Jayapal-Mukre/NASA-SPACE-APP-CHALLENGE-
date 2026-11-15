import { DEMO_SCENE_CHAPTERS } from '../data/demoStoryboard';

export type NarrationAudioSource =
  | 'gemini-tts-wav'
  | 'browser-speech-fallback'
  | 'custom-audio'
  | 'muted'
  | 'loading';

export class DemoAudioEngine {
  private ctx: AudioContext | null = null;
  private narrationGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private decodedBufferCache = new Map<string, AudioBuffer>();
  private activeNarrationSource: AudioBufferSourceNode | null = null;
  private customAudioEl: HTMLAudioElement | null = null;
  private activeSceneId: string | null = null;

  // Ambient music synth nodes
  private musicActive = false;
  private musicOscillators: OscillatorNode[] = [];
  private chordTimer: number | null = null;

  private narrationVol = 0.92;
  private narrationMuted = false;
  private musicVol = 0.24;
  private musicMuted = false;
  private narrationSourceType: NarrationAudioSource = 'loading';
  private onSourceChange?: (src: NarrationAudioSource) => void;

  constructor(onSourceChange?: (src: NarrationAudioSource) => void) {
    this.onSourceChange = onSourceChange;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.narrationGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.narrationGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this.syncGains();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private syncGains() {
    if (!this.ctx || !this.narrationGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const narGainVal = this.narrationMuted ? 0 : Math.max(0, Math.min(1, this.narrationVol));
    // Ambient music always sits gently underneath voice-over narration
    const musGainVal = this.musicMuted ? 0 : Math.max(0, Math.min(1, this.musicVol)) * 0.22;
    this.narrationGain.gain.setTargetAtTime(narGainVal, now, 0.04);
    this.musicGain.gain.setTargetAtTime(musGainVal, now, 0.08);
  }

  public setNarrationVolume(vol: number) {
    this.narrationVol = vol;
    this.syncGains();
    if (this.customAudioEl) {
      this.customAudioEl.volume = this.narrationMuted ? 0 : vol;
    }
  }

  public setNarrationMuted(muted: boolean) {
    this.narrationMuted = muted;
    this.syncGains();
    if (this.customAudioEl) {
      this.customAudioEl.muted = muted;
    }
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public setMusicVolume(vol: number) {
    this.musicVol = vol;
    this.syncGains();
  }

  public setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    this.syncGains();
  }

  public getSourceType(): NarrationAudioSource {
    return this.narrationSourceType;
  }

  private updateSourceType(src: NarrationAudioSource) {
    this.narrationSourceType = src;
    this.onSourceChange?.(src);
  }

  public startAmbientMusic() {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain || this.musicActive) return;
    this.musicActive = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;
    filter.Q.value = 0.7;
    filter.connect(this.musicGain);

    // Warm D-minor 9th -> Fmaj7 -> Gm7 -> A7sus4 orbital documentary chord progression
    const chords = [
      [146.83, 220.0, 261.63, 329.63], // Dm9
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 233.08, 293.66, 349.23], // Gm7
      [164.81, 220.0, 293.66, 329.63], // Asus4/E
    ];

    const oscs: OscillatorNode[] = [];
    chords[0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.detune.setValueAtTime((i - 1.5) * 4.5, ctx.currentTime);

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = i === 0 ? 0.24 : 0.14;
      osc.connect(voiceGain);
      voiceGain.connect(filter);
      osc.start();
      oscs.push(osc);
    });

    this.musicOscillators = oscs;
    let chordIdx = 0;
    this.chordTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicActive) return;
      chordIdx = (chordIdx + 1) % chords.length;
      const chord = chords[chordIdx];
      this.musicOscillators.forEach((osc, idx) => {
        osc.frequency.setTargetAtTime(chord[idx], this.ctx!.currentTime, 1.4);
      });
    }, 6000);
  }

  public stopAmbientMusic() {
    this.musicActive = false;
    if (this.chordTimer !== null) {
      window.clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    this.musicOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore stopped oscillator
      }
    });
    this.musicOscillators = [];
  }

  public playTransitionChime() {
    if (this.musicMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    const now = ctx.currentTime;
    const freqs = [587.33, 880.0];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.075);
      gain.gain.setValueAtTime(0.0001, now + i * 0.075);
      gain.gain.linearRampToValueAtTime(0.14, now + i * 0.075 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.075 + 0.36);
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(now + i * 0.075);
      osc.stop(now + i * 0.075 + 0.4);
    });
  }

  public stopNarration() {
    if (this.activeNarrationSource) {
      try {
        this.activeNarrationSource.stop();
        this.activeNarrationSource.disconnect();
      } catch {
        // Ignore
      }
      this.activeNarrationSource = null;
    }
    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public async prewarmBrowserCache(sceneIds: string[]) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    for (const id of sceneIds) {
      if (this.decodedBufferCache.has(id)) continue;
      try {
        const res = await fetch(`/api/demo/audio/${encodeURIComponent(id)}`);
        if (!res.ok) break; // Don't spam if server TTS unavailable
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        this.decodedBufferCache.set(id, decoded);
      } catch {
        break;
      }
    }
  }

  public async playSceneNarration(
    sceneId: string,
    offsetWithinSceneSec = 0,
    customNarrationUrl?: string
  ): Promise<void> {
    this.stopNarration();
    this.activeSceneId = sceneId;

    if (this.narrationMuted) {
      this.updateSourceType('muted');
      return;
    }

    const scene = DEMO_SCENE_CHAPTERS.find((s) => s.id === sceneId);
    if (!scene) return;

    // Optional Administrator-uploaded custom audio track
    if (customNarrationUrl && customNarrationUrl.trim()) {
      try {
        const el = this.customAudioEl || new Audio();
        el.src = customNarrationUrl.trim();
        el.volume = this.narrationVol;
        el.muted = this.narrationMuted;
        el.currentTime = Math.max(0, scene.startSec + offsetWithinSceneSec);
        await el.play();
        this.customAudioEl = el;
        this.updateSourceType('custom-audio');
        return;
      } catch {
        // Fall through to Gemini TTS
      }
    }

    const ctx = this.ensureContext();
    if (ctx && this.narrationGain) {
      this.updateSourceType('loading');
      try {
        let buffer = this.decodedBufferCache.get(scene.id);
        if (!buffer) {
          const res = await fetch(`/api/demo/audio/${encodeURIComponent(scene.id)}`);
          if (!res.ok) {
            throw new Error(`TTS HTTP ${res.status}`);
          }
          const arr = await res.arrayBuffer();
          buffer = await ctx.decodeAudioData(arr.slice(0));
          this.decodedBufferCache.set(scene.id, buffer);
        }

        // Guard against user scrubbing to a different scene while awaiting fetch
        if (this.activeSceneId !== scene.id || this.narrationMuted) return;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.narrationGain);
        const safeOffset = Math.min(Math.max(0, offsetWithinSceneSec), Math.max(0, buffer.duration - 0.5));
        src.start(0, safeOffset);
        this.activeNarrationSource = src;
        this.updateSourceType('gemini-tts-wav');
        return;
      } catch {
        // Fall back honestly to Web Speech API synthesis if Gemini TTS endpoint is unavailable
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && this.activeSceneId === scene.id) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(scene.narrationScript);
        utter.rate = 0.96;
        utter.pitch = 0.98;
        utter.volume = this.narrationMuted ? 0 : this.narrationVol;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => v.lang.startsWith('en') && /natural|google|samantha|daniel/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith('en'));
        if (preferred) utter.voice = preferred;
        window.speechSynthesis.speak(utter);
        this.updateSourceType('browser-speech-fallback');
      } catch {
        // Silent browser environment fallback
      }
    }
  }

  public dispose() {
    this.stopNarration();
    this.stopAmbientMusic();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
