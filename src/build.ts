// When this build was made (set by Vite at build time), shown in Settings and on the Play tab.
declare const __BUILD_TIME__: string;
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
/** e.g. "22/10 18:40" in the phone's own time zone. */
export function buildLabel(): string {
  if (!BUILD_TIME) return 'dev';
  const d = new Date(BUILD_TIME);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
