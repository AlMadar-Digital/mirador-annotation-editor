import React from 'react';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { PoiMoveOnMap } from '../src/plugins/poiMoveOnMapPlugin';
import { render, screen } from './test-utils';

const markers = {};

vi.mock('react-konva', () => ({
  Group: (props) => {
    markers[props.id] = props;
    return props.children;
  },
  Layer: ({ children }) => children,
  Shape: () => null,
  Stage: ({ children }) => <div data-testid="poi-move-stage">{children}</div>,
}));

const CANVAS = 'canvas/1';

const pointPoi = (id, x, y, journeyId) => ({
  'dbf:journey': journeyId ? { id: journeyId, order: 0 } : undefined,
  'dbf:kind': 'POI',
  id,
  maeData: {
    target: { drawingState: JSON.stringify({ shapes: [{ id: `${id}-shape`, type: 'poi', x, y }] }) },
    templateType: 'poi',
  },
  target: { selector: { type: 'PointSelector', x, y }, source: CANVAS },
});

const viewer = {
  addHandler: vi.fn(),
  canvas: document.createElement('canvas'),
  container: { clientHeight: 400, clientWidth: 500 },
  removeHandler: vi.fn(),
  viewport: { getBounds: () => ({ height: 800, width: 1000, x: 0, y: 0 }) },
};

/** A drag end event on a marker dropped at (x, y) */
const dropAt = (x, y) => {
  const node = { position: vi.fn(), x: () => x, y: () => y };
  return { currentTarget: node, node };
};

const renderLayer = (props = {}) => {
  const adapter = {
    annotationPageId: 'page/1',
    getStorageAdapterUser: () => 'tester',
    update: vi.fn(async (annotation) => ({ items: [annotation] })),
  };
  const receiveAnnotation = vi.fn();
  const pois = [pointPoi('poi-1', 10, 20)].map((poi) => ({ poi, point: { x: 10, y: 20 } }));
  render(
    <PoiMoveOnMap
      canvasHeight={800}
      canvasId={CANVAS}
      canvasWidth={1000}
      isFormOpen={false}
      pois={pois}
      receiveAnnotation={receiveAnnotation}
      storageAdapter={() => adapter}
      viewer={viewer}
      {...props}
    />,
  );
  return { adapter, receiveAnnotation };
};

describe('PoiMoveOnMap (AlMadar-Digital/platform#427)', () => {
  beforeEach(() => {
    Object.keys(markers).forEach((key) => delete markers[key]);
  });

  it('starts in Move: the map works as usual, with no markers over it', () => {
    renderLayer();

    expect(screen.getByRole('button', { name: 'poi_mode_move' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('poi-move-stage')).toBeNull();
  });

  it.each([
    ['an annotation form is open', { isFormOpen: true }],
    ['annotations are read-only (no adapter)', { storageAdapter: null }],
    ['the canvas has no POI', { pois: [] }],
  ])('shows no toggle when %s', (_, props) => {
    renderLayer(props);

    expect(screen.queryByRole('button', { name: 'poi_mode_move' })).toBeNull();
  });

  it('in Target, puts a draggable marker on every POI', async () => {
    renderLayer();

    await userEvent.click(screen.getByRole('button', { name: 'pois_mode_target' }));

    expect(screen.getByTestId('poi-move-stage')).toBeInTheDocument();
    expect(markers['poi-1']).toEqual(expect.objectContaining({ draggable: true, x: 10, y: 20 }));
  });

  it('saves a dropped POI on its new spot', async () => {
    const { adapter, receiveAnnotation } = renderLayer();
    await userEvent.click(screen.getByRole('button', { name: 'pois_mode_target' }));

    await act(async () => markers['poi-1'].onDragEnd(dropAt(300, 150)));

    expect(adapter.update).toHaveBeenCalledTimes(1);
    const saved = adapter.update.mock.calls[0][0];
    expect(saved.id).toBe('poi-1');
    expect(saved.target).toEqual({ selector: { type: 'PointSelector', x: 300, y: 150 }, source: CANVAS });
    expect(receiveAnnotation).toHaveBeenCalledWith(CANVAS, 'page/1', expect.anything());
  });

  it("redraws the path of the dropped POI's journey", async () => {
    const journey = {
      body: [], 'dbf:kind': 'Journey', id: 'journey-1', target: CANVAS,
    };
    const other = pointPoi('poi-2', 500, 400, 'journey-1');
    const moved = pointPoi('poi-1', 10, 20, 'journey-1');
    const adapter = {
      annotationPageId: 'page/1',
      getStorageAdapterUser: () => 'tester',
      update: vi.fn(async (annotation) => ({
        items: annotation.id === 'poi-1' ? [journey, annotation, other] : [annotation],
      })),
    };
    renderLayer({
      pois: [{ poi: moved, point: { x: 10, y: 20 } }],
      storageAdapter: () => adapter,
    });
    await userEvent.click(screen.getByRole('button', { name: 'pois_mode_target' }));

    await act(async () => markers['poi-1'].onDragEnd(dropAt(300, 150)));

    expect(adapter.update).toHaveBeenCalledTimes(2);
    const savedJourney = adapter.update.mock.calls[1][0];
    expect(savedJourney.id).toBe('journey-1');
    expect(savedJourney.target.selector[0].type).toBe('SvgSelector');
  });

  it('puts the marker back when the save fails', async () => {
    const adapter = {
      annotationPageId: 'page/1',
      getStorageAdapterUser: () => 'tester',
      update: vi.fn(async () => { throw new Error('offline'); }),
    };
    renderLayer({ storageAdapter: () => adapter });
    await userEvent.click(screen.getByRole('button', { name: 'pois_mode_target' }));
    const { node, ...event } = dropAt(300, 150);

    await act(async () => markers['poi-1'].onDragEnd({ ...event, currentTarget: node }));

    expect(node.position).toHaveBeenCalledWith({ x: 10, y: 20 });
  });
});
