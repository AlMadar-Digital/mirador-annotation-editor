import {
  addCompanionWindow,
  getCompanionWindows,
  removeCompanionWindow,
  updateCompanionWindow,
} from 'dbf-mirador';

// Issue #457: the editor's annotation form and dbf-mirador's own POI/journey preview (its
// poiPreviewPlugin, registered by the host alongside this package's plugins) share the right
// side of the window - only one of them is shown at a time.
export const ANNOTATION_EDIT_CONTENT_ID = 'annotationCreation';
// Not a companion window type this package registers itself: see dbf-mirador's
// poiPreviewPlugin.tsx.
export const PREVIEW_CONTENT_ID = 'mapsPoiPreview';

/** The companion windows of a Mirador window, as their store entries. */
const getWindowCompanionWindows = (state, windowId) => Object.values(getCompanionWindows(state))
  .filter((cw) => cw?.windowId === windowId);

/**
 * Opens the annotation form - editing `annotationid`, or creating a new annotation without one -
 * in place of every other companion window beside the map (the left-hand sidebar stays).
 * When editing, a preview it closes is remembered on the form's own companion window
 * (`returnToPreview`), so the form can bring it back once the annotation is saved (see
 * reopenPreview).
 * @param {string} windowId - The Mirador window.
 * @param {string} [annotationid] - The annotation to edit.
 * @returns {Function} A thunk.
 */
export const openAnnotationEditor = (windowId, annotationid) => (dispatch, getState) => {
  const companionWindows = getWindowCompanionWindows(getState(), windowId);
  const preview = companionWindows.find((cw) => cw.content === PREVIEW_CONTENT_ID);

  companionWindows
    .filter((cw) => cw.position !== 'left')
    .forEach((cw) => dispatch(removeCompanionWindow(windowId, cw.id)));

  dispatch(addCompanionWindow(windowId, {
    ...(annotationid ? { annotationid } : {}),
    content: ANNOTATION_EDIT_CONTENT_ID,
    position: 'right',
    ...(annotationid && preview?.annotationid ? {
      returnToPreview: { annotationid: preview.annotationid, position: preview.position },
    } : {}),
  }));
};

/**
 * Shows `annotationid` in the window's preview, opening it if needed - unless the annotation
 * form is open, which the preview never stacks next to.
 * @param {string} windowId - The Mirador window.
 * @param {string} annotationid - The annotation to preview.
 * @returns {Function} A thunk.
 */
export const previewAnnotation = (windowId, annotationid) => (dispatch, getState) => {
  const companionWindows = getWindowCompanionWindows(getState(), windowId);
  if (companionWindows.some((cw) => cw.content === ANNOTATION_EDIT_CONTENT_ID)) return;

  const preview = companionWindows.find((cw) => cw.content === PREVIEW_CONTENT_ID);
  if (preview) {
    dispatch(updateCompanionWindow(windowId, preview.id, { annotationid }));
  } else {
    dispatch(addCompanionWindow(windowId, {
      annotationid,
      content: PREVIEW_CONTENT_ID,
      position: 'right',
    }));
  }
};

/**
 * Brings back the preview openAnnotationEditor closed, now showing the saved annotation.
 * @param {string} windowId - The Mirador window.
 * @param {{annotationid: string, position: string}} returnToPreview - The closed preview.
 * @returns {object} The action.
 */
export const reopenPreview = (windowId, { annotationid, position }) => addCompanionWindow(
  windowId,
  { annotationid, content: PREVIEW_CONTENT_ID, position: position ?? 'right' },
);
