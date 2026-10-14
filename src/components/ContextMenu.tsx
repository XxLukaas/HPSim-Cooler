/**
 * Kontext- und Dropdown-Menüs (mit Tastatursteuerung und Untermenüs).
 */
import { ChevronRight, Check, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ACTION_MAP, isEnabled, runAction } from '../app/actions';

export interface MenuItem {
  label?: string;
  icon?: LucideIcon;
  shortcut?: string;
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
  heading?: string;
  children?: MenuItem[];
  testId?: string;
}

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[]; anchor?: string } | null;
}

export const useMenu = create<MenuState>(() => ({ menu: null }));

export function openMenu(x: number, y: number, items: MenuItem[], anchor?: string): void {
  useMenu.setState({ menu: { x, y, items, anchor } });
}

export function closeMenu(): void {
  useMenu.setState({ menu: null });
}

/** Menüeintrag aus einer registrierten Aktion. */
export function actionItem(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  const a = ACTION_MAP[id];
  if (!a) return { label: id, disabled: true };
  return {
    label: a.label,
    icon: a.icon,
    shortcut: a.shortcut,
    disabled: !isEnabled(id),
    checked: a.checked ? a.checked() : undefined,
    run: () => runAction(id),
    testId: `action-${id}`,
    ...overrides,
  };
}

export const SEP: MenuItem = { separator: true };

function MenuList({ items, x, y, onClose, level = 0 }: { items: MenuItem[]; x: number; y: number; onClose: () => void; level?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [focus, setFocus] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = Math.max(8, level ? x - r.width - 220 : window.innerWidth - r.width - 8);
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y, level]);

  useEffect(() => {
    if (level) return;
    const onKey = (e: KeyboardEvent) => {
      const enabled = items.map((it, i) => (!it.separator && !it.heading && !it.disabled ? i : -1)).filter((i) => i >= 0);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!enabled.length) return;
        const cur = enabled.indexOf(focus);
        const next = e.key === 'ArrowDown' ? enabled[(cur + 1) % enabled.length] : enabled[(cur - 1 + enabled.length) % enabled.length];
        setFocus(next);
      } else if (e.key === 'Enter' && focus >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const it = items[focus];
        if (it?.run && !it.disabled) {
          onClose();
          it.run();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [items, focus, onClose, level]);

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="menu-sep" />;
        if (it.heading) return <div key={i} className="menu-heading">{it.heading}</div>;
        const Icon = it.icon;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            data-testid={it.testId}
            className={`menu-item${focus === i ? ' focused' : ''}${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onMouseEnter={(e) => {
              setFocus(i);
              if (it.children) {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSub({ index: i, x: r.right + 2, y: r.top - 5 });
              } else setSub(null);
            }}
            onClick={() => {
              if (it.children) return;
              onClose();
              it.run?.();
            }}
          >
            <span className="menu-icon">{it.checked ? <Check size={15} /> : Icon ? <Icon size={15} /> : null}</span>
            <span className="menu-label">{it.label}</span>
            {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
            {it.children && <ChevronRight size={14} className="muted" />}
          </button>
        );
      })}
      {sub && items[sub.index]?.children && (
        <MenuList items={items[sub.index].children!} x={sub.x} y={sub.y} onClose={onClose} level={level + 1} />
      )}
    </div>
  );
}

export function MenuHost() {
  const menu = useMenu((s) => s.menu);
  useEffect(() => {
    if (!menu) return;
    const close = () => closeMenu();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);
  if (!menu) return null;
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={closeMenu} />;
}
