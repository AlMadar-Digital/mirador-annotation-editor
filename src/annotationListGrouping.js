/**
 * Pure grouping/ordering logic for the two-level sortable annotation list (issue #344): a
 * journey is always a top-level entry, a poi is either nested under a journey or its own
 * top-level entry. Kept separate from the React rendering (SortableCanvasAnnotationsList.jsx)
 * so the ordering rules are directly unit-testable without mounting SortableJS.
 *
 * Mirrors the server's dbf:order/dbf:journey.order convention (strapi-plugins'
 * annotationConversion.ts): a top-level item's position is its own dbf:order (journeys always,
 * pois only when they have no dbf:journey); a poi nested under a journey is ordered by
 * dbf:journey.order instead.
 */

/** A missing order sorts after every explicit one; ties break on id for a stable order. */
const compareByOrder = (a, b) => {
  if (a.order === b.order) return a.id.localeCompare(b.id);
  if (a.order === null || a.order === undefined) return 1;
  if (b.order === null || b.order === undefined) return -1;
  return a.order - b.order;
};

/**
 * Groups a flat AnnotationPage.items array (raw IIIF-ish annotation JSON, each item carrying
 * dbf:kind/dbf:journey/dbf:order - see annotationConversion.ts) into the two-level tree the
 * sortable list renders.
 * @param {object[]} items
 * @returns {Array<{ id: string, kind: 'Journey'|'POI', item: object, pois?: object[] }>}
 */
export const groupAnnotationItems = (items = []) => {
  const journeys = items.filter((item) => item['dbf:kind'] === 'Journey');
  const poisByJourneyId = {};
  const standalonePois = [];

  items
    .filter((item) => item['dbf:kind'] !== 'Journey')
    .forEach((item) => {
      const journey = item['dbf:journey'];
      if (journey?.id) {
        (poisByJourneyId[journey.id] ??= []).push(item);
      } else {
        standalonePois.push(item);
      }
    });

  Object.values(poisByJourneyId).forEach((pois) => pois.sort((a, b) => compareByOrder(
    { id: a.id, order: a['dbf:journey']?.order },
    { id: b.id, order: b['dbf:journey']?.order },
  )));

  const topLevel = [
    ...journeys.map((item) => ({
      id: item.id, item, kind: 'Journey', order: item['dbf:order'], pois: poisByJourneyId[item.id] ?? [],
    })),
    ...standalonePois.map((item) => ({
      id: item.id, item, kind: 'POI', order: item['dbf:order'],
    })),
  ];
  topLevel.sort(compareByOrder);

  return topLevel;
};

/**
 * Whether a new annotation needs a top-level dbf:order: a poi or journey that isn't a journey's
 * stop (whose position is dbf:journey.order instead) and has no order yet.
 * @param {object} item
 * @returns {boolean}
 */
export const needsTopLevelOrder = (item) => (
  (item?.['dbf:kind'] === 'POI' || item?.['dbf:kind'] === 'Journey')
  && !item['dbf:journey']?.id
  && (item['dbf:order'] === null || item['dbf:order'] === undefined)
);

/**
 * The dbf:order that puts a new top-level item at the end of the list: one past the highest
 * top-level order already used (0 on an empty list). Items still without an order keep
 * sorting after it, as they do after every ordered item.
 * @param {object[]} items the canvas's existing AnnotationPage.items
 * @returns {number}
 */
export const nextTopLevelOrder = (items = []) => {
  const orders = groupAnnotationItems(items)
    .map(({ order }) => order)
    .filter((order) => Number.isFinite(order));
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
};

/**
 * Reads a display title out of an annotation's body: the identifying TextualBody item for
 * `language`, falling back to the first identifying item of any language, then to an empty
 * string (the list renders that as an em-dash placeholder rather than crashing).
 * @param {object} item
 * @param {string} language
 * @returns {string}
 */
export const annotationTitle = (item, language) => {
  const identifying = (Array.isArray(item?.body) ? item.body : [])
    .filter((body) => body?.purpose === 'identifying' && body?.type === 'TextualBody');
  const match = identifying.find((body) => body.language === language) ?? identifying[0];
  return (match?.value ?? '').trim();
};

/**
 * Builds the updated annotation to save after the top-level list is reordered: sets dbf:order
 * to the item's new index, and - for a poi - clears dbf:journey (an explicit `null`, not
 * merely absent - see sharedPoiData's own comment for why that distinction matters) only when
 * it previously had one, since a poi's own row in the top-level list means "no journey".
 * @param {object} item
 * @param {number} index
 * @returns {object} a new annotation object, not mutated in place
 */
export const withTopLevelOrder = (item, index) => {
  const updated = { ...item, 'dbf:order': index };
  if (item['dbf:kind'] === 'POI' && item['dbf:journey']) {
    updated['dbf:journey'] = null;
  }
  return updated;
};

/**
 * Builds the updated poi to save after a journey's nested list is reordered, or after a poi is
 * dropped into a journey from elsewhere: sets dbf:journey to `{ id: journeyId, order: index }`.
 * @param {object} poi
 * @param {string} journeyId
 * @param {number} index
 * @returns {object} a new annotation object, not mutated in place
 */
export const withJourneyOrder = (poi, journeyId, index) => ({
  ...poi,
  'dbf:journey': { id: journeyId, order: index },
});
