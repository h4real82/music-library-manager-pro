/**
 * Adaptive System Performance Scaling Engine
 * Automatically benchmarks host CPU cores, GPU/FPS, memory, and audio context latency
 * to dynamically tune UI rendering, waveform canvas granularity, spectral FFT size, and CSS effects.
 */

export type PerformanceProfileMode = 'auto' | 'ultra' | 'balanced' | 'power-saver';

export interface PerformanceMetrics {
  cores: number;
  memoryGb: number;
  measuredFps: number;
  gpuTier: 'high' | 'mid' | 'low';
  audioSampleRate: number;
  isBatteryPower: boolean;
}

export interface RenderConfig {
  profile: 'ultra' | 'balanced' | 'power-saver';
  targetFps: number;
  waveformSliceGranularity: number; // e.g. 320 (ultra), 160 (balanced), 80 (power-saver)
  fftSize: number; // e.g. 2048 (ultra), 1024 (balanced), 512 (power-saver)
  enableGlowEffects: boolean;
  enableGlassmorphismBlur: boolean;
  spectrumCanvasFps: number;
  vuMeterUpdateIntervalMs: number;
}

class SystemPerformanceEngine {
  private mode: PerformanceProfileMode = 'auto';
  private metrics: PerformanceMetrics = {
    cores: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
    memoryGb: typeof navigator !== 'undefined' ? ((navigator as any).deviceMemory || 8) : 8,
    measuredFps: 60,
    gpuTier: 'high',
    audioSampleRate: 48000,
    isBatteryPower: false
  };

  private listeners: Set<(config: RenderConfig) => void> = new Set();
  private currentConfig: RenderConfig = {
    profile: 'ultra',
    targetFps: 60,
    waveformSliceGranularity: 320,
    fftSize: 2048,
    enableGlowEffects: true,
    enableGlassmorphismBlur: true,
    spectrumCanvasFps: 60,
    vuMeterUpdateIntervalMs: 16
  };

  constructor() {
    this.loadSavedMode();
    this.benchmarkSystem();
  }

  private loadSavedMode() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('dj_app_perf_mode');
        if (saved && ['auto', 'ultra', 'balanced', 'power-saver'].includes(saved)) {
          this.mode = saved as PerformanceProfileMode;
        }
      } catch {}
    }
  }

  public setMode(newMode: PerformanceProfileMode) {
    this.mode = newMode;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('dj_app_perf_mode', newMode);
      } catch {}
    }
    this.recalculateConfig();
  }

  public getMode(): PerformanceProfileMode {
    return this.mode;
  }

  public getConfig(): RenderConfig {
    return this.currentConfig;
  }

  public getMetrics(): PerformanceMetrics {
    return this.metrics;
  }

  public subscribe(callback: (config: RenderConfig) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentConfig);
    return () => this.listeners.delete(callback);
  }

  private benchmarkSystem() {
    if (typeof window === 'undefined') return;

    // Check battery status if supported
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.metrics.isBatteryPower = !battery.charging;
        battery.addEventListener('chargingchange', () => {
          this.metrics.isBatteryPower = !battery.charging;
          this.recalculateConfig();
        });
      }).catch(() => {});
    }

    // FPS benchmark over 30 frames
    let frames = 0;
    let startTime = performance.now();

    const checkFps = () => {
      frames++;
      const elapsed = performance.now() - startTime;
      if (elapsed >= 1000) {
        this.metrics.measuredFps = Math.round((frames * 1000) / elapsed);
        if (this.metrics.measuredFps < 40) {
          this.metrics.gpuTier = 'low';
        } else if (this.metrics.measuredFps < 55) {
          this.metrics.gpuTier = 'mid';
        } else {
          this.metrics.gpuTier = 'high';
        }
        this.recalculateConfig();
      } else {
        requestAnimationFrame(checkFps);
      }
    };

    requestAnimationFrame(checkFps);
  }

  private recalculateConfig() {
    let resolvedProfile: 'ultra' | 'balanced' | 'power-saver' = 'ultra';

    if (this.mode === 'auto') {
      // Auto detection logic
      const isLowCore = this.metrics.cores <= 2;
      const isLowMem = this.metrics.memoryGb <= 4;
      const isLowFps = this.metrics.measuredFps < 45;

      if (isLowCore || isLowMem || isLowFps || (this.metrics.isBatteryPower && isLowFps)) {
        resolvedProfile = 'power-saver';
      } else if (this.metrics.cores <= 4 || this.metrics.memoryGb <= 8 || this.metrics.gpuTier === 'mid') {
        resolvedProfile = 'balanced';
      } else {
        resolvedProfile = 'ultra';
      }
    } else {
      resolvedProfile = this.mode;
    }

    switch (resolvedProfile) {
      case 'ultra':
        this.currentConfig = {
          profile: 'ultra',
          targetFps: 60,
          waveformSliceGranularity: 320,
          fftSize: 2048,
          enableGlowEffects: true,
          enableGlassmorphismBlur: true,
          spectrumCanvasFps: 60,
          vuMeterUpdateIntervalMs: 16
        };
        break;

      case 'balanced':
        this.currentConfig = {
          profile: 'balanced',
          targetFps: 45,
          waveformSliceGranularity: 160,
          fftSize: 1024,
          enableGlowEffects: true,
          enableGlassmorphismBlur: false,
          spectrumCanvasFps: 30,
          vuMeterUpdateIntervalMs: 33
        };
        break;

      case 'power-saver':
        this.currentConfig = {
          profile: 'power-saver',
          targetFps: 30,
          waveformSliceGranularity: 80,
          fftSize: 512,
          enableGlowEffects: false,
          enableGlassmorphismBlur: false,
          spectrumCanvasFps: 20,
          vuMeterUpdateIntervalMs: 66
        };
        break;
    }

    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.currentConfig));
  }
}

export const globalPerformanceEngine = new SystemPerformanceEngine();
