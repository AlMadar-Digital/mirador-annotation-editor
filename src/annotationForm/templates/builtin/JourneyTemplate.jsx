import React, { useRef, useState } from 'react';
import { Grid, TextField } from '@mui/material';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { getConfig } from 'dbf-mirador';
import { TEMPLATE } from '../../AnnotationFormUtils';
import { templateKit } from '../kit';
import { LanguageToggle } from '../templateComponents/LanguageToggle';
import { LocalizedMediaSelectionField } from '../templateComponents/LocalizedMediaSelectionField';
import { RichTextField } from '../templateComponents/RichTextField';
import { applyPoiBodyConversion, getDefaultActiveLocale, parseContentByLocale } from './POITemplate';

const { AnnotationFormFooter } = templateKit;

/** Arabic (any variant) is the only right-to-left content locale offered today - same rule as
 * POITemplate's isRtlLocale. */
const isRtlLocale = (localeCode) => (
  typeof localeCode === 'string' && localeCode.toLowerCase().startsWith('ar')
);

const EMPTY_LOCALE_CONTENT = { description: '', title: '' };

/** Reads one locale's title/description out of maeData.contentByLocale. */
const getLocaleContent = (contentByLocale, locale) => (
  contentByLocale[locale] ?? EMPTY_LOCALE_CONTENT
);

/**
 * Convert a JourneyTemplate annotationState into a savable IIIF annotation: build the body
 * array (applyPoiBodyConversion - a journey has the exact same localized title/description/
 * media shape as a poi), then set `target` to the whole canvas. A journey has no spatial
 * marker (root_repo's design doc explicitly scoped that out - see docs/superpowers/specs/
 * 2026-09-01-poi-iiif-annotation-format-design.md), so unlike every other template here this
 * does NOT go through finalizeSpatialTarget/getIIIFTargetFromMaeData at all - there is no
 * Konva-drawn shape to finalize.
 * @param {object} state
 * @param {{ canvas: object, windowId: string, playerReferences: object }} ctx
 * @returns {Promise<object>}
 */
export const convertJourneyAnnotationToBeSaved = async (state, { canvas }) => {
  const stateToSave = applyPoiBodyConversion(state);
  stateToSave.target = canvas.id;
  return stateToSave;
};

/** Journey Template - same fields as POITemplate except target/coordinates (issue #344) */
export default function JourneyTemplate(
  {
    annotation,
    closeFormCompanionWindow,
    saveAnnotation,
    t,
  },
) {
  const {
    contentLocales = [], searchMediaItems, searchIiifImages, searchUploads,
  } = useSelector((state) => getConfig(state)).annotation ?? {};

  let maeAnnotation = annotation;

  if (!maeAnnotation.id) {
    maeAnnotation = {
      body: [],
      'dbf:kind': 'Journey',
      'dbf:mediaAr': null,
      'dbf:mediaEn': null,
      maeData: {
        contentByLocale: {},
        target: {},
        templateType: TEMPLATE.JOURNEY_TYPE,
      },
      motivation: 'identifying',
      target: null,
    };
  } else {
    // Rebuild contentByLocale from the saved body - reuses POITemplate's own rehydration (see
    // its own doc for the "first describing item per locale wins" rule). dbf:mediaEn/dbf:mediaAr
    // (issue #377) are read directly off maeAnnotation below, not part of this per-locale map -
    // each is its own root-level annotation extension.
    maeAnnotation.maeData.contentByLocale = parseContentByLocale(maeAnnotation.body);
  }

  const [annotationState, setAnnotationState] = useState(maeAnnotation);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState(
    getDefaultActiveLocale(annotationState.maeData.contentByLocale, contentLocales),
  );

  const rootRef = useRef(null);
  /** See POITemplate's own dialogContainer comment for why this is needed. */
  const dialogContainer = () => rootRef.current?.closest('[role="dialog"]') ?? document.body;

  const activeLocaleContent = getLocaleContent(
    annotationState.maeData.contentByLocale,
    activeLocale,
  );
  const activeLocaleIsRtl = isRtlLocale(activeLocale);

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

  /** Merge a patch into the active locale's title/description * */
  const updateActiveLocaleContent = (patch) => {
    updateMaeData({
      contentByLocale: {
        ...annotationState.maeData.contentByLocale,
        [activeLocale]: { ...activeLocaleContent, ...patch },
      },
    });
  };

  /** Update the attached English/Arabic media, or clear it (media is `null`) - each is its own
   * root-level annotation extension (issue #377), same pattern as NestedMapTemplate's
   * updateLinkedMap for `dbf:linkedMap`. Uses the functional setState form - see POITemplate's
   * matching updateMediaEn/updateMediaAr comment for why. */
  const updateMediaEn = (media) => {
    setAnnotationState((prev) => ({
      ...prev,
      'dbf:mediaEn': media,
    }));
  };

  /** Update the attached Arabic media - see updateMediaEn's own doc. */
  const updateMediaAr = (media) => {
    setAnnotationState((prev) => ({
      ...prev,
      'dbf:mediaAr': media,
    }));
  };

  /** Save function * */
  const saveFunction = async () => {
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
          <Typography variant="formSectionTitle">{t('journey')}</Typography>
        </Grid>
        <Grid>
          <LanguageToggle
            contentLocales={contentLocales}
            label={t('journey_language')}
            onChange={setActiveLocale}
            value={activeLocale}
          />
        </Grid>
      </Grid>
      <Grid>
        <TextField
          fullWidth
          label={t('journey_title')}
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
      {(searchMediaItems || searchIiifImages || searchUploads) && (
        <Grid>
          <LocalizedMediaSelectionField
            activeLocaleIsRtl={activeLocaleIsRtl}
            dialogContainer={dialogContainer}
            keepSameLabel={t('journey_media_keep_same')}
            labelAr={t('journey_media_ar')}
            labelEn={t('journey_media_en')}
            mediaAr={annotationState['dbf:mediaAr'] ?? null}
            mediaEn={annotationState['dbf:mediaEn'] ?? null}
            onChangeAr={updateMediaAr}
            onChangeEn={updateMediaEn}
            onSearchIiifImages={searchIiifImages}
            onSearchMediaItems={searchMediaItems}
            onSearchUploads={searchUploads}
            t={t}
          />
        </Grid>
      )}
      <Grid>
        <Typography variant="formSectionTitle">{t('journey_description_section')}</Typography>
      </Grid>
      <Grid>
        <RichTextField
          // Remount per locale switch - see the matching comment on POITemplate's
          // RichTextField for why relying on ckeditor5-react's controlled `data` sync
          // silently wipes the previous locale's just-edited description.
          key={activeLocale}
          onChange={(html) => updateActiveLocaleContent({ description: html })}
          placeholder={t('journey_description_placeholder')}
          rtl={activeLocaleIsRtl}
          value={activeLocaleContent.description}
        />
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
      <Grid>
        <Typography variant="subFormSectionTitle">{t('journey_hint')}</Typography>
      </Grid>
    </Grid>
  );
}

JourneyTemplate.propTypes = {
  annotation: PropTypes.shape({
    body: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
      }),
    ),
    id: PropTypes.string,
  }).isRequired,
  closeFormCompanionWindow: PropTypes.func.isRequired,
  // eslint-disable-next-line react/forbid-prop-types
  saveAnnotation: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
