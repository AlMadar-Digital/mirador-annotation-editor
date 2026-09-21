import { v4 as uuidv4 } from 'uuid';

import {
  getKonvaAsDataURL,
  getPoiMarkerRadius,
  getSvg,
  SHAPES_TOOL,
  OVERLAY_TOOL,
  POI_MARKER_STYLE,
} from './annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { TARGET_TOOL_STATE, TEMPLATE } from './annotationForm/AnnotationFormUtils';

/**
 * Check if annotation is exportable to image in case of Konva annotation
 * @param maeData
 * @returns {boolean}
 */
function isAnnotationExportableToImage(maeData) {
  return false;
}

/**
 * Check if the shape has the same stroke and fill colors as the TARGET_TOOL_STATE
 * It's used to create SVG target instead simple target when user create only one shape
 * and edit it.
 * @param shape
 * @returns {boolean}
 */
const hasMatchingStrokeAndFillColors = (shape) => {
  return shape.strokeColor === TARGET_TOOL_STATE.strokeColor
    && shape.fillColor === TARGET_TOOL_STATE.fillColor;
};

/**
 * Check if the shape is a rectangle
 * @param shape
 * @returns {boolean}
 */
const isRectangleShape = (shape) => shape.type === SHAPES_TOOL.RECTANGLE;

/**
 * Check if the target is a simple rectangle with the same color as the tool
 * If only one, check if target need to be an SVG Target
 * @param shapes
 * @returns {boolean}
 */
const isSimpleTarget = (shapes) => {
  if (shapes.length !== 1) return false;
  const shape = shapes[0];

  return isRectangleShape(shape) && (!shape?.rotation || shape.rotation === 0)
    && hasMatchingStrokeAndFillColors(shape);
};

/**
 * Get the IIIF target from the full canvas
 * @param maeData
 * @param canvasId
 * @returns {`${string}#${string}`}
 */
const getIIIFTargetFullCanvas = (maeData, canvasId) => {
  console.info('Implement target as string on fullSizeCanvas.');
  const maeTarget = maeData.target;
  return `${canvasId}#${maeTarget.tend ? `xywh=${maeTarget.fullCanvaXYWH}&t=${maeTarget.tstart},${maeTarget.tend}` : `xywh=${maeTarget.fullCanvaXYWH}`}`;
};

/**
 * Get the IIIF target from a rectangle shape
 * @param maeTarget
 * @param canvasId
 * @param shape
 * @returns {`${string}#${string}`}
 */
const getIIIFTargetFromRectangleShape = (maeTarget, canvasId, shape) => {
  console.info('Implement target as string with one shape (rectangle)');
  let {
    x,
    y,
    width,
    height,
    scaleX,
    scaleY,
  } = shape;

  // if `width` or `height` may be negative if the annotation was not created by dragging from the top left.
  // convert to ensure that x and y always describe the top-left corner of an annotation and that
  // `width` and `height` are positive.
  // (can be useful to use xywh in Cantaloupe, for example).
  if (width < 0) {
    width = -width;
    x -= width;
  }
  if (height < 0) {
    height = -height;
    y -= height;
  }

  // Image have not tstart and tend
  // We use scaleX and scaleY to have the real size of the shape, if it has been resized
  return `${canvasId}#${maeTarget.tend ? `xywh=${x},${y},${width * scaleX},${height * scaleY}&t=${maeTarget.tstart},${maeTarget.tend}` : `xywh=${x},${y},${width * scaleX},${height * scaleY}`}`;
};

/**
 * Get the IIIF target for a POI/NestedMap point shape as a real IIIF PointSelector
 * (https://iiif.io/api/cookbook/recipe/0135-annotating-point-in-canvas/), instead of tracing
 * the marker as an SvgSelector - avoids the bbox-guessing this previously required to recover
 * a point from a traced circle path (see convertPointSelectorToMae for the read side).
 * @param {string} canvasId
 * @param {object} shape
 * @returns {{selector: {type: string, x: number, y: number}, source: string}}
 */
const getIIIFTargetAsPointSelector = (canvasId, shape) => ({
  selector: {
    type: 'PointSelector',
    x: shape.x,
    y: shape.y,
  },
  source: canvasId,
});

/**
 * Get the IIIF target as a fragment selector with SVG
 * @param maeTarget
 * @param canvasId
 * @returns {{selector: [{type: string, value},{type: string, value: string}], source}}
 */
export const getIIIFTargetAsFragmentSVGSelector = (maeTarget, canvasId) => {
  const fragmentTarget = `${maeTarget.tend ? `t=${maeTarget.tstart},${maeTarget.tend}` : ''}`;
  return {
    selector: [
      {
        type: 'SvgSelector',
        value: maeTarget.svg,
      },
      {
        type: 'FragmentSelector',
        value: `${canvasId}#${fragmentTarget}`,
      },
    ],
    source: canvasId,
  };
};

/** Get the IIIF target from the annotation state
 * @param maeData
 * @param canvasId
 * @param windowId NEEDED By MAEV
 * @param playerScale NEEDED By MAEV
 * @returns {{selector: [{type: string, value},{type: string, value: string}], source}|*|string}
 */
