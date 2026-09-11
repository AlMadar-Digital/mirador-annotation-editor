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
  const [localPois, setLocalPois] = useState(pois);

  // Mirrors SortableCanvasAnnotationsList's own sync effect, scoped to this journey alone:
  // only this journey's own canonical pois resets this list, and only when this list itself
  // isn't mid-drag.
  useEffect(() => {
    if (isDraggingRef.current) return;
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
    updated.reduce(
      (chain, entry) => chain.then(() => persist(entry)),
      Promise.resolve(),
    );
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
  const [localTopLevel, setLocalTopLevel] = useState(canonicalTopLevel);

  // See the module comment above: only this list's own canonical top-level items reset it,
  // and only when it isn't mid-drag itself - a journey's own nested drag doesn't touch this.
  useEffect(() => {
    if (isDraggingRef.current) return;
    setLocalTopLevel(canonicalTopLevel);
  }, [canonicalTopLevel]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const persist = useCallback((annotation) => {
    const adapter = storageAdapter(canvasId);
    return adapter.update(annotation).then((annoPage) => {
      receiveAnnotation(canvasId, adapter.annotationPageId, annoPage);
    });
  }, [storageAdapter, canvasId, receiveAnnotation]);

  const handleTopLevelSetList = useCallback((newList) => {
    const updated = newList.map((entry, position) => withTopLevelOrder(entry, position));
    setLocalTopLevel(updated);
    updated.reduce(
      (chain, entry) => chain.then(() => persist(entry)),
      Promise.resolve(),
    );
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
    return (
      <CanvasListItem
        annotationid={item.id}
        data-kind={item['dbf:kind']}
        key={item.id}
        onClick={() => handleSelect(item.id)}
        onMouseEnter={() => hoverAnnotation(windowId, [item.id])}
        onMouseLeave={() => hoverAnnotation(windowId, [])}
        style={{
          backgroundColor: isHighlighted ? 'rgba(0, 0, 0, 0.04)' : undefined,
          cursor: 'pointer',
          listStyle: 'none',
          padding: '8px 16px',
        }}
      >
        <Typography variant="body2">{title}</Typography>
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
