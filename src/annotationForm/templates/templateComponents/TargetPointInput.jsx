import React, {
  useCallback, useLayoutEffect, useReducer, useRef, useState,
} from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import {
  Grid, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import PanToolIcon from '@mui/icons-material/PanToolSharp';
import GpsFixedIcon from '@mui/icons-material/GpsFixedSharp';
import { useTranslation } from 'react-i18next';
import AnnotationDrawing from '../../AnnotationFormOverlay/AnnotationDrawing';
import {
  KONVA_MODE, OVERLAY_TOOL, SHAPES_TOOL,
} from '../../AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

/**
 * The two ways the pointer works on the map while editing a point (AlMadar-Digital/platform#427):
 * - `target`: clicking places the point, the marker can be dragged, the wheel zooms the map;
 * - `move`: the map pans and zooms freely and the point can't be changed by accident.
 */
export const POINT_INPUT_MODE = { MOVE: 'move', TARGET: 'target' };

/**
 * Fixed toolState per mode for the POI drawing engine: fillColor/strokeColor/strokeWidth are
 * unused - PoiNode's appearance is fixed, not read from toolState. Stable module-level
 * references so AnnotationDrawing's `useEffect(..., [toolState])` (which syncs toolState's
 * colors onto the selected shape outside KONVA_MODE.TARGET) only runs when the mode changes.
 */
const TOOL_STATE_BY_MODE = {
  [POINT_INPUT_MODE.MOVE]: { activeTool: OVERLAY_TOOL.PAN },
  [POINT_INPUT_MODE.TARGET]: { activeTool: SHAPES_TOOL.POI },
};

/** No-op: nothing here ever changes toolState (see TOOL_STATE_BY_MODE above) */
const noop = () => {};

/**
 * TargetPointInput (tetras-dbf/mirador-annotation-editor#21) - a minimal spatial-target input
 * restricted to a single click-to-place POI marker: no shape toolbar, no color/style panel, no
 * resize handles. Deliberately does not reuse TargetSpatialInput/AnnotationFormOverlay (the
 * general shape toolbar shared by every other template) - only AnnotationDrawing, the drawing
 * engine itself, which POI's SHAPES_TOOL.POI case extends additively.
 *
 * A Move/Target toggle floats over the top right of the map. A new point starts in Target,
 * so it can be placed right away; an existing one in Move, so navigating the map doesn't move
 * it by accident.
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
      // Recover the existing point as the selected shape so an editing user
      // sees/can immediately drag the marker they already placed
      ...(shapes.length > 0 ? { currentShape: shapes[0] } : {}),
    };
  });

  const [mode, setMode] = useState(() => (
    drawingState.shapes.length > 0 ? POINT_INPUT_MODE.MOVE : POINT_INPUT_MODE.TARGET
  ));

  const [scale, setScale] = useState(playerReferences.getScale());
  // The drawing layer is positioned over the image from the viewport at render time, so it
  // must re-render whenever the map moves - not only when the zoom (scale) changes - or a pan
  // in Move mode would leave the marker behind, off its point.
  const [, onViewportMoved] = useReducer((count) => count + 1, 0);
  const updateScale = useCallback(() => {
    const nxt = playerReferences.getScale();
    setScale((prev) => (prev === nxt ? prev : nxt));
    onViewportMoved();
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

  const mapContainer = playerReferences.getContainer?.();
  const modeToggle = (
    <Paper
      elevation={3}
      sx={{
        top: (theme) => theme.spacing(2),
        insetInlineEnd: (theme) => theme.spacing(2),
        position: 'absolute',
        zIndex: 10,
      }}
    >
      <ToggleButtonGroup
        aria-label={t('poi_mode')}
        exclusive
        onChange={(event, newMode) => newMode && setMode(newMode)}
        size="small"
        value={mode}
      >
        <Tooltip title={t('poi_mode_move')}>
          <ToggleButton aria-label={t('poi_mode_move')} value={POINT_INPUT_MODE.MOVE}>
            <PanToolIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title={t('poi_mode_target')}>
          <ToggleButton aria-label={t('poi_mode_target')} value={POINT_INPUT_MODE.TARGET}>
            <GpsFixedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Paper>
  );

  return (
    <Grid container direction="column">
      <Typography variant="subFormSectionTitle">
        {t(mode === POINT_INPUT_MODE.MOVE ? 'poi_move_hint' : 'poi_click_to_place')}
      </Typography>
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
          toolState={TOOL_STATE_BY_MODE[mode]}
          updateCurrentShapeInShapes={updateCurrentShapeInShapes}
          updateScale={updateScale}
          windowId={windowId}
        />
      </Grid>
      {mapContainer && ReactDOM.createPortal(modeToggle, mapContainer)}
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
