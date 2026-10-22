// Hand-drawn skill icons (24×24 line art). Game data still names icons by emoji;
// these helpers swap the emoji for our own drawing wherever one exists.

const HUE = {
  P: '#dfe6ee', // steel
  F: '#ff8a3d', // fire
  I: '#7fd8ff', // ice
  H: '#ffd45a', // holy / gold
  D: '#c39bff', // shadow
  N: '#7ee07a', // nature
  B: '#ff6170', // blood
  L: '#ffe14d', // lightning
  W: '#a8f0dc', // wind
  A: '#8fb4ff', // arcane / time
  O: '#efe6cf', // bone
  E: '#e6b877', // wood / earth
} as const;
type Hue = keyof typeof HUE;

const fillSoft = 'fill="currentColor" fill-opacity=".25"';
const fillOn = 'fill="currentColor"';
const SKULL = `<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.4 3 5.5V19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3c1.7-1.1 3-2.9 3-5.5A7.5 7.5 0 0 0 12 3z" ${fillSoft}/><circle cx="9" cy="11" r="1.8" ${fillOn}/><circle cx="15" cy="11" r="1.8" ${fillOn}/><path d="M10.5 20v-2M13.5 20v-2M11.3 15l.7-1.5.7 1.5z"/>`;
const STAR = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join('L')}z`;
};
const HEART = `<path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10C19.5 15.5 12 20 12 20z" ${fillSoft}/>`;
const HOURGLASS = `<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path d="M9 19c1-1.5 2-2 3-2s2 .5 3 2z" ${fillOn}/>`;

