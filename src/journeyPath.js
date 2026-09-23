import { groupAnnotationItems } from './annotationListGrouping';
import {
  convertIIIFAnnoToMaeData, getIIIFTargetAsFragmentSVGSelector, smoothCurveToSvg,
} from './IIIFUtils';

/**
 * Synthesizes and auto-refreshes a journey's SVG path target from its POIs' own saved
 * positions (issue #358, V0): a journey has no Konva stage of its own (see JourneyTemplate.jsx),
 * so its path is built directly from data already on disk - each POI's center point and the
 * canvas's own pixel size - rather than from any live drawing.
 */

/** Ensures a raw annotation item carries `maeData.target`, reconstructing it (on a shallow
 * copy, never mutating the original redux-held object) for an annotation that predates or
 * bypassed MAE's own save path - see convertIIIFAnnoToMaeData's own doc. Most POIs already
 * carry maeData.target as saved by finalizeSpatialTarget, so this is a no-op for them. */
const ensureMaeData = (item) => (
  item.maeData?.target ? item : convertIIIFAnnoToMaeData({ ...item })
);

/**
 * Reads one poi's path input - its marker's center point, out of its saved target: the same
 * coordinate space PoiNode markers themselves render from (maeData.target.drawingState's
 * single SHAPES_TOOL.POI shape), never a live/on-screen Konva shape, which can be in zoomed
 * screen-space and would misalign the path against the canvas at any other zoom level.
 *
 * `maeData.target.fullCanvaXYWH` is read too when present, but is no longer required: a POI
 * saved as a real IIIF PointSelector (see IIIFUtils.js's getIIIFTargetAsPointSelector) has no
 * such field - a point selector has no notion of canvas size - unlike a legacy SvgSelector-
 * traced POI, whose maeData reconstruction derives it from the traced SVG's own width/height.
 * @param {object} poiItem
 * @returns {{ x: number, y: number, fullCanvaXYWH: string|undefined } | null}
 */
const getPoiPathPoint = (poiItem) => {
  const hydrated = ensureMaeData(poiItem);
  const target = hydrated.maeData?.target;
  if (!target?.drawingState) return null;

  const drawingState = typeof target.drawingState === 'string'
    ? JSON.parse(target.drawingState)
    : target.drawingState;
  const shape = drawingState?.shapes?.[0];
  if (typeof shape?.x !== 'number' || typeof shape?.y !== 'number') return null;

  return { fullCanvaXYWH: target.fullCanvaXYWH, x: shape.x, y: shape.y };
};

/** A journey's synthesized path is sized to some `fullW`/`fullH` pair purely to produce a
 * valid wrapping `<svg>` - Mirador's CanvasAnnotationDisplay.svgContext() draws each path's `d`
 * directly in canvas pixel space and never reads the wrapper's own width/height attributes, so
 * this value is cosmetic, not positional. Used only when no POI on the journey supplies a real
 * one (i.e. every POI was saved as a PointSelector - see getPoiPathPoint's own doc): a bounding
 * box of the points themselves, padded slightly, is always large enough to contain the curve.
 * @param {{ x: number, y: number }[]} points
 * @returns {[number, number]} [fullW, fullH]
 */
const fallbackFullCanvasSize = (points) => {
  const padding = 50;
  const fullW = Math.max(...points.map((point) => point.x)) + padding;
  const fullH = Math.max(...points.map((point) => point.y)) + padding;
  return [fullW, fullH];
};

/** A journey's own saved `target` is never a reliable source of the real canvas id: on read,
 * the server (journeyToAnnotation) fills an unset target with a synthetic placeholder whose
 * `source` is just the journey's own annotation id (`maps://annotations/<id>/canvas`), not the
 * IIIF canvas this journey's path is drawn on - Mirador's own AnnotationsOverlay matches a
 * resource's target id against real `canvasWorld.canvases` ids to decide what to draw where, so
 * a path saved against that placeholder id silently never renders (it never matches any real
 * canvas). Every caller of recomputeJourneyPath already knows the real canvas it's operating on
 * (it's what it passed to `storageAdapter`), so this is a fallback only for the case a caller
 * hasn't been updated to pass one - used mainly by tests exercising this function directly.
 */
const canvasIdOfJourney = (journeyItem) => (
  typeof journeyItem.target === 'string' ? journeyItem.target : journeyItem.target?.source
);

/**
 * Recomputes `journeyId`'s path target from its current POIs (issue #358): a smooth open curve
 * through each POI's center point, ordered by dbf:journey.order (groupAnnotationItems already
 * provides that ordering - no new data model needed).
 *
 * With fewer than two usable POI points, the journey has no line to draw and its target is
 * reset back to the plain canvas id (no path). Both the manual "refresh path" action and every
 * automatic POI membership/order/delete trigger call this same function, so they can never
 * diverge.
 * @param {string} journeyId
 * @param {object[]} items - the canvas's raw AnnotationPage items (as passed to
 *   groupAnnotationItems elsewhere in this list)
 * @param {string} [canvasId] - the real IIIF canvas id the computed path's target should point
 *   at (every caller already has this - it's what it passes to `storageAdapter`). Falls back to
 *   whatever the journey's own saved target claims when omitted, which is usually wrong (see
 *   canvasIdOfJourney's own doc) - callers should always pass this explicitly.
 * @returns {object|null} the journey annotation with an updated `target`, or `null` when
 *   `journeyId` doesn't match any journey in `items`
 */
export const recomputeJourneyPath = (journeyId, items, canvasId) => {
  const journeyEntry = groupAnnotationItems(items)
    .find((entry) => entry.kind === 'Journey' && entry.id === journeyId);
  if (!journeyEntry) return null;

  const resolvedCanvasId = canvasId ?? canvasIdOfJourney(journeyEntry.item);
  const points = [];
  let fullCanvaXYWH;
  journeyEntry.pois.forEach((poi) => {
    const point = getPoiPathPoint(poi);
    if (!point) return;
    points.push({ x: point.x, y: point.y });
    fullCanvaXYWH ??= point.fullCanvaXYWH;
  });

  if (points.length < 2 || !resolvedCanvasId) {
    return { ...journeyEntry.item, target: resolvedCanvasId ?? journeyEntry.item.target };
  }

  const [fullW, fullH] = fullCanvaXYWH
    ? fullCanvaXYWH.split(',').slice(2)
    : fallbackFullCanvasSize(points);
  const svg = smoothCurveToSvg({ fullH, fullW, points });

  return {
    ...journeyEntry.item,
    target: getIIIFTargetAsFragmentSVGSelector({ svg }, resolvedCanvasId),
  };
};

/** The SVG path value of a journey target, or null when it has no path. */
const journeyPathSvg = (target) => [].concat(target?.selector ?? [])
  .find((selector) => selector?.type === 'SvgSelector')?.value ?? null;

/**
 * Whether two journey targets draw the same path - what decides if a recomputed path is worth
 * saving. Compares what the path is rather than how it's serialized: the server hands targets
 * back with their keys reordered (Postgres jsonb), and stores "no path" in several forms (the
 * plain canvas id recomputeJourneyPath sets, `null`, or a placeholder FragmentSelector), which
 * are all the same "no path" here. A path is only the same when drawn on the same canvas too.
 * @param {object|string|null} a
 * @param {object|string|null} b
 * @returns {boolean}
 */
export const isSameJourneyPath = (a, b) => {
  const pathA = journeyPathSvg(a);
  const pathB = journeyPathSvg(b);
  if (pathA === null || pathB === null) return pathA === pathB;
  return pathA === pathB && a.source === b.source;
};
