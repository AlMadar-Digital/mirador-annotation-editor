import React, { useRef, useState } from 'react';
import { Grid, TextField } from '@mui/material';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { getConfig } from 'dbf-mirador';
import { TEMPLATE } from '../../AnnotationFormUtils';
import { resizeKonvaStage } from '../../AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { finalizeSpatialTarget } from '../../../IIIFUtils';
import { templateKit } from '../kit';
import { LanguageToggle } from '../templateComponents/LanguageToggle';
import { MapRelationField } from '../templateComponents/MapRelationField';
import { RichTextField } from '../templateComponents/RichTextField';
import {
  applyPoiBodyConversion,
  getDefaultActiveLocale,
  getLocaleContent,
  isRtlLocale,
  isTitleFilled,
  isValidLatitude,
  isValidLongitude,
  isValidPointTarget,
  normalizeCoordinateInput,
  parseContentByLocale,
} from './POITemplate';

const { AnnotationFormFooter, TargetFormSection } = templateKit;

/**
 * Convert a NestedMapTemplate annotationState into a savable IIIF annotation: shares POI's
 * body-building pipeline (title/description/media - issue #350: "they share same information
 * than POI and are saved like POI"), so this is saved as the exact same dbf:kind: 'POI' shape.
 * `dbf:linkedMap` is already set directly on `state` by updateLinkedMap below (not read here),
 * matching how dbf:journey is threaded through - see applyPoiBodyConversion's own doc.
 * @param {object} state
 * @param {{ canvas: object, windowId: string, playerReferences: object }} ctx
 * @returns {Promise<object>}
 */
export const convertNestedMapAnnotationToBeSaved = async (
  state,
  { canvas, windowId, playerReferences },
) => {
  const stateToSave = applyPoiBodyConversion(state);
  return finalizeSpatialTarget(stateToSave, canvas, windowId, playerReferences);
};

/** Nested Map Template - a POI-shaped point whose click, at read time, opens a different map
 * (dbf:linkedMap) instead of an info popup. See
 * docs/superpowers/specs/2026-09-01-poi-iiif-annotation-format-design.md in root_repo. */
