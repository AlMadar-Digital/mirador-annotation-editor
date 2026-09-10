import fixture from '../../__fixtures__/journey_poi_ordering_demo.json';

const SEED_PARAM = 'seedJourneyDemo';

/**
 * Dev-only helper (issue #344 QA): writes the journeys/POIs fixture straight into localStorage
 * under the LocalStorageAdapter key the demo's canvas actually uses, so the two-level sortable
 * annotation list has real journeys + nested/standalone POIs + ordering edge cases to review
 * without going through the annotation form by hand. Only runs when the page is loaded with
 * `?seedJourneyDemo` in the URL, so it never surprises a normal demo visit.
 */
export function seedJourneyDemoAnnotations() {
  if (typeof window === 'undefined') return;
  if (!new URLSearchParams(window.location.search).has(SEED_PARAM)) return;

  window.localStorage.setItem(fixture.id, JSON.stringify(fixture));
  // eslint-disable-next-line no-console
  console.info(`[demo] Seeded ${fixture.items.length} journey/POI annotations for canvas testing (?${SEED_PARAM}).`);
}
