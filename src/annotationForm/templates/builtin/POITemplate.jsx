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
import { resizeKonvaStage, SHAPES_TOOL } from '../../AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { finalizeSpatialTarget, getDefaultValue, isEmptyValue } from '../../../IIIFUtils';
import { templateKit } from '../kit';
import { MediaItemRelationField } from '../templateComponents/MediaItemRelationField';
import { RichTextField } from '../templateComponents/RichTextField';

const { AnnotationFormFooter, TargetFormSection } = templateKit;

/** IIIF content-resource type for a POI's title/description body items: always a
 * language-tagged HTML TextualBody. Issue #333 retired the previous repeatable, per-item-typed
 * descriptionItems list (which could also hold Image/Sound link items) in favor of a single
 * rich-text description per locale, matching the single scalar descriptionEn/descriptionAr
 * Strapi field this feeds - annotationConversion.ts (server-side) already only ever reads the
 * first describing TextualBody per language, so the richer list was silently truncated there
 * regardless. */
const TEXTUAL_BODY_TYPE = 'TextualBody';

/** The body-item type of a POI's per-language Media Item relation (mediaEn/mediaAr) - kept
 * distinct from TEXTUAL_BODY_TYPE since it's a single field per language holding a Strapi Media
 * Item relation, not free text. */
export const MEDIA_ITEM_BODY_TYPE = 'MediaItem';

/** Arabic (any variant - e.g. 'ar', 'ar-SA') is the only right-to-left content locale POI's
 * contentLocales currently offers (Strapi's GET /maps/locales hardcodes [en, ar]). Matches the
 * name-suffix convention apps/strapi/src/admin/rtl-fields.css already uses for the same *Ar
 * fields in Strapi's own Content Manager form, applied here per-activeLocale instead, since this
 * form shows one language's fields at a time rather than an En/Ar pair side by side (see the
 * language Select below). */
const isRtlLocale = (localeCode) => (
  typeof localeCode === 'string' && localeCode.toLowerCase().startsWith('ar')
);

// Deliberately has no `mediaItem` key: applyPoiBodyConversion only emits a MediaItem body item
// for a locale whose content object actually HAS that key (added either by rehydrating an
// existing one, or by the user touching MediaItemRelationField - see its onChange below), so
// that a locale where the editor never touched media doesn't get its mediaEn/mediaAr silently
// disconnected server-side. Baking `mediaItem: null` into this fallback would defeat that: any
// edit to title/description alone (which merges this fallback in via updateActiveLocaleContent)
// would then look identical to an explicit "no media" clear.
const EMPTY_LOCALE_CONTENT = { description: '', title: '' };

/** Read one locale's title/description/mediaItem out of maeData.contentByLocale, defaulting to
 * empty content for a locale the editor hasn't touched yet (never written into state - see
 * applyPoiBodyConversion, which is what keeps an untouched locale from being saved as an empty
 * Strapi row).
 * @param {object} contentByLocale
 * @param {string} locale
 * @returns {{ title: string, description: string, mediaItem: (object|null|undefined) }}
 */
const getLocaleContent = (contentByLocale, locale) => contentByLocale[locale] ?? EMPTY_LOCALE_CONTENT;

/**
 * A POI's spatial target must be exactly one placed POI marker (SHAPES_TOOL.POI, tetras-dbf/
 * mirador-annotation-editor#21's dedicated click-to-place tool - no shared toolbar, no style
 * options, no resize). TargetFormSection's `pointOnly` mode makes drawing anything else
 * structurally impossible in normal use, but this still guards two real cases: no point has been
 * placed yet (drawingState.shapes is empty), and an annotation loaded from outside MAE (see the
 * KNOWN LIMITATION below).
 *
 * KNOWN LIMITATION (not yet reachable - no producer of maeData-less POI annotations exists until
 * strapi-plugins#10 ships): IIIFUtils.js's convertSvgSelectorToMae reconstructs ANY SvgSelector,
 * circle included, as a SHAPES_TOOL.RECTANGLE shape (bounding-box only, no shape-type detection).
 * So a POI created outside MAE, once opened here for the first time, will show/validate as a
 * rectangle - failing this very check - until convertSvgSelectorToMae is taught to recognize a
 * lone <circle> element. Left unfixed here since it would touch shared code with zero test
 * coverage for non-rectangular shapes today; track as a follow-up once strapi-plugins#10 lands.
 * @param maeData
 * @returns {boolean}
 */
