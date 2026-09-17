import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PerformanceModeSelector from './PerformanceModeSelector';

describe('PerformanceModeSelector Accessibility & UX', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToString(
      <PerformanceModeSelector isOpen={false} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders dialog with ARIA accessibility attributes when open', () => {
    const html = renderToString(
      <PerformanceModeSelector isOpen={true} onClose={() => {}} />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="perf-modal-title"');
    expect(html).toContain('id="perf-modal-title"');
    expect(html).toContain('System-Performance &amp; Grafik-Skalierung');
  });

  it('renders profile selection buttons with aria-pressed state', () => {
    const html = renderToString(
      <PerformanceModeSelector isOpen={true} onClose={() => {}} />
    );

    expect(html).toContain('aria-pressed=');
    expect(html).toContain('Auto-Erkennung (Empfohlen)');
    expect(html).toContain('Ultra Performance (High-End PC)');
    expect(html).toContain('Ausgewogen (Standard Laptop)');
    expect(html).toContain('Stromsparmodus (Akku / Ältere Geräte)');
  });

  it('includes close button with aria-label and focus-visible styling', () => {
    const html = renderToString(
      <PerformanceModeSelector isOpen={true} onClose={() => {}} />
    );

    expect(html).toContain('aria-label="Close graphics performance settings"');
    expect(html).toContain('focus-visible:ring-2');
  });
});
