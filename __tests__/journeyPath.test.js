import { recomputeJourneyPath } from '../src/journeyPath';

/** Builds a minimal raw journey annotation item for these tests. */
const journey = (id, overrides = {}) => ({
  body: [], 'dbf:kind': 'Journey', id, target: 'canvas/1', ...overrides,
});

/** Builds a minimal raw poi annotation item, already carrying a saved maeData.target (as
 * finalizeSpatialTarget would have stored it) with its marker centered at (x, y) on a canvas
 * whose real pixel size is fullW x fullH. */
const poi = (id, {
  x, y, fullW = 800, fullH = 600, journeyId, order,
} = {}) => ({
  body: [],
  'dbf:journey': journeyId ? { id: journeyId, order } : undefined,
  'dbf:kind': 'POI',
  id,
  maeData: {
    target: {
      drawingState: JSON.stringify({ shapes: [{ type: 'poi', x, y }] }),
      fullCanvaXYWH: `0,0,${fullW},${fullH}`,
    },
  },
});

describe('recomputeJourneyPath', () => {
  it('returns null when journeyId matches no journey in items', () => {
    const items = [journey('journey-1')];

    expect(recomputeJourneyPath('journey-missing', items)).toBeNull();
  });

  it('joins two pois with a straight line (a curve has nothing to smooth between two points)', () => {
    const items = [
      journey('journey-1'),
      poi('poi-b', {
        journeyId: 'journey-1', order: 1, x: 300, y: 400,
      }),
      poi('poi-a', {
        journeyId: 'journey-1', order: 0, x: 100, y: 200,
      }),
    ];

    const updated = recomputeJourneyPath('journey-1', items);

    expect(updated.id).toBe('journey-1');
    expect(updated.target.source).toBe('canvas/1');
    expect(updated.target.selector[0].type).toBe('SvgSelector');
    const svg = updated.target.selector[0].value;
    expect(svg).toContain("width='800' height='600'");
    expect(svg).toContain('M 100,200 L 300,400');
  });

  it('joins 3+ pois with a smooth curve (a Catmull-Rom spline) that still passes through each one', () => {
    const items = [
      journey('journey-1'),
      poi('poi-a', {
        journeyId: 'journey-1', order: 0, x: 0, y: 0,
      }),
      poi('poi-b', {
        journeyId: 'journey-1', order: 1, x: 6, y: 0,
      }),
      poi('poi-c', {
        journeyId: 'journey-1', order: 2, x: 12, y: 0,
      }),
    ];

    const updated = recomputeJourneyPath('journey-1', items);
    const svg = updated.target.selector[0].value;

    // No more straight "L" segments once there's a bend to smooth - each leg is a cubic
    // bezier ("C") instead, but its own endpoint still lands exactly on the next poi.
    expect(svg).not.toMatch(/\bL\b/);
    expect(svg).toContain('M 0,0 C 1.5,0 3,0 6,0 C 9,0 10.5,0 12,0');
  });

  it('sizes the synthesized svg from any one poi\'s fullCanvaXYWH (they all share one canvas)', () => {
    const items = [
      journey('journey-1'),
      poi('poi-a', {
        fullH: 500, fullW: 1000, journeyId: 'journey-1', order: 0, x: 10, y: 10,
      }),
      poi('poi-b', {
        fullH: 500, fullW: 1000, journeyId: 'journey-1', order: 1, x: 20, y: 20,
      }),
    ];

    const updated = recomputeJourneyPath('journey-1', items);

    expect(updated.target.selector[0].value).toContain("width='1000' height='500'");
  });

  it('does not mutate the original journey/poi items', () => {
    const journeyItem = journey('journey-1');
    const poiA = poi('poi-a', {
      journeyId: 'journey-1', order: 0, x: 1, y: 1,
    });
    const poiB = poi('poi-b', {
      journeyId: 'journey-1', order: 1, x: 2, y: 2,
    });
    const items = [journeyItem, poiA, poiB];

    recomputeJourneyPath('journey-1', items);

    expect(journeyItem.target).toBe('canvas/1');
  });

  it('resets the target back to the plain canvas id when fewer than two pois have a usable point', () => {
    const items = [
      journey('journey-1', { target: 'canvas/1' }),
      poi('poi-a', {
        journeyId: 'journey-1', order: 0, x: 1, y: 1,
      }),
    ];

    const updated = recomputeJourneyPath('journey-1', items);

    expect(updated.target).toBe('canvas/1');
  });

  it('resets to the canvas id (not null) when a previously-drawn journey drops below two pois', () => {
    const items = [
      journey('journey-1', {
        target: {
          selector: [{ type: 'SvgSelector', value: '<svg/>' }],
          source: 'canvas/1',
        },
      }),
      poi('poi-a', {
        journeyId: 'journey-1', order: 0, x: 1, y: 1,
      }),
    ];

    const updated = recomputeJourneyPath('journey-1', items);

    expect(updated.target).toBe('canvas/1');
  });

  it('targets the real canvas id passed in, not whatever the journey\'s own saved target claims (issue: a fresh journey\'s target is a server-side placeholder - maps://annotations/<id>/canvas - that never matches a real Mirador canvas, so a path saved against it silently never renders)', () => {
    const items = [
      journey('journey-1', {
        target: {
          selector: { type: 'FragmentSelector', value: 'xywh=0,0,0,0' },
          source: 'maps://annotations/journey-1/canvas',
        },
      }),
      poi('poi-a', {
        journeyId: 'journey-1', order: 0, x: 100, y: 200,
      }),
      poi('poi-b', {
        journeyId: 'journey-1', order: 1, x: 300, y: 400,
      }),
    ];

    const updated = recomputeJourneyPath('journey-1', items, 'real-canvas-id');

    expect(updated.target.source).toBe('real-canvas-id');
  });

  it('skips a poi with no saved target (e.g. not yet placed) when building the path', () => {
    const items = [
      journey('journey-1'),
      poi('poi-a', {
        journeyId: 'journey-1', order: 0, x: 1, y: 1,
      }),
      poi('poi-b', {
        journeyId: 'journey-1', order: 1, x: 2, y: 2,
      }),
      { 'dbf:journey': { id: 'journey-1', order: 2 }, 'dbf:kind': 'POI', id: 'poi-no-target' },
    ];

    const updated = recomputeJourneyPath('journey-1', items);

    expect(updated.target.selector[0].value).toContain('M 1,1 L 2,2');
  });
});
