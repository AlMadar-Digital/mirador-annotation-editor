import * as actions from 'dbf-mirador';
import {
  getCompanionWindow,
  getVisibleCanvases,
  getPresentAnnotationsOnSelectedCanvases,
  OSDReferences,
  removeCompanionWindow as removeCompanionWindowAction,
  receiveAnnotation as receiveAnnotationAction,
} from 'dbf-mirador';

import annotationForm from '../annotationForm/AnnotationForm';
import { WindowPlayer } from '../playerReferences';
import translations from '../locales/locales';
import { reopenPreview as reopenPreviewAction } from '../annotationPreview';

/** */
const mapDispatchToProps = (dispatch, {
  id,
  windowId,
}) => ({
  closeCompanionWindow: () => dispatch(
    removeCompanionWindowAction(windowId, id),
  ),
  receiveAnnotation: (targetId, annoId, annotation) => dispatch(
    receiveAnnotationAction(targetId, annoId, annotation),
  ),
  reopenPreview: (returnToPreview) => dispatch(
    reopenPreviewAction(windowId, returnToPreview),
  ),
});

/** */
function mapStateToProps(state, {
  id: companionWindowId,
  windowId,
}) {
  const currentTime = null;
  const cw = getCompanionWindow(state, {
    companionWindowId,
    windowId,
  });
  // `returnToPreview`: the preview this form replaced (see openAnnotationEditor)
  const { annotationid, returnToPreview } = cw;

  // This architecture lead to recreate the playerReferences each time the component is rendered
  const media = OSDReferences.get(windowId);
  const playerReferences = new WindowPlayer(state, windowId, media, actions);

  // This could be removed but it's serve the useEffect in AnnotationForm for now.
  const canvases = getVisibleCanvases(state, { windowId });
  let annotation = getPresentAnnotationsOnSelectedCanvases(state, { windowId })
    .flatMap((annoPage) => annoPage.json.items || [])
    .find((annot) => annot.id === annotationid);

  // New annotation has no ID and no templateType defined
  if (!annotation) {
    annotation = {
      id: null,
      maeData: {
        templateType: null,
      },
    };
  }

  return {
    annotation,
    canvases,
    config: {
      ...state.config,
      translations,
    },
    currentTime,
    playerReferences,
    returnToPreview,
  };
}

// TODO attention


const annotationCreationCompanionWindow = {
  companionWindowKey: 'annotationCreation',
  component: annotationForm,
  mapDispatchToProps,
  mapStateToProps,
};

export default annotationCreationCompanionWindow;
