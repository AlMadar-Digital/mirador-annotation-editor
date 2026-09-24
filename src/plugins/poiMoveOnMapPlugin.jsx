import React, {
  useCallback, useEffect, useReducer, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  Paper, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import PanToolIcon from '@mui/icons-material/PanToolSharp';
import GpsFixedIcon from '@mui/icons-material/GpsFixedSharp';
import { Layer, Stage } from 'react-konva';
import { useTranslation } from 'react-i18next';
import {
  getCompanionWindowsForContent,
  getVisibleCanvases,
  receiveAnnotation as receiveAnnotationAction,
} from 'dbf-mirador';
import PoiNode from '../annotationForm/AnnotationFormOverlay/KonvaDrawing/shapes/PoiNode';
import {
  getPoiMarkerRadius, POI_MARKER_STYLE,
} from '../annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { POINT_INPUT_MODE } from '../annotationForm/templates/templateComponents/TargetPointInput';
import { saveAnnotationInStorageAdapter } from '../annotationForm/AnnotationFormUtils';
import { getPoiPathPoint, refreshJourneyPath } from '../journeyPath';
import { withMovedPoiTarget } from '../poiMove';
import translations from '../locales/locales';

/** No-op: a marker here has nothing to select or start on drag - only its drop matters. */
const noop = () => {};

/**
 * Where the canvas sits in the viewer, so the markers' layer can be drawn in canvas pixels:
 * Mirador lays a canvas out in OpenSeadragon viewport coordinates that are its own pixels, so
 * the visible viewport bounds give both the layer's offset and its zoom.
 * @param {object} viewer - the OpenSeadragon viewer
 * @returns {{ height: number, scale: number, width: number, x: number, y: number } | null}
 */
const getCanvasLayout = (viewer) => {
  const bounds = viewer?.viewport?.getBounds(true);
  const container = viewer?.container;
  if (!bounds || !container || !bounds.width) return null;
  const scale = container.clientWidth / bounds.width;
  return {
    height: container.clientHeight,
    scale,
    width: container.clientWidth,
    x: -bounds.x * scale,
    y: -bounds.y * scale,
  };
};

/**
 * Moving POIs straight on the map (AlMadar-Digital/platform#427, "mass POI moving"). While no
 * annotation form is open, a Move/Target toggle floats over the top right of the map, like the
 * one in a POI's own form:
 * - Move: the map pans and zooms as usual;
 * - Target: every POI of the canvas gets a cross marker that can be dragged. Dropping one
 *   saves the POI on its new spot and, when it belongs to a journey, redraws the journey's path.
 *   The wheel still zooms the map.
 */
export function PoiMoveOnMap({
  canvasId = null,
  canvasHeight = 0,
  canvasWidth = 0,
  isFormOpen,
  pois,
  receiveAnnotation,
  storageAdapter = null,
  viewer = null,
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(POINT_INPUT_MODE.MOVE);
  const [, onViewportMoved] = useReducer((count) => count + 1, 0);
  // Drops are saved one after another: most adapters' update() rewrites the whole annotation
  // page, so two saves in flight could each undo the other.
  const saveQueueRef = useRef(Promise.resolve());

  const available = !isFormOpen && !!storageAdapter && !!canvasId && pois.length > 0;
  const isTarget = available && mode === POINT_INPUT_MODE.TARGET;

  // Opening a form takes the map over; coming back to it starts again in Move.
  useEffect(() => {
    if (!available) setMode(POINT_INPUT_MODE.MOVE);
  }, [available]);

  useEffect(() => {
    if (!isTarget || typeof viewer?.addHandler !== 'function') return undefined;
    viewer.addHandler('animation', onViewportMoved);
    viewer.addHandler('resize', onViewportMoved);
    return () => {
      viewer.removeHandler('animation', onViewportMoved);
      viewer.removeHandler('resize', onViewportMoved);
    };
  }, [isTarget, viewer]);

  const savePoi = useCallback((poi, point) => {
    const adapter = storageAdapter(canvasId);
    /** Saves the moved POI, then redraws its journey's path from the page the save resolved with */
    const run = async () => {
      const annoPage = await saveAnnotationInStorageAdapter(
        canvasId,
        adapter,
        receiveAnnotation,
        withMovedPoiTarget(poi, point, canvasId),
      );
      await refreshJourneyPath(
        poi['dbf:journey']?.id,
        annoPage,
        canvasId,
        adapter,
        receiveAnnotation,
      );
    };
    const result = saveQueueRef.current.then(run, run);
    saveQueueRef.current = result.catch(() => {});
    return result;
  }, [canvasId, receiveAnnotation, storageAdapter]);

  if (!available) return null;

  const toggle = (
    <Paper
      elevation={3}
      sx={{
        insetInlineEnd: (theme) => theme.spacing(2),
        position: 'absolute',
        top: (theme) => theme.spacing(2),
        zIndex: 1001,
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
        <Tooltip title={t('pois_mode_target')}>
          <ToggleButton aria-label={t('pois_mode_target')} value={POINT_INPUT_MODE.TARGET}>
            <GpsFixedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Paper>
  );

  const layout = isTarget ? getCanvasLayout(viewer) : null;
  const radius = getPoiMarkerRadius(canvasWidth, canvasHeight);

  /** Zooms the map on wheel as if the markers' layer wasn't there - see AnnotationDrawing. */
  const handleWheel = (e) => {
    const viewerCanvas = viewer?.canvas;
    if (!viewerCanvas) return;
    e.evt.preventDefault();
    viewerCanvas.dispatchEvent(new WheelEvent(e.evt.type, e.evt));
  };

  return (
    <>
      {layout && (
        <Stage
          height={layout.height}
          onWheel={handleWheel}
          style={{
            cursor: 'crosshair', left: 0, position: 'absolute', top: 0, zIndex: 1000,
          }}
          width={layout.width}
        >
          <Layer scaleX={layout.scale} scaleY={layout.scale} x={layout.x} y={layout.y}>
            {pois.map(({ point, poi }) => (
              <PoiNode
                handleDragEnd={(evt) => {
                  const node = evt.currentTarget;
                  savePoi(poi, { x: node.x(), y: node.y() })
                    // A failed save puts the marker back where the POI still is.
                    .catch(() => node.position(point));
                }}
                handleDragStart={noop}
                key={poi.id}
                onShapeClick={noop}
                shape={{
                  ...POI_MARKER_STYLE, id: poi.id, radius, x: point.x, y: point.y,
                }}
              />
            ))}
          </Layer>
        </Stage>
      )}
      {toggle}
    </>
  );
}

PoiMoveOnMap.defaultProps = {
  canvasHeight: 0,
  canvasId: null,
  canvasWidth: 0,
  storageAdapter: null,
  viewer: null,
};

PoiMoveOnMap.propTypes = {
  canvasHeight: PropTypes.number,
  canvasId: PropTypes.string,
  canvasWidth: PropTypes.number,
  isFormOpen: PropTypes.bool.isRequired,
  pois: PropTypes.arrayOf(PropTypes.shape({
    // eslint-disable-next-line react/forbid-prop-types
    poi: PropTypes.object.isRequired,
    point: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }).isRequired,
  })).isRequired,
  receiveAnnotation: PropTypes.func.isRequired,
  storageAdapter: PropTypes.func,
  // eslint-disable-next-line react/forbid-prop-types
  viewer: PropTypes.object,
};

const poisCache = new WeakMap();

/**
 * The POIs of a canvas that have a point to drag, each with that point. A previous result is
 * reused while the canvas's annotations are the same, so the markers don't re-render on every
 * unrelated store change.
 * @param {object|undefined} annotationsOnCanvas - `state.annotations[canvasId]`
 * @returns {{ poi: object, point: { x: number, y: number } }[]}
 */
const getMovablePois = (annotationsOnCanvas) => {
  if (!annotationsOnCanvas) return [];
  if (poisCache.has(annotationsOnCanvas)) return poisCache.get(annotationsOnCanvas);
  const pois = Object.values(annotationsOnCanvas)
    .flatMap((page) => page?.json?.items ?? [])
    .filter((item) => item['dbf:kind'] === 'POI')
    .map((poi) => ({ poi, point: getPoiPathPoint(poi) }))
    .filter(({ point }) => point);
  poisCache.set(annotationsOnCanvas, pois);
  return pois;
};

/** */
function mapStateToProps(state, { windowId }) {
  const [canvas] = getVisibleCanvases(state, { windowId });
  const { annotation = {} } = state.config;
  return {
    canvasHeight: canvas?.getHeight?.() ?? 0,
    canvasId: canvas?.id ?? null,
    canvasWidth: canvas?.getWidth?.() ?? 0,
    isFormOpen: Object.keys(
      getCompanionWindowsForContent(state, { content: 'annotationCreation', windowId }),
    ).length > 0,
    pois: canvas ? getMovablePois(state.annotations[canvas.id]) : [],
    storageAdapter: annotation.readonly === true ? null : (annotation.adapter ?? null),
  };
}

const mapDispatchToProps = {
  receiveAnnotation: receiveAnnotationAction,
};

const poiMoveOnMapPlugin = {
  component: PoiMoveOnMap,
  config: {
    translations,
  },
  mapDispatchToProps,
  mapStateToProps,
  mode: 'add',
  target: 'OpenSeadragonViewer',
};

export default poiMoveOnMapPlugin;
