import { v4 as uuidv4 } from 'uuid';
import { convertIIIFAnnoToMaeData, getIIIFTargetAsPointSelector } from './IIIFUtils';
import { POI_MARKER_STYLE, SHAPES_TOOL } from './annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

/**
 * A POI annotation moved to a new point on its canvas (AlMadar-Digital/platform#427, "mass POI
 * moving"): its IIIF target becomes a PointSelector on `point`, and its `maeData.target` marker
 * follows, so the edit form opens on the new spot. Everything else is kept as is. Works on a
 * copy - the given item is the one held in Mirador's store.
 * @param {object} poi - a raw POI annotation, as held in `state.annotations`
 * @param {{ x: number, y: number }} point - the new position, in canvas pixels
 * @param {string} canvasId
 * @returns {object} the moved annotation, ready to save
 */
export const withMovedPoiTarget = (poi, point, canvasId) => {
  const hydrated = poi.maeData?.target ? poi : convertIIIFAnnoToMaeData({ ...poi });
  const target = hydrated.maeData?.target ?? {};
  const drawingState = typeof target.drawingState === 'string'
    ? JSON.parse(target.drawingState)
    : (target.drawingState ?? {});
  const previousShape = drawingState.shapes?.[0] ?? {
    ...POI_MARKER_STYLE,
    id: uuidv4(),
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    type: SHAPES_TOOL.POI,
  };
  const shape = { ...previousShape, x: point.x, y: point.y };

  // `svg` (the marker as traced on the form's drawing layer) is left out: it would still show
  // the old spot, and a point's position is its PointSelector.
  const { svg, ...maeTarget } = target;

  return {
    ...hydrated,
    maeData: {
      ...hydrated.maeData,
      target: {
        ...maeTarget,
        drawingState: JSON.stringify({
          ...drawingState,
          currentShape: shape,
          isDrawing: false,
          shapes: [shape],
        }),
      },
    },
    target: getIIIFTargetAsPointSelector(canvasId, shape),
  };
};
