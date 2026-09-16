import React from 'react';
import { render } from './test-utils';
import { TargetPointInput } from '../src/annotationForm/templates/templateComponents/TargetPointInput';
import { SHAPES_TOOL } from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

// AnnotationDrawing only renders its Konva Stage via a portal into
// playerReferences.getContainer(), which is null in tests (see POITemplate.test.js's own
// comment on this) - swapped for a stub that reports the drawingState it received, so these
// tests can assert on TargetPointInput's own state-recovery logic without depending on Konva.
vi.mock('../src/annotationForm/AnnotationFormOverlay/AnnotationDrawing', () => ({
  // eslint-disable-next-line react/prop-types -- test-only stand-in
  default: ({ drawingState }) => (
    <div data-testid="drawing-state">{JSON.stringify(drawingState)}</div>
  ),
}));

/** A single POI marker, as placed by the dedicated POI tool (see PoiNode.jsx) */
const poiShape = () => ({
  fill: '#e53935',
  id: 'shape-1',
  radius: 10,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  stroke: '#ffffff',
  strokeWidth: 2,
  type: SHAPES_TOOL.POI,
  x: 10,
  y: 20,
});

const playerReferences = {
  getScale: vi.fn().mockReturnValue(1),
};

describe('TargetPointInput', () => {
  it('recovers an existing point as the selected currentShape when editing a POI (issue #377)', () => {
    const { getByTestId } = render(
      <TargetPointInput
        playerReferences={playerReferences}
        setTargetDrawingState={vi.fn()}
        targetDrawingState={{ currentShape: null, isDrawing: false, shapes: [poiShape()] }}
        windowId="window1"
      />,
    );

    const drawingState = JSON.parse(getByTestId('drawing-state').textContent);
    expect(drawingState.currentShape).toEqual(poiShape());
    expect(drawingState.shapes).toEqual([poiShape()]);
  });

  it('leaves currentShape null when there is no existing point to recover', () => {
    const { getByTestId } = render(
      <TargetPointInput
        playerReferences={playerReferences}
        setTargetDrawingState={vi.fn()}
        targetDrawingState={{ currentShape: null, isDrawing: false, shapes: [] }}
        windowId="window1"
      />,
    );

    const drawingState = JSON.parse(getByTestId('drawing-state').textContent);
    expect(drawingState.currentShape).toBeNull();
  });
});