export const getIIIFTargetFromMaeData = (
  maeData,
  canvasId,
  windowId = null,
  playerScale = null,
) => {
  const maeTarget = maeData.target;
  const { templateType } = maeData;

  switch (templateType) {
    case TEMPLATE.IIIF_TYPE:
      return maeTarget;
    case TEMPLATE.POI_TYPE:
    case TEMPLATE.NESTED_MAP_TYPE:
      // A POI/NestedMap target is always exactly one placed marker (see isValidPointTarget), so
      // it always saves as a PointSelector - never the rectangle/SVG paths below.
      return getIIIFTargetAsPointSelector(canvasId, maeTarget.drawingState.shapes[0]);
    case TEMPLATE.TAGGING_TYPE:
    case TEMPLATE.TEXT_TYPE:
    case TEMPLATE.MULTIPLE_BODY_TYPE:
      // In some case the target can be simplified in a string
      if (isSimpleTarget(maeTarget.drawingState.shapes)) {
        console.info('Simple target detected');
        return getIIIFTargetFromRectangleShape(
          maeTarget,
          canvasId,
          maeTarget.drawingState.shapes[0],
        );
      }
      // On the other case, the target is a SVG
      console.info('Implement target as SVG/Fragment with shapes');
      return getIIIFTargetAsFragmentSVGSelector(maeTarget, canvasId);
    default:
      return getIIIFTargetFullCanvas(maeData, canvasId);
  }
};

/**
 * generate the maeData body from a IIIF annotation
 * NOTE: only textual bodies are supported.
 *
 * @param {object} anno
 * @returns {Array<string, object|object[]}
 */
const convertIIIFBodyToMae = (anno) => {
  const maeBodyTemplate = {
    purpose: 'describing',
    type: 'TextualBody',
    value: '',
  };
  // convert body if it's an object
  const convertBodyObjToMae = (_bodyObj) => {
    const maeBody = structuredClone(maeBodyTemplate);
    maeBody.value = _bodyObj.value || '';
    return maeBody;
  };
  // convert body if it's just a string
  const convertBodyValueToMae = (_bodyValue) => {
    const maeBody = structuredClone(maeBodyTemplate);
    maeBody.value = _bodyValue || '';
    return maeBody;
  };

  // NOTE if body is an array, textBody will be retyped to array
  let templateType = '';
  let textBody = {};

  // A POI annotation (motivation: 'identifying' + the dbf:kind marker - see
  // docs/superpowers/specs/2026-09-01-poi-iiif-annotation-format-design.md in root_repo) must be
  // detected before the tagging/multiple_body fallback below, or an annotation created outside
  // MAE (e.g. directly via a future StrapiAnnotationAdapter) would open under
  // MultipleBodyTemplate instead of POITemplate, and re-saving it would silently rebuild `body`
  // from MultipleBodyTemplate's shape - discarding the POI's title/description structure.
  // POITemplate derives title/descriptionItems straight from `anno.body` itself (not from
  // maeData.textBody), so textBody is intentionally left empty here.
  //
  // A "Nested Map" point (issue #350) is saved as the exact same dbf:kind: 'POI' row (it shares
  // POI's fields and is a plain `poi` Strapi document) - the only thing that distinguishes it is
  // carrying a non-null dbf:linkedMap, so that's what routes it back to NestedMapTemplate instead
  // of POITemplate when re-opened for editing.
  if (anno['dbf:kind'] === 'POI') {
    templateType = anno['dbf:linkedMap'] ? TEMPLATE.NESTED_MAP_TYPE : TEMPLATE.POI_TYPE;
  } else if (anno['dbf:kind'] === 'Journey') {
    // Same reasoning as the POI branch above: a journey has no spatial target and derives its
    // title/description straight from `anno.body` itself (see JourneyTemplate.jsx), so textBody
    // is intentionally left empty here too.
    templateType = TEMPLATE.JOURNEY_TYPE;
  } else if (anno.motivation === 'tagging' || (Array.isArray(anno.motivation) && anno.motivation.includes('tagging'))) {
    templateType = TEMPLATE.TAGGING_TYPE;
  } else {
    templateType = TEMPLATE.MULTIPLE_BODY_TYPE;
    if (anno.bodyValue) {
      textBody = convertBodyValueToMae(anno.bodyValue);
    } else if (anno.body) {
      textBody = Array.isArray(anno.body)
        ? anno.body.map(convertBodyObjToMae)
        : convertBodyObjToMae(anno.body);
    }
  }

  return [templateType, textBody];
};

/**
 * quick and dirty function to compute bounding box from an SVG Document using a hidden off-screen insertion.
 * @param {XMLDocument} svgDoc - the parsed SVG
 * @returns {{ x: number, y: number, width: number, height: number }} in the SVG's user coordinate system.
 */
