import React, { useState } from 'react';
import { SlidersHorizontal, RotateCcw, Zap, Target, Gauge } from 'lucide-react';

interface DjFiltersProps {
  bpmRange: [number, number];
  onBpmRangeChange: (range: [number, number]) => void;
  energyRange: [number, number];
  onEnergyRangeChange: (range: [number, number]) => void;
  className?: string;
}

const BPM_PRESETS: { label: string; range: [number, number]; sub: string }[] = [
  { label: 'All', range: [60, 200], sub: '60-200' },
  { label: 'Warmup', range: [110, 122], sub: '110-122' },
  { label: 'House', range: [122, 127], sub: '122-127' },
  { label: 'Techno', range: [127, 134], sub: '127-134' },
  { label: 'Peak', range: [134, 142], sub: '134-142' },
  { label: 'Fast', range: [142, 200], sub: '142+' },
];

const ENERGY_PRESETS: { label: string; range: [number, number]; color: string }[] = [
  { label: 'All', range: [0, 10], color: '#A855F7' },
  { label: '1-3 Intro', range: [1, 3], color: '#06B6D4' },
  { label: '4-6 Groove', range: [4, 6], color: '#22C55E' },
  { label: '7-8 Drive', range: [7, 8], color: '#F59E0B' },
  { label: '9-10 Peak', range: [9, 10], color: '#F43F5E' },
];

// 10 Color gradient for energy levels 1 to 10
const ENERGY_COLORS = [
  '#06B6D4', // 1 - Cyan
  '#0EA5E9', // 2 - Sky
  '#3B82F6', // 3 - Blue
  '#10B981', // 4 - Emerald
  '#22C55E', // 5 - Green
  '#EAB308', // 6 - Yellow
  '#F59E0B', // 7 - Amber
  '#F97316', // 8 - Orange
  '#EC4899', // 9 - Pink
  '#F43F5E', // 10 - Rose
];

