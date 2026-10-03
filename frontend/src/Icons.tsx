import type { CSSProperties } from 'react'

const paths = {
  chat: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a8.5 8.5 0 0 1 17 0"/><path d="M7 9h6M7 13h9"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L6 21"/></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  send: <><path d="m12 4 7 7M12 4l-7 7M12 4v16"/></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></>,
  history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/></>,
  shield: <><path d="m12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  camera: <><path d="M8 5 10 2h4l2 3h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="12" r="4"/></>,
  signal: <><path d="M4 18v3M9 13v8m5-13v13m5-19v19"/></>,
  sparkle: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
  stop: <rect x="5" y="5" width="14" height="14" rx="2"/>,
  leaf: <><path d="M20 3S7 2 5 10c-2 8 7 11 11 6s4-13 4-13ZM4 21l11-11"/></>,
}

export type IconName = keyof typeof paths
export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>
}

export function Panda({ size = 48, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 80 80" className={className} style={style} aria-hidden="true">
    <circle cx="21" cy="21" r="12" fill="#283831"/><circle cx="59" cy="21" r="12" fill="#283831"/>
    <ellipse cx="40" cy="43" rx="29" ry="28" fill="#fffdf7"/>
    <ellipse cx="28" cy="39" rx="9" ry="11" transform="rotate(25 28 39)" fill="#283831"/>
    <ellipse cx="52" cy="39" rx="9" ry="11" transform="rotate(-25 52 39)" fill="#283831"/>
    <circle cx="30" cy="37" r="2.7" fill="white"/><circle cx="50" cy="37" r="2.7" fill="white"/>
    <ellipse cx="40" cy="50" rx="5" ry="3.5" fill="#283831"/>
    <path d="M40 53v4m-7-1q7 9 14 0" stroke="#283831" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <ellipse cx="22" cy="50" rx="5" ry="3" fill="#f2b3a1"/><ellipse cx="58" cy="50" rx="5" ry="3" fill="#f2b3a1"/>
  </svg>
}
