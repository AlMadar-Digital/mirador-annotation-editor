import React from 'react';
import userEvent from '@testing-library/user-event';
import AnnotationActionsContext from '../src/AnnotationActionsContext';
import SortableCanvasAnnotationsList from '../src/SortableCanvasAnnotationsList';
import { groupAnnotationItems } from '../src/annotationListGrouping';
import {
  act, render, screen, waitFor,
} from './test-utils';

// Deep imports of react-sortablejs (through SortableCanvasAnnotationsList ->
// CanvasListItem's own dependency tree) don't share a plain module-scope closure or
// globalThis write with this test file under this project's Vitest/Vite module setup -
// only the actual DOM ends up observably shared. So the mock stashes each render's props
// as a plain JS property directly on its own rendered DOM node (not a data-* attribute,
// which can only hold strings and would drop the function props) instead.
vi.mock('react-sortablejs', () => ({
  ReactSortable: (props) => (
    <div
      data-testid="mock-sortable"
      ref={(node) => {
        if (node) node.sortableProps = props;
      }}
    >
      {props.children}
    </div>
  ),
}));

const latestSortableProps = () => screen.getByTestId('mock-sortable').sortableProps;

const poi = (id, order) => ({
  body: [{
    language: 'en', purpose: 'identifying', type: 'TextualBody', value: id,
  }],
  'dbf:kind': 'POI',
  'dbf:order': order,
  id,
});

const baseProps = {
  canvasId: 'canv/1',
  deselectAnnotation: () => {},
  hoverAnnotation: () => {},
  index: 0,
  label: 'Canvas 1',
  selectAnnotation: () => {},
  totalSize: 1,
  windowId: 'win/1',
};

const listedTitles = () => screen.getAllByText(/^poi\/[ab]$/).map((el) => el.textContent);

// CanvasListItem (rendered by renderRow) reads this context for its own hover edit/delete
// controls - unused by this test, but required to be present so it doesn't crash.
const annotationActionsContextValue = {
  annotationsOnCanvases: {},
  canvases: [],
  receiveAnnotation: () => {},
  storageAdapter: () => ({}),
  switchToSingleCanvasView: () => {},
};

const withContext = (props, context = {}) => (
  <AnnotationActionsContext.Provider value={{ ...annotationActionsContextValue, ...context }}>
    <SortableCanvasAnnotationsList {...baseProps} {...props} />
  </AnnotationActionsContext.Provider>
);

describe('SortableCanvasAnnotationsList', () => {
  it('keeps a drop\'s own order on screen while a later write from the same drop is still in flight (issue #344 follow-up)', async () => {
    const poiA = poi('poi/a', 0);
    const poiB = poi('poi/b', 1);

    // Both writes are held open (not just the first) - the reduce chain fires the second
    // persist() as soon as the first's returned promise resolves, which happens on the very
    // next microtask if left uncontrolled, leaving no observable gap to assert against.
    const pendingUpdates = [];
    const update = vi.fn(() => new Promise((resolve) => { pendingUpdates.push(resolve); }));
    const storageAdapter = vi.fn(() => ({ annotationPageId: 'page/1', update }));
    const receiveAnnotation = vi.fn();

    const { rerender } = render(withContext({
      items: [poiA, poiB],
      receiveAnnotation,
      storageAdapter,
    }));

    expect(listedTitles()).toEqual(['poi/a', 'poi/b']);

    // Drag B in front of A - the reduce chain in handleTopLevelSetList will persist B's
    // write (index 0) first, then A's (index 1). The chain's first persist() call only
    // actually fires on a later microtask (it starts from `Promise.resolve().then(...)`),
    // so this needs the async form of act() to flush that far.
    await act(async () => {
      const { onStart, setList, onEnd } = latestSortableProps();
      onStart();
      setList([
        { ...poiB, 'dbf:order': 0 },
        { ...poiA, 'dbf:order': 1 },
      ]);
      onEnd();
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    expect(listedTitles()).toEqual(['poi/b', 'poi/a']);

    // B's write (first in the chain) lands; A's hasn't yet, so the canonical page - as the
    // next `items` prop reflects - still has A at its old order (0), tying with B's freshly
    // written order (0). Sanity-check what that interim canonical order actually sorts to:
    // ties break on id, so it's the stale, pre-drag order, not the drop's.
    const interimItems = [{ ...poiA }, { ...poiB, 'dbf:order': 0 }];
    expect(groupAnnotationItems(interimItems).map((entry) => entry.id))
      .toEqual(['poi/a', 'poi/b']);

    pendingUpdates[0]({ items: [] });
    await waitFor(() => expect(receiveAnnotation).toHaveBeenCalledTimes(1));
    // The second write (A's) is still held open at this point - confirm the reduce chain
    // really has moved on to it, rather than this test racing ahead of the implementation.
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));

    rerender(withContext({
      items: interimItems,
      receiveAnnotation,
      storageAdapter,
    }));

    // Must still show the drop's own order, not snap back to that stale intermediate
    // canonical state while A's write is still in flight (it would look like the drop was
    // silently reverted).
    expect(listedTitles()).toEqual(['poi/b', 'poi/a']);

    // Once A's write also lands, the canonical order finally matches the drop - resolving
    // it should still leave the list showing the drop's order, this time because canonical
    // and optimistic finally agree.
    pendingUpdates[1]({ items: [] });
    await waitFor(() => expect(receiveAnnotation).toHaveBeenCalledTimes(2));

    const settledItems = [
      { ...poiA, 'dbf:order': 1 },
      { ...poiB, 'dbf:order': 0 },
    ];
    rerender(withContext({
      items: settledItems,
      receiveAnnotation,
      storageAdapter,
    }));
    expect(listedTitles()).toEqual(['poi/b', 'poi/a']);
  });
});

