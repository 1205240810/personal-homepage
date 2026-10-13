'use client';
import { useRef, type PointerEvent } from 'react';
import { joystickVector } from '@/lib/world/joystick';
import type { Point } from '@/lib/world/types';

/** Analog stick: drag anywhere on the base, diagonals included. */
export function VirtualJoystick({
  onChange,
}: {
  onChange: (v: Point) => void;
}) {
  const knob = useRef<HTMLSpanElement>(null),
    pointer = useRef<number | null>(null);
  const track = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect(),
      knobSize = knob.current?.offsetWidth ?? 46,
      radius = (box.width - knobSize) / 2,
      { direction, knob: offset } = joystickVector(
        event.clientX - box.left - box.width / 2,
        event.clientY - box.top - box.height / 2,
        radius,
      );
    if (knob.current)
      knob.current.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    onChange(direction);
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    event.currentTarget.removeAttribute('data-active');
    if (knob.current) knob.current.style.transform = '';
    onChange({ x: 0, y: 0 });
  };
  return (
    <div
      className="joystick"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (pointer.current !== null) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute('data-active', '');
        track(event);
      }}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId) track(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span ref={knob} className="joystick-knob" />
    </div>
  );
}