const svgToXywh = (svgDoc) => {
  const parsedSvg = svgDoc.documentElement;

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.width = '0';
  container.style.height = '0';
  container.style.overflow = 'hidden';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const svg = document.importNode(parsedSvg, true);
  // some SVGs don't have explicit width/height/viewBox. We still want user-space coords.
  // wrap everything into a <g> so we can call getBBox on that group.
  const ns = 'http://www.w3.org/2000/svg';
  const wrapper = document.createElementNS(ns, 'svg');
  for (const attr of svg.attributes || []) {
    wrapper.setAttribute(attr.name, attr.value);
  }
  // move children into a group so getBBox returns combined extents
  const g = document.createElementNS(ns, 'g');
  while (svg.firstChild) g.appendChild(svg.firstChild);
  wrapper.appendChild(g);
  container.appendChild(wrapper);

  // force layout/render so getBBox is correct (reading offsetWidth is one way)
  container.offsetWidth;

  const bbox = g.getBBox(); // SVGRect-like: { x, y, width, height }
  document.body.removeChild(container);
  return bbox;
};

/**
 * generate a string-representation of an SVG rectangle based on XYWH coordinates
 * @param {{ x: number|string, y: number|string, w: number|string, fullW: number|string|undefined, fullH: number|string|undefined }}
 * @returns {string}
 */
const xywhToSvg = ({
  x, y, w, h, fullW = undefined, fullH = undefined,
}) => {
  // retype just in case
  x = parseFloat(x);
  y = parseFloat(y);
  w = parseFloat(w);
  h = parseFloat(h);
  if (fullH) {
    fullH = parseFloat(fullH);
  } else if (fullW) {
    fullW = parseFloat(fullW);
  }
  const svgWh = fullW && fullH
    ? `width='${fullW}' height='${fullH}'`
    : '';
  if ([x, y, w, h].some((val) => typeof val !== 'number')) {
    throw new Error(`xywhToSvg: x,y,w,h must be floats (got x=${x}, y=${y}, w=${w}, h=${h})`);
  }

  return `<svg
      version='1.1'
      xmlns='http://www.w3.org/2000/svg'
      xmlns:xlink='http://www.w3.org/1999/xlink'
      ${svgWh}
  >
    <defs/>
    <g><g>
      <path
        d=' M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${x + h} L ${x} ${y} Z Z'
        fill='${TARGET_TOOL_STATE.fillColor}'
        stroke='${TARGET_TOOL_STATE.strokeColor}'
        stroke-width='${TARGET_TOOL_STATE.strokeWidth}'
        fill-opacity='0'
        stroke-miterlimit='10'
        stroke-dasharray=''
      />
    </g></g>
  </svg>`;
};

/** Scales each Catmull-Rom tangent beyond the canonical 1/6-chord length (tension 1): rounds
 * off the bend at each poi more generously, at the cost of a wider, more sweeping curve on
 * either side of it. 1.5 was chosen by eye against the demo map - noticeably smoother than the
 * canonical curve without yet overshooting into a visible loop at sharp turns. */
const CURVE_TENSION = 1.5;

/**
 * Builds a smooth cubic-bezier `d` path through every point, in order, via a Catmull-Rom
 * spline: unlike a quadratic/simplified curve, this passes through each point exactly (not
 * just near it), which matters here since each point is a POI's own marker center - the curve
 * must still touch every marker, only the line between them should bend smoothly instead of
 * breaking. Segment i's control points are derived from its neighbors on each side, clamped to
 * the curve's own endpoint when there is no such neighbor (a poi has no "before the first" or
 * "after the last" leg to smooth against, so the endpoint just repeats itself there).
 * @param {{x: number, y: number}[]} points
 * @returns {string}
 */
