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
import { templateKit } from '../kit';
import { MediaItemRelationField } from '../templateComponents/MediaItemRelationField';
import { RichTextField } from '../templateComponents/RichTextField';
import { applyPoiBodyConversion, MEDIA_ITEM_BODY_TYPE } from './POITemplate';

const { AnnotationFormFooter } = templateKit;

/** IIIF content-resource type for a journey's title/description body items - same convention
 * as POITemplate's TEXTUAL_BODY_TYPE. */
const TEXTUAL_BODY_TYPE = 'TextualBody';

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
  const { contentLocales = [], searchMediaItems } = useSelector(
    (state) => getConfig(state),
  ).annotation ?? {};

  let maeAnnotation = annotation;

  if (!maeAnnotation.id) {
    maeAnnotation = {
      body: [],
      'dbf:kind': 'Journey',
      maeData: {
        contentByLocale: {},
        target: {},
        templateType: TEMPLATE.JOURNEY_TYPE,
      },
      motivation: 'identifying',
      target: null,
    };
  } else {
    // Rebuild contentByLocale from the saved body - identical to POITemplate's own rehydration
    // (see its own comment for why only the first describing TextualBody per language is kept).
    const contentByLocale = {};
    const localesWithDescription = new Set();
    maeAnnotation.body.forEach((body) => {
      const locale = body.language;
      if (!locale) return;
      const content = contentByLocale[locale] ?? { description: '', title: '' };
      if (body.purpose === 'identifying') {
        content.title = body.value ?? '';
      } else if (body.type === MEDIA_ITEM_BODY_TYPE) {
        content.mediaItem = body.id ? {
          documentId: body.id,
          mediaType: body.mediaType ?? null,
          thumbnailUrl: body.thumbnailUrl ?? null,
          titleEn: body.title,
        } : null;
      } else if (
        body.purpose === 'describing'
        && body.type === TEXTUAL_BODY_TYPE
        && !localesWithDescription.has(locale)
      ) {
        content.description = body.value ?? '';
        localesWithDescription.add(locale);
      }
      contentByLocale[locale] = content;
    });
    maeAnnotation.maeData.contentByLocale = contentByLocale;
  }

  const [annotationState, setAnnotationState] = useState(maeAnnotation);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState(
    Object.keys(annotationState.maeData.contentByLocale)[0] ?? contentLocales[0]?.code,
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
      <Grid>
        <Typography variant="formSectionTitle">{t('journey')}</Typography>
      </Grid>
      {contentLocales.length > 1 && (
        <Grid>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="journey-language-label">{t('journey_language')}</InputLabel>
            <Select
              labelId="journey-language-label"
              label={t('journey_language')}
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
      {typeof searchMediaItems === 'function' && (
        <Grid>
          <MediaItemRelationField
            dialogContainer={dialogContainer}
            label={t('journey_media_item')}
            onChange={(mediaItem) => updateActiveLocaleContent({ mediaItem })}
            onSearch={searchMediaItems}
            t={t}
            value={activeLocaleContent.mediaItem}
          />
        </Grid>
      )}
      <Grid>
        <Typography variant="formSectionTitle">{t('journey_description_section')}</Typography>
      </Grid>
      <Grid>
        <RichTextField
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
