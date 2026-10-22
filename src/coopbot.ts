// Testing switch: bring an AI teammate (a copy of your own character) into dungeon runs, to try 2-player co-op on one device.
const KEY = 'website-game-coopbot';
export function coopBotOn(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function setCoopBot(on: boolean): void {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage blocked: stays off */ }
}
