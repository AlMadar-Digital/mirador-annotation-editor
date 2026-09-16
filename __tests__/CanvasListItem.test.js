import React from 'react';
import userEvent from '@testing-library/user-event';

import CanvasListItem from '../src/CanvasListItem';
import AnnotationActionsContext from '../src/AnnotationActionsContext';
import { fireEvent, render, screen } from './test-utils';

const receiveAnnotation = vi.fn();
const storageAdapter = vi.fn(() => ({
  all: vi.fn()
    .mockResolvedValue({
      items: [{ id: 'anno/2' }]
    }),
  annotationPageId: 'pageId/3',
  delete: vi.fn(async () => 'annoPageResultFromDelete')
}));

function createWrapper(props, context = {}) {
  return render(
    <AnnotationActionsContext.Provider
      value={{
        canvases: [],
        receiveAnnotation,
        storageAdapter,
        switchToSingleCanvasView: () => undefined,
        ...context
      }}
    >
      <CanvasListItem annotationid="anno/1" {...props}>
        <div>HelloWorld</div>
      </CanvasListItem>
    </AnnotationActionsContext.Provider>,
    { context }
  );
}

describe('CanvasListItem', () => {
  it('wraps its children', () => {
    createWrapper();
    expect(screen.getByText('HelloWorld'))
      .toBeInTheDocument();
  });

  it('doesn\'t show edit/delete when annotation not editable on hover', async () => {
    createWrapper({}, {
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: { items: [{ id: 'anno/1' }] } // no maeData => not editable
          }
        }
      },
      canvases: [{ id: 'canv/1' }]
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    expect(li)
      .not
      .toBeNull();

    // you can use either userEvent.hover or fireEvent.mouseEnter
    await userEvent.hover(li);
    // fireEvent.mouseEnter(li!);

    expect(screen.queryByRole('button', { name: /metadata/i }))
      .toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i }))
      .toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i }))
      .toBeNull();
  });

  it('shows edit/delete when editable and hovering', async () => {
    createWrapper({}, {
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  id: 'anno/1',
                  maeData: { cre: 'someValue' },
                  creator: 'someCreator'
                } // editable
              ]
            }
          }
        }
      },
      canvases: [{ id: 'canv/1' }]
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    expect(li)
      .not
      .toBeNull();

    await userEvent.hover(li);
    // fireEvent.mouseEnter(li!);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length)
      .toBe(3);
    expect(screen.getByRole('button', { name: /metadata/i }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i }))
      .toBeInTheDocument();
  });

  it('only shows preview for maps annotations (dbf:kind present), and opens the mapsPoiPreview companion window on click', async () => {
    const addCompanionWindow = vi.fn();

    createWrapper({}, {
      addCompanionWindow,
      annotationPreviewCompanionWindowIsOpened: true,
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  'dbf:kind': 'POI',
                  id: 'anno/1',
                  maeData: { someData: 'someValue' }
                }
              ]
            }
          }
        }
      },
      canvases: [{ id: 'canv/1' }]
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    await userEvent.hover(li);

    const previewButton = screen.getByRole('button', { name: /preview/i });
    expect(previewButton)
      .toBeInTheDocument();
    expect(previewButton)
      .toBeEnabled();

    await userEvent.click(previewButton);

    expect(addCompanionWindow)
      .toHaveBeenCalledWith('mapsPoiPreview', { annotationid: 'anno/1', position: 'right' });
  });

  it('shows "open nested map" instead of preview for a Nested Map point (dbf:linkedMap present), and delegates to config.annotation.openLinkedMap on click', async () => {
    const openLinkedMap = vi.fn();
    const linkedMap = { id: 'map/2', titleEn: 'Nested map' };

    createWrapper({}, {
      annotationPreviewCompanionWindowIsOpened: true,
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  'dbf:kind': 'POI',
                  'dbf:linkedMap': linkedMap,
                  id: 'anno/1',
                  maeData: { someData: 'someValue' }
                }
              ]
            }
          }
        }
      },
      canvases: [{ id: 'canv/1' }],
      config: { annotation: { openLinkedMap } }
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    await userEvent.hover(li);

    expect(screen.queryByRole('button', { name: /preview/i }))
      .toBeNull();

    const openNestedMapButton = screen.getByRole('button', { name: /open nested map/i });
    expect(openNestedMapButton)
      .toBeInTheDocument();

    await userEvent.click(openNestedMapButton);

    expect(openLinkedMap)
      .toHaveBeenCalledWith(linkedMap);
  });

  it('disables preview while a preview companion window is already open', async () => {
    createWrapper({}, {
      annotationPreviewCompanionWindowIsOpened: false,
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  'dbf:kind': 'POI',
                  id: 'anno/1',
                  maeData: { someData: 'someValue' }
                }
              ]
            }
          }
        }
      },
      canvases: [{ id: 'canv/1' }]
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    await userEvent.hover(li);

    expect(screen.getByRole('button', { name: /preview/i }))
      .toBeDisabled();
  });

  it('does not show preview for a non-maps annotation (no dbf:kind)', async () => {
    createWrapper({}, {
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  id: 'anno/1',
                  maeData: { someData: 'someValue' }
                }
              ]
            }
          }
        }
      },
      canvases: [{ id: 'canv/1' }]
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    await userEvent.hover(li);

    expect(screen.queryByRole('button', { name: /preview/i }))
      .toBeNull();
  });

  it('deletes via storageAdapter on delete click', async () => {
    createWrapper({}, {
      annotationEditCompanionWindowIsOpened: true,
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  id: 'anno/1',
                  maeData: { someData: 'someValue' }
                }
              ]
            }
          }
        }
      },
      canvases: [{ id: 'canv/1' }]
    });

    const li = screen.getByText('HelloWorld')
      .closest('li');
    expect(li)
      .not
      .toBeNull();

    await userEvent.hover(li);
    // fireEvent.mouseEnter(li!);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);
    // fireEvent.click(deleteButton);

    expect(storageAdapter)
      .toHaveBeenCalledTimes(1);
    expect(storageAdapter)
      .toHaveBeenCalledWith('canv/1');
  });

  describe('move to journey (issue #377)', () => {
    /** A context with one editable (maeData-bearing) poi, ready for the tests below to add
     * their own journeys/currentJourneyId/onMoveToJourney props on top of. */
    const editableContext = () => ({
      annotationEditCompanionWindowIsOpened: true,
      annotationsOnCanvases: {
        'canv/1': {
          'annoPage/1': {
            json: {
              items: [
                {
                  id: 'anno/1',
                  maeData: { someData: 'someValue' },
                },
              ],
            },
          },
        },
      },
      canvases: [{ id: 'canv/1' }],
    });

    it('does not show the button when no journeys prop is passed (e.g. a Journey row)', async () => {
      createWrapper({}, editableContext());

      const li = screen.getByText('HelloWorld').closest('li');
      await userEvent.hover(li);

      expect(screen.queryByRole('button', { name: /move to journey/i }))
        .toBeNull();
    });

    it('does not show the button when there are no journeys and the poi has none either', async () => {
      createWrapper({ journeys: [] }, editableContext());

      const li = screen.getByText('HelloWorld').closest('li');
      await userEvent.hover(li);

      expect(screen.queryByRole('button', { name: /move to journey/i }))
        .toBeNull();
    });

    it('lists every journey and assigns the poi to the one picked', async () => {
      const onMoveToJourney = vi.fn();
      createWrapper({
        journeys: [
          { id: 'journey/a', title: 'Journey A' },
          { id: 'journey/b', title: 'Journey B' },
        ],
        onMoveToJourney,
      }, editableContext());

      const li = screen.getByText('HelloWorld').closest('li');
      await userEvent.hover(li);

      const moveButton = screen.getByRole('button', { name: /move to journey/i });
      await userEvent.click(moveButton);

      expect(screen.getByRole('menuitem', { name: 'Journey A' }))
        .toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Journey B' }))
        .toBeInTheDocument();
      // Not already in a journey - no "remove from journey" option to offer.
      expect(screen.queryByRole('menuitem', { name: /remove_from_journey/i }))
        .toBeNull();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Journey B' }));

      expect(onMoveToJourney)
        .toHaveBeenCalledWith('journey/b');
    });

    it('offers "remove from journey" when the poi already belongs to one, calling back with null', async () => {
      const onMoveToJourney = vi.fn();
      createWrapper({
        currentJourneyId: 'journey/a',
        journeys: [{ id: 'journey/a', title: 'Journey A' }],
        onMoveToJourney,
      }, editableContext());

      const li = screen.getByText('HelloWorld').closest('li');
      await userEvent.hover(li);

      await userEvent.click(screen.getByRole('button', { name: /move to journey/i }));

      await userEvent.click(screen.getByRole('menuitem', { name: /remove_from_journey/i }));

      expect(onMoveToJourney)
        .toHaveBeenCalledWith(null);
    });
  });
});
