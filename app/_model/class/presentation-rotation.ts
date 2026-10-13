type PositionedPin = { x: number; y: number };
type Rectangle = { left: number; right: number; top: number; bottom: number };
type PositionedRectangle = { id: string; bounds: Rectangle };

const PIN_SIZE = 30;
const PIN_COLLISION_STEP = 38;

export function crossedPinMilestone(previousCount: number, currentCount: number) {
  const previousMilestone = Math.floor(Math.max(0, previousCount) / 10);
  const currentMilestone = Math.floor(Math.max(0, currentCount) / 10);
  return currentMilestone > previousMilestone ? currentMilestone * 10 : null;
}

export function resolvePinDisplayPositions<T extends PositionedPin & { id: string }>(pins: readonly T[], width: number, height: number) {
  const positions = new Map<string, PositionedPin>();
  if (width <= 0 || height <= 0) return positions;
  const offsets = [{ x: 0, y: 0 }];
  // ponytail: 캔버스 수용량을 넘으면 일부 겹침을 허용한다. 실제 문제가 생길 때만 클러스터로 바꾼다.
  const searchRings = Math.max(4, Math.ceil(Math.sqrt(pins.length)));
  for (let ring = 1; ring <= searchRings; ring += 1) {
    for (let y = -ring; y <= ring; y += 1) {
      for (let x = -ring; x <= ring; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) === ring) offsets.push({ x, y });
      }
    }
  }
  offsets.sort((first, second) => first.x ** 2 + first.y ** 2 - second.x ** 2 - second.y ** 2);

  const occupied: Rectangle[] = [];
  for (const pin of pins) {
    const origin = { x: pin.x * width, y: pin.y * height };
    let anchor = {
      x: Math.max(0, Math.min(width - PIN_SIZE, origin.x)),
      y: Math.max(PIN_SIZE, Math.min(height, origin.y))
    };
    for (const offset of offsets) {
      const candidate = {
        x: Math.max(0, Math.min(width - PIN_SIZE, origin.x + offset.x * PIN_COLLISION_STEP)),
        y: Math.max(PIN_SIZE, Math.min(height, origin.y + offset.y * PIN_COLLISION_STEP))
      };
      const bounds = { left: candidate.x, right: candidate.x + PIN_SIZE, top: candidate.y - PIN_SIZE, bottom: candidate.y };
      if (occupied.every((other) => !rectanglesOverlap(bounds, other))) {
        anchor = candidate;
        break;
      }
    }
    occupied.push({ left: anchor.x, right: anchor.x + PIN_SIZE, top: anchor.y - PIN_SIZE, bottom: anchor.y });
    positions.set(pin.id, { x: anchor.x / width, y: anchor.y / height });
  }
  return positions;
}

function pickMostDistantPin<T extends PositionedPin>(candidates: readonly T[], visiblePins: readonly PositionedPin[]) {
  if (!candidates.length) return undefined;
  if (!visiblePins.length) return candidates[0];

  return candidates.reduce((best, candidate) => {
    const nearestVisibleDistance = Math.min(...visiblePins.map((pin) => (candidate.x - pin.x) ** 2 + (candidate.y - pin.y) ** 2));
    const bestNearestDistance = Math.min(...visiblePins.map((pin) => (best.x - pin.x) ** 2 + (best.y - pin.y) ** 2));
    return nearestVisibleDistance > bestNearestDistance ? candidate : best;
  });
}

export function advancePinPlayback<T extends PositionedPin & { id: string }>(pins: readonly T[], shownPinIds: readonly string[]) {
  if (!pins.length) return { shownPinIds: [], activePinId: null };
  const shown = new Set(shownPinIds);
  const visiblePins = pins.filter((pin) => shown.has(pin.id));
  const nextPin = pickMostDistantPin(pins.filter((pin) => !shown.has(pin.id)), visiblePins);
  if (nextPin) return { shownPinIds: [...visiblePins.map((pin) => pin.id), nextPin.id], activePinId: nextPin.id };

  return { shownPinIds: [pins[0].id], activePinId: pins[0].id };
}

export function canRotatePinPlayback(showPins: boolean, pinCount: number, shownPinCount: number, selectedPinId: string | null) {
  return showPins && shownPinCount < pinCount && selectedPinId === null;
}

export function nextPresentationSlide(currentSlide: number, slideCount: number) {
  return slideCount > 0 ? (currentSlide + 1) % slideCount : 0;
}

export function presentationAutoplayDelay(
  enabled: boolean,
  showPins: boolean,
  pinCount: number,
  shownPinCount: number,
  slideCount: number,
  detailOpen: boolean
) {
  if (!enabled || slideCount < 2 || detailOpen) return null;
  if (showPins && shownPinCount < pinCount) return null;
  return showPins && pinCount > 0 ? 1000 : 3000;
}

export function slideIndexFromPageNumber(pageNumber: string, slideCount: number) {
  if (!pageNumber.trim()) return null;
  const parsed = Number(pageNumber);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= slideCount ? parsed - 1 : null;
}

export function findNewestIncomingPin<T extends { id: string }>(pins: readonly T[], previousPinIds: readonly string[]) {
  const previous = new Set(previousPinIds);
  return pins.find((pin) => !previous.has(pin.id)) ?? null;
}

export function rectanglesOverlap(first: Rectangle, second: Rectangle) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

export function resolveVisiblePresentationLabelIds(labels: readonly PositionedRectangle[], pins: readonly PositionedRectangle[], activeId: string | null) {
  const active = labels.find((label) => label.id === activeId);
  const ordered = active ? [active, ...labels.filter((label) => label !== active)] : labels;
  const retained: PositionedRectangle[] = [];

  for (const label of ordered) {
    const overlapsAnotherPin = pins.some((pin) => pin.id !== label.id && rectanglesOverlap(label.bounds, pin.bounds));
    if (label === active || (!overlapsAnotherPin && retained.every((other) => !rectanglesOverlap(label.bounds, other.bounds)))) {
      retained.push(label);
    }
  }

  return retained.map((label) => label.id);
}
