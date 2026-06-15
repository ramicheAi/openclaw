// Themis icon family — 24×24 inline SVG.
//
// Construction rules (per design handoff §13):
//   • 24×24 viewBox, 1.6 stroke, rounded caps + joins, no fills unless solid
//     by design.
//   • Strict 90° geometry for stable elements; −7° for anything communicating
//     weight/imbalance (matches the Tau crossbar).
//   • No decorative flourishes. Geometric primitives only.
//
// Color rules:
//   • Default brass for navigation + primary actions
//   • Semantic only when the icon IS the meaning:
//       verify-green = verified/check
//       flag-amber   = pending/lock/privilege
//       danger       = hot
//   • Never colorize a navigation icon — semantic palette is reserved for state.
//
// Roster (22): doc · brain · scales · verified · pending · privileged · search
// · chron · entity · binder · cite · copy · export · hot · replay
// · pause · arrow · close · add · cmdk · ask · arc

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  size?: number;
  title?: string;
}

function Icon({ size = 24, title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconDoc(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </Icon>
  );
}

// The Tau-as-icon, used for brain mode + brand chrome.
export function IconBrain(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx={12} cy={12} r={9} />
      <path d="M8.5 8.5c1.2-1 2.5-1 3.5 0s2.3 1 3.5 0" />
      <path d="M7 13c1.5-1 3-1 5 .5s3.5 1.5 5 .5" />
      <path d="M9 17c1-.8 2.5-.8 3 0" />
    </Icon>
  );
}

// Scales of Themis — the −7° tilted beam.
export function IconScales(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4v16" />
      <path d="M8 20h8" />
      <g transform="rotate(-7 12 7)">
        <path d="M4 7h16" />
        <path d="M5 7l-1.5 4a3 3 0 0 0 6 0L8 7" />
        <path d="M19 7l-1.5 4a3 3 0 0 0 6 0L22 7" />
      </g>
    </Icon>
  );
}

export function IconVerified(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx={12} cy={12} r={9} />
      <path d="M8 12.5l3 3 5-6" />
    </Icon>
  );
}

export function IconPending(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function IconPrivileged(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x={5} y={11} width={14} height={9} rx={1.5} />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx={12} cy={15.5} r={1.1} fill="currentColor" />
    </Icon>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx={11} cy={11} r={6} />
      <path d="M20 20l-4.5-4.5" />
    </Icon>
  );
}

export function IconChron(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx={7} cy={6} r={1.2} fill="currentColor" />
      <circle cx={11} cy={12} r={1.2} fill="currentColor" />
      <circle cx={15} cy={18} r={1.2} fill="currentColor" />
    </Icon>
  );
}

export function IconEntity(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx={12} cy={8} r={3.4} />
      <path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" />
    </Icon>
  );
}

export function IconBinder(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x={5} y={4} width={14} height={16} rx={1.5} />
      <path d="M5 9h2M5 13h2M5 17h2" />
      <path d="M11 9h5M11 13h5" />
    </Icon>
  );
}

export function IconCite(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 6h4l-2 5H7z" />
      <path d="M14 6h4l-2 5h-2z" />
      <path d="M5 18h14" />
    </Icon>
  );
}

export function IconCopy(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x={8} y={8} width={12} height={12} rx={1.5} />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </Icon>
  );
}

export function IconExport(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 4v11" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </Icon>
  );
}

// Hot — the −7° tilted exclamation triangle.
export function IconHot(p: IconProps) {
  return (
    <Icon {...p}>
      <g transform="rotate(-7 12 13)">
        <path d="M12 4l8.5 15h-17z" />
        <path d="M12 10v4" />
        <circle cx={12} cy={17} r={0.8} fill="currentColor" />
      </g>
    </Icon>
  );
}

export function IconReplay(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M3 4v4h4" />
    </Icon>
  );
}

export function IconPause(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x={8} y={6} width={3} height={12} rx={1} />
      <rect x={13} y={6} width={3} height={12} rx={1} />
    </Icon>
  );
}

export function IconArrow(p: IconProps & { direction?: "right" | "left" | "up" | "down" }) {
  const { direction = "right", ...rest } = p;
  const rot = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <Icon {...rest}>
      <g transform={`rotate(${rot} 12 12)`}>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </g>
    </Icon>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 6l12 12M18 6l-12 12" />
    </Icon>
  );
}

export function IconAdd(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconCmdK(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x={3.5} y={3.5} width={17} height={17} rx={3} />
      <path d="M9 9l3 3-3 3M14 9h-1.5a1.5 1.5 0 0 0-1.5 1.5V14a1.5 1.5 0 0 0 1.5 1.5H14" />
    </Icon>
  );
}

export function IconAsk(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5 5h14v10H10l-5 4z" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.5V13" />
      <circle cx={12} cy={15.5} r={0.7} fill="currentColor" />
    </Icon>
  );
}

// Causal arc — the curved spine through evidence nodes.
export function IconArc(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 18c4-12 12-12 16 0" />
      <circle cx={4} cy={18} r={1.4} fill="currentColor" />
      <circle cx={12} cy={9.5} r={1.4} fill="currentColor" />
      <circle cx={20} cy={18} r={1.4} fill="currentColor" />
    </Icon>
  );
}
