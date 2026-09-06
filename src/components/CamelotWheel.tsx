import React from 'react';
import { TrackDef } from '../types';
import { normalizeToCamelot } from '../lib/djMixerLogic';

interface CamelotWheelProps {
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  tracks?: TrackDef[];
  className?: string;
}

// 12 Camelot positions: index 0 is 12 (top / -90 deg), index 1 is 1 (1 o'clock / -60 deg), etc.
const CAMELOT_DATA = [
  { num: 12, major: '12B', minor: '12A', majorNote: 'E', minorNote: 'Dbm', color: '#3B82F6' },
  { num: 1, major: '1B', minor: '1A', majorNote: 'B', minorNote: 'Abm', color: '#06B6D4' },
  { num: 2, major: '2B', minor: '2A', majorNote: 'F#', minorNote: 'Ebm', color: '#0D9488' },
  { num: 3, major: '3B', minor: '3A', majorNote: 'Db', minorNote: 'Bbm', color: '#10B981' },
  { num: 4, major: '4B', minor: '4A', majorNote: 'Ab', minorNote: 'Fm', color: '#84CC16' },
  { num: 5, major: '5B', minor: '5A', majorNote: 'Eb', minorNote: 'Cm', color: '#EAB308' },
  { num: 6, major: '6B', minor: '6A', majorNote: 'Bb', minorNote: 'Gm', color: '#F59E0B' },
  { num: 7, major: '7B', minor: '7A', majorNote: 'F', minorNote: 'Dm', color: '#F97316' },
  { num: 8, major: '8B', minor: '8A', majorNote: 'C', minorNote: 'Am', color: '#EF4444' },
  { num: 9, major: '9B', minor: '9A', majorNote: 'G', minorNote: 'Em', color: '#EC4899' },
  { num: 10, major: '10B', minor: '10A', majorNote: 'D', minorNote: 'Bm', color: '#D946EF' },
  { num: 11, major: '11B', minor: '11A', majorNote: 'A', minorNote: 'F#m', color: '#8B5CF6' }
];

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

function describeArc(x: number, y: number, rInner: number, rOuter: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(x, y, rOuter, endAngle);
  const endOuter = polarToCartesian(x, y, rOuter, startAngle);
  const startInner = polarToCartesian(x, y, rInner, endAngle);
  const endInner = polarToCartesian(x, y, rInner, startAngle);

  const arcSweep = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', startOuter.x, startOuter.y,
    'A', rOuter, rOuter, 0, arcSweep, 0, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', rInner, rInner, 0, arcSweep, 1, startInner.x, startInner.y,
    'Z'
  ].join(' ');
}

