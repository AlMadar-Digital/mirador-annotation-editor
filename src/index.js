import miradorAnnotationPlugin from './plugins/miradorAnnotationPlugin';
import externalStorageAnnotationPlugin from './plugins/externalStorageAnnotationPlugin';
import canvasAnnotationsPlugin from './plugins/canvasAnnotationsPlugin';
import annotationCreationCompanionWindowPlugin from './plugins/annotationCreationCompanionWindow';
import windowSideBarButtonsPlugin from './plugins/windowSideBarButtonsPlugin';
import annotationSagaPlugin from './plugins/annotationSaga';
import poiMoveOnMapPlugin from './plugins/poiMoveOnMapPlugin';
import AiiinotateAdapter from './annotationAdapter/AiiinotateAdapter';
import LocalStorageAdapter from './annotationAdapter/LocalStorageAdapter';
import { templateKit } from './annotationForm/templates/kit';
import { convertIIIFAnnoToMaeData } from './IIIFUtils';
import 'react-quill/dist/quill.snow.css';

export {
  miradorAnnotationPlugin, externalStorageAnnotationPlugin,
  canvasAnnotationsPlugin, annotationCreationCompanionWindowPlugin,
  windowSideBarButtonsPlugin,
  poiMoveOnMapPlugin,
  templateKit,
  convertIIIFAnnoToMaeData,
};

export const annotationAdapters = {
  AiiinotateAdapter,
  LocalStorageAdapter,
};

const annotationPlugins = [
  miradorAnnotationPlugin,
  externalStorageAnnotationPlugin,
  canvasAnnotationsPlugin,
  annotationCreationCompanionWindowPlugin,
  windowSideBarButtonsPlugin,
  annotationSagaPlugin,
  poiMoveOnMapPlugin,
];

export default annotationPlugins;
