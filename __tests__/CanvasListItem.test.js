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

    await userEvent.click(previewButton);

    expect(addCompanionWindow)
      .toHaveBeenCalledWith('mapsPoiPreview', { annotationid: 'anno/1', position: 'right' });
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
});
