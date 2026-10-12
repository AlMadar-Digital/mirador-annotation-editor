import React from 'react';
import PropTypes from 'prop-types';
import { Group, Shape } from 'react-konva';

/** On-screen half-length (CSS px) of the cross's arms. */
export const CROSS_ARM_PX = 12;
/** On-screen width (CSS px) of the cross's arms, and of the outline drawn under them. */
const CROSS_LINE_WIDTH_PX = 3;
const CROSS_OUTLINE_WIDTH_PX = 7;

/**
 * The cross's arm length in the layer's (image) coordinates: CROSS_ARM_PX counter-scaled by the
 * layer's zoom, so the cross keeps the same size on screen at any zoom and on any image size
 * (AlMadar-Digital/map-mirador#17) - a size in image pixels shrank to a dot on high-res images.
 */
const getArmLength = (konvaShape) => CROSS_ARM_PX / (konvaShape.getAbsoluteScale().x || 1);

/**
 * Draws the cross (✚) centered on the shape's origin: a wide outline (the marker's stroke color)
 * under narrower arms (its fill color), so it reads on any map. Arm length and line widths are
 * both counter-scaled by the layer's zoom, so the whole marker stays the same size on screen.
 */
function drawCross(context, konvaShape, { fill, stroke }) {
  const zoom = konvaShape.getAbsoluteScale().x || 1;
  const arm = getArmLength(konvaShape);

  context.beginPath();
  context.moveTo(-arm, 0);
  context.lineTo(arm, 0);
  context.moveTo(0, -arm);
  context.lineTo(0, arm);
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
 * Constant on-screen size and fixed color, with no Transformer/resize handles - a POI has no
 * style options and its size is not user-configurable. Always draggable (no separate cursor/edit
 * tool exists for this shape), so a placed marker can be repositioned without switching tools.
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

  const { fill, stroke } = shape;

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
          const arm = getArmLength(konvaShape);
          context.beginPath();
          context.rect(-arm, -arm, arm * 2, arm * 2);
          context.closePath();
          context.fillStrokeShape(konvaShape);
        }}
        sceneFunc={
          (context, konvaShape) => drawCross(context, konvaShape, { fill, stroke })
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
    stroke: PropTypes.string,
    x: PropTypes.number,
    y: PropTypes.number,
  }).isRequired,
};

export default PoiNode;
