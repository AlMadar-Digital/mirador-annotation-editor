import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import { ReactSortable } from 'react-sortablejs';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import CanvasListItem from './CanvasListItem';
import {
  annotationTitle, groupAnnotationItems, withJourneyOrder, withTopLevelOrder,
} from './annotationListGrouping';
import { TEMPLATE } from './annotationForm/AnnotationFormUtils';
import { TEMPLATE_REGISTRY } from './annotationForm/templates/registry';

/** Maps a raw annotation item back to its template registry id (issue #377), mirroring
 * IIIFUtils.js's own dbf:kind/dbf:linkedMap routing - the only two things this list needs to
 * pick the right template icon for a row. */
const templateTypeForItem = (item) => {
  if (item['dbf:kind'] === 'Journey') return TEMPLATE.JOURNEY_TYPE;
  return item['dbf:linkedMap'] ? TEMPLATE.NESTED_MAP_TYPE : TEMPLATE.POI_TYPE;
};

// Shared by the top-level list and every journey's nested list so a poi can be dragged between
// them. Module-level (not recreated on every render): react-sortablejs only re-reads its option
// object at mount time (see componentDidMount/makeOptions in react-sortablejs - componentDidUpdate
// only reacts to the `disabled` prop), so a fresh object identity each render buys nothing but
// is worth avoiding for clarity.
const GROUP_NAME = 'maps-annotation-list';
const TOP_LEVEL_GROUP = { name: GROUP_NAME, put: true };
const JOURNEY_GROUP = {
  name: GROUP_NAME,
  put: (toList, fromList, dragEl) => dragEl.getAttribute('data-kind') === 'POI',
};

/**
 * One journey's nested sortable poi list (issue #344), split out of
 * SortableCanvasAnnotationsList into its own component so it owns its own reorder state -
 * see that component's module comment for why. `pois` is this journey's canonical
 * (redux-derived) poi list; `persist` is the shared, stateless save callback.
 */
