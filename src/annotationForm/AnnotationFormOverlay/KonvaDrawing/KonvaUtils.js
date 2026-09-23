import { exportStageSVG } from 'react-konva-to-svg';

/**
 * Get the Konva stage associated with the windowId
 * @param windowId
 * @returns {Stage}
 */
export function getKonvaStage(windowId) {
  return window.Konva.stages.find((s) => s.attrs.id === windowId);
}

/**
 *
 * @param jSONDrawingState
 * @returns {null}
 */
export function parseDrawingState(jSONDrawingState) {
  let drawingState = null;
  if (jSONDrawingState && typeof jSONDrawingState === 'string') {
    drawingState = JSON.parse(jSONDrawingState);
    console.debug('Parsed drawingState:', drawingState);
    drawingState = {
      ...drawingState,
      currentShape: null,
    };
  }
  return drawingState;
}

/**
 * Resize the Konva stage and redraw it
 * @param windowId
 * @param width
 * @param height
 * @param scale
 * @param hideAfterResize
 * @param scaleStrokeForPNGExport
 */
export function resizeKonvaStage(
  windowId,
  width,
  height,
  scale,
  hideAfterResize = true,
  scaleStrokeForPNGExport = false,
) {
  hideKonvaStage();
  const stage = getKonvaStage(windowId);
  stage.width(width);
  stage.height(height);
  stage.scale({
    x: scale,
    y: scale,
  });

  if (scaleStrokeForPNGExport) {
    stage.find('Rect')
      .map((node) => {
        node.strokeWidth(node.strokeWidth() * scale);
      });

    stage.find('Line')
      .map((node) => {
        node.strokeWidth(node.strokeWidth() * scale);
      });

    stage.find('Circle')
      .map((node) => {
        node.strokeWidth(node.strokeWidth() * scale);
      });
    stage.find('Ellipse')
      .map((node) => {
        node.strokeWidth(node.strokeWidth() * scale);
      });
  }

  if (!hideAfterResize) {
    showKonvaStage();
  }
  // stage.draw();
}

/**
 * Hide the Konva stage
 */
export function hideKonvaStage() {
  const konvaStage = document.getElementsByClassName('konvajs-content');
  konvaStage[0].style.visibility = 'hidden';
}

/**
 * Show the Konva stage
 */
export function showKonvaStage() {
  const konvaStage = document.getElementsByClassName('konvajs-content');
  konvaStage[0].style.visibility = 'visible';
}

/**
 * `exportStageSVG` (via the `svgcanvas` shim it uses to record Konva's canvas draw calls
 * as SVG) draws an opaque white `<rect>` covering the whole stage whenever it sees a
 * `clearRect` call under a non-identity transform matrix. Konva's per-layer `clear()` ends
 * up in exactly that situation whenever the browser's `devicePixelRatio` isn't 1 (i.e. any
 * retina/high-DPI screen), since the pixel-ratio scale is still applied to the transform at
 * that point. This bakes a stray opaque white box into every exported annotation target on
 * such screens (see issue #267).
 *
 * Real annotation shapes always get an explicit, real-color `stroke` set by `cleanNode`
 * below, so a `<rect>` with no stroke - or with `stroke="none"`, which is how the
 * `svgcanvas` shim itself writes out the artifact rect - can only be this export
 * artifact, never user content, whenever its fill is opaque white. Safe to strip.
 * @param {string} svg
 * @returns {string}
 */
export function stripSpuriousWhiteBackgroundRect(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  doc.querySelectorAll('rect').forEach((rect) => {
    const fill = (rect.getAttribute('fill') || '').trim().toLowerCase();
    const isOpaqueWhite = fill === '#ffffff' || fill === '#fff' || fill === 'white';
    const stroke = (rect.getAttribute('stroke') || 'none').trim().toLowerCase();
    const hasNoRealStroke = stroke === 'none' || stroke === '';
    if (isOpaqueWhite && hasNoRealStroke) {
      rect.remove();
    }
  });
  return new XMLSerializer().serializeToString(doc.documentElement);
}

/**
 * Get SVG picture containing all the stuff draw in the stage (Konva Stage).
 * This image will be put in overlay of the iiif media
 */