export default function DjFilters({
  bpmRange,
  onBpmRangeChange,
  energyRange,
  onEnergyRangeChange,
  className = '',
}: DjFiltersProps) {
  const [bpmMode, setBpmMode] = useState<'presets' | 'target'>('presets');
  const [targetBpm, setTargetBpm] = useState<number>(128);
  const [targetTolerancePct, setTargetTolerancePct] = useState<number>(4); // +/- 4%

  const isBpmFiltered = bpmRange[0] > 60 || bpmRange[1] < 200;
  const isEnergyFiltered = energyRange[0] > 0 || energyRange[1] < 10;

  const handleResetBpm = () => {
    onBpmRangeChange([60, 200]);
  };

  const handleResetEnergy = () => {
    onEnergyRangeChange([0, 10]);
  };

  const handleTargetToleranceApply = (bpm: number, tolerancePct: number) => {
    setTargetBpm(bpm);
    setTargetTolerancePct(tolerancePct);
    const delta = Math.round(bpm * (tolerancePct / 100));
    const min = Math.max(60, bpm - delta);
    const max = Math.min(200, bpm + delta);
    onBpmRangeChange([min, max]);
  };

  const isCurrentBpmPreset = (range: [number, number]) => {
    return bpmRange[0] === range[0] && bpmRange[1] === range[1];
  };

  const isCurrentEnergyPreset = (range: [number, number]) => {
    return energyRange[0] === range[0] && energyRange[1] === range[1];
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#A855F7]" />
          DJ Filters
        </h3>

        {(isBpmFiltered || isEnergyFiltered) && (
          <button
            onClick={() => {
              handleResetBpm();
              handleResetEnergy();
            }}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors bg-[#0D0E12] px-2 py-0.5 rounded border border-[#242936]"
            title="Alle Filter zurücksetzen"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* BPM FILTER SECTION */}
      <div className="bg-[#12141a] p-3 rounded-xl border border-[#242936] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3 h-3 text-[#22C55E]" />
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">BPM Tempo</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-bold text-[#22C55E] bg-[#0D0E12] px-2 py-0.5 rounded border border-[#242936]">
              {isBpmFiltered ? `${bpmRange[0]} - ${bpmRange[1]}` : '60 - 200 (Alle)'}
            </span>
            {isBpmFiltered && (
              <button
                onClick={handleResetBpm}
                className="text-gray-500 hover:text-white p-0.5"
                title="BPM Filter zurücksetzen"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Mode Toggle: Presets vs Target Pitch */}
        <div className="flex bg-[#0D0E12] p-0.5 rounded-lg border border-[#242936] mb-2.5">
          <button
            onClick={() => setBpmMode('presets')}
            className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
              bpmMode === 'presets'
                ? 'bg-[#242936] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Genres / Brackets
          </button>
          <button
            onClick={() => setBpmMode('target')}
            className={`flex-1 py-1 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${
              bpmMode === 'target'
                ? 'bg-[#242936] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Target className="w-2.5 h-2.5 text-[#22C55E]" />
            <span>Target ± Pitch</span>
          </button>
        </div>

        {bpmMode === 'presets' ? (
          /* BPM Presets Grid */
          <div className="grid grid-cols-3 gap-1.5">
            {BPM_PRESETS.map((p) => {
              const active = isCurrentBpmPreset(p.range);
              return (
                <button
                  key={p.label}
                  onClick={() => onBpmRangeChange(p.range)}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all border ${
                    active
                      ? 'bg-[#22C55E]/15 border-[#22C55E] text-white font-bold shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                      : 'bg-[#0D0E12] border-[#242936] text-gray-400 hover:text-white hover:border-gray-500'
                  }`}
                >
                  <div className="text-[10px] leading-tight font-medium">{p.label}</div>
                  <div className="text-[9px] font-mono text-gray-500 leading-tight">{p.sub}</div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Target BPM + Pitch Tolerance */
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono shrink-0">BPM:</span>
              <input
                type="number"
                min="60"
                max="200"
                value={targetBpm}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    handleTargetToleranceApply(val, targetTolerancePct);
                  }
                }}
                className="w-16 bg-[#0D0E12] border border-[#242936] focus:border-[#22C55E] rounded px-2 py-1 text-xs font-mono text-white text-center outline-none"
              />
              <div className="flex items-center gap-1 flex-1">
                {[2, 4, 8, 16].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleTargetToleranceApply(targetBpm, pct)}
                    className={`flex-1 py-1 rounded text-[10px] font-mono font-bold transition-all border ${
                      targetTolerancePct === pct && isBpmFiltered
                        ? 'bg-[#22C55E]/20 border-[#22C55E] text-[#22C55E]'
                        : 'bg-[#0D0E12] border-[#242936] text-gray-400 hover:text-white'
                    }`}
                  >
                    ±{pct}%
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[9px] font-mono text-gray-500 text-center">
              Fokus auf {targetBpm} BPM ({bpmRange[0]} - {bpmRange[1]} BPM)
            </div>
          </div>
        )}

        {/* Custom manual stepper inputs */}
        <div className="mt-2.5 pt-2 border-t border-[#242936] flex items-center justify-between text-[10px] text-gray-400 font-mono">
          <span>Min:</span>
          <input
            type="number"
            min="60"
            max={bpmRange[1]}
            value={bpmRange[0]}
            onChange={(e) => {
              const min = Math.max(60, Math.min(parseInt(e.target.value, 10) || 60, bpmRange[1]));
              onBpmRangeChange([min, bpmRange[1]]);
            }}
            className="w-12 bg-[#0D0E12] border border-[#242936] rounded px-1 text-center text-white"
          />
          <span className="text-gray-600">—</span>
          <span>Max:</span>
          <input
            type="number"
            min={bpmRange[0]}
            max="200"
            value={bpmRange[1]}
            onChange={(e) => {
              const max = Math.min(200, Math.max(parseInt(e.target.value, 10) || 200, bpmRange[0]));
              onBpmRangeChange([bpmRange[0], max]);
            }}
            className="w-12 bg-[#0D0E12] border border-[#242936] rounded px-1 text-center text-white"
          />
        </div>
      </div>

      {/* ENERGY LEVEL FILTER SECTION */}
      <div className="bg-[#12141a] p-3 rounded-xl border border-[#242936] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-[#A855F7]" />
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">Energy Level</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-bold text-[#A855F7] bg-[#0D0E12] px-2 py-0.5 rounded border border-[#242936]">
              {isEnergyFiltered ? `${energyRange[0]} - ${energyRange[1]}` : '1 - 10 (Alle)'}
            </span>
            {isEnergyFiltered && (
              <button
                onClick={handleResetEnergy}
                className="text-gray-500 hover:text-white p-0.5"
                title="Energy Filter zurücksetzen"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* 10-step interactive discrete energy bar */}
        <div className="space-y-1 mb-2.5">
          <div className="flex items-end gap-1 h-7 bg-[#0D0E12] p-1 rounded-lg border border-[#242936]">
            {ENERGY_COLORS.map((col, idx) => {
              const level = idx + 1;
              const isSelected = level >= energyRange[0] && level <= energyRange[1];
              return (
                <button
                  key={level}
                  onClick={() => {
                    // If clicked alone, filter strictly for this energy level; if already this level, reset to all
                    if (energyRange[0] === level && energyRange[1] === level) {
                      onEnergyRangeChange([0, 10]);
                    } else {
                      onEnergyRangeChange([level, level]);
                    }
                  }}
                  className={`flex-1 rounded-sm transition-all relative group flex flex-col justify-end ${
                    isSelected ? 'opacity-100 ring-1 ring-white/50' : 'opacity-25 hover:opacity-75'
                  }`}
                  style={{
                    height: `${(level / 10) * 100}%`,
                    backgroundColor: col,
                    boxShadow: isSelected ? `0 0 8px ${col}` : 'none',
                  }}
                  title={`Level ${level}/10`}
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-black border border-[#242936] text-white text-[9px] font-mono px-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none z-20">
                    {level}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] font-mono text-gray-500 px-0.5">
            <span>1 Chill</span>
            <span>5 Medium</span>
            <span>10 Peak</span>
          </div>
        </div>

        {/* Energy Tier Presets */}
        <div className="grid grid-cols-3 gap-1.5">
          {ENERGY_PRESETS.map((p) => {
            const active = isCurrentEnergyPreset(p.range);
            return (
              <button
                key={p.label}
                onClick={() => onEnergyRangeChange(p.range)}
                className={`py-1 px-1.5 rounded-lg text-center transition-all border text-[10px] font-medium ${
                  active
                    ? 'bg-[#A855F7]/20 border-[#A855F7] text-white font-bold shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                    : 'bg-[#0D0E12] border-[#242936] text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
