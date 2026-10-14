"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./pin-composer.module.css";

/** Keeps the existing question form next to its normalized slide coordinate. */
export function PinComposer({ canvasRef, x, y, onClose, children, duration = 420 }: {
  duration?: number;
  canvasRef: RefObject<HTMLDivElement | null>;
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const tailRef = useRef<SVGPathElement>(null);
  const bodyRef = useRef<SVGRectElement>(null);
  const closeRef = useRef(onClose);
  const opened = useRef(false);
  useLayoutEffect(() => { closeRef.current = onClose; });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const morphBody = bodyRef.current;
    const canvas = canvasRef.current?.querySelector(".slide-canvas");
    if (!panel || !canvas) return;
    let frame = 0;
    const reposition = () => {
      const view = window.visualViewport;
      const leftEdge = (view?.offsetLeft ?? 0) + 8;
      const topEdge = (view?.offsetTop ?? 0) + 8;
      const width = (view?.width ?? window.innerWidth) - 16;
      const height = (view?.height ?? window.innerHeight) - 16;
      panel.style.width = `${Math.min(340, width)}px`;
      panel.style.maxHeight = `${height}px`;
      const box = canvas.getBoundingClientRect();
      const pointX = box.left + x * box.width;
      const pointY = box.top + y * box.height;
      // Layout dimensions must not include the opening animation's scale.
      const size = { width: panel.offsetWidth, height: panel.offsetHeight };
      const fitsRight = pointX + 20 + size.width <= leftEdge + width;
      const fitsLeft = pointX - 20 - size.width >= leftEdge;
      const preferredLeft = pointX + 20 + size.width <= leftEdge + width
        ? pointX + 20 : pointX - size.width - 20;
      const left = Math.max(leftEdge, Math.min(preferredLeft, leftEdge + width - size.width));
      let top = Math.max(topEdge, Math.min(pointY - 20, topEdge + height - size.height));
      if (!fitsRight && !fitsLeft) {
        const above = pointY - topEdge - 20;
        const below = topEdge + height - pointY - 20;
        panel.style.maxHeight = `${Math.max(80, Math.max(above, below))}px`;
        size.height = panel.offsetHeight;
        top = above >= below ? pointY - 20 - size.height : pointY + 20;
      }
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
      let path: string;
      if (!fitsRight && !fitsLeft) {
        const baseX = clamp(pointX, left + 22, left + size.width - 22);
        const baseY = pointY < top ? top + 1 : top + size.height - 1;
        path = `M ${baseX - 10} ${baseY} L ${pointX} ${pointY} L ${baseX + 10} ${baseY}`;
      } else {
        const baseX = pointX < left ? left + 1 : left + size.width - 1;
        const baseY = clamp(pointY, top + 22, top + size.height - 22);
        path = `M ${baseX} ${baseY - 10} L ${pointX} ${pointY} L ${baseX} ${baseY + 10}`;
      }
      tailRef.current?.setAttribute("d", path);
      panel.style.transformOrigin = "0 0";
      if (!opened.current) {
        opened.current = true;
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          panel.style.opacity = "0";
          panel.style.pointerEvents = "none";
          const start = performance.now();
          const draw = (now: number) => {
            const progress = Math.min(1, (now - start) / Math.max(1, duration));
            const eased = 1 - Math.pow(1 - progress, 3);
            const mix = (a: number, b: number) => a + (b - a) * eased;
            const bx = mix(pointX - 14, left);
            const by = mix(pointY - 36, top);
            const bw = mix(28, size.width);
            const bh = mix(28, size.height);
            const body = bodyRef.current;
            if (body) {
              body.style.display = "block";
              for (const [key, value] of Object.entries({ x: bx, y: by, width: bw, height: bh, rx: mix(14, 12) })) body.setAttribute(key, String(value));
            }
            // A single anchored tip persists while the bubble body expands.
            const endNumbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
            tailRef.current?.setAttribute("d", `M ${mix(pointX - 8, endNumbers[0])} ${mix(pointY - 12, endNumbers[1])} L ${pointX} ${pointY} L ${mix(pointX + 8, endNumbers[4])} ${mix(pointY - 12, endNumbers[5])}`);
            if (progress < 1) frame = requestAnimationFrame(draw);
            else {
              if (body) body.style.display = "none";
              panel.style.opacity = "1";
              panel.style.pointerEvents = "";
              panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(100, duration / 4) });
            }
          };
          draw(start);
        }
      }
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(canvas);
    observer.observe(panel);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      cancelAnimationFrame(frame);
      // React Strict Mode replays setup after cleanup in local development.
      // A cancelled opening must be allowed to start again on that replay.
      opened.current = false;
      panel.style.opacity = "1";
      panel.style.pointerEvents = "";
      if (morphBody) morphBody.style.display = "none";
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [canvasRef, x, y, duration]);

  useLayoutEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  return <div className={styles.root}>
    <div className="pin-composer-dismiss" aria-hidden="true" onPointerDown={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }} onClick={(event) => { event.stopPropagation(); closeRef.current(); }} />
    <svg className="pin-composer-tail" aria-hidden="true"><rect ref={bodyRef} style={{ display: "none" }} /><path ref={tailRef} /></svg>
    <section ref={panelRef} className="student-question-modal pin-composer" role="dialog"
      tabIndex={-1} aria-labelledby="question-modal-title">{children}</section>
  </div>;
}
