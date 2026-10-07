import {
  openAnnotationEditor, previewAnnotation, reopenPreview,
} from '../src/annotationPreview';

/** Runs a thunk against a store holding `companionWindows`, returning the actions it dispatched. */
const run = (thunk, companionWindows = {}) => {
  const dispatch = vi.fn();
  thunk(dispatch, () => ({ companionWindows }));
  return dispatch.mock.calls.map(([action]) => action);
};

const sidebar = {
  content: 'annotations', id: 'cw-side', position: 'left', windowId: 'w1',
};
const preview = {
  annotationid: 'journey/1', content: 'mapsPoiPreview', id: 'cw-preview', position: 'right', windowId: 'w1',
};
const otherWindowPreview = { ...preview, id: 'cw-other', windowId: 'w2' };
const editor = {
  annotationid: 'poi/1', content: 'annotationCreation', id: 'cw-edit', position: 'right', windowId: 'w1',
};

describe('openAnnotationEditor (issue #457)', () => {
  it('replaces the preview with the form, remembering the preview to return to', () => {
    const actions = run(openAnnotationEditor('w1', 'poi/1'), {
      'cw-other': otherWindowPreview, 'cw-preview': preview, 'cw-side': sidebar,
    });

    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual(expect.objectContaining({
      id: 'cw-preview', type: 'mirador/REMOVE_COMPANION_WINDOW', windowId: 'w1',
    }));
    expect(actions[1]).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        annotationid: 'poi/1',
        content: 'annotationCreation',
        position: 'right',
        returnToPreview: { annotationid: 'journey/1', position: 'right' },
      }),
      type: 'mirador/ADD_COMPANION_WINDOW',
    }));
  });

  it('opens the form without returnToPreview when no preview was open', () => {
    const [action] = run(openAnnotationEditor('w1', 'poi/1'), { 'cw-side': sidebar });

    expect(action.type).toBe('mirador/ADD_COMPANION_WINDOW');
    expect(action.payload).not.toHaveProperty('returnToPreview');
  });

  it('closes the preview for a new annotation, without coming back to it', () => {
    const actions = run(openAnnotationEditor('w1'), { 'cw-preview': preview });

    expect(actions[0].type).toBe('mirador/REMOVE_COMPANION_WINDOW');
    expect(actions[1].payload).not.toHaveProperty('annotationid');
    expect(actions[1].payload).not.toHaveProperty('returnToPreview');
  });
});

describe('previewAnnotation (issue #457)', () => {
  it('opens a preview when there is none', () => {
    const [action] = run(previewAnnotation('w1', 'poi/1'), { 'cw-other': otherWindowPreview });

    expect(action).toEqual(expect.objectContaining({
      payload: expect.objectContaining({ annotationid: 'poi/1', content: 'mapsPoiPreview', position: 'right' }),
      type: 'mirador/ADD_COMPANION_WINDOW',
      windowId: 'w1',
    }));
  });

  it('re-uses the open preview', () => {
    const [action] = run(previewAnnotation('w1', 'poi/1'), { 'cw-preview': preview });

    expect(action).toEqual(expect.objectContaining({
      id: 'cw-preview', payload: { annotationid: 'poi/1' }, type: 'mirador/UPDATE_COMPANION_WINDOW',
    }));
  });

  it('does nothing while the form is open', () => {
    expect(run(previewAnnotation('w1', 'poi/2'), { 'cw-edit': editor })).toEqual([]);
  });
});

describe('reopenPreview (issue #457)', () => {
  it('opens the preview the form replaced', () => {
    expect(reopenPreview('w1', { annotationid: 'journey/1', position: 'bottom' })).toEqual(expect.objectContaining({
      payload: expect.objectContaining({ annotationid: 'journey/1', content: 'mapsPoiPreview', position: 'bottom' }),
      type: 'mirador/ADD_COMPANION_WINDOW',
    }));
  });
});
