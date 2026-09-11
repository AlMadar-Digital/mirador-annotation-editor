import React, { useRef, useState } from 'react';
import {
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { getConfig } from 'dbf-mirador';
import { TEMPLATE } from '../../AnnotationFormUtils';
import { resizeKonvaStage } from '../../AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { finalizeSpatialTarget } from '../../../IIIFUtils';
import { templateKit } from '../kit';
import { MediaItemRelationField } from '../templateComponents/MediaItemRelationField';
import { MapRelationField } from '../templateComponents/MapRelationField';
import { RichTextField } from '../templateComponents/RichTextField';
import {
  applyPoiBodyConversion,
  getLocaleContent,
  isRtlLocale,
  isValidPointTarget,
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
    contentLocales = [], searchMediaItems, searchMaps,
  } = useSelector((state) => getConfig(state)).annotation ?? {};

  let maeAnnotation = annotation;

  if (!maeAnnotation.id) {
    maeAnnotation = {
      body: [],
      'dbf:kind': 'POI',
      'dbf:linkedMap': null,
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
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState(
    Object.keys(annotationState.maeData.contentByLocale)[0] ?? contentLocales[0]?.code,
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

  /** Save function * */
  const saveFunction = async () => {
    const validTarget = isValidPointTarget(annotationState.maeData);
    const validLinkedMap = Boolean(annotationState['dbf:linkedMap']);
    setTargetError(!validTarget);
    setLinkedMapError(!validLinkedMap);
    if (!validTarget || !validLinkedMap) {
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
      <Grid>
        <Typography variant="formSectionTitle">{t('nested_map')}</Typography>
      </Grid>
      {contentLocales.length > 1 && (
        <Grid>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="nested-map-language-label">{t('poi_language')}</InputLabel>
            <Select
              labelId="nested-map-language-label"
              label={t('poi_language')}
              value={activeLocale ?? ''}
              onChange={(event) => setActiveLocale(event.target.value)}
              MenuProps={{ container: dialogContainer }}
            >
              {contentLocales.map(({ code, name }) => (
                <MenuItem key={code} value={code}>{name ?? code}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      )}
      <Grid>
        <TextField
          fullWidth
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
      </Grid>
      {typeof searchMediaItems === 'function' && (
        <Grid>
          <MediaItemRelationField
            dialogContainer={dialogContainer}
            label={t('poi_media_item')}
            onChange={(mediaItem) => updateActiveLocaleContent({ mediaItem })}
            onSearch={searchMediaItems}
            t={t}
            value={activeLocaleContent.mediaItem}
          />
        </Grid>
      )}
      <Grid>
        <Typography variant="formSectionTitle">{t('poi_description_section')}</Typography>
      </Grid>
      <Grid>
        <RichTextField
          onChange={(html) => updateActiveLocaleContent({ description: html })}
          placeholder={t('poi_description_placeholder')}
          rtl={activeLocaleIsRtl}
          value={activeLocaleContent.description}
        />
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
