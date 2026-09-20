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
 * Reads one poi's path input - its marker's center point, and the canvas's own pixel
 * dimensions - out of its saved target: the same coordinate space PoiNode markers themselves
 * render from (maeData.target.drawingState's single SHAPES_TOOL.POI shape, and
 * maeData.target.fullCanvaXYWH), never a live/on-screen Konva shape, which can be in zoomed
 * screen-space and would misalign the path against the canvas at any other zoom level.
 * @param {object} poiItem
 * @returns {{ x: number, y: number, fullCanvaXYWH: string } | null}
 */
const getPoiPathPoint = (poiItem) => {
  const hydrated = ensureMaeData(poiItem);
  const target = hydrated.maeData?.target;
  if (!target?.drawingState || !target?.fullCanvaXYWH) return null;

  const drawingState = typeof target.drawingState === 'string'
    ? JSON.parse(target.drawingState)
    : target.drawingState;
  const shape = drawingState?.shapes?.[0];
  if (typeof shape?.x !== 'number' || typeof shape?.y !== 'number') return null;

  return { fullCanvaXYWH: target.fullCanvaXYWH, x: shape.x, y: shape.y };
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
 * provides that ordering - no new data model needed), sized to the canvas's own pixel
 * dimensions so Mirador doesn't scale/position it incorrectly relative to the image.
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

  if (points.length < 2 || !fullCanvaXYWH || !resolvedCanvasId) {
    return { ...journeyEntry.item, target: resolvedCanvasId ?? journeyEntry.item.target };
  }

  const [, , fullW, fullH] = fullCanvaXYWH.split(',');
  const svg = smoothCurveToSvg({ fullH, fullW, points });

  return {
    ...journeyEntry.item,
    target: getIIIFTargetAsFragmentSVGSelector({ svg }, resolvedCanvasId),
  };
};