export const isValidPointTarget = (maeData) => {
  const shapes = maeData?.target?.drawingState?.shapes;
  return Array.isArray(shapes) && shapes.length === 1 && shapes[0].type === SHAPES_TOOL.POI;
};

/**
 * Build the saved `body` array from maeData.contentByLocale: one identifying + at most one
 * describing TextualBody + at most one describing MediaItem, per locale the editor actually
 * touched, each tagged `language` (root_repo#32 - StrapiAnnotationAdapter merges/splits these
 * per-locale server-side). A locale never written into contentByLocale (the editor never
 * switched to it, or switched but never typed anything) is simply absent from the saved body -
 * it is not re-saved as an empty translation.
 *
 * A locale's MediaItem body item follows a stricter rule than title/description: it is emitted
 * only when that locale's content object actually HAS a `mediaItem` key (own-property check, not
 * a truthiness check) - added either by rehydrating an existing MediaItem body item, or by the
 * user touching MediaItemRelationField (attaching or explicitly clearing one). A locale whose
 * `mediaItem` key is absent - the editor never rendered/touched that field for it - emits nothing,
 * so the server leaves that language's mediaEn/mediaAr relation alone rather than reading silence
 * as "detach it". Only an explicit clear (key present, value null) tells the server to disconnect.
 *
 * Journey membership (dbf:journey) and cross-map linking (dbf:linkedMap) are deliberately NOT
 * read or written here: those are relations managed from the Strapi backoffice, not from the
 * annotation editor. `stateToSave` is the same object as `state` (mutated in place, matching
 * every other template's convention), so whatever dbf:journey/dbf:linkedMap the annotation
 * already carried when it was loaded survives untouched into the saved result - editing a POI's
 * title/description/target in MAE must never silently drop its existing relations.
 * @param {object} state
 * @returns {object} the same state, mutated
 */
export const applyPoiBodyConversion = (state) => {
  const stateToSave = state;
  const { contentByLocale } = stateToSave.maeData;

  stateToSave.body = Object.entries(contentByLocale)
    .flatMap(([language, content]) => {
      const { description, title, mediaItem } = content;
      return [
        {
          language,
          purpose: 'identifying',
          type: TEXTUAL_BODY_TYPE,
          value: isEmptyValue(title) ? getDefaultValue() : title,
        },
        ...(isEmptyValue(description) ? [] : [{
          language, purpose: 'describing', type: TEXTUAL_BODY_TYPE, value: description,
        }]),
        ...('mediaItem' in content
          ? [{
            id: mediaItem?.documentId ?? null,
            language,
            purpose: 'describing',
            title: mediaItem?.titleEn ?? null,
            type: MEDIA_ITEM_BODY_TYPE,
          }]
          : []),
      ];
    });

  return stateToSave;
};

/**
 * Convert a POITemplate annotationState into a savable IIIF annotation: build the body array
 * (applyPoiBodyConversion), then finalize the spatial target through the same shared pipeline
 * every other spatial-target template uses.
 * @param {object} state
 * @param {{ canvas: object, windowId: string, playerReferences: object }} ctx
 * @returns {Promise<object>}
 */
export const convertPoiAnnotationToBeSaved = async (
  state,
  { canvas, windowId, playerReferences },
) => {
  const stateToSave = applyPoiBodyConversion(state);
  return finalizeSpatialTarget(stateToSave, canvas, windowId, playerReferences);
};

