import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ContextMenu, { ContextMenuItemOrDivider } from './ContextMenu';
import { Play, Sliders } from 'lucide-react';

describe('ContextMenu component', () => {
  it('renders context menu items with labels and icons without error', () => {
    const items: ContextMenuItemOrDivider[] = [
      {
        id: 'play',
        label: 'Vorhören',
        icon: Play,
        onClick: vi.fn(),
      },
      'divider',
      {
        id: 'studio',
        label: 'Im Studio öffnen',
        icon: Sliders,
        badge: 'Mix',
        onClick: vi.fn(),
      },
    ];

    const html = renderToString(
      <ContextMenu
        x={100}
        y={150}
        isOpen={true}
        onClose={vi.fn()}
        title="Track Name"
        subtitle="Artist • 126 BPM"
        items={items}
      />
    );

    expect(html).toContain('Track Name');
    expect(html).toContain('Artist • 126 BPM');
    expect(html).toContain('Vorhören');
    expect(html).toContain('Im Studio öffnen');
  });

  it('renders null when isOpen is false', () => {
    const html = renderToString(
      <ContextMenu
        x={100}
        y={150}
        isOpen={false}
        onClose={vi.fn()}
        items={[]}
      />
    );

    expect(html).toBe('');
  });
});
