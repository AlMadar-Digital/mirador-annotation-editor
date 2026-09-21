/** Custom DOM event name used to trigger annotation save from hotkeys */
export const MAE_SAVE_EVENT = 'mae-save-annotation';

/** Custom DOM event to delete the currently selected shape */
export const MAE_DELETE_SHAPE_EVENT = 'mae-delete-shape';

/** Dispatched by TargetSpatialInput when the last shape has been removed */
export const MAE_ANNOTATION_EMPTY_EVENT = 'mae-annotation-empty';

/** Custom DOM event: fired (with `detail: { saving: boolean }`) whenever
 * SortableCanvasAnnotationsList starts or finishes persisting a POI reorder/move, so the
 * toolbar's "create annotation" button can show a spinner even though it lives in a separate
 * companion window/plugin tree with no shared component state. */
export const MAE_POI_SAVING_EVENT = 'mae-poi-saving';