const G: Record<string, [Hue, string]> = {
  '🌀': ['W', '<path d="M12 12a1.8 1.8 0 0 1 1.8 1.8a3.6 3.6 0 0 1-3.6 3.6a5.4 5.4 0 0 1-5.4-5.4a7.2 7.2 0 0 1 7.2-7.2a9 9 0 0 1 9 9" transform="translate(-.6 -1)"/>'],
  '💢': ['E', '<path d="M3 19h18"/><path d="M12 19l-2-4 3-2-2-4M7 19l-3-3M17 19l3-3M12 3v3M8 5l1.5 2M16 5l-1.5 2"/>'],
  '🛡️': ['P', `<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" ${fillSoft}/><path d="M12 7v10M8.5 11h7"/>`],
  '📢': ['B', `<path d="M4 10v4h3l8 4V6L7 10z" ${fillSoft}/><path d="M18 9a4 4 0 0 1 0 6M20.5 7a7 7 0 0 1 0 10"/>`],
  '🌧️': ['W', '<path d="M6 3v12M18 3v12M12 7v14M4 13l2 3 2-3M16 13l2 3 2-3M10 18l2 3 2-3M5 3l1 2 1-2M17 3l1 2 1-2M11 7l1 2 1-2"/>'],
  '🪶': ['W', `<path d="M19 4c1 7-4 12-11 12-1-7 4-12 11-12z" ${fillSoft}/><path d="M19 4L4 20M10 13l4-.5M12.5 10l4-.5"/>`],
  '🪤': ['P', '<path d="M3 19h18M4 15a8 8 0 0 1 16 0M4 15h16M7 15l1-3M10 15l.5-4M14 15l-.5-4M17 15l-1-3M12 19v-4"/>'],
  '🔰': ['A', `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8l4 2.2v4.6L12 17l-4-2.2v-4.6z" ${fillSoft}/>`],
  '❄️': ['I', '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>'],
  '☄️': ['F', `<circle cx="16" cy="8" r="4" ${fillSoft}/><path d="M13 11L4 20M13.2 7.2L6 13M16.8 10.8L11 18"/>`],
  '🔥': ['F', `<path d="M12 21c-4 0-6.5-2.8-6.5-6.2 0-3.5 2.5-5.3 3.5-8.8 2 1.5 2.5 3.5 2.5 5 1-1 1.5-2.5 1.2-4 3.3 2 5.8 5 5.8 8 0 3.4-2.5 6-6.5 6z" ${fillSoft}/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.7 1.4-2.6 2.3-4.2 1.6 1.2 3.3 2.5 3.3 4.2 0 1.6-1.1 2.8-2.8 2.8z"/>`],
  '⏳': ['A', HOURGLASS],
  '⌛': ['A', HOURGLASS],
  '💀': ['O', SKULL],
  '☠️': ['O', `<path d="M4 21L20 9M4 9l16 12"/><g transform="translate(4.8 0) scale(.6)" stroke-width="3">${SKULL}</g>`],
  '💥': ['F', `<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z" ${fillSoft}/>`],
  '🦴': ['O', `<path d="M7 7l10 10" stroke-width="3.4"/><circle cx="5.3" cy="7.7" r="2" ${fillOn}/><circle cx="7.7" cy="5.3" r="2" ${fillOn}/><circle cx="16.3" cy="18.7" r="2" ${fillOn}/><circle cx="18.7" cy="16.3" r="2" ${fillOn}/>`],
  '🕸️': ['D', '<g stroke-width="1.3"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/><path d="M12 6l4.2 1.8L18 12l-1.8 4.2L12 18l-4.2-1.8L6 12l1.8-4.2z"/><path d="M12 9.5l1.8.7.7 1.8-.7 1.8-1.8.7-1.8-.7-.7-1.8.7-1.8z"/></g>'],
  '💪': ['B', '<path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V11M10 10V6.5a1.5 1.5 0 0 1 3 0V10M13 10V7a1.5 1.5 0 0 1 3 0v4M16 11V9a1.5 1.5 0 0 1 3 0v4c0 4.5-3 8-7 8s-5.5-2-6.5-4L4 14a1.6 1.6 0 0 1 2.5-2L8 13.5"/>'],
  '🔨': ['P', `<path d="M14 10L4.5 19.5a1.4 1.4 0 0 0 2 2L16 12"/><path d="M12 6l5-3 4.5 4.5-3 5z" ${fillSoft}/>`],
  '😤': ['B', '<path d="M6 4l4 16M11 3l4 16M16 4l3 12"/>'],
  '👑': ['H', `<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" ${fillSoft}/><path d="M5 19h14"/>`],
  '🗡️': ['P', `<path d="M21 3v2.5L12.5 14 10 11.5 18.5 3z" ${fillSoft}/><path d="M7.5 10.5l6 6M10.5 13.5L4 20"/>`],
  '⚔️': ['P', '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5L18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>'],
  '❤️': ['B', HEART],
  '💛': ['H', HEART],
  '🩸': ['B', `<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" ${fillSoft}/><path d="M9 14.5a3 3 0 0 0 3 3"/>`],
  '🌿': ['N', `<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z" ${fillSoft}/><path d="M5 19l9-9"/>`],
  '🌵': ['N', '<path d="M3 18c4-2 6-8 9-8s4 5 9 3M6 15.5l-1.5-2.5M9 11.5L8.5 8.5M12 10l1-3M15.5 12.5l1.5-2.5M18.5 13.5l.5 3M8 14.5l2 1"/>'],
  '👟': ['W', `<path d="M6 4h5v8l7 3a2 2 0 0 1 1.5 2v2H6z" ${fillSoft}/><path d="M6 19h13.5M2 9h4M3 12h3"/>`],
  '⏱️': ['A', '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M10 3h4M12 3v3.5M18 7l1.5-1.5"/>'],
  '🎯': ['B', `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" ${fillOn}/>`],
  '👁️': ['L', `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3" ${fillSoft}/><circle cx="12" cy="12" r="1" ${fillOn}/>`],
  '💨': ['W', '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>'],
  '🔱': ['H', `<path d="M12 4v17M7 4v4a5 5 0 0 0 10 0V4M10 21h4"/><path d="M12 2l-1.3 2.5h2.6zM7 2L5.7 4.5h2.6zM17 2l-1.3 2.5h2.6z" ${fillOn}/>`],
  '🧭': ['W', `<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z" ${fillSoft}/><circle cx="12" cy="12" r=".8" ${fillOn}/>`],
  '🔮': ['D', `<circle cx="12" cy="10.5" r="6.5" ${fillSoft}/><path d="M7 20h10M8.5 20l1-3M15.5 20l-1-3M9.5 8.5a3 3 0 0 1 3-2"/>`],
  '🌋': ['F', `<path d="M3 20l5-9h8l5 9z" ${fillSoft}/><path d="M10 11l2 3 2-3M12 8V3M8.5 6L7 4M15.5 6L17 4"/>`],
  '⚡': ['L', `<path d="M13 2L5 13.5h6L10 22l8-11.5h-6z" ${fillSoft}/>`],
  '⏩': ['A', `<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z" ${fillSoft}/>`],
  '💠': ['I', `<path d="M12 2l8 10-8 10-8-10z" ${fillSoft}/><path d="M12 7l4 5-4 5-4-5z"/>`],
  '🧊': ['I', `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" ${fillSoft}/><path d="M4 7.5L12 12l8-4.5M12 12v9M7 13l2 1"/>`],
  '🌑': ['D', `<path d="M15 3.5a8.5 8.5 0 1 0 6 12 7 7 0 1 1-6-12z" ${fillSoft}/><path d="M18 5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z"/>`],
  '👻': ['D', `<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.3 2-2.4-2-2.3 2-2.4-2z" ${fillSoft}/><circle cx="9.5" cy="11" r="1.2" ${fillOn}/><circle cx="14.5" cy="11" r="1.2" ${fillOn}/>`],
  '🌪️': ['W', '<path d="M3 4h18M5 8h14M7 12h10M9.5 16h6M11.5 20h2"/>'],
  '⚜️': ['H', '<path d="M12 3c-2 3-2 6 0 9 2-3 2-6 0-9zM12 12c-1-4-6-5-7-1-1 3 2 5 4 3M12 12c1-4 6-5 7-1 1 3-2 5-4 3M8 15h8M12 12v9M9.5 21h5"/>'],
  '🔆': ['H', `<circle cx="12" cy="12" r="4" ${fillSoft}/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>`],
  '🏹': ['E', '<path d="M5 4c9 0 15 6 15 15"/><path d="M5 4l15 15" stroke-width="1"/><path d="M4 20L17 7M17 7h-4M17 7v4M4 20l2.5-.5M4 20l.5-2.5"/>'],
  '🐺': ['P', `<path d="M4 3l4 5h8l4-5v8l-3 3-5 7-5-7-3-3z" ${fillSoft}/><path d="M9 12l1.5 1M15 12l-1.5 1M11 17h2"/>`],
  '🦅': ['E', '<path d="M12 9c-3-4-7-5-10-4 2 1 3 3 4 5-1 0-2 1-2 2 2 0 4 0 6 1M12 9c3-4 7-5 10-4-2 1-3 3-4 5 1 0 2 1 2 2-2 0-4 0-6 1M10 13l2 7 2-7M12 9l-1.2-2.5L12 5l1.2 1.5z"/>'],
  '🌫️': ['W', '<path d="M3 8h13M19 8h2M6 12h15M3 16h12M18 16h3"/>'],
  '💫': ['H', `<path d="${STAR(12, 10, 6.5)}" ${fillSoft}/><path d="M3 19c4 2 10 2 15-2M20 15l1 1"/>`],
  '✨': ['H', `<path d="M10 3l1.6 5.4L17 10l-5.4 1.6L10 17l-1.6-5.4L3 10l5.4-1.6z" ${fillSoft}/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>`],
  '🌟': ['H', `<path d="${STAR(12, 12, 7)}" ${fillSoft}/><path d="M12 1.5v1.5M22.5 12H21M1.5 12H3M12 21v1.5"/>`],
  '🌠': ['H', `<path d="${STAR(15.5, 8.5, 5.5)}" ${fillSoft}/><path d="M11 13L3 21M9 11l-5 2M13 15l-2 5"/>`],
  '🔯': ['A', '<path d="M12 3l7.8 13.5H4.2zM12 21L4.2 7.5h15.6z"/>'],
  '♻️': ['N', '<path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M18 3v4h-4M6 21v-4h4"/>'],
  '🔔': ['H', `<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" ${fillSoft}/><path d="M10 20a2 2 0 0 0 4 0M12 3v2"/>`],
  '🧚': ['N', `<circle cx="12" cy="12" r="3" ${fillSoft}/><path d="M12 9c-2-4-6-5-8-3 0 3 3 5 6 5M12 9c2-4 6-5 8-3 0 3-3 5-6 5M10 15l-2 4M14 15l2 4"/>`],
  '🐍': ['N', '<path d="M4 20c4 0 4-4 8-4s4 4 8 0c2-2 0-5-3-5H8c-3 0-4-3-2-5 2-2 6-2 8 0M14 6l3-1.5M17 4.5l1.5.5"/>'],
  '🦇': ['D', `<path d="M12 8.5c-1.5 0-2 1-2 2-2.5-2-6-2.5-8-1 1.5.8 2 2.3 2 4 1.3-.8 2.8-.8 4 .2.6-1 1.6-1.3 2.6-.7.4-1 1-1.5 1.4-1.5s1 .5 1.4 1.5c1-.6 2-.3 2.6.7 1.2-1 2.7-1 4-.2 0-1.7.5-3.2 2-4-2-1.5-5.5-1-8 1 0-1-.5-2-2-2z" ${fillSoft}/><path d="M11 8.6l-.5-1.8M13 8.6l.5-1.8"/>`],
  '🗿': ['L', '<path d="M7 3h10v18H7zM7 9h10M7 15h10M9.5 6h1M13.5 6h1M10 12h4M9.5 18h5"/>'],
  '📜': ['E', '<path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H5a2 2 0 0 1 0-4h1V6a2 2 0 0 1 1-2zM9 9h5M9 12h5M9 15h3"/>'],
};

const ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

/** True when we have our own drawing for this icon. */
export const hasIcon = (e: string): boolean => !!G[e];

/** Inline HTML icon: our drawing if there is one, otherwise the emoji. */
export function ico(e: string, cls = ''): string {
  const g = G[e];
  if (!g) return e;
  return `<svg class="ico ${cls}" ${ATTRS} style="color:${HUE[g[0]]}" aria-hidden="true">${g[1]}</svg>`;
}

/** The same icon as an SVG <g> centred on 0,0 with the given size (for drawing inside another SVG). */
export function icoG(e: string, size: number): string | null {
  const g = G[e];
  if (!g) return null;
  const s = size / 24;
  return `<g class="gly" transform="translate(${(-size / 2).toFixed(1)} ${(-size / 2).toFixed(1)}) scale(${s.toFixed(3)})" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${HUE[g[0]]}">${g[1]}</g>`;
}

/** Every icon we draw (for the preview sheet). */
export const ICON_KEYS = Object.keys(G);
