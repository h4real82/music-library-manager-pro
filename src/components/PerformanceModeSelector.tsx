import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Gauge, BatteryCharging, Check, ShieldAlert, Monitor, Sparkles, X } from 'lucide-react';
import { globalPerformanceEngine, PerformanceProfileMode, RenderConfig, PerformanceMetrics } from '../lib/performanceEngine';

interface PerformanceModeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PerformanceModeSelector({ isOpen, onClose }: PerformanceModeSelectorProps) {
  const [mode, setMode] = useState<PerformanceProfileMode>(() => globalPerformanceEngine.getMode());
  const [config, setConfig] = useState<RenderConfig>(() => globalPerformanceEngine.getConfig());
  const [metrics, setMetrics] = useState<PerformanceMetrics>(() => globalPerformanceEngine.getMetrics());

  useEffect(() => {
    const unsubscribe = globalPerformanceEngine.subscribe((newCfg) => {
      setConfig(newCfg);
      setMetrics(globalPerformanceEngine.getMetrics());
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const handleSelectMode = (newMode: PerformanceProfileMode) => {
    setMode(newMode);
    globalPerformanceEngine.setMode(newMode);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#12151D] border border-[#2A3245] rounded-2xl w-full max-w-xl shadow-[0_16px_64px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#0A0C10] border-b border-[#242936] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">System-Performance & Grafik-Skalierung</h3>
              <p className="text-[11px] text-gray-400">Passe die Anwendungsleistung dynamisch an deine System-Hardware an</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real-time Hardware Diagnostics */}
        <div className="p-6 space-y-5">
          <div className="bg-[#0A0C10] border border-[#242936] rounded-xl p-3.5 flex items-center justify-around gap-2 text-center text-xs font-mono">
            <div>
              <span className="text-gray-500 block text-[10px] uppercase">FPS Benchmark</span>
              <span className="text-emerald-400 font-bold text-sm">{metrics.measuredFps} FPS</span>
            </div>
            <div className="h-6 w-px bg-[#242936]" />
            <div>
              <span className="text-gray-500 block text-[10px] uppercase">CPU Cores</span>
              <span className="text-cyan-400 font-bold text-sm">{metrics.cores} Kerne</span>
            </div>
            <div className="h-6 w-px bg-[#242936]" />
            <div>
              <span className="text-gray-500 block text-[10px] uppercase">System RAM</span>
              <span className="text-purple-400 font-bold text-sm">{metrics.memoryGb} GB</span>
            </div>
            <div className="h-6 w-px bg-[#242936]" />
            <div>
              <span className="text-gray-500 block text-[10px] uppercase">Aktiv. Profil</span>
              <span className={`font-bold text-xs uppercase px-2 py-0.5 rounded border ${
                config.profile === 'ultra' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' :
                config.profile === 'balanced' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {config.profile}
              </span>
            </div>
          </div>

          {/* Profile Selection Grid */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">Leistungsprofile wählen:</span>
            
            {/* 1. AUTO DETECT */}
            <button
              onClick={() => handleSelectMode('auto')}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                mode === 'auto'
                  ? 'bg-purple-900/30 border-purple-500/80 shadow-[0_0_20px_rgba(168,85,247,0.2)] text-white'
                  : 'bg-[#161920] border-[#242936] text-gray-400 hover:text-white hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">Auto-Erkennung (Empfohlen)</span>
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">SMART</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Analysiert Hardware-Power & Akkulaufzeit automatisch für optimale Performance</p>
                </div>
              </div>
              {mode === 'auto' && <Check className="w-5 h-5 text-purple-400" />}
            </button>

            {/* 2. ULTRA PERFORMANCE */}
            <button
              onClick={() => handleSelectMode('ultra')}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                mode === 'ultra'
                  ? 'bg-cyan-900/30 border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.2)] text-white'
                  : 'bg-[#161920] border-[#242936] text-gray-400 hover:text-white hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">Ultra Performance (High-End PC)</span>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">60 FPS</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Maximale 320-Slice Wellenform-Präzision, FFT 2048, leuchtende Glüh- & Glaseffekte</p>
                </div>
              </div>
              {mode === 'ultra' && <Check className="w-5 h-5 text-cyan-400" />}
            </button>

            {/* 3. BALANCED */}
            <button
              onClick={() => handleSelectMode('balanced')}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                mode === 'balanced'
                  ? 'bg-amber-900/30 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.2)] text-white'
                  : 'bg-[#161920] border-[#242936] text-gray-400 hover:text-white hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <Gauge className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">Ausgewogen (Standard Laptop)</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">45 FPS</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Flüssige Visualisierungen mit reduzierter Shader-Belastung und 160 Slices</p>
                </div>
              </div>
              {mode === 'balanced' && <Check className="w-5 h-5 text-amber-400" />}
            </button>

            {/* 4. POWER SAVER */}
            <button
              onClick={() => handleSelectMode('power-saver')}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                mode === 'power-saver'
                  ? 'bg-rose-900/30 border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.2)] text-white'
                  : 'bg-[#161920] border-[#242936] text-gray-400 hover:text-white hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <BatteryCharging className="w-5 h-5 text-rose-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">Stromsparmodus (Akku / Ältere Geräte)</span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold">30 FPS</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">Kompakte 80-Slice Visualisierungen, deaktivierter Glasfilter & minimale Akkubelastung</p>
                </div>
              </div>
              {mode === 'power-saver' && <Check className="w-5 h-5 text-rose-400" />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0A0C10] border-t border-[#242936] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono transition-all shadow-md"
          >
            Übernehmen & Schließen
          </button>
        </div>

      </div>
    </div>
  );
}
