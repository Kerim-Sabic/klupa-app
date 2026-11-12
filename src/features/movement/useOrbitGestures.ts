import { useEffect, useRef, type RefObject } from 'react';

export type OrbitChange = (dx: number, dy: number, zoom: number) => void;

type Spot = { x: number; y: number };

function midpointAndSpread(touches: TouchList): { mid: Spot; spread: number } | null {
  const [a, b] = [touches[0], touches[1]];
  if (a === undefined || b === undefined) return null;
  return {
    mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
    spread: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  };
}

/**
 * Turning the camera must never take the page's scroll away. With a mouse it needs Ctrl (or
 * Cmd) held while dragging, and Ctrl with the wheel zooms; on a touch screen it needs two
 * fingers, while one finger scrolls the page and taps a player as usual. Listeners are added
 * by hand because they must be allowed to cancel the browser's own gesture.
 */
export function useOrbitGestures(target: RefObject<HTMLElement | null>, onChange: OrbitChange) {
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  });

  useEffect(() => {
    const element = target.current;
    if (element === null) return undefined;
    let drag: Spot | null = null;
    let pinch: { mid: Spot; spread: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !(event.ctrlKey || event.metaKey)) return;
      drag = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (drag === null) return;
      change.current(event.clientX - drag.x, event.clientY - drag.y, 1);
      drag = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => {
      drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      change.current(0, 0, Math.exp(event.deltaY * 0.0015));
    };
    const onTouch = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinch = null;
        return;
      }
      event.preventDefault();
      const now = midpointAndSpread(event.touches);
      if (now === null) return;
      if (pinch !== null && event.type === 'touchmove') {
        const zoom = now.spread > 0 && pinch.spread > 0 ? pinch.spread / now.spread : 1;
        change.current(now.mid.x - pinch.mid.x, now.mid.y - pinch.mid.y, zoom);
      }
      pinch = now;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('touchstart', onTouch, { passive: false });
    element.addEventListener('touchmove', onTouch, { passive: false });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouch);
      element.removeEventListener('touchmove', onTouch);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [target]);
}