export default function CamelotWheel({
  selectedKey,
  onSelectKey,
  tracks = [],
  className = ''
}: CamelotWheelProps) {
  const size = 280;
  const center = size / 2;

  // Track counts per normalized Camelot key
  const keyCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    tracks.forEach(t => {
      const k = normalizeToCamelot(t.key);
      if (k) {
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [tracks]);

  // Normalized selected key (e.g. '10m' or '10A' -> '10A')
  const normalizedSelectedKey = React.useMemo(() => {
    return normalizeToCamelot(selectedKey);
  }, [selectedKey]);

  // Selected item info for center hub
  const selectedInfo = React.useMemo(() => {
    if (!normalizedSelectedKey) return null;
    for (const item of CAMELOT_DATA) {
      if (item.major === normalizedSelectedKey) {
        return { key: item.major, note: `${item.majorNote} Dur (${item.num}d)`, color: item.color, count: keyCounts[item.major] || 0 };
      }
      if (item.minor === normalizedSelectedKey) {
        return { key: item.minor, note: `${item.minorNote} Moll (${item.num}m)`, color: item.color, count: keyCounts[item.minor] || 0 };
      }
    }
    return { key: normalizedSelectedKey, note: '', color: '#A855F7', count: keyCounts[normalizedSelectedKey] || 0 };
  }, [normalizedSelectedKey, keyCounts]);

  const handleSliceClick = (key: string) => {
    if (normalizedSelectedKey === key) {
      onSelectKey(null);
    } else {
      onSelectKey(key);
    }
  };

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <div className="relative w-full max-w-[260px] aspect-square flex items-center justify-center">
        <svg 
          viewBox={`0 0 ${size} ${size}`} 
          className="w-full h-full drop-shadow-[0_0_15px_rgba(0,0,0,0.6)]"
        >
          {/* Subtle Outer Ambient Ring */}
          <circle 
            cx={center} 
            cy={center} 
            r={136} 
            fill="none" 
            stroke="#242936" 
            strokeWidth="1.5" 
            strokeDasharray="2 4"
            className="opacity-40"
          />

          {CAMELOT_DATA.map((item, idx) => {
            const startAngle = idx * 30 - 14.5;
            const endAngle = idx * 30 + 14.5;
            const midAngle = idx * 30;

            const isSelectedMajor = normalizedSelectedKey === item.major;
            const isSelectedMinor = normalizedSelectedKey === item.minor;
            const hasSelection = Boolean(normalizedSelectedKey);

            const majorCount = keyCounts[item.major] || 0;
            const minorCount = keyCounts[item.minor] || 0;

            // Outer Ring: Major (B)
            const outerPath = describeArc(center, center, 92, 132, startAngle, endAngle);
            const outerTextPos = polarToCartesian(center, center, 112, midAngle);

            // Inner Ring: Minor (A)
            const innerPath = describeArc(center, center, 52, 88, startAngle, endAngle);
            const innerTextPos = polarToCartesian(center, center, 70, midAngle);

            return (
              <g key={item.num} className="transition-all duration-200">
                {/* Outer Slice (Major B) */}
                <path
                  d={outerPath}
                  fill={item.color}
                  fillOpacity={
                    isSelectedMajor 
                      ? 1 
                      : hasSelection 
                        ? 0.18 
                        : majorCount > 0 
                          ? 0.65 
                          : 0.35
                  }
                  stroke={isSelectedMajor ? '#FFFFFF' : '#0D0E12'}
                  strokeWidth={isSelectedMajor ? 2.5 : 1.5}
                  onClick={() => handleSliceClick(item.major)}
                  className="cursor-pointer hover:fill-opacity-95 hover:brightness-125 transition-all"
                >
                  <title>{`${item.major} (${item.majorNote} Dur / ${item.num}d) - ${majorCount} Track(s)`}</title>
                </path>

                {/* Major Label */}
                <text
                  x={outerTextPos.x}
                  y={outerTextPos.y + 3.5}
                  textAnchor="middle"
                  fill={isSelectedMajor ? '#FFFFFF' : '#F3F4F6'}
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                >
                  {item.major}
                </text>

                {/* Inner Slice (Minor A) */}
                <path
                  d={innerPath}
                  fill={item.color}
                  fillOpacity={
                    isSelectedMinor 
                      ? 1 
                      : hasSelection 
                        ? 0.18 
                        : minorCount > 0 
                          ? 0.65 
                          : 0.35
                  }
                  stroke={isSelectedMinor ? '#FFFFFF' : '#0D0E12'}
                  strokeWidth={isSelectedMinor ? 2.5 : 1.5}
                  onClick={() => handleSliceClick(item.minor)}
                  className="cursor-pointer hover:fill-opacity-95 hover:brightness-125 transition-all"
                >
                  <title>{`${item.minor} (${item.minorNote} Moll / ${item.num}m) - ${minorCount} Track(s)`}</title>
                </path>

                {/* Minor Label */}
                <text
                  x={innerTextPos.x}
                  y={innerTextPos.y + 3.5}
                  textAnchor="middle"
                  fill={isSelectedMinor ? '#FFFFFF' : '#F3F4F6'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                  className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                >
                  {item.minor}
                </text>
              </g>
            );
          })}

          {/* Center Hub */}
          <circle
            cx={center}
            cy={center}
            r={48}
            fill="#12141A"
            stroke={selectedInfo ? (selectedInfo.color || '#A855F7') : '#242936'}
            strokeWidth={selectedInfo ? 2 : 1.5}
            onClick={() => onSelectKey(null)}
            className="cursor-pointer hover:stroke-[#A855F7] transition-all"
          />

          {/* Center Hub Content */}
          {selectedInfo ? (
            <g 
              onClick={() => onSelectKey(null)} 
              className="cursor-pointer group"
            >
              <text
                x={center}
                y={center - 11}
                textAnchor="middle"
                fill={selectedInfo.color}
                fontSize="16"
                fontWeight="900"
                fontFamily="monospace"
                className="group-hover:scale-105 transition-transform"
              >
                {selectedInfo.key}
              </text>
              <text
                x={center}
                y={center + 5}
                textAnchor="middle"
                fill="#9CA3AF"
                fontSize="9"
                fontFamily="sans-serif"
              >
                {selectedInfo.note ? `${selectedInfo.note} • ${selectedInfo.count} Trk` : `${selectedInfo.count} Tracks`}
              </text>
              <text
                x={center}
                y={center + 19}
                textAnchor="middle"
                fill="#EF4444"
                fontSize="8"
                fontWeight="bold"
                className="opacity-70 group-hover:opacity-100 uppercase tracking-widest"
              >
                ✕ Reset
              </text>
            </g>
          ) : (
            <g 
              onClick={() => onSelectKey(null)} 
              className="cursor-default"
            >
              <text
                x={center}
                y={center - 8}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="10"
                fontWeight="bold"
                letterSpacing="0.08em"
              >
                CAMELOT
              </text>
              <text
                x={center}
                y={center + 6}
                textAnchor="middle"
                fill="#6B7280"
                fontSize="8"
                fontWeight="medium"
              >
                HARMONIC
              </text>
              <text
                x={center}
                y={center + 18}
                textAnchor="middle"
                fill="#A855F7"
                fontSize="8"
                fontWeight="bold"
                className="opacity-80"
              >
                ALLE KEYS
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Helper Legend / Info */}
      <div className="flex items-center justify-between w-full px-2 mt-1 text-[10px] text-gray-500 font-mono">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
          A: Moll (Innen)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]" />
          B: Dur (Außen)
        </span>
      </div>
    </div>
  );
}
