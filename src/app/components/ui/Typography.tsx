/**
 * Typography.tsx — Centralized font/text components for the game UI.
 *
 * Rules:
 *  - Font: Roboto Condensed for everything.
 *  - NormalText  — small plain white (info labels, values, etc.)
 *  - MenuText    — larger+bold (bottom-nav tab labels, section headers)
 *  - ButtonText  — medium (building labels, action buttons)
 *
 * All variants default to white with a black pixel-stroke shadow so
 * they read over any background. Pass `style` to override anything.
 */

import React from 'react';

const BASE_FONT = "'Roboto Condensed', sans-serif";

// ─── stroke shadow helper ──────────────────────────────────────────────────────
const BLACK_STROKE =
  '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';

// ─── Shared base props ────────────────────────────────────────────────────────
type TextProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  as?: 'span' | 'div' | 'p';
};

// ─────────────────────────────────────────────────────────────────────────────
// NormalText — plain white info text (values, descriptions, timestamps)
// ─────────────────────────────────────────────────────────────────────────────
export function NormalText({ children, style, className, as: Tag = 'span' }: TextProps) {
  return (
    <Tag
      className={className}
      style={{
        fontFamily: BASE_FONT,
        fontSize: 'clamp(9px, 1.4vw, 12px)',
        fontWeight: 600,
        color: '#ffffff',
        letterSpacing: '0.06em',
        textShadow: BLACK_STROKE,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MenuText — bold, used for bottom-nav tab labels, section headers
// ─────────────────────────────────────────────────────────────────────────────
export function MenuText({ children, style, className, as: Tag = 'span' }: TextProps) {
  return (
    <Tag
      className={className}
      style={{
        fontFamily: BASE_FONT,
        fontSize: 'clamp(12px, 2vw, 16.5px)',
        fontWeight: 700,
        color: '#ffffff',
        letterSpacing: '0.15em',
        textShadow: `${BLACK_STROKE}, 0 1px 6px rgba(0,0,0,0.8)`,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ButtonText — medium, used for building labels, action button captions
// ─────────────────────────────────────────────────────────────────────────────
export function ButtonText({ children, style, className, as: Tag = 'span' }: TextProps) {
  return (
    <Tag
      className={className}
      style={{
        fontFamily: BASE_FONT,
        fontSize: 'clamp(8px, 1.6vw, 13px)',
        fontWeight: 700,
        color: '#ffffff',
        letterSpacing: '0.14em',
        textShadow: `${BLACK_STROKE}, 0 1px 4px rgba(0,0,0,0.7)`,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
