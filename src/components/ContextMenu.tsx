import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string;
  shortcut?: string;
  badge?: string;
  badgeColor?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

export type ContextMenuItemOrDivider = ContextMenuItem | 'divider';

interface ContextMenuProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: ContextMenuItemOrDivider[];
}

export default function ContextMenu({
  x,
  y,
  isOpen,
  onClose,
  title,
  subtitle,
  items,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x, y });

  // Clamp position within viewport boundaries
  useLayoutEffect(() => {
    if (!isOpen) return;

    const menuEl = menuRef.current;
    const menuWidth = menuEl ? menuEl.offsetWidth : 220;
    const menuHeight = menuEl ? menuEl.offsetHeight : 280;

    const padding = 8;
    const maxX = window.innerWidth - menuWidth - padding;
    const maxY = window.innerHeight - menuHeight - padding;

    const clampedX = Math.max(padding, Math.min(x, maxX));
    const clampedY = Math.max(padding, Math.min(y, maxY));

    setPos({ x: clampedX, y: clampedY });
  }, [x, y, isOpen, items]);

  // Handle outside click, Escape, and scroll
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className="fixed z-50 min-w-[210px] max-w-[320px] bg-[#12141C]/95 backdrop-blur-xl border border-[#2E3445] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.7)] p-1.5 select-none text-gray-200 animate-in fade-in zoom-in-95 duration-100 focus:outline-none"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {(title || subtitle) && (
        <div className="px-3 py-2 border-b border-[#242936] mb-1">
          {title && (
            <div className="text-xs font-bold text-white tracking-wide truncate">
              {title}
            </div>
          )}
          {subtitle && (
            <div className="text-[10px] font-mono text-gray-400 truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {items.map((item, idx) => {
          if (item === 'divider' || item.divider) {
            return (
              <div
                key={`divider-${idx}`}
                className="my-1 border-t border-[#242936]"
              />
            );
          }

          const Icon = item.icon;
          const isDisabled = Boolean(item.disabled);

          return (
            <button
              key={item.id || `item-${idx}`}
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                if (item.onClick) item.onClick();
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs font-medium transition-all group/item text-left ${
                isDisabled
                  ? 'opacity-40 cursor-not-allowed text-gray-500'
                  : item.danger
                  ? 'text-red-400 hover:bg-red-500/20 hover:text-red-300'
                  : 'text-gray-300 hover:text-white hover:bg-[#1C202B] active:scale-[0.99]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                {Icon && (
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      item.danger
                        ? 'text-red-400 group-hover/item:text-red-300'
                        : item.iconColor || 'text-cyan-400 group-hover/item:text-cyan-300'
                    }`}
                  />
                )}
                <span className="truncate">{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.badge && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                      item.badgeColor || 'bg-[#242936] text-gray-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {item.shortcut && (
                  <span className="text-[10px] font-mono text-gray-500 group-hover/item:text-gray-400">
                    {item.shortcut}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
