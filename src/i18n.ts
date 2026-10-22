// Language: 粵語 (default) or English. Picked in 設定 / Settings; switching reloads the page,
// so every string (including data tables built at load time) is simply evaluated in the current language.
export type Lang = 'zh' | 'en';
const KEY = 'website-game-lang';

let lang: Lang = (() => {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
})();

export const getLang = (): Lang => lang;
/** Has this player picked a language yet? (First launch asks.) */
export const langChosen = (): boolean => { try { return !!localStorage.getItem(KEY); } catch { return true; } };

/** Forget the choice (account reset): the next load asks again. */
export function clearLang(): void { try { localStorage.removeItem(KEY); } catch { /* blocked */ } }

/** Save the choice and reload so everything is rebuilt in the new language. */
export function setLang(l: Lang): void {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked: still switches for this visit */ }
  try { location.reload(); } catch { /* not in a browser (tests) */ }
}

/** Pick the string for the current language: tr('中文', 'English'). */
export const tr = (zh: string, en: string): string => (lang === 'en' ? en : zh);
