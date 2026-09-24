import React from 'react';
import PropTypes from 'prop-types';
import { Group, Shape } from 'react-konva';

/** On-screen width (CSS px) of the cross's arms, and of the outline drawn under them. */
const CROSS_LINE_WIDTH_PX = 3;
const CROSS_OUTLINE_WIDTH_PX = 7;

/**
 * Draws the cross (✚) centered on the shape's origin, its arms `radius` long: a wide outline
 * (the marker's stroke color) under narrower arms (its fill color), so it reads on any map.
 * Line widths are counter-scaled by the layer's zoom so they stay the same on screen while the
 * cross itself scales with the image, like the other shapes.
 */
function drawCross(context, konvaShape, { fill, radius, stroke }) {
  const zoom = konvaShape.getAbsoluteScale().x || 1;

  context.beginPath();
  context.moveTo(-radius, 0);
  context.lineTo(radius, 0);
  context.moveTo(0, -radius);
  context.lineTo(0, radius);
  context.setAttr('lineCap', 'round');

  context.setAttr('strokeStyle', stroke);
  context.setAttr('lineWidth', CROSS_OUTLINE_WIDTH_PX / zoom);
  context.stroke();

  context.setAttr('strokeStyle', fill);
  context.setAttr('lineWidth', CROSS_LINE_WIDTH_PX / zoom);
  context.stroke();
}

/**
 * The POI marker shape (tetras-dbf/mirador-annotation-editor#21), drawn as a cross (✚) rather
 * than a dot so the exact targeted point is visible at its center (AlMadar-Digital/platform#427).
 * Fixed-size and fixed-color, with no Transformer/resize handles - a POI has no style options and
 * its size is not user-configurable. Always draggable (no separate cursor/edit tool exists for
 * this shape), so a placed marker can be repositioned without switching tools.
 *
 * The Group carries the marker's id/position - what AnnotationDrawing's drag handlers read back
 * from the dragged node - while the Shape inside only draws the cross, and hit-tests the whole
 * square around it so the gaps between the arms still grab the marker.
 */
function PoiNode({
  handleDragEnd,
  handleDragStart,
  onShapeClick,
  shape,
}) {
  /** Forwards the click to the parent's shape-click handler */
  const handleClick = () => {
    onShapeClick(shape);
  };

  const { fill, radius, stroke } = shape;

  return (
    <Group
      draggable
      id={shape.id}
      onClick={handleClick}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onMousedown={handleClick}
      x={shape.x}
      y={shape.y}
    >
      <Shape
        fill={fill}
        hitFunc={(context, konvaShape) => {
          context.beginPath();
          context.rect(-radius, -radius, radius * 2, radius * 2);
          context.closePath();
          context.fillStrokeShape(konvaShape);
        }}
        sceneFunc={
          (context, konvaShape) => drawCross(context, konvaShape, { fill, radius, stroke })
        }
      />
    </Group>
  );
}

PoiNode.propTypes = {
  handleDragEnd: PropTypes.func.isRequired,
  handleDragStart: PropTypes.func.isRequired,
  onShapeClick: PropTypes.func.isRequired,
  shape: PropTypes.shape({
    fill: PropTypes.string,
    id: PropTypes.string,
    radius: PropTypes.number,
    stroke: PropTypes.string,
    x: PropTypes.number,
    y: PropTypes.number,
  }).isRequired,
};

export default PoiNode;
