import React, {
  useCallback, useLayoutEffect, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import { Grid, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AnnotationDrawing from '../../AnnotationFormOverlay/AnnotationDrawing';
import { KONVA_MODE, SHAPES_TOOL } from '../../AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

/**
 * Fixed toolState for the POI drawing engine: activeTool never changes (no toolbar exists to
 * change it to), and fillColor/strokeColor/strokeWidth are unused - PoiNode's appearance is
 * fixed, not read from toolState. A stable module-level reference so AnnotationDrawing's
 * `useEffect(..., [toolState])` (which syncs toolState's colors onto the selected shape outside
 * KONVA_MODE.TARGET) only ever runs once, harmlessly, on mount.
 */
const POI_TOOL_STATE = { activeTool: SHAPES_TOOL.POI };

/** No-op: nothing here ever changes toolState (see POI_TOOL_STATE above) */
const noop = () => {};

/**
 * TargetPointInput (tetras-dbf/mirador-annotation-editor#21) - a minimal spatial-target input
 * restricted to a single click-to-place POI marker: no shape toolbar, no color/style panel, no
 * resize handles. Deliberately does not reuse TargetSpatialInput/AnnotationFormOverlay (the
 * general shape toolbar shared by every other template) - only AnnotationDrawing, the drawing
 * engine itself, which POI's SHAPES_TOOL.POI case extends additively.
 * @param playerReferences
 * @param setTargetDrawingState
 * @param targetDrawingState
 * @param windowId
 */
export function TargetPointInput({
  playerReferences,
  setTargetDrawingState,
  targetDrawingState,
  windowId,
}) {
  const { t } = useTranslation();

  const [drawingState, setDrawingState] = useState(() => {
    const shapes = Array.isArray(targetDrawingState?.shapes) ? targetDrawingState.shapes : [];
    return {
      currentShape: null,
      isDrawing: false,
      shapes,
      ...targetDrawingState,
    };
  });

  const [scale, setScale] = useState(playerReferences.getScale());
  const updateScale = useCallback(() => {
    const nxt = playerReferences.getScale();
    setScale((prev) => (prev === nxt ? prev : nxt));
  }, [playerReferences]);

  // Emit to parent only when shapes identity actually changes, matching TargetSpatialInput
  const lastShapesRef = useRef(drawingState.shapes);
  useLayoutEffect(() => {
    const prev = lastShapesRef.current;
    const next = drawingState.shapes;
    if (prev === next) return;
    lastShapesRef.current = next;
    setTargetDrawingState({ drawingState });
  }, [drawingState.shapes, setTargetDrawingState, drawingState]);

  // A POI target is always a single shape - dragging the existing marker replaces it in place
  // (by id) rather than appending, matching handleMouseDown's click-to-place/replace semantics.
  const updateCurrentShapeInShapes = useCallback((currentShape) => {
    setTimeout(() => {
      setDrawingState((prev) => {
        if (!currentShape) {
          return prev.currentShape == null ? prev : { ...prev, currentShape: null };
        }
        if (prev.currentShape === currentShape && prev.shapes[0] === currentShape) return prev;
        return { ...prev, currentShape, shapes: [currentShape] };
      });
    }, 0);
  }, []);

  return (
    <Grid container direction="column">
      <Typography variant="subFormSectionTitle">{t('poi_click_to_place')}</Typography>
      <Grid container direction="row" spacing={2}>
        <AnnotationDrawing
          displayMode={KONVA_MODE.POI}
          drawingState={drawingState}
          playerReferences={playerReferences}
          scale={scale}
          setColorToolFromCurrentShape={noop}
          setDrawingState={setDrawingState}
          setToolState={noop}
          tabView="edit"
          toolState={POI_TOOL_STATE}
          updateCurrentShapeInShapes={updateCurrentShapeInShapes}
          updateScale={updateScale}
          windowId={windowId}
        />
      </Grid>
    </Grid>
  );
}

TargetPointInput.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  playerReferences: PropTypes.object.isRequired,
  setTargetDrawingState: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types
  targetDrawingState: PropTypes.object.isRequired,
  windowId: PropTypes.string.isRequired,
};
