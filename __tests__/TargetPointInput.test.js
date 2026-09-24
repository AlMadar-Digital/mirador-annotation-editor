import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from './test-utils';
import { TargetPointInput } from '../src/annotationForm/templates/templateComponents/TargetPointInput';
import { OVERLAY_TOOL, SHAPES_TOOL } from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

// AnnotationDrawing only renders its Konva Stage via a portal into
// playerReferences.getContainer(), which is null in tests (see POITemplate.test.js's own
// comment on this) - swapped for a stub that reports the drawingState and active tool it
// received, so these tests can assert on TargetPointInput's own logic without depending on Konva.
vi.mock('../src/annotationForm/AnnotationFormOverlay/AnnotationDrawing', () => ({
  // eslint-disable-next-line react/prop-types -- test-only stand-in
  default: ({ drawingState, toolState }) => (
    <>
      <div data-testid="drawing-state">{JSON.stringify(drawingState)}</div>
      {/* eslint-disable-next-line react/prop-types -- test-only stand-in */}
      <div data-testid="active-tool">{toolState.activeTool}</div>
    </>
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

  describe('Move/Target toggle (AlMadar-Digital/platform#427)', () => {
    /** Renders the input with its toggle portaled into a stand-in map container */
    const renderWithMap = (shapes) => {
      const mapContainer = document.createElement('div');
      document.body.appendChild(mapContainer);
      render(
        <TargetPointInput
          playerReferences={{ ...playerReferences, getContainer: () => mapContainer }}
          setTargetDrawingState={vi.fn()}
          targetDrawingState={{ currentShape: null, isDrawing: false, shapes }}
          windowId="window1"
        />,
      );
      return mapContainer;
    };

    it('starts in Target for a new point, so it can be placed right away', () => {
      renderWithMap([]);

      expect(screen.getByTestId('active-tool')).toHaveTextContent(SHAPES_TOOL.POI);
      expect(screen.getByRole('button', { name: 'poi_mode_target' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('starts in Move for an existing point, so navigating the map does not move it', () => {
      renderWithMap([poiShape()]);

      expect(screen.getByTestId('active-tool')).toHaveTextContent(OVERLAY_TOOL.PAN);
      expect(screen.getByRole('button', { name: 'poi_mode_move' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('floats over the map and switches the pointer between the map and the point', async () => {
      const mapContainer = renderWithMap([poiShape()]);

      const target = screen.getByRole('button', { name: 'poi_mode_target' });
      expect(mapContainer).toContainElement(target);

      await userEvent.click(target);
      expect(screen.getByTestId('active-tool')).toHaveTextContent(SHAPES_TOOL.POI);

      // clicking the active mode again keeps it rather than leaving no mode selected
      await userEvent.click(target);
      expect(screen.getByTestId('active-tool')).toHaveTextContent(SHAPES_TOOL.POI);

      await userEvent.click(screen.getByRole('button', { name: 'poi_mode_move' }));
      expect(screen.getByTestId('active-tool')).toHaveTextContent(OVERLAY_TOOL.PAN);
    });
  });
});