export async function getSvg(windowId) {
  const stage = getKonvaStage(windowId);
  const exportStrokeWidth = 3;

  stage.find('Transformer')
    .forEach((node) => node.destroy());

  /**
   * Clean the node by removing the strokeScaleEnabled and setting the stroke width
   * If not done, the SVG export will fail
   * @param node
   */
  function cleanNode(node) {
    const {
      r,
      g,
      b,
      a,
    } = rgbaToObj(node.stroke());
    node.strokeScaleEnabled(true);
    node.stroke(`rgb(${r},${g},${b})`);
    node.strokeWidth(exportStrokeWidth);
  }

  // TODO Use forEach instead of map
  stage.find('Rect')
    .map((node) => {
      cleanNode(node);
    });

  stage.find('Line')
    .map((node) => {
      cleanNode(node);
    });

  stage.find('Circle')
    .map((node) => {
      cleanNode(node);
    });

  stage.find('Ellipse')
    .map((node) => {
      cleanNode(node);
    });

  let svg = await exportStageSVG(stage, false); // TODO clean
  svg = stripSpuriousWhiteBackgroundRect(svg);
  svg = svg.replaceAll('"', '\'');
  return svg;
}

/** Export the stage as a JPG image in a data url */
export async function getKonvaAsDataURL(windowId) {
  const stage = getKonvaStage(windowId);
  stage.find('Transformer')
    .forEach((node) => node.visible(false));
  return stage.toDataURL({
    mimeType: 'image/jpg',
    quality: 0.2,
  });
}

export const defaultLineWeightChoices = [0, 2, 5, 10, 20, 50];

export const KONVA_MODE = {
  DRAW: 'draw',
  IMAGE: 'image',
  POI: 'poi',
  TARGET: 'target',
};

export const OVERLAY_TOOL = {
  CURSOR: 'cursor',
  DELETE: 'delete',
  EDIT: 'edit',
  IMAGE: 'image',
  // Hands the pointer to the viewer: the drawing layer ignores it, so the map pans and zooms
  PAN: 'pan',
  SHAPE: 'shapes',
  TEXT: 'text',
};

export const SHAPES_TOOL = {
  ARROW: 'arrow',
  CIRCLE: 'circle',
  ELLIPSE: 'ellipse',
  FREEHAND: 'freehand',
  IMAGE: 'image',
  POI: 'poi',
  POLYGON: 'polygon',
  RECTANGLE: 'rectangle',
  SHAPES: 'shapes',
};

/**
 * Fixed, non-configurable appearance for the POI marker shape
 * (tetras-dbf/mirador-annotation-editor#21): a POI has no color/style options, unlike every
 * other drawable shape - this is deliberately not read from toolState anywhere.
 */
export const POI_MARKER_STYLE = {
  fill: '#1e88e5',
  stroke: '#ffffff',
  strokeWidth: 2,
};

/**
 * Radius for a newly-placed POI marker, proportional to the media's true size so it stays
 * visible on both small and very large images, clamped to a sane range.
 * @param {number} mediaTrueWidth
 * @param {number} mediaTrueHeight
 * @returns {number}
 */
export function getPoiMarkerRadius(mediaTrueWidth, mediaTrueHeight) {
  const smallerDimension = Math.min(mediaTrueWidth, mediaTrueHeight);
  // Math.max/Math.min propagate NaN, so an unset/zero media dimension (e.g. clicked before the
  // media has fully loaded) would otherwise silently produce an invisible, NaN-radius marker.
  if (!Number.isFinite(smallerDimension) || smallerDimension <= 0) return 10;
  return Math.min(40, Math.max(6, smallerDimension * 0.015));
}

/** Check if the active tool is a shape tool */
export function isShapesTool(activeTool) {
  // Find if active tool in the list of overlay tools. I want a boolean in return
  return Object.values(SHAPES_TOOL)
    .find((tool) => tool === activeTool);
}

/**
 * Utils function to convert a CSS color string to an {r,g,b,a} object.
 * Delegates to Konva's own parser since callers can pass any CSS color format
 * (hex, rgb(), rgba(), named colors like POI markers' '#ffffff' stroke), not just rgba().
 */
export const rgbaToObj = (rgba = "rgba(255,255,255,0.5)") => window.Konva.Util.colorToRGBA(rgba);

/** Convert color object to rgba string */
export const objToRgba = (obj = {
  /* eslint-disable sort-keys */
  r: 255,
  g: 255,
  b: 255,
  a: 0.5,
  /* eslint-enable sort-keys */
}) => `rgba(${obj.r},${obj.g},${obj.b},${obj.a})`;
