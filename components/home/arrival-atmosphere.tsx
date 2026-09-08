'use client';
import { useEffect, useRef, type RefObject } from 'react';

/** Light and suspended dust share the camera motion of the existing hall art. */
export function ArrivalAtmosphere({
  surfaceRef,
  lightsOn,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  lightsOn: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const power = useRef(lightsOn);
  useEffect(() => {
    power.current = lightsOn;
  }, [lightsOn]);
  useEffect(() => {
    const canvas = canvasRef.current,
      surface = surfaceRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !surface || !ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1,
      height = 1,
      frame = 0,
      previous = 0,
      elapsed = 0;
    let x = 0,
      y = 0,
      tx = 0,
      ty = 0,
      brightness = 0;
    const resize = () => {
      width = surface.clientWidth;
      height = surface.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const box = surface.getBoundingClientRect();
      tx = ((event.clientX - box.left) / box.width - 0.5) * 2;
      ty = ((event.clientY - box.top) / box.height - 0.5) * 2;
    };
    const reset = () => {
      tx = 0;
      ty = 0;
    };
    const draw = (time: number) => {
      const dt = Math.min(time - (previous || time), 40) / 1000;
      previous = time;
      elapsed += dt;
      const ease = 1 - Math.exp(-dt * 4);
      x += (tx - x) * ease;
      y += (ty - y) * ease;
      brightness += ((power.current ? 1 : 0) - brightness) * ease;
      surface.style.setProperty('--look-x', `${-x * 10}px`);
      surface.style.setProperty('--look-y', `${-y * 6}px`);
      ctx.clearRect(0, 0, width, height);
      // Small, deterministic dust motes stay in the window light, away from the copy.
      for (let i = 0; i < 42; i++) {
        const sx = 0.4 + ((i * 0.6180339) % 0.58);
        const py =
          ((i * 0.137 + elapsed * (0.009 + (i % 4) * 0.002)) % 0.9) * height;
        const px = sx * width + Math.sin(elapsed * 0.19 + i * 2.3) * 16;
        const light = Math.max(0, 1 - Math.abs(sx - 0.71) * 3);
        const alpha =
          (0.12 + brightness * 0.21) *
          light *
          (0.6 + Math.sin(elapsed * 0.5 + i) * 0.35);
        ctx.fillStyle = `rgba(239,224,195,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.6 + (i % 3) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (document.hidden || motion.matches) {
        ctx.clearRect(0, 0, width, height);
        surface.style.setProperty('--look-x', '0px');
        surface.style.setProperty('--look-y', '0px');
      } else frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    sync();
    surface.addEventListener('pointermove', pointer);
    surface.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      surface.removeEventListener('pointermove', pointer);
      surface.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, [surfaceRef]);
  return (
    <canvas ref={canvasRef} className="arrival-atmosphere" aria-hidden="true" />
  );
}