describe('journey path auto-recompute (issue #358)', () => {
  /** A raw journey annotation item, with no synthesized path yet (plain canvas-id target). */
  const journeyItem = (id, order = 0) => ({
    body: [{
      language: 'en', purpose: 'identifying', type: 'TextualBody', value: id,
    }],
    'dbf:kind': 'Journey',
    'dbf:order': order,
    id,
    target: 'canv/1',
  });

  /** A raw poi item with an already-placed marker (maeData.target), as finalizeSpatialTarget
   * would have saved it - the input recomputeJourneyPath reads a poi's center point from. */
  const poiWithTarget = ({
    id, journeyId, order, x, y,
  }) => ({
    body: [{
      language: 'en', purpose: 'identifying', type: 'TextualBody', value: id,
    }],
    'dbf:journey': journeyId ? { id: journeyId, order } : undefined,
    'dbf:kind': 'POI',
    id,
    maeData: {
      target: {
        drawingState: JSON.stringify({ shapes: [{ type: 'poi', x, y }] }),
        fullCanvaXYWH: '0,0,800,600',
      },
    },
  });

  /** A fake adapter whose `update` mutates a shared in-memory store (like a real
   * read-modify-write adapter would), so a later persist in the same test sees every earlier
   * one's effect - unlike a stateless mock, this matters here because the journey-path
   * recompute must read the POIs' *latest* order, not the state as it was before this test's
   * own earlier writes landed. */
  const fakeAdapter = (initialItems) => {
    let store = initialItems;
    const update = vi.fn(async (annotation) => {
      store = store.map((it) => (it.id === annotation.id ? annotation : it));
      return { items: store };
    });
    return { annotationPageId: 'page/1', update };
  };

  it('recomputes and persists the journey path once after reordering its pois in one drag', async () => {
    const journey = journeyItem('journey/1');
    const poiA = poiWithTarget({
      id: 'poi/a', journeyId: 'journey/1', order: 0, x: 10, y: 10,
    });
    const poiB = poiWithTarget({
      id: 'poi/b', journeyId: 'journey/1', order: 1, x: 20, y: 20,
    });

    const adapter = fakeAdapter([journey, poiA, poiB]);
    const storageAdapter = vi.fn(() => adapter);
    const receiveAnnotation = vi.fn();

    render(withContext({
      items: [journey, poiA, poiB],
      receiveAnnotation,
      storageAdapter,
    }));

    // sortables[0] is the top-level list, sortables[1] is this one journey's nested poi list.
    const nestedProps = screen.getAllByTestId('mock-sortable')[1].sortableProps;

    await act(async () => {
      nestedProps.onStart();
      nestedProps.setList([
        { ...poiB, 'dbf:journey': { id: 'journey/1', order: 0 } },
        { ...poiA, 'dbf:journey': { id: 'journey/1', order: 1 } },
      ]);
      nestedProps.onEnd();
    });

    // 2 poi writes (the reordered batch) + 1 journey path write, once the batch settles.
    await waitFor(() => expect(adapter.update).toHaveBeenCalledTimes(3));

    const journeyWrite = adapter.update.mock.calls
      .map((call) => call[0])
      .find((annotation) => annotation.id === 'journey/1');
    expect(journeyWrite.target.source).toBe('canv/1');
    expect(journeyWrite.target.selector[0].value).toContain('M 20,20 L 10,10');
  });

  it('recomputes the destination journey\'s path after "move to journey" assigns a poi to it', async () => {
    const journey = journeyItem('journey/1');
    const existingPoi = poiWithTarget({
      id: 'poi/existing', journeyId: 'journey/1', order: 0, x: 10, y: 10,
    });
    const standalonePoi = poiWithTarget({ id: 'poi/standalone', x: 20, y: 20 });

    const adapter = fakeAdapter([journey, existingPoi, standalonePoi]);
    const storageAdapter = vi.fn(() => adapter);
    const receiveAnnotation = vi.fn();

    render(withContext({
      items: [journey, existingPoi, standalonePoi],
      receiveAnnotation,
      storageAdapter,
    }, {
      annotationEditCompanionWindowIsOpened: true,
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': { json: { items: [journey, existingPoi, standalonePoi] } },
        },
      },
      canvases: [{ id: 'canv/1' }],
    }));

    const standaloneRow = screen.getByText('poi/standalone').closest('li');
    await userEvent.hover(standaloneRow);
    await userEvent.click(screen.getByRole('button', { name: /move to journey/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: journey.body[0].value }));

    // The poi's own write, then the journey path write once it settles.
    await waitFor(() => expect(adapter.update).toHaveBeenCalledTimes(2));

    const journeyWrite = adapter.update.mock.calls
      .map((call) => call[0])
      .find((annotation) => annotation.id === 'journey/1');
    expect(journeyWrite.target.selector[0].value).toContain('M 10,10 L 20,20');
  });
});
