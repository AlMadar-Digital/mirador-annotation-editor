import {
  annotationTitle, groupAnnotationItems, withJourneyOrder, withTopLevelOrder,
} from '../src/annotationListGrouping';

/** Builds a minimal raw poi annotation item for these tests. */
const poi = (id, overrides = {}) => ({
  body: [], 'dbf:kind': 'POI', id, ...overrides,
});
/** Builds a minimal raw journey annotation item for these tests. */
const journey = (id, overrides = {}) => ({
  body: [], 'dbf:kind': 'Journey', id, ...overrides,
});

describe('groupAnnotationItems', () => {
  it('puts journeys and standalone pois at the top level, ordered by dbf:order', () => {
    const items = [
      poi('poi-standalone', { 'dbf:order': 1 }),
      journey('journey-1', { 'dbf:order': 0 }),
    ];

    const grouped = groupAnnotationItems(items);

    expect(grouped.map((entry) => entry.id)).toEqual(['journey-1', 'poi-standalone']);
    expect(grouped[0].kind).toBe('Journey');
    expect(grouped[1].kind).toBe('POI');
  });

  it('nests a poi under its journey instead of the top level', () => {
    const items = [
      journey('journey-1'),
      poi('poi-1', { 'dbf:journey': { id: 'journey-1', order: 0 } }),
    ];

    const grouped = groupAnnotationItems(items);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].pois.map((p) => p.id)).toEqual(['poi-1']);
  });

  it('orders pois within a journey by dbf:journey.order', () => {
    const items = [
      journey('journey-1'),
      poi('poi-b', { 'dbf:journey': { id: 'journey-1', order: 1 } }),
      poi('poi-a', { 'dbf:journey': { id: 'journey-1', order: 0 } }),
    ];

    const grouped = groupAnnotationItems(items);

    expect(grouped[0].pois.map((p) => p.id)).toEqual(['poi-a', 'poi-b']);
  });

  it('sorts items with no order after every explicitly ordered one, tie-broken by id', () => {
    const items = [
      poi('poi-z', {}),
      poi('poi-a', { 'dbf:order': 0 }),
      poi('poi-b', {}),
    ];

    const grouped = groupAnnotationItems(items);

    expect(grouped.map((entry) => entry.id)).toEqual(['poi-a', 'poi-b', 'poi-z']);
  });

  it('treats a poi with dbf:journey: null the same as one with no journey at all (top level)', () => {
    const items = [poi('poi-1', { 'dbf:journey': null, 'dbf:order': 0 })];

    const grouped = groupAnnotationItems(items);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe('POI');
  });

  it('returns an empty array for an empty/missing items list', () => {
    expect(groupAnnotationItems([])).toEqual([]);
    expect(groupAnnotationItems()).toEqual([]);
  });
});

describe('annotationTitle', () => {
  it('reads the identifying TextualBody matching the requested language', () => {
    const item = {
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Old City walk',
        },
        {
          language: 'ar', purpose: 'identifying', type: 'TextualBody', value: 'جولة المدينة القديمة',
        },
      ],
    };

    expect(annotationTitle(item, 'ar')).toBe('جولة المدينة القديمة');
  });

  it('falls back to the first identifying item when the requested language is missing', () => {
    const item = {
      body: [{
        language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Old City walk',
      }],
    };

    expect(annotationTitle(item, 'ar')).toBe('Old City walk');
  });

  it('returns an empty string when the item has no identifying body at all', () => {
    expect(annotationTitle({ body: [] }, 'en')).toBe('');
    expect(annotationTitle({}, 'en')).toBe('');
  });
});

describe('withTopLevelOrder', () => {
  it('sets dbf:order to the new index', () => {
    const updated = withTopLevelOrder(journey('journey-1', { 'dbf:order': 5 }), 2);

    expect(updated['dbf:order']).toBe(2);
  });

  it('explicitly clears dbf:journey (to null, not absent) when a grouped poi moves to the top level', () => {
    const updated = withTopLevelOrder(
      poi('poi-1', { 'dbf:journey': { id: 'journey-1', order: 0 } }),
      3,
    );

    expect(updated['dbf:journey']).toBeNull();
    expect(updated['dbf:order']).toBe(3);
  });

  it('does not touch dbf:journey for a journey entry', () => {
    const updated = withTopLevelOrder(journey('journey-1'), 0);

    expect(updated['dbf:journey']).toBeUndefined();
  });

  it('does not mutate the original item', () => {
    const original = poi('poi-1', { 'dbf:journey': { id: 'journey-1', order: 0 } });
    withTopLevelOrder(original, 3);

    expect(original['dbf:journey']).toEqual({ id: 'journey-1', order: 0 });
  });
});

describe('withJourneyOrder', () => {
  it('sets dbf:journey to the target journey id and index', () => {
    const updated = withJourneyOrder(poi('poi-1'), 'journey-2', 1);

    expect(updated['dbf:journey']).toEqual({ id: 'journey-2', order: 1 });
  });

  it('does not mutate the original item', () => {
    const original = poi('poi-1');
    withJourneyOrder(original, 'journey-2', 1);

    expect(original['dbf:journey']).toBeUndefined();
  });
});