function JourneyPoiList({
  journeyId, persist, pois, renderRow,
}) {
  const isDraggingRef = useRef(false);
  // A drop fires one persist() per item in this list (see handleSetList below), each a
  // separate read-modify-write round trip that lands in redux the moment IT resolves - not
  // when the whole drop's batch does. Until every one of them has landed, `pois` (redux's
  // canonical state) only reflects however many of them have committed *so far*, lagging
  // behind the optimistic `localPois` already on screen. Counting them here lets the sync
  // effect below tell "a drop is still being persisted" apart from "dragging" (isDraggingRef,
  // already false again by the time this fires - SortableJS's onEnd doesn't wait for
  // handleSetList's own async work) - without it, the effect would resync `localPois` to
  // that partial canonical state on every intermediate commit, visibly flickering/reverting
  // the list until the last item in the drop finally lands (issue #344 follow-up).
  const pendingWritesRef = useRef(0);
  const [localPois, setLocalPois] = useState(pois);

  // Mirrors SortableCanvasAnnotationsList's own sync effect, scoped to this journey alone:
  // only this journey's own canonical pois resets this list, and only when this list itself
  // isn't mid-drag or mid-persist.
  useEffect(() => {
    if (isDraggingRef.current || pendingWritesRef.current > 0) return;
    setLocalPois(pois);
  }, [pois]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleSetList = useCallback((newList) => {
    const updated = newList.map((poi, position) => withJourneyOrder(poi, journeyId, position));
    setLocalPois(updated);
    pendingWritesRef.current += 1;
    updated.reduce(
      (chain, entry) => chain.then(() => persist(entry)),
      Promise.resolve(),
    ).finally(() => {
      pendingWritesRef.current -= 1;
    });
  }, [journeyId, persist]);

  return (
    <ReactSortable
      animation={150}
      forceFallback
      group={JOURNEY_GROUP}
      list={localPois}
      onEnd={handleDragEnd}
      onStart={handleDragStart}
      setList={handleSetList}
      tag="ul"
      style={{ listStyle: 'none', margin: 0, paddingInlineStart: 24 }}
    >
      {localPois.map((poi) => (
        <li key={poi.id} style={{ listStyle: 'none' }} data-kind="POI">
          {renderRow(poi)}
        </li>
      ))}
    </ReactSortable>
  );
}

JourneyPoiList.propTypes = {
  journeyId: PropTypes.string.isRequired,
  persist: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- raw annotation JSON, no fixed shape
  pois: PropTypes.arrayOf(PropTypes.object).isRequired,
  renderRow: PropTypes.func.isRequired,
};

/**
 * The maps plugin's two-level sortable annotation list (issue #344): journeys are always at
 * the top level, alongside any poi with no journey; a poi that belongs to a journey is nested
 * under it instead. Replaces mirador core's own flat CanvasAnnotations for a canvas whose
 * annotations carry a `dbf:kind` (i.e. maps' poi/journey annotations) - see
 * canvasAnnotationsPlugin.jsx, which falls back to the original flat list for every other
 * annotation motivation this package also supports (tagging/notes/IIIF expert mode).
 *
 * Built on react-sortablejs/SortableJS, sharing one `group` between the top-level list and
 * every journey's nested list, so a poi can be dragged between them (and a journey - tagged
 * `data-kind="Journey"` on its row - is refused by every nested list's `group.put`, since a
 * journey can't itself belong to a journey).
 *
 * react-sortablejs's own documented caveat (see its README's "Nesting" section) is that a
 * parent list and a nested child list sharing one `setState` function get their state updated
 * twice per cross-list move, which can leave a stray duplicate DOM node behind: SortableJS
 * moves the dragged element's real DOM node directly (outside React) while React's own
 * reconciliation, driven by the shared state update, independently unmounts/remounts it in
 * the other list's tree. The README's own guidance is that this only reliably works when the
 * lists involved in a move don't share one setState - so the top-level list
 * (`localTopLevel`, below) and each journey's nested list (`JourneyPoiList`'s own `localPois`)
 * each own an independent `useState`, synced from this canvas's `items` prop but never
 * touching each other's state directly; only `persist`, which does no rendering, is shared.
 *
 * `items` is the canvas's raw annotation JSON (annotationsOnCanvases[canvasId], merged across
 * annotation pages) - unlike mirador core's own getAnnotationResourcesDataForCanvas selector,
 * this needs dbf:kind/dbf:journey/dbf:order, which that selector's {content,id,tags,targetId}
 * shape strips away.
 */
export default function SortableCanvasAnnotationsList({
  canvasId,
  deselectAnnotation,
  hoverAnnotation,
  hoveredAnnotationIds = [],
  index,
  items = [],
  label,
  receiveAnnotation,
  selectAnnotation,
  selectedAnnotationId,
  storageAdapter,
  totalSize,
  windowId,
}) {
  const { i18n, t } = useTranslation();

  // Built once per render rather than re-derived per row via getTemplateType (which rebuilds
  // this same array internally) - external templates never carry dbf:kind Journey/POI, so the
  // built-in-only registry (no externalTemplates arg) always has the entry a row needs.
  const templateEntriesById = useMemo(() => {
    const map = new Map();
    TEMPLATE_REGISTRY(t).forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [t]);

  const canonicalGrouped = useMemo(() => groupAnnotationItems(items), [items]);
  const canonicalTopLevel = useMemo(
    () => canonicalGrouped.map((entry) => entry.item),
    [canonicalGrouped],
  );
  const poisByJourneyId = useMemo(() => {
    const map = new Map();
    canonicalGrouped.forEach((entry) => {
      if (entry.kind === 'Journey') map.set(entry.id, entry.pois);
    });
    return map;
  }, [canonicalGrouped]);

  const isDraggingRef = useRef(false);
  // See JourneyPoiList's own pendingWritesRef comment above - same lagging-canonical-state
  // problem, one level up: a top-level drop persists each reordered item separately, and
  // `canonicalTopLevel` only catches up one commit at a time.
  const pendingWritesRef = useRef(0);
  const [localTopLevel, setLocalTopLevel] = useState(canonicalTopLevel);

  // See the module comment above: only this list's own canonical top-level items reset it,
  // and only when it isn't mid-drag or mid-persist itself - a journey's own nested drag
  // doesn't touch this.
  useEffect(() => {
    if (isDraggingRef.current || pendingWritesRef.current > 0) return;
    setLocalTopLevel(canonicalTopLevel);
  }, [canonicalTopLevel]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Every list on this canvas (the top-level one and each journey's own) now persists
  // through this SAME queue, even though they each own independent render state (see the
  // module comment above). That's essential, not incidental: most annotation adapters'
  // update() is a read-modify-write over the WHOLE annotation page (read all, splice one
  // item, write all back - see e.g. LocalStorageAdapter.update()), so two persist() calls
  // in flight at once - one from the source list's reduce chain, one from the
  // destination's, exactly what a cross-list drag fires - can each read the page before the
  // other's write lands and then clobber it back to a stale copy on write. A single-list
  // drag (reordering within one list, or the old shared-state code before this file's own
  // history) never hit this, since only one list's chain was ever running; a cross-list
  // move needs two lists' chains to actually be ordered against each other, not just each
  // internally sequential.
  const persistQueueRef = useRef(Promise.resolve());

  const persist = useCallback((annotation) => {
    const adapter = storageAdapter(canvasId);
    /** Runs this one annotation's write once every write queued ahead of it has settled. */
    const run = () => adapter.update(annotation).then((annoPage) => {
      receiveAnnotation(canvasId, adapter.annotationPageId, annoPage);
    });
    const result = persistQueueRef.current.then(run, run);
    // Keep the queue moving even if this write failed - a rejection here must not stall
    // every persist queued after it.
    persistQueueRef.current = result.catch(() => {});
    return result;
  }, [storageAdapter, canvasId, receiveAnnotation]);

  const handleTopLevelSetList = useCallback((newList) => {
    const updated = newList.map((entry, position) => withTopLevelOrder(entry, position));
    setLocalTopLevel(updated);
    pendingWritesRef.current += 1;
    updated.reduce(
      (chain, entry) => chain.then(() => persist(entry)),
      Promise.resolve(),
    ).finally(() => {
      pendingWritesRef.current -= 1;
    });
  }, [persist]);

  const handleSelect = useCallback((annotationId) => {
    if (window.getSelection()?.toString()) return;
    if (selectedAnnotationId === annotationId) {
      deselectAnnotation(windowId, annotationId);
    } else {
      selectAnnotation(windowId, annotationId);
    }
  }, [windowId, deselectAnnotation, selectAnnotation, selectedAnnotationId]);

  /** Renders one row (a journey, a standalone poi, or a poi nested under a journey). */
  const renderRow = (item) => {
    const title = annotationTitle(item, i18n.language) || '—';
    const isHighlighted = hoveredAnnotationIds.includes(item.id)
      || selectedAnnotationId === item.id;
    const isJourney = item['dbf:kind'] === 'Journey';
    const templateIcon = templateEntriesById.get(templateTypeForItem(item))?.icon;
    let backgroundColor;
    if (isHighlighted) {
      backgroundColor = 'rgba(0, 0, 0, 0.04)';
    } else if (isJourney) {
      backgroundColor = 'rgba(0, 0, 0, 0.02)';
    }
    return (
      <CanvasListItem
        annotationid={item.id}
        data-kind={item['dbf:kind']}
        key={item.id}
        onClick={() => handleSelect(item.id)}
        onMouseEnter={() => hoverAnnotation(windowId, [item.id])}
        onMouseLeave={() => hoverAnnotation(windowId, [])}
        style={{
          alignItems: 'center',
          backgroundColor,
          cursor: 'pointer',
          display: 'flex',
          gap: 8,
          listStyle: 'none',
          padding: '8px 16px',
        }}
      >
        {templateIcon && (
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            {templateIcon}
          </span>
        )}
        <Typography variant={isJourney ? 'subtitle2' : 'body2'}>{title}</Typography>
      </CanvasListItem>
    );
  };

  if (localTopLevel.length === 0) {
    return null;
  }

  return (
    <>
      <Typography sx={{ paddingLeft: 2, paddingRight: 1, paddingTop: 2 }} variant="overline">
        {t('annotationCanvasLabel', { context: `${index + 1}/${totalSize}`, label })}
      </Typography>
      <ReactSortable
        animation={150}
        forceFallback
        group={TOP_LEVEL_GROUP}
        list={localTopLevel}
        onEnd={handleDragEnd}
        onStart={handleDragStart}
        setList={handleTopLevelSetList}
        tag="ul"
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {localTopLevel.map((item) => (
          item['dbf:kind'] === 'Journey' ? (
            <li key={item.id} style={{ listStyle: 'none' }} data-kind="Journey">
              {renderRow(item)}
              <JourneyPoiList
                journeyId={item.id}
                persist={persist}
                pois={poisByJourneyId.get(item.id) ?? []}
                renderRow={renderRow}
              />
            </li>
          ) : (
            <li key={item.id} style={{ listStyle: 'none' }} data-kind="POI">
              {renderRow(item)}
            </li>
          )
        ))}
      </ReactSortable>
    </>
  );
}

SortableCanvasAnnotationsList.propTypes = {
  canvasId: PropTypes.string.isRequired,
  deselectAnnotation: PropTypes.func.isRequired,
  hoverAnnotation: PropTypes.func.isRequired,
  hoveredAnnotationIds: PropTypes.arrayOf(PropTypes.string),
  index: PropTypes.number.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- raw annotation JSON, no fixed shape
  items: PropTypes.arrayOf(PropTypes.object),
  label: PropTypes.string.isRequired,
  receiveAnnotation: PropTypes.func.isRequired,
  selectAnnotation: PropTypes.func.isRequired,
  selectedAnnotationId: PropTypes.string,
  storageAdapter: PropTypes.func.isRequired,
  totalSize: PropTypes.number.isRequired,
  windowId: PropTypes.string.isRequired,
};

SortableCanvasAnnotationsList.defaultProps = {
  hoveredAnnotationIds: [],
  items: [],
  selectedAnnotationId: undefined,
};
