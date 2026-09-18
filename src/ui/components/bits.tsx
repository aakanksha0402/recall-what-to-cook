import type { CSSProperties, ReactNode } from 'react';
import { BackIcon } from './icons';
import { useNav } from '../context';

export function Kicker({ children, warn, ink, style }: { children: ReactNode; warn?: boolean; ink?: boolean; style?: CSSProperties }) {
  return (
    <div className={`k${warn ? ' k-warn' : ''}${ink ? ' k-ink' : ''}`} style={{ marginBottom: 8, ...style }}>
      {children}
    </div>
  );
}

export function Chip({
  children,
  on,
  onClick,
  onLongPress,
  neutral,
  muted,
  title,
}: {
  children: ReactNode;
  on?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  neutral?: boolean;
  muted?: boolean;
  title?: string;
}) {
  const cls = neutral ? 'tag-neutral' : on ? 'tag-accent' : muted ? 'tag-outline-muted' : 'tag-outline';
  let timer: number | null = null;
  const start = () => {
    if (!onLongPress) return;
    timer = window.setTimeout(() => {
      timer = null;
      onLongPress();
    }, 550);
  };
  const cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };
  return (
    <span
      className={`tag ${cls}${onClick ? ' row' : ''}`}
      onClick={onClick}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => onLongPress && e.preventDefault()}
      title={title}
    >
      {children}
    </span>
  );
}

export function BackButton({ onClick }: { onClick?: () => void }) {
  const nav = useNav();
  return (
    <button type="button" className="back" onClick={onClick ?? nav.back}>
      <BackIcon />
      Back
    </button>
  );
}

export function DishRow({ name, meta, onClick, size = 19, mutedName }: { name: string; meta?: string; onClick?: () => void; size?: number; mutedName?: boolean }) {
  return (
    <div className={onClick ? 'row' : ''} onClick={onClick}>
      <div className={`dsh${mutedName ? ' mut' : ''}`} style={{ fontSize: size }}>
        {name}
      </div>
      {meta && <div className="mut meta">{meta}</div>}
    </div>
  );
}

export function PlateNumeral({ value, size = 34 }: { value: string | number; size?: number }) {
  const v = String(value);
  return (
    <div className="cmyk-num dsh" style={{ fontSize: size }}>
      <span className="paper">{v}</span>
      <span className="plate plate-c" aria-hidden="true">
        {v}
      </span>
      <span className="plate plate-m" aria-hidden="true">
        {v}
      </span>
      <span className="plate plate-y" aria-hidden="true">
        {v}
      </span>
    </div>
  );
}

export function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="between" style={{ marginBottom: 16 }}>
            <div className="dsh" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>
              {title}
            </div>
            <button type="button" className="link" style={{ fontSize: 13 }} onClick={onClose}>
              Done
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty">
      <div className="dsh">{title}</div>
      {body && (
        <p className="mut" style={{ fontSize: 13 }}>
          {body}
        </p>
      )}
      {action && (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