const catmullRomToBezierPath = (points) => {
  const [first] = points;
  if (points.length === 2) {
    const [, second] = points;
    return `M ${first.x},${first.y} L ${second.x},${second.y}`;
  }

  const segments = points.slice(0, -1).map((p1, i) => {
    const p0 = points[i - 1] ?? p1;
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    // Catmull-Rom -> cubic Bezier control point conversion (tangent = CURVE_TENSION/6 of the
    // chord between the point before and the point after; CURVE_TENSION=1 is the canonical
    // conversion).
    const cp1x = p1.x + ((p2.x - p0.x) * CURVE_TENSION) / 6;
    const cp1y = p1.y + ((p2.y - p0.y) * CURVE_TENSION) / 6;
    const cp2x = p2.x - ((p3.x - p1.x) * CURVE_TENSION) / 6;
    const cp2y = p2.y - ((p3.y - p1.y) * CURVE_TENSION) / 6;
    return `C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  });

  return `M ${first.x},${first.y} ${segments.join(' ')}`;
};

/** Dash/gap lengths (in canvas pixels) for a journey's path, distinguishing it at a glance from
 * a tagging/text/etc. target's own solid TARGET_TOOL_STATE-colored outline. */
const JOURNEY_PATH_DASH_ARRAY = '15,10';

/**
 * Build a smooth open curve SVG string through an ordered list of points (issue #358):
 * synthesizes a journey's path directly from its POIs' already-saved center points, without a
 * live Konva stage (journeys mount no Konva stage at all - see JourneyTemplate.jsx). Modeled on
 * xywhToSvg's `<svg>` wrapper conventions, but with no fill (an open line, not a filled shape)
 * and a smooth multi-point `d` path (see catmullRomToBezierPath) instead of a single rectangle.
 * @param {{ points: {x: number, y: number}[], fullW: number|string, fullH: number|string }}
 * @returns {string}
 */
export const smoothCurveToSvg = ({ points, fullW: rawFullW, fullH: rawFullH }) => {
  const fullW = parseFloat(rawFullW);
  const fullH = parseFloat(rawFullH);
  if (!Number.isFinite(fullW) || !Number.isFinite(fullH)) {
    throw new Error(`smoothCurveToSvg: fullW,fullH must be floats (got fullW=${fullW}, fullH=${fullH})`);
  }

  const pathData = catmullRomToBezierPath(points);

  return `<svg
      version='1.1'
      xmlns='http://www.w3.org/2000/svg'
      xmlns:xlink='http://www.w3.org/1999/xlink'
      width='${fullW}' height='${fullH}'
  >
    <defs/>
    <g><g>
      <path
        d='${pathData}'
        fill='none'
        stroke='${POI_MARKER_STYLE.fill}'
        stroke-width='${TARGET_TOOL_STATE.strokeWidth}'
        stroke-miterlimit='10'
        stroke-dasharray='${JOURNEY_PATH_DASH_ARRAY}'
      />
    </g></g>
  </svg>`;
};

const convertFragmentSelectorToMae = (selector) => {
  // NOTE: parseFloat is VERY important. without it, when modifying annotation, it will be displayed VERY weirdly.
  const [x, y, w, h] = selector.value.replace('xywh=', '').split(',').map(parseFloat);
  const currentShape = {
    id: uuidv4(),
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    x,
    y,
    width: w,
    height: h,
    type: SHAPES_TOOL.RECTANGLE,
    fill: TARGET_TOOL_STATE.fillColor,
    stroke: TARGET_TOOL_STATE.strokeColor,
    strokeWidth: TARGET_TOOL_STATE.strokeWidth,
  };

  return {
    drawingState: JSON.stringify({
      currentShape,
      shapes: [currentShape],
      isDrawing: false,
    }),
    svg: xywhToSvg({
      x, y, w, h,
    }),
  };
};

/**
 * Reconstructs a POI/NestedMap point's `maeData.target` from its saved SvgSelector as a
 * SHAPES_TOOL.POI shape (not RECTANGLE) - a POI/NestedMap's target is, by construction, always
 * exactly one placed marker (TargetPointInput/PoiNode - no shared toolbar, no other drawable
 * shape is ever possible for these two templates), so this never needs to inspect the SVG's
 * markup to tell what shape it is; unlike the generic reconstruction below, it must not produce
 * RECTANGLE here, or every reopened POI/NestedMap fails isValidPointTarget's type check and
 * blocks save with "you must choose a target" even though a marker was already placed and
 * nothing was touched (issue #377 review comment).
 *
 * Deliberately does NOT look for a literal `<circle>` element: `getSvg`'s underlying export
 * (react-konva-to-svg -> svgcanvas, which shims the Canvas2D API) traces every shape - including
 * a Konva Circle - as a generic `<path>` built from arc/line-to draw calls, exactly like every
 * other shape type. There is no `<circle>` tag to find in the real, non-mocked output; the
 * bounding box is the only reliable signal, and a circle's bbox is always a square centered on
 * it, so `radius = max(width, height) / 2` and center = bbox center recover it exactly.
 *
 * Colors come from POI_MARKER_STYLE, the same fixed, non-configurable appearance PoiNode itself
 * uses - not from the SVG, since a POI marker carries no size/style knobs to round-trip.
 * @param {XMLDocument} svgDoc
 * @param {string} svgValue
 * @returns {object} maeTarget
 */
const convertPoiSvgSelectorToMae = (svgDoc, svgValue) => {
  const xywh = svgToXywh(svgDoc);
  const currentShape = {
    fill: POI_MARKER_STYLE.fill,
    id: uuidv4(),
    radius: Math.max(xywh.width, xywh.height) / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    stroke: POI_MARKER_STYLE.stroke,
    strokeWidth: POI_MARKER_STYLE.strokeWidth,
    type: SHAPES_TOOL.POI,
    x: xywh.x + xywh.width / 2,
    y: xywh.y + xywh.height / 2,
  };

  const maeTarget = {
    drawingState: JSON.stringify({
      currentShape,
      isDrawing: false,
      shapes: [currentShape],
    }),
    svg: svgValue,
  };

  const fullW = svgDoc.querySelector('svg').getAttribute('width') || undefined;
  const fullH = svgDoc.querySelector('svg').getAttribute('height') || undefined;
  if (fullW && fullH) {
    maeTarget.fullCanvaXYWH = `0,0,${fullW},${fullH}`;
  }

  return maeTarget;
};

/**
 * Reconstructs a POI/NestedMap point's `maeData.target` from a real IIIF PointSelector
 * (the format written by getIIIFTargetAsPointSelector going forward). Unlike the legacy
 * convertPoiSvgSelectorToMae below, there is no traced marker to measure, so the radius can't be
 * recovered - it falls back to getPoiMarkerRadius's own no-media-dimensions default. This is
 * harmless: the radius only affects this editor's own Konva marker size, not the point's saved
 * position, and a renderer (e.g. map-mirador) draws its own icon independently of it.
 * @param {{ type: string, x: number, y: number }} selector
 * @returns {object} maeTarget
 */
const convertPointSelectorToMae = (selector) => {
  const currentShape = {
    ...POI_MARKER_STYLE,
    id: uuidv4(),
    radius: getPoiMarkerRadius(),
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    type: SHAPES_TOOL.POI,
    x: selector.x,
    y: selector.y,
  };

  return {
    drawingState: JSON.stringify({
      currentShape,
      isDrawing: false,
      shapes: [currentShape],
    }),
  };
};

/**
 * @param {{ type: string, value: string }} selector
 * @param {string} [templateType] - when POI_TYPE/NESTED_MAP_TYPE, reconstructs a POI marker
 *   (see convertPoiSvgSelectorToMae) instead of the generic rectangle bounding box below - those
 *   two templates' target is always exactly one placed marker, never any other drawable shape.
 * @returns {object} maeTarget
 */
const convertSvgSelectorToMae = (selector, templateType) => {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(selector.value, 'image/svg+xml');

  if (templateType === TEMPLATE.POI_TYPE || templateType === TEMPLATE.NESTED_MAP_TYPE) {
    return convertPoiSvgSelectorToMae(svgDoc, selector.value);
  }

  const xywh = svgToXywh(svgDoc);
  const fullW = svgDoc.querySelector('svg').getAttribute('width') || undefined;
  const fullH = svgDoc.querySelector('svg').getAttribute('height') || undefined;
  // when building the `currentShape` and `maeTarget`, we try to extract as much infoermation as possible from the SVG
  const currentShape = {
    id: uuidv4(),
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    x: xywh.x,
    y: xywh.y,
    width: xywh.width,
    height: xywh.height,
    type: SHAPES_TOOL.RECTANGLE,
    fill: svgDoc.querySelector('path[fill]')?.getAttribute('fill') || TARGET_TOOL_STATE.fillColor,
    stroke: svgDoc.querySelector('path[stroke]')?.getAttribute('stroke') || TARGET_TOOL_STATE.strokeColor,
    strokeWidth: svgDoc.querySelector('path[stroke-width]')?.getAttribute('stroke-width') || TARGET_TOOL_STATE.strokeWidth,
  };
  const maeTarget = {
    drawingState: JSON.stringify({
      currentShape,
      shapes: [currentShape],
      isDrawing: false,
    }),
    svg: selector.value,
  };
  if (fullW && fullH) {
    maeTarget.fullCanvaXYWH = `0,0,${fullW},${fullH}`;
    // ratio of area of annotation / full canvas area
    // maeTarget.scale = (xywh.width * xywh.height) / (fullW * fullH);
  }
  return maeTarget;
};

/**
 * generate `maeData.target` from an annotation's `target` field.
 *
 * NOTE: limitations:
 * - currently, only 3 types of targets are supported:
 *    - FragmentSelectors
 *    - SvgSelectors
 *    - PointSelectors (POI/NestedMap only; see convertPointSelectorToMae)
 * - if there is an array of selectors, the first supported selector is used
 * - we extract bounding boxes from SVGs, so we expect SVGs to be rectangular
 *
 * @param {object} target
 * @param {string} annotationId
 * @param {string} [templateType] - forwarded to convertSvgSelectorToMae; see its own doc
 * @returns {object}
 */
const convertIIIFTargetToMae = (target, annotationId, templateType) => {
  const supportedSelectorTypes = ['SvgSelector', 'FragmentSelector', 'PointSelector'];
  const selectorArray = Array.isArray(target.selector) ? target.selector : [target.selector];

  for (const selector of selectorArray) {
    // NOTE: order of selector types is important
    // we put the try..catch in the loop to skip the error and fallback to another selector if possible
    try {
      if (selector.type === 'SvgSelector') {
        return convertSvgSelectorToMae(selector, templateType);
      } if (selector.type === 'FragmentSelector') {
        return convertFragmentSelectorToMae(selector);
      } if (selector.type === 'PointSelector') {
        return convertPointSelectorToMae(selector);
      }
    } catch (err) {
      console.error(`Error generating maeData from selector ${selector.type}, attempting to fallback to other selector`, err);
    }
  }
  // if at the end of the loop, no selector could be processed, log an error and return.
  console.error(`On annotation '${annotationId}': none of the selector types in the annotation are unsupported: ${selectorArray.map((selector) => selector.type)}. Supported selectors are: [${supportedSelectorTypes}].`);
  return {};
};

/**
 * generate the maeData field for IIIF annotations that lack one (i.e., all annotations that are created outside of MAE).
 * this allows to open them and update them as with any MAE-created annotation.
 * @param {*} anno
 * @returns
 */
export function convertIIIFAnnoToMaeData(anno) {
  if (!anno.maeData || Object.keys(anno.maeData || {}).length === 0) {
    try {
      const maeData = {
        target: {},
        templateType: '',
        tags: [],
        textBody: {},
      };

      const [templateType, textBody] = convertIIIFBodyToMae(anno);
      maeData.templateType = templateType;
      maeData.textBody = textBody;

      maeData.target = convertIIIFTargetToMae(anno.target, anno.id, templateType);
      anno.maeData = maeData;
      return anno;
    } catch (e) {
      console.error('Error generating maeData from annotation', e);
      return anno;
    }
  }
  return anno;
}

/**
 * Checks if a value is empty or contains only whitespace/HTML tags
 * @param {string} value - The string value to check
 * @returns {boolean} True if the value is empty, undefined, or contains only HTML tags/whitespace
 * @example
 * isEmptyValue('') // true
 * isEmptyValue('<p></p>') // true
 * isEmptyValue('<p><br></p>') // true
 * isEmptyValue('<p>  </p>') // true
 * isEmptyValue('<p>Hello</p>') // false
 */
export const isEmptyValue = (value) => {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  const withoutTags = trimmed.replace(/<[^>]*>/g, '').trim();
  return withoutTags === '';
};

/**
 * Get default value for the annotation body when the body is empty. The default value is a string with the current date and time.
 * @returns {`${string}`}
 */
export const getDefaultValue = () => `${new Date().toLocaleString()}`;

/** templateTypes with a Konva-drawn spatial target, i.e. every template except IIIF_TYPE */
const SPATIAL_TARGET_TEMPLATE_TYPES = [
  TEMPLATE.TAGGING_TYPE, TEMPLATE.TEXT_TYPE, TEMPLATE.MULTIPLE_BODY_TYPE, TEMPLATE.POI_TYPE,
  TEMPLATE.NESTED_MAP_TYPE,
];

/**
 * Shared, template-agnostic tail end of "convert annotationState to be saved": strips
 * maeData.target down to its known keys, captures an SVG snapshot of any drawn shapes (for a
 * known spatial-target templateType only - see SPATIAL_TARGET_TEMPLATE_TYPES; this matters
 * because convertAnnotationStateToBeSaved can also reach here as AnnotationForm.jsx's fallback
 * for a templateType the registry doesn't recognize, and that isn't necessarily a Konva-shaped
 * drawingState), computes the target's scale, derives the saved `target` (a xywh string or an
 * SVG/Fragment selector), and stringifies drawingState for storage. Every template with a
 * spatial target shares this exact pipeline - only what happens to `.body`/`.maeData.tags`
 * before calling this is template-specific.
 * @param {object} annotationState
 * @param {object} canvas
 * @param {string} windowId
 * @param {object} playerReferences
 * @returns {Promise<object>} the same annotationState, mutated
 */
export const finalizeSpatialTarget = async (
  annotationState,
  canvas,
  windowId,
  playerReferences,
) => {
  const annotationStateForSaving = annotationState;

  // TODO I dont know why this code is here? To clean the object ?
  annotationStateForSaving.maeData.target = {
    drawingState: annotationStateForSaving.maeData.target.drawingState,
    fullCanvaXYWH: annotationStateForSaving.maeData.target.fullCanvaXYWH,
    scale: annotationStateForSaving.maeData.target.scale,
    tend: annotationStateForSaving.maeData.target.tend,
    tstart: annotationStateForSaving.maeData.target.tstart,
  };

  console.info('Annotation state target', annotationStateForSaving.maeData.target);

  if (
    SPATIAL_TARGET_TEMPLATE_TYPES.includes(annotationStateForSaving.maeData.templateType)
      && annotationStateForSaving.maeData.target.drawingState.shapes.length > 0
  ) {
    annotationStateForSaving.maeData.target.svg = await getSvg(windowId);
  }

  if (isAnnotationExportableToImage(annotationStateForSaving.maeData)) {
    annotationStateForSaving.body.id = await getKonvaAsDataURL(windowId);
    annotationStateForSaving.body.format = 'image/jpg';
    annotationStateForSaving.type = 'Annotation';
  }

  // TODO Always relevant ?
  annotationStateForSaving.maeData.target.scale = playerReferences.getMediaTrueHeight()
    / playerReferences.getDisplayedMediaHeight() * playerReferences.getZoom();

  annotationStateForSaving.target = getIIIFTargetFromMaeData(
    annotationStateForSaving.maeData,
    canvas.id,
    windowId,
    playerReferences.getScale(),
  );

  annotationStateForSaving.maeData.target.drawingState = JSON.stringify(
    annotationStateForSaving.maeData.target.drawingState,
  );

  return annotationStateForSaving;
};

/**
 * Shared conversion for templates whose annotationState carries a single `body` object with
 * no tags array or maeData.textBody - TaggingTemplate and TextCommentTemplate have the exact
 * same shape, so both re-export this rather than duplicating it: default an empty body.value,
 * then finalize the spatial target.
 * @param {object} state
 * @param {{ canvas: object, windowId: string, playerReferences: object }} ctx
 * @returns {Promise<object>}
 */
export const convertSingleBodyAnnotationToBeSaved = async (
  state,
  { canvas, windowId, playerReferences },
) => {
  const stateToSave = state;
  if (
    stateToSave.body
      && !Array.isArray(stateToSave.body)
      && isEmptyValue(stateToSave.body.value)
  ) {
    stateToSave.body.value = getDefaultValue();
  }
  return finalizeSpatialTarget(stateToSave, canvas, windowId, playerReferences);
};

/**
 * Shared MULTIPLE_BODY_TYPE-specific step: default an empty maeData.textBody.value, then build
 * the saved `body` array from textBody + tags. Used by both
 * convertMultipleBodyAnnotationToBeSaved (MultipleBodyTemplate.jsx, the real path) and
 * convertAnnotationStateToBeSaved's own MULTIPLE_BODY_TYPE branch below (AnnotationForm.jsx's
 * fallback for an unrecognized templateType) so the two can't silently diverge.
 * @param {object} state
 * @returns {object} the same state, mutated
 */
export const applyMultipleBodyConversion = (state) => {
  const stateToSave = state;
  if (
    stateToSave.maeData?.textBody
      && isEmptyValue(stateToSave.maeData.textBody.value)
  ) {
    stateToSave.maeData.textBody.value = getDefaultValue();
  }
  stateToSave.body = [stateToSave.maeData.textBody];
  stateToSave.body.push(...stateToSave.maeData.tags.map((tag) => ({
    id: tag.value,
    purpose: 'tagging',
    type: 'TextualBody',
    value: tag.value,
  })));
  return stateToSave;
};

/**
 * Convert annotation state to be saved. Function change the annotationState object
 *
 * NOTE: as of Phase 2d of the per-template conversion-logic migration described in
 * tetras-dbf/root_repo#12, every templateType in annotationForm/templates/registry.jsx owns its own
 * tetras-dbf/root_repo#12, every templateType in templateRegistry.jsx owns its own
 * convertToAnnotation (see convertTaggingAnnotationToBeSaved/
 * convertTextCommentAnnotationToBeSaved/convertIIIFAnnotationToBeSaved/
 * convertMultipleBodyAnnotationToBeSaved), so this function is no longer used by any registry
 * entry. It is kept only as AnnotationForm.jsx's fallback for a templateType the registry
 * doesn't recognize (e.g. corrupted/legacy data) - see the registryEntry ?? fallback in
 * saveAnnotation. Behavior is otherwise unchanged from before Phase 2 and is still
 * characterized directly by IIIFUtils.test.js.
 * @param annotationState
 * @param canvas
 * @param windowId
 * @param playerReferences
 * @returns {Promise<void>}
 */
export const convertAnnotationStateToBeSaved = async (
  annotationState,
  canvas,
  windowId,
  playerReferences,
) => {
  const annotationStateForSaving = annotationState;

  if (annotationState.maeData.templateType === TEMPLATE.IIIF_TYPE) {
    return annotationState;
  }

  if (
    annotationStateForSaving.body
      && !Array.isArray(annotationStateForSaving.body)
      && isEmptyValue(annotationStateForSaving.body.value)
  ) {
    annotationStateForSaving.body.value = getDefaultValue();
  }

  if (annotationStateForSaving.maeData.templateType === TEMPLATE.MULTIPLE_BODY_TYPE) {
    applyMultipleBodyConversion(annotationStateForSaving);
  } else if (
    annotationStateForSaving.maeData?.textBody
      && isEmptyValue(annotationStateForSaving.maeData.textBody.value)
  ) {
    annotationStateForSaving.maeData.textBody.value = getDefaultValue();
  }

  return finalizeSpatialTarget(annotationStateForSaving, canvas, windowId, playerReferences);
};

//* *******************************************

/**
 * Create the body of a V2 annotation from a V3 annotation
 * @param {object} v3body
 * @returns {object}
 */
function createV2AnnoBody(v3body) {
  const v2body = {
    chars: v3body.value,
  };
  if (v3body.purpose === 'tagging') {
    v2body['@type'] = 'oa:Tag';
  } else {
    v2body['@type'] = 'dctypes:Text';
  }
  if (v3body.format) {
    v2body.format = v3body.format;
  }
  if (v3body.language) {
    v2body.language = v3body.language;
  }
  if (v3body.purpose) {
    v2body.motivation = v3body.purpose;
  }
  return v2body;
}

/**
 * Create a V2 selector from a V3 selector
 * @param {object} v3selector
 * @returns {object|null}
 */
function createV2AnnoSelector(v3selector) {
  switch (v3selector.type) {
    case 'SvgSelector':
      return {
        '@type': 'oa:SvgSelector',
        value: v3selector.value,
      };
    case 'FragmentSelector':
      return {
        '@type': 'oa:FragmentSelector',
        value: v3selector.value,
      };
    case 'PointSelector':
      return {
        '@type': 'oa:PointSelector',
        x: v3selector.x,
        y: v3selector.y,
      };
    default:
      return null;
  }
}

/**
 * Creates a V2 annotation from a V3 annotation
 * @param {object} v3anno
 * @returns {object}
 */
export function createV2Anno(v3anno) {
  const v2anno = {
    '@context': 'https://iiif.io/api/presentation/2/context.json',
    '@type': 'oa:Annotation',
    maeData: v3anno.maeData || {},
    motivation: 'oa:commenting',
  };
  // copy id if it is SAS-generated
  if (v3anno.id?.startsWith('http')) {
    v2anno['@id'] = v3anno.id;
  }
  if (Array.isArray(v3anno.body)) {
    v2anno.resource = v3anno.body.map((b) => createV2AnnoBody(b));
  } else {
    v2anno.resource = createV2AnnoBody(v3anno.body);
  }
  // v3anno.target can be either a string or an object =>
  // if it's an object, extract it.
  if (typeof v3anno.target === 'object' && !Array.isArray(v3anno.target) && v3anno.target !== null) {
    v2anno.on = {
      '@type': 'oa:SpecificResource',
      full:
        // `target` has a `source` with `id` object pointing to the proper canvas
        v3anno.target.source?.id
        // `target` has an id
        || v3anno.target.id
        // `target` is an object and `target.source` is a string
        || v3anno.target.source,
    };
    // if v3anno.target is a string, don't process it
  } else {
    v2anno.on = v3anno.target;
  }
  if (v3anno.target.selector) {
    if (Array.isArray(v3anno.target.selector)) {
      const selectors = v3anno.target.selector.map((s) => createV2AnnoSelector(s));
      // create choice, assuming two elements and 0 is default
      v2anno.on.selector = {
        '@type': 'oa:Choice',
        default: selectors[0],
        item: selectors[1],
      };
    } else {
      v2anno.on.selector = createV2AnnoSelector(v3anno.target.selector);
    }
    if (v3anno.target.source?.partOf) {
      v2anno.on.within = {
        '@id': v3anno.target.source.partOf.id,
        '@type': 'sc:Manifest',
      };
    }
  }
  return v2anno;
}

/**
 * create a V3 body from a V2 body
 * @param {object} v2body
 * @returns {object}
 */
function createV3AnnoBody(v2body) {
  const v3body = {
    type: 'TextualBody',
    value: v2body.chars,
  };
  if (v2body.motivation) {
    v3body.purpose = v2body.motivation;
  }
  if (v2body.format) {
    v3body.format = v2body.format;
  }
  if (v2body.language) {
    v3body.language = v2body.language;
  }
  if (v2body['@type'] === 'oa:Tag') {
    v3body.purpose = 'tagging';
  }
  return v3body;
}

/**
 * Create a V3 selector from a V2 selector
 * @param {object} v2selector
 * @returns {object}
 */
function createV3AnnoSelector(v2selector) {
  switch (v2selector['@type']) {
    case 'oa:SvgSelector':
      return {
        type: 'SvgSelector',
        value: v2selector.value,
      };
    case 'oa:FragmentSelector':
      return {
        type: 'FragmentSelector',
        value: v2selector.value,
      };
    case 'oa:PointSelector':
      return {
        type: 'PointSelector',
        x: v2selector.x,
        y: v2selector.y,
      };
    case 'oa:Choice':
      /* create alternate selectors */
      return [
        createV3AnnoSelector(v2selector.default),
        createV3AnnoSelector(v2selector.item),
      ];
    default:
      return null;
  }
}

/**
 * Creates a V3 annotation from a V2 annotation
 * @param {object} v2anno
 * @returns {object}
 */
function createV3Anno(v2anno) {
  const v3anno = {
    id: v2anno['@id'],
    maeData: v2anno.maeData || {},
    motivation: 'commenting',
    type: 'Annotation',
  };
  if (Array.isArray(v2anno.resource)) {
    v3anno.body = v2anno.resource.map((b) => createV3AnnoBody(b));
  } else if (v2anno.resource) {
    // it's an object
    v3anno.body = createV3AnnoBody(v2anno.resource);
  } else {
    // no body is defined
    v3anno.body = {};
  }
  let v2target = v2anno.on;
  if (Array.isArray(v2target)) {
    [v2target] = v2target;
  }
  v3anno.target = {
    selector: createV3AnnoSelector(v2target.selector),
    source: v2target.full,
  };
  if (v2target.within) {
    v3anno.target.source = {
      id: v2target.full,
      partOf: {
        id: v2target.within['@id'],
        type: 'Manifest',
      },
      type: 'Canvas',
    };
  }
  return v3anno;
}

/**
 * from an array of IIIF V2 annotations, create a V3 annotationPage
 * @param {object[]} v2annos - array of IIIF V2 annotations
 * @param {string} annotationPageId - '@id' of the annotationPage
 * @returns {object}
 */
export function createAnnotationPage(v2annos, annotationPageId) {
  if (Array.isArray(v2annos)) {
    const v3annos = v2annos.map((a) => createV3Anno(a));
    return {
      id: annotationPageId,
      items: v3annos,
      type: 'AnnotationPage',
    };
  }
  return v2annos;
}
