// Touch joystick (appears wherever you press) + WASD / arrow keys.
// Converts screen directions into world directions for the fixed diagonal camera.
import type { Input } from './sim/sim';

const DEAD_ZONE = 8; // px
const MAX_R = 50; // px

export function createInput(area: HTMLElement) {
  const keys = new Set<string>();
  let pointerId: number | null = null;
  let ox = 0, oy = 0, sx = 0, sy = 0;
  const stick = document.createElement('div');
  stick.className = 'stick';
  stick.innerHTML = '<i></i>';
  stick.style.display = 'none';
  const knob = stick.firstElementChild as HTMLElement;
  area.appendChild(stick);

  const state = { enabled: false, read };

  area.addEventListener('pointerdown', (e) => {
    if (!state.enabled || pointerId !== null) return;
    if ((e.target as HTMLElement).closest('button')) return;
    pointerId = e.pointerId;
    const r = area.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    sx = sy = 0;
    stick.style.left = `${ox}px`; stick.style.top = `${oy}px`;
    stick.style.display = 'block';
    knob.style.transform = 'translate(0,0)';
    area.setPointerCapture?.(e.pointerId);
  });
  area.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const r = area.getBoundingClientRect();
    let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const d = Math.hypot(dx, dy);
    if (d > MAX_R) { dx = (dx / d) * MAX_R; dy = (dy / d) * MAX_R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    sx = d < DEAD_ZONE ? 0 : dx / MAX_R;
    sy = d < DEAD_ZONE ? 0 : dy / MAX_R;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    sx = sy = 0;
    stick.style.display = 'none';
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  window.addEventListener('blur', () => keys.clear());

  function read(): Input {
    let kx = 0, ky = 0;
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
    if (keys.has('d') || keys.has('arrowright')) kx += 1;
    if (keys.has('w') || keys.has('arrowup')) ky -= 1;
    if (keys.has('s') || keys.has('arrowdown')) ky += 1;
    const touching = pointerId !== null;
    const keyActive = kx !== 0 || ky !== 0;
    let x = touching ? sx : kx, y = touching ? sy : ky;
    if (!touching && keyActive) { const l = Math.hypot(x, y); x /= l; y /= l; }
    if (!state.enabled) return { x: 0, z: 0, manual: false };
    // screen (right, down) -> world, camera looks from +x,+z towards the origin
    const wx = (x + y) / Math.SQRT2;
    const wz = (-x + y) / Math.SQRT2;
    return { x: wx, z: wz, manual: touching || keyActive };
  }

  return state;
}