/** POI Template */
export default function POITemplate(
  {
    annotation,
    closeFormCompanionWindow,
    playerReferences,
    saveAnnotation,
    t,
    windowId,
  },
) {
  const { contentLocales = [], searchMediaItems } = useSelector((state) => getConfig(state)).annotation ?? {};

  let maeAnnotation = annotation;

  if (!maeAnnotation.id) {
    maeAnnotation = {
      body: [],
      'dbf:kind': 'POI',
      maeData: {
        contentByLocale: {},
        target: null,
        templateType: TEMPLATE.POI_TYPE,
      },
      motivation: 'identifying',
      target: null,
    };
  } else {
    if (maeAnnotation.maeData.target.drawingState && typeof maeAnnotation.maeData.target.drawingState === 'string') {
      // currentShape is cleared on load (matching MultipleBodyTemplate's pattern): it was only
      // ever meaningful as transient in-session UI selection state, and a stale one - left over
      // from the last save - would otherwise mark the marker as "already selected" from mount.
      maeAnnotation.maeData.target.drawingState = {
        ...JSON.parse(maeAnnotation.maeData.target.drawingState),
        currentShape: null,
      };
    }
    // Group the saved body (one identifying + at most one describing TextualBody + at most one
    // describing MediaItem per language, see applyPoiBodyConversion) back into a per-locale map
    // for the form to bind to. A locale can, in principle, still carry more than one describing
    // TextualBody item (legacy data saved before issue #333, or data written by another editor) -
    // only the first one is kept, mirroring annotationConversion.ts's own `.find()` semantics
    // server-side, so what's shown here always matches what a re-save would actually persist.
    const contentByLocale = {};
    const localesWithDescription = new Set();
    maeAnnotation.body.forEach((body) => {
      const locale = body.language;
      if (!locale) return;
      // No `mediaItem` key here either, for the same reason as EMPTY_LOCALE_CONTENT above -
      // only actually seeing a MediaItem body item (below) should add it.
      const content = contentByLocale[locale] ?? { description: '', title: '' };
      if (body.purpose === 'identifying') {
        content.title = body.value ?? '';
      } else if (body.type === MEDIA_ITEM_BODY_TYPE) {
        // body.id is null for an explicit "no media" clear (see applyPoiBodyConversion) -
        // that must rehydrate back to `null`, not a `{ documentId: null }` object.
        content.mediaItem = body.id ? { documentId: body.id, titleEn: body.title } : null;
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
    // dbf:journey / dbf:linkedMap (if present) are intentionally left untouched on
    // maeAnnotation itself - not read into maeData, since there is no UI here to edit them.
  }

  const [annotationState, setAnnotationState] = useState(maeAnnotation);
  const [targetError, setTargetError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState(
    Object.keys(annotationState.maeData.contentByLocale)[0] ?? contentLocales[0]?.code,
  );

  const rootRef = useRef(null);
  // strapi-plugins' MiradorMaeViewer already reparents MuiPopover/MuiPopper's mount node into
  // the Radix dialog via a theme default (so Radix's outside-pointer-events lock, a plain
  // Node.contains() check with no opt-out, sees them as "inside" the dialog) - but MUI's Select
  // resolves its dropdown's container through the `MuiMenu` theme slot, not `MuiPopover`
  // (Menu.js calls its own useDefaultProps({ name: 'MuiMenu' }) before ever rendering
  // Popover), so that theme default never reaches it: the dropdown kept mounting on
  // document.body, outside the dialog, silently eating hover/click on its options (and, per
  // root_repo#34's original fix, native focus/focusout recursion between MUI's and Radix's
  // focus traps). Setting `container` explicitly here reaches Popover directly regardless of
  // which theme slot resolves it.
  const dialogContainer = () => rootRef.current?.closest('[role="dialog"]') ?? document.body;

  const activeLocaleContent = getLocaleContent(annotationState.maeData.contentByLocale, activeLocale);
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

  /** Save function * */
  const saveFunction = async () => {
    if (!isValidPointTarget(annotationState.maeData)) {
      setTargetError(true);
      return;
    }
    setTargetError(false);
    resizeKonvaStage(
      windowId,
      playerReferences.getMediaTrueWidth(),
      playerReferences.getMediaTrueHeight(),
      1 / playerReferences.getScale(),
    );
    setSaving(true);
    try {
      // Awaited (unlike a bare fire-and-forget call) so `saving` genuinely reflects the
      // in-flight save instead of clearing itself before the network round-trip finishes.
      await saveAnnotation(annotationState);
    } finally {
      // On success the form's own companion window closes anyway (unmounting this
      // component), so this only visibly matters on failure - where it lets the editor
      // retry instead of the button staying stuck disabled/spinning forever.
      setSaving(false);
    }
  };

  return (
    <Grid container direction="column" spacing={2} ref={rootRef}>
      <Grid>
        <Typography variant="formSectionTitle">{t('poi')}</Typography>
      </Grid>
      {contentLocales.length > 1 && (
        <Grid>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="poi-language-label">{t('poi_language')}</InputLabel>
            <Select
              labelId="poi-language-label"
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

POITemplate.propTypes = {
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
