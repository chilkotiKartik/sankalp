'use client';

import { createNoise3D } from 'simplex-noise';
import { useEffect, useRef, type RefObject } from 'react';

export type OrbMode = 'idle' | 'listening' | 'processing' | 'speaking' | 'emergency';

type RGB = [number, number, number];

interface Palette {
  glow: RGB;
  layers: [RGB, RGB, RGB];
  core: RGB;
  accent: RGB;
}

/**
 * Palettes per mode and theme. Colours carry meaning here: sage while listening,
 * warm amber while speaking, red in an emergency — so the state is readable
 * across the room, without reading a word.
 */
const PALETTES: Record<'light' | 'dark', Record<OrbMode, Palette>> = {
  light: {
    idle: { glow: [126, 176, 156], layers: [[52, 120, 103], [126, 182, 160], [206, 214, 186]], core: [252, 250, 245], accent: [214, 174, 120] },
    listening: { glow: [64, 174, 142], layers: [[26, 122, 100], [92, 196, 164], [176, 226, 206]], core: [246, 255, 251], accent: [120, 214, 182] },
    processing: { glow: [156, 168, 138], layers: [[48, 114, 100], [206, 152, 88], [148, 196, 176]], core: [253, 247, 238], accent: [216, 156, 92] },
    speaking: { glow: [228, 164, 100], layers: [[206, 126, 52], [238, 186, 124], [104, 166, 142]], core: [255, 248, 238], accent: [232, 176, 110] },
    emergency: { glow: [222, 84, 72], layers: [[168, 32, 26], [226, 94, 78], [244, 166, 146]], core: [255, 242, 238], accent: [236, 120, 100] },
  },
  dark: {
    idle: { glow: [64, 138, 118], layers: [[44, 128, 108], [104, 176, 156], [70, 116, 106]], core: [224, 240, 232], accent: [150, 190, 172] },
    listening: { glow: [74, 202, 168], layers: [[40, 168, 138], [104, 214, 182], [150, 232, 210]], core: [232, 255, 247], accent: [140, 236, 206] },
    processing: { glow: [118, 152, 132], layers: [[56, 136, 118], [226, 158, 88], [120, 186, 166]], core: [242, 238, 228], accent: [228, 164, 98] },
    speaking: { glow: [238, 170, 102], layers: [[228, 146, 76], [244, 196, 130], [98, 172, 148]], core: [255, 246, 232], accent: [244, 190, 126] },
    emergency: { glow: [252, 108, 96], layers: [[212, 54, 44], [250, 116, 96], [252, 176, 156]], core: [255, 238, 234], accent: [252, 140, 118] },
  },
};

interface MotionSpec {
  speed: number;
  deform: number;
  react: number;
  breathe: number;
  /** How strongly the waveform ring shows (0 = hidden). */
  ring: number;
  spin: number;
}

const MOTION: Record<OrbMode, MotionSpec> = {
  idle: { speed: 0.2, deform: 0.058, react: 0, breathe: 0.024, ring: 0.18, spin: 0.06 },
  listening: { speed: 0.5, deform: 0.055, react: 0.24, breathe: 0.01, ring: 1, spin: 0.16 },
  processing: { speed: 1.05, deform: 0.05, react: 0, breathe: 0.018, ring: 0.42, spin: 0.55 },
  speaking: { speed: 0.66, deform: 0.05, react: 0.28, breathe: 0.012, ring: 0.9, spin: 0.12 },
  emergency: { speed: 0.9, deform: 0.065, react: 0.16, breathe: 0.045, ring: 0.7, spin: 0.24 },
};

const BARS = 72;
const MOTES = 14;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function isDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme) return theme === 'dark';
  if (document.documentElement.dataset.contrast === 'high') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The living orb — the product's single control and its whole status display.
 *
 * Built from layers that each carry one idea: an ambient aura for presence, a
 * ring of bars that moves with the voice, three noise-deformed bodies for an
 * organic (never mechanical) shape, drifting motes for life, and a rim of light
 * for depth. Loudness is read from a ref every frame, so audio never re-renders React.
 */