export default function NestedMapTemplate(
  {
    annotation,
    closeFormCompanionWindow,
    playerReferences,
    saveAnnotation,
    t,
    windowId,
  },
) {
  const {
    contentLocales = [], searchMaps,
  } = useSelector((state) => getConfig(state)).annotation ?? {};

  let maeAnnotation = annotation;

  if (!maeAnnotation.id) {
    maeAnnotation = {
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': null,
      'dbf:linkedMap': null,
      'dbf:longitude': null,
      'dbf:mediaAr': null,
      'dbf:mediaEn': null,
      maeData: {
        contentByLocale: {},
        target: null,
        templateType: TEMPLATE.NESTED_MAP_TYPE,
      },
      motivation: 'identifying',
      target: null,
    };
  } else {
    if (maeAnnotation.maeData.target.drawingState && typeof maeAnnotation.maeData.target.drawingState === 'string') {
      // currentShape is cleared on load - see POITemplate's identical handling.
      maeAnnotation.maeData.target.drawingState = {
        ...JSON.parse(maeAnnotation.maeData.target.drawingState),
        currentShape: null,
      };
    }
    maeAnnotation.maeData.contentByLocale = parseContentByLocale(maeAnnotation.body);
  }

  const [annotationState, setAnnotationState] = useState(maeAnnotation);
  const [targetError, setTargetError] = useState(false);
  const [linkedMapError, setLinkedMapError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [latitudeError, setLatitudeError] = useState(false);
  const [longitudeError, setLongitudeError] = useState(false);
  // See POITemplate's own latitudeInput/longitudeInput doc for why these are tracked separately
  // from the parsed `dbf:latitude`/`dbf:longitude`.
  const [latitudeInput, setLatitudeInput] = useState(
    maeAnnotation['dbf:latitude'] != null ? String(maeAnnotation['dbf:latitude']) : '',
  );
  const [longitudeInput, setLongitudeInput] = useState(
    maeAnnotation['dbf:longitude'] != null ? String(maeAnnotation['dbf:longitude']) : '',
  );
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState(
    getDefaultActiveLocale(annotationState.maeData.contentByLocale, contentLocales),
  );

  const rootRef = useRef(null);
  /** See MiradorMaeViewer/POITemplate for why an explicit dialog container is required here. */
  const dialogContainer = () => rootRef.current?.closest('[role="dialog"]') ?? document.body;

  const activeLocaleContent = getLocaleContent(
    annotationState.maeData.contentByLocale,
    activeLocale,
  );
  const activeLocaleIsRtl = isRtlLocale(activeLocale);
  const linkedMap = annotationState['dbf:linkedMap'] ?? null;

  /** Update a top-level maeData field * */
  const updateMaeData = (patch) => {
    setAnnotationState({
      ...annotationState,
      maeData: {
        ...annotationState.maeData,
        ...patch,
      },
    });
  };

  /** Update Target State * */
  const updateTargetState = (target) => {
    updateMaeData({ target });
  };

  /** Merge a patch into the active locale's title/description * */
  const updateActiveLocaleContent = (patch) => {
    updateMaeData({
      contentByLocale: {
        ...annotationState.maeData.contentByLocale,
        [activeLocale]: { ...activeLocaleContent, ...patch },
      },
    });
  };

  /** Update the linked map, or clear it (map is `null`) * */
  const updateLinkedMap = (map) => {
    setAnnotationState({
      ...annotationState,
      'dbf:linkedMap': map ? { id: map.documentId, titleEn: map.titleEn } : null,
    });
  };

  /** Update the optional real-world latitude/longitude - see POITemplate's updateLatitude/
   * updateLongitude for the shared doc. */
  const updateLatitude = (event) => {
    const { value } = event.target;
    setLatitudeInput(value);
    setAnnotationState((prev) => ({
      ...prev,
      'dbf:latitude': normalizeCoordinateInput(value),
    }));
  };

  /** Update the optional real-world longitude - see updateLatitude's own doc. */
  const updateLongitude = (event) => {
    const { value } = event.target;
    setLongitudeInput(value);
    setAnnotationState((prev) => ({
      ...prev,
      'dbf:longitude': normalizeCoordinateInput(value),
    }));
  };

  /** Save function * */
  const saveFunction = async () => {
    const validTarget = isValidPointTarget(annotationState.maeData);
    const validLinkedMap = Boolean(annotationState['dbf:linkedMap']);
    const validTitle = isTitleFilled(annotationState.maeData.contentByLocale, contentLocales);
    const validLatitude = isValidLatitude(annotationState['dbf:latitude']);
    const validLongitude = isValidLongitude(annotationState['dbf:longitude']);
    setTargetError(!validTarget);
    setLinkedMapError(!validLinkedMap);
    setTitleError(!validTitle);
    setLatitudeError(!validLatitude);
    setLongitudeError(!validLongitude);
    if (!validTarget || !validLinkedMap || !validTitle || !validLatitude || !validLongitude) {
      return;
    }
    resizeKonvaStage(
      windowId,
      playerReferences.getMediaTrueWidth(),
      playerReferences.getMediaTrueHeight(),
      1 / playerReferences.getScale(),
    );
    setSaving(true);
    try {
      await saveAnnotation(annotationState);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Grid container direction="column" spacing={2} ref={rootRef}>
      <Grid container direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Grid>
          <Typography variant="formSectionTitle">{t('nested_map')}</Typography>
        </Grid>
        <Grid>
          <LanguageToggle
            contentLocales={contentLocales}
            label={t('poi_language')}
            onChange={setActiveLocale}
            value={activeLocale}
          />
        </Grid>
      </Grid>
      <Grid>
        <TextField
          fullWidth
          error={titleError}
          label={t('poi_title')}
          value={activeLocaleContent.title}
          variant="outlined"
          onChange={(event) => updateActiveLocaleContent({ title: event.target.value })}
          slotProps={{
            htmlInput: {
              dir: activeLocaleIsRtl ? 'rtl' : 'ltr',
              style: { textAlign: activeLocaleIsRtl ? 'right' : 'left' },
            },
          }}
        />
        {titleError && (
          <Typography color="error" variant="caption">
            {t('poi_title_required')}
          </Typography>
        )}
      </Grid>
      <Grid>
        <Typography variant="formSectionTitle">{t('nested_map_linked_map')}</Typography>
      </Grid>
      {typeof searchMaps === 'function' && (
        <Grid>
          <MapRelationField
            dialogContainer={dialogContainer}
            label={t('nested_map_linked_map')}
            onChange={updateLinkedMap}
            onSearch={searchMaps}
            t={t}
            value={linkedMap ? { documentId: linkedMap.id, titleEn: linkedMap.titleEn } : null}
          />
          {linkedMapError && (
            <Typography color="error" variant="caption">
              {t('nested_map_linked_map_required')}
            </Typography>
          )}
        </Grid>
      )}
      <Grid>
        <Typography variant="formSectionTitle">{t('poi_description_section')}</Typography>
      </Grid>
      <Grid>
        <RichTextField
          // Remount per locale switch - see the matching comment on POITemplate's
          // RichTextField for why relying on ckeditor5-react's controlled `data` sync
          // silently wipes the previous locale's just-edited description.
          key={activeLocale}
          onChange={(html) => updateActiveLocaleContent({ description: html })}
          placeholder={t('poi_description_placeholder')}
          rtl={activeLocaleIsRtl}
          value={activeLocaleContent.description}
        />
      </Grid>
      <Grid container direction="row" spacing={2}>
        <Grid size={6}>
          <TextField
            fullWidth
            error={latitudeError}
            label={t('poi_latitude')}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            type="text"
            value={latitudeInput}
            variant="outlined"
            onChange={updateLatitude}
          />
          {latitudeError && (
            <Typography color="error" variant="caption">
              {t('poi_latitude_invalid')}
            </Typography>
          )}
        </Grid>
        <Grid size={6}>
          <TextField
            fullWidth
            error={longitudeError}
            label={t('poi_longitude')}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            type="text"
            value={longitudeInput}
            variant="outlined"
            onChange={updateLongitude}
          />
          {longitudeError && (
            <Typography color="error" variant="caption">
              {t('poi_longitude_invalid')}
            </Typography>
          )}
        </Grid>
      </Grid>
      <Grid>
        <TargetFormSection
          onChangeTarget={updateTargetState}
          playerReferences={playerReferences}
          pointOnly
          spatialTarget
          target={annotationState.maeData.target}
          windowId={windowId}
        />
        {targetError && (
          <Typography color="error" variant="caption">
            {t('poi_target_must_be_point')}
          </Typography>
        )}
      </Grid>
      <Grid>
        <AnnotationFormFooter
          closeFormCompanionWindow={closeFormCompanionWindow}
          saveAnnotation={saveFunction}
          saving={saving}
          t={t}
          annotationState={annotationState}
        />
      </Grid>
    </Grid>
  );
}

NestedMapTemplate.propTypes = {
  annotation: PropTypes.shape({
    adapter: PropTypes.func,
    body: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
      }),
    ),
    defaults: PropTypes.objectOf(
      PropTypes.oneOfType(
        [PropTypes.bool, PropTypes.func, PropTypes.number, PropTypes.string],
      ),
    ),
    drawingState: PropTypes.string,
    manifestNetwork: PropTypes.string,
    target: PropTypes.string,
  }).isRequired,
  closeFormCompanionWindow: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types
  playerReferences: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types
  saveAnnotation: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  windowId: PropTypes.string.isRequired,
};
