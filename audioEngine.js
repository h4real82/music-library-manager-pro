// Globale Instanz komplett außerhalb von React – blockiert niemals den Ton
export const djAudioEngine = typeof window !== 'undefined' ? new Audio() : null;
if (djAudioEngine) {
  djAudioEngine.volume = 0.8;
}

// Generiert die ultra-feine Aurora-Wellenform aus dem Screenshot
export function drawAuroraWaveform(canvas, duration, currentTime) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // 1. Hintergrund-Glow (Energie-Aura)
  ctx.shadowBlur = 20;
  ctx.shadowColor = 'rgba(168, 85, 247, 0.4)';
  
  // 2. Horizontaler Farbverlauf von Pink nach Cyan (wie im Screenshot)
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#f43f5e'); // Neon Pink (Hohe Energie)
  gradient.addColorStop(0.4, '#a855f7'); // Violett
  gradient.addColorStop(1, '#06b6d4'); // Cyan (Leise/Melodisch)
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  
  // 3. Ultra-feines, hochfrequentes Linien-Grid zeichnen
  const lineCount = 180;
  const playheadX = duration > 0 ? (currentTime / duration) * w : 0;
  
  for (let i = 0; i < lineCount; i++) {
    const x = (i / lineCount) * w;
    
    // Simuliere Peaks: In der Mitte (Drop) höher, am Rand flacher
    const distanceFromCenter = Math.abs(i - lineCount / 3);
    const baseAmp = Math.sin((i / lineCount) * Math.PI) * 0.4;
    const peakSim = Math.random() > 0.85 ? 0.4 : 0.1; // Zufällige laute Ausschläge
    const amplitude = (baseAmp + peakSim) * (1 - distanceFromCenter / lineCount) * (h * 0.8);
    
    // Wenn der Part hinter dem Playhead liegt, dezent abdunkeln
    ctx.globalAlpha = x < playheadX ? 1.0 : 0.4;
    
    ctx.beginPath();
    ctx.moveTo(x, h / 2 - amplitude / 2);
    ctx.lineTo(x, h / 2 + amplitude / 2);
    ctx.stroke();
  }
}
