import { withMovedPoiTarget } from '../src/poiMove';

const drawingStateOf = (annotation) => JSON.parse(annotation.maeData.target.drawingState);

describe('withMovedPoiTarget', () => {
  const poi = {
    'dbf:journey': { id: 'journey-1', order: 0 },
    'dbf:kind': 'POI',
    id: 'poi-1',
    maeData: {
      target: {
        drawingState: JSON.stringify({
          currentShape: null,
          shapes: [{
            id: 'shape-1', radius: 12, type: 'poi', x: 10, y: 20,
          }],
        }),
        svg: '<svg>old spot</svg>',
      },
      templateType: 'poi',
    },
    target: { selector: { type: 'PointSelector', x: 10, y: 20 }, source: 'canvas/1' },
  };

  it('points the IIIF target at the new spot', () => {
    const moved = withMovedPoiTarget(poi, { x: 300, y: 150 }, 'canvas/1');

    expect(moved.target).toEqual({
      selector: { type: 'PointSelector', x: 300, y: 150 },
      source: 'canvas/1',
    });
  });

  it("moves the edit form's marker too, keeping the rest of it", () => {
    const moved = withMovedPoiTarget(poi, { x: 300, y: 150 }, 'canvas/1');
    const { currentShape, shapes } = drawingStateOf(moved);

    expect(shapes).toEqual([{
      id: 'shape-1', radius: 12, type: 'poi', x: 300, y: 150,
    }]);
    expect(currentShape).toEqual(shapes[0]);
    expect(moved.maeData.target.svg).toBeUndefined();
    expect(moved.maeData.templateType).toBe('poi');
    expect(moved['dbf:journey']).toEqual(poi['dbf:journey']);
  });

  it('does not change the given annotation', () => {
    const before = JSON.stringify(poi);

    withMovedPoiTarget(poi, { x: 300, y: 150 }, 'canvas/1');

    expect(JSON.stringify(poi)).toBe(before);
  });

  it('works on a POI with no maeData yet, straight from the server', () => {
    const raw = {
      body: [],
      'dbf:kind': 'POI',
      id: 'poi-2',
      motivation: 'identifying',
      target: { selector: { type: 'PointSelector', x: 1, y: 2 }, source: 'canvas/1' },
    };

    const moved = withMovedPoiTarget(raw, { x: 40, y: 50 }, 'canvas/1');

    expect(moved.target.selector).toEqual({ type: 'PointSelector', x: 40, y: 50 });
    expect(drawingStateOf(moved).shapes[0]).toEqual(expect.objectContaining({ type: 'poi', x: 40, y: 50 }));
    expect(raw.maeData).toBeUndefined();
  });
});