export function VoiceOrb({
  mode,
  level,
  reducedMotion,
  size,
  pulse = 0,
}: {
  mode: OrbMode;
  level: RefObject<number>;
  reducedMotion: boolean;
  size: number;
  /**
   * Increment to fire a ring of ripples — the orb's acknowledgement that it heard
   * you. Driven by a counter rather than a callback so it survives re-renders and
   * never needs an imperative handle.
   */
  pulse?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // A ref the draw loop polls, so a pulse never restarts the animation.
  const pulseRef = useRef(pulse);
  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.scale(dpr, dpr);

    const noise = createNoise3D(() => 0.42);
    let dark = isDark();
    let current: Palette = structuredClone(PALETTES[dark ? 'dark' : 'light'][modeRef.current]);
    let motion: MotionSpec = { ...MOTION[modeRef.current] };
    let amp = 0;
    let raf = 0;
    let frame = 0;
    let last = performance.now();
    let time = 0;
    let spin = 0;

    const cx = size / 2;
    const cy = size / 2;
    const base = size * 0.26;

    const bars = new Float32Array(BARS);
    const ripples: { r: number; a: number }[] = [];
    let rippleCooldown = 0;
    let seenPulse = pulseRef.current;
    const motes = Array.from({ length: MOTES }, (_, i) => ({
      angle: (i / MOTES) * Math.PI * 2,
      radius: 1.18 + (i % 4) * 0.12,
      speed: 0.12 + (i % 5) * 0.035,
      size: 0.9 + (i % 3) * 0.6,
      phase: i * 1.7,
    }));

    /** One noise-deformed body. Centres drift slightly so the shape never looks symmetric. */
    const blob = (radius: number, deform: number, seed: number, t: number, color: RGB, alpha: number, drift: number) => {
      const ox = cx + Math.sin(t * 0.6 + seed) * size * 0.012 * drift;
      const oy = cy + Math.cos(t * 0.5 + seed) * size * 0.012 * drift;
      const steps = 110;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const n = noise(Math.cos(a) * 1.25 + seed, Math.sin(a) * 1.25 + seed, t);
        const r = radius * (1 + deform * n);
        const x = ox + Math.cos(a) * r;
        const y = oy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(ox - radius * 0.34, oy - radius * 0.4, radius * 0.08, ox, oy, radius * 1.16);
      g.addColorStop(0, rgba(mix(color, [255, 255, 255], 0.42), alpha));
      g.addColorStop(0.58, rgba(color, alpha));
      g.addColorStop(1, rgba(mix(color, [0, 0, 0], 0.12), alpha * 0.92));
      ctx.fillStyle = g;
      ctx.fill();
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame++;
      if (frame % 60 === 0) dark = isDark();

      const m = modeRef.current;
      const palette = PALETTES[dark ? 'dark' : 'light'][m];
      const target = MOTION[m];
      // Frame-rate independent easing, so colour and motion cross-fade between states.
      const k = 1 - Math.pow(0.02, dt);
      current = {
        glow: mix(current.glow, palette.glow, k),
        layers: [mix(current.layers[0], palette.layers[0], k), mix(current.layers[1], palette.layers[1], k), mix(current.layers[2], palette.layers[2], k)],
        core: mix(current.core, palette.core, k),
        accent: mix(current.accent, palette.accent, k),
      };
      motion = {
        speed: lerp(motion.speed, target.speed, k),
        deform: lerp(motion.deform, target.deform, k),
        react: lerp(motion.react, target.react, k),
        breathe: lerp(motion.breathe, target.breathe, k),
        ring: lerp(motion.ring, target.ring, k),
        spin: lerp(motion.spin, target.spin, k),
      };

      const incoming = Math.max(0, Math.min(1, level.current));
      amp = lerp(amp, incoming, incoming > amp ? 0.4 : 0.07);
      time += dt * motion.speed;
      spin += dt * motion.spin;

      ctx.clearRect(0, 0, size, size);

      const pulse = m === 'emergency' ? (Math.sin(now / 300) + 1) / 2 : (Math.sin(now / 1500) + 1) / 2;
      const scale = 1 + motion.breathe * pulse + amp * motion.react * 0.4;
      const bodyRadius = base * scale;

      // 1. Ambient aura.
      const halo = ctx.createRadialGradient(cx, cy, bodyRadius * 0.55, cx, cy, size * 0.5);
      halo.addColorStop(0, rgba(current.glow, (dark ? 0.34 : 0.24) + amp * 0.14));
      halo.addColorStop(0.55, rgba(current.glow, (dark ? 0.12 : 0.09) + amp * 0.05));
      halo.addColorStop(1, rgba(current.glow, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // 2. Ripples on speech onsets.
      // A send emits three rings in quick succession: a clear "got it", distinct
      // from the steady ripples that track loudness while listening.
      if (pulseRef.current !== seenPulse) {
        seenPulse = pulseRef.current;
        ripples.push({ r: bodyRadius * 0.95, a: 0.5 }, { r: bodyRadius * 0.7, a: 0.34 }, { r: bodyRadius * 0.45, a: 0.2 });
      }

      rippleCooldown -= dt;
      if ((m === 'listening' || m === 'emergency') && rippleCooldown <= 0 && (amp > 0.3 || m === 'emergency')) {
        ripples.push({ r: bodyRadius * 1.1, a: m === 'emergency' ? 0.4 : 0.32 });
        rippleCooldown = m === 'emergency' ? 0.85 : 0.5;
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]!;
        rp.r += dt * size * 0.2;
        rp.a -= dt * 0.34;
        if (rp.a <= 0 || rp.r > size * 0.5) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(current.layers[1], rp.a * 0.8);
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      // 3. Voice ring: bars around the body that rise with loudness.
      if (motion.ring > 0.02) {
        const ringRadius = bodyRadius * 1.22;
        ctx.lineCap = 'round';
        for (let i = 0; i < BARS; i++) {
          const a = (i / BARS) * Math.PI * 2 + spin * 0.6;
          // Noise gives each bar its own life; amplitude sets the overall height.
          const n = (noise(Math.cos(a) * 2.2, Math.sin(a) * 2.2, time * 1.6 + i * 0.002) + 1) / 2;
          const energy = m === 'processing' ? 0.25 + 0.75 * ((Math.sin(spin * 6 - i * 0.28) + 1) / 2) ** 3 : 0.22 + amp * 1.25 * n;
          bars[i] = lerp(bars[i]!, energy, 0.28);
          const len = Math.max(1.5, bars[i]! * size * 0.055) * motion.ring;
          const inner = ringRadius;
          const outer = ringRadius + len;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
          ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
          ctx.strokeStyle = rgba(mix(current.layers[0], current.accent, (i % 7) / 9), (0.16 + bars[i]! * 0.5) * motion.ring);
          ctx.lineWidth = Math.max(1.1, size * 0.006);
          ctx.stroke();
        }
      }

      // 4. Drifting motes.
      for (const mote of motes) {
        const a = mote.angle + spin * mote.speed * 6 + Math.sin(time * 0.4 + mote.phase) * 0.25;
        const r = bodyRadius * (mote.radius + Math.sin(time * 0.8 + mote.phase) * 0.05) + amp * size * 0.02;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, mote.size * (size / 320) * (1 + amp * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = rgba(current.accent, 0.16 + amp * 0.22);
        ctx.fill();
      }

      // 5. Soft contact shadow, so the orb sits in the page instead of floating on it.
      const shadow = ctx.createRadialGradient(cx, cy + bodyRadius * 0.92, bodyRadius * 0.1, cx, cy + bodyRadius * 0.95, bodyRadius * 0.9);
      shadow.addColorStop(0, rgba([20, 30, 28], dark ? 0.32 : 0.14));
      shadow.addColorStop(1, rgba([20, 30, 28], 0));
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, size, size);

      // 6. The body: three noise-deformed layers.
      const deform = motion.deform + amp * motion.react;
      blob(bodyRadius * 1.13, deform * 1.4, 0, time * 0.8, current.layers[2], dark ? 0.3 : 0.26, 1.4);
      blob(bodyRadius * 1.04, deform * 1.12, 3.3, time, current.layers[1], 0.62, 0.9);
      blob(bodyRadius * 0.93, deform * 0.82, 7.1, time * 1.15, current.layers[0], 0.93, 0.5);

      // 7. Lighting. A broad key light, a tight glint, and a warm bounce from below —
      //    all clipped to the body so the orb reads as a soft material, not a plastic ball.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius * 1.04, 0, Math.PI * 2);
      ctx.clip();

      ctx.globalCompositeOperation = 'lighter';
      // Broad, low key light across the upper-left third.
      const key = ctx.createRadialGradient(cx - bodyRadius * 0.34, cy - bodyRadius * 0.4, 0, cx - bodyRadius * 0.3, cy - bodyRadius * 0.34, bodyRadius * 1.05);
      key.addColorStop(0, rgba(current.core, dark ? 0.17 : 0.26));
      key.addColorStop(0.42, rgba(current.core, dark ? 0.06 : 0.1));
      key.addColorStop(1, rgba(current.core, 0));
      ctx.fillStyle = key;
      ctx.fillRect(cx - bodyRadius * 1.1, cy - bodyRadius * 1.1, bodyRadius * 2.2, bodyRadius * 2.2);
      // Small, tight glint — the only genuinely bright pixel on the whole orb.
      const glint = ctx.createRadialGradient(cx - bodyRadius * 0.38, cy - bodyRadius * 0.44, 0, cx - bodyRadius * 0.38, cy - bodyRadius * 0.44, bodyRadius * 0.46);
      glint.addColorStop(0, rgba(current.core, dark ? 0.15 : 0.22));
      glint.addColorStop(0.35, rgba(current.core, dark ? 0.07 : 0.1));
      glint.addColorStop(1, rgba(current.core, 0));
      ctx.fillStyle = glint;
      ctx.fillRect(cx - bodyRadius * 1.1, cy - bodyRadius * 1.1, bodyRadius * 2.2, bodyRadius * 2.2);
      // Warm light bouncing back up from the page.
      const bounce = ctx.createRadialGradient(cx + bodyRadius * 0.24, cy + bodyRadius * 0.62, 0, cx + bodyRadius * 0.24, cy + bodyRadius * 0.62, bodyRadius * 0.78);
      bounce.addColorStop(0, rgba(current.accent, dark ? 0.15 : 0.18));
      bounce.addColorStop(1, rgba(current.accent, 0));
      ctx.fillStyle = bounce;
      ctx.fillRect(cx - bodyRadius * 1.1, cy - bodyRadius * 1.1, bodyRadius * 2.2, bodyRadius * 2.2);

      // Occlusion on the shadow side keeps the form from going flat.
      ctx.globalCompositeOperation = 'multiply';
      const occl = ctx.createRadialGradient(cx + bodyRadius * 0.52, cy + bodyRadius * 0.5, bodyRadius * 0.15, cx + bodyRadius * 0.42, cy + bodyRadius * 0.4, bodyRadius * 1.25);
      occl.addColorStop(0, rgba([18, 28, 26], dark ? 0.42 : 0.18));
      occl.addColorStop(0.55, rgba([18, 28, 26], dark ? 0.13 : 0.05));
      occl.addColorStop(1, rgba([18, 28, 26], 0));
      ctx.fillStyle = occl;
      ctx.fillRect(cx - bodyRadius * 1.1, cy - bodyRadius * 1.1, bodyRadius * 2.2, bodyRadius * 2.2);
      ctx.restore();

      // 8. Rim of light: brightest where the key light grazes the edge, fading round the back.
      const rim = ctx.createLinearGradient(cx - bodyRadius, cy - bodyRadius, cx + bodyRadius, cy + bodyRadius);
      rim.addColorStop(0, rgba(current.core, dark ? 0.3 : 0.5));
      rim.addColorStop(0.5, rgba(current.core, dark ? 0.1 : 0.16));
      rim.addColorStop(1, rgba(current.accent, dark ? 0.22 : 0.26));
      ctx.beginPath();
      ctx.arc(cx, cy, bodyRadius * 0.985, 0, Math.PI * 2);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 9. Thinking: two arcs orbiting just outside the body.
      if (m === 'processing') {
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, size * 0.008);
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, bodyRadius * 1.38, spin * 3 + i * Math.PI, spin * 3 + i * Math.PI + Math.PI * 0.4);
          ctx.strokeStyle = rgba(i === 0 ? current.layers[0] : current.accent, 0.75);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };

    /** Reduced motion: the same visual language, held still. */
    const drawStatic = () => {
      const m = modeRef.current;
      const p = PALETTES[isDark() ? 'dark' : 'light'][m];
      ctx.clearRect(0, 0, size, size);
      const halo = ctx.createRadialGradient(cx, cy, base * 0.6, cx, cy, size * 0.5);
      halo.addColorStop(0, rgba(p.glow, 0.22));
      halo.addColorStop(1, rgba(p.glow, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);
      const g = ctx.createRadialGradient(cx - base * 0.3, cy - base * 0.34, base * 0.08, cx, cy, base * 1.1);
      g.addColorStop(0, rgba(mix(p.layers[1], [255, 255, 255], 0.35), 1));
      g.addColorStop(1, rgba(p.layers[0], 1));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, base, 0, Math.PI * 2);
      ctx.fill();
      // A static ring marks the active states without movement.
      if (m !== 'idle') {
        ctx.beginPath();
        ctx.arc(cx, cy, base * 1.26, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(p.layers[0], 0.55);
        ctx.lineWidth = m === 'emergency' ? 5 : 3;
        ctx.stroke();
      }
    };

    if (reducedMotion) {
      drawStatic();
      const id = window.setInterval(drawStatic, 250);
      return () => window.clearInterval(id);
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [size, reducedMotion, level]);

  return <canvas ref={canvasRef} aria-hidden style={{ width: size, height: size }} className="block" />;
}
