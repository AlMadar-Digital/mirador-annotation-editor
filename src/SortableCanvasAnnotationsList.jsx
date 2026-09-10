import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import { ReactSortable } from 'react-sortablejs';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import CanvasListItem from './CanvasListItem';
import {
  annotationTitle, groupAnnotationItems, withJourneyOrder, withTopLevelOrder,
} from './annotationListGrouping';

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
 * journey can't itself belong to a journey). NOTE (react-sortablejs's own documented caveat,
 * see its README's "Nesting" section): a sortable list nested inside another sortable list's
 * item is flagged upstream as not fully solid yet ("the child updates the state twice") - this
 * is exactly that shape (each journey's nested list lives inside the top-level list's row for
 * that journey), so drag-and-drop between a journey and the top level should get real browser
 * QA before shipping, even though the ordering/persistence logic itself
 * (annotationListGrouping.js) is unit-tested independently of SortableJS.
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
  const [localItems, setLocalItems] = useState(items);

  // Only the map's own edits (from elsewhere - another tab, a save in this same list) should
  // ever reset local state; an in-progress drag's own setList calls must not be clobbered by
  // this effect re-firing from the very re-render they themselves triggered upstream in
  // annotationsOnCanvases, so this mirrors POITemplate's "load once, then own it" pattern.
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const grouped = useMemo(() => groupAnnotationItems(localItems), [localItems]);
  const topLevelList = useMemo(() => grouped.map((entry) => entry.item), [grouped]);

  const persist = useCallback((annotation) => {
    const adapter = storageAdapter(canvasId);
    adapter.update(annotation).then((annoPage) => {
      receiveAnnotation(canvasId, adapter.annotationPageId, annoPage);
    });
  }, [storageAdapter, canvasId, receiveAnnotation]);

  // Merges a reordered slice (the top level, or one journey's pois) back into the shared flat
  // `localItems` state by id, and persists whichever entries actually changed position/parent -
  // see the module comment above for why both lists stay flat/raw-shaped rather than nesting
  // wrapper objects, so a cross-list move never needs reshaping an item.
  const mergeSlice = useCallback((updatedSlice) => {
    setLocalItems((current) => {
      const byId = new Map(current.map((entry) => [entry.id, entry]));
      updatedSlice.forEach((entry) => {
        byId.set(entry.id, entry);
      });
      return Array.from(byId.values());
    });
    updatedSlice.forEach((entry) => persist(entry));
  }, [persist]);

  const handleTopLevelSetList = useCallback((newList) => {
    const updated = newList.map((entry, position) => withTopLevelOrder(entry, position));
    mergeSlice(updated);
  }, [mergeSlice]);

  const handleJourneySetList = useCallback((journeyId, newList) => {
    const updated = newList.map((poi, position) => withJourneyOrder(poi, journeyId, position));
    mergeSlice(updated);
  }, [mergeSlice]);

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

  if (topLevelList.length === 0) {
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
        group={{ name: 'maps-annotation-list', put: true }}
        list={topLevelList}
        setList={handleTopLevelSetList}
        tag="ul"
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {grouped.map((entry) => (
          entry.kind === 'Journey' ? (
            <li key={entry.id} style={{ listStyle: 'none' }} data-kind="Journey">
              {renderRow(entry.item)}
              <ReactSortable
                animation={150}
                forceFallback
                group={{
                  name: 'maps-annotation-list',
                  put: (toList, fromList, dragEl) => dragEl.getAttribute('data-kind') === 'POI',
                }}
                list={entry.pois}
                setList={(newList) => handleJourneySetList(entry.id, newList)}
                tag="ul"
                style={{ listStyle: 'none', margin: 0, paddingInlineStart: 24 }}
              >
                {entry.pois.map((poi) => (
                  <li key={poi.id} style={{ listStyle: 'none' }} data-kind="POI">
                    {renderRow(poi)}
                  </li>
                ))}
              </ReactSortable>
            </li>
          ) : (
            <li key={entry.id} style={{ listStyle: 'none' }} data-kind="POI">
              {renderRow(entry.item)}
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
