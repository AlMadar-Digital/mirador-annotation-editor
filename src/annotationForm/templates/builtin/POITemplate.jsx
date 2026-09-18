import React, { useRef, useState } from 'react';
import { Grid, TextField } from '@mui/material';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import { getConfig } from 'dbf-mirador';
import { TEMPLATE } from '../../AnnotationFormUtils';
import { resizeKonvaStage, SHAPES_TOOL } from '../../AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { finalizeSpatialTarget, isEmptyValue } from '../../../IIIFUtils';
import { templateKit } from '../kit';
import { LanguageToggle } from '../templateComponents/LanguageToggle';
import { LocalizedMediaSelectionField } from '../templateComponents/LocalizedMediaSelectionField';
import { RichTextField } from '../templateComponents/RichTextField';

const { AnnotationFormFooter, TargetFormSection } = templateKit;

/** IIIF content-resource type for a POI's title/description body items: always a
 * language-tagged HTML TextualBody. Issue #333 retired the previous repeatable, per-item-typed
 * descriptionItems list (which could also hold Image/Sound link items) in favor of a single
 * rich-text description per locale, matching the single scalar descriptionEn/descriptionAr
 * Strapi field this feeds - annotationConversion.ts (server-side) already only ever reads the
 * first describing TextualBody per language, so the richer list was silently truncated there
 * regardless. */
export const TEXTUAL_BODY_TYPE = 'TextualBody';

/** Arabic (any variant - e.g. 'ar', 'ar-SA') is the only right-to-left content locale POI's
 * contentLocales currently offers (Strapi's GET /maps/locales hardcodes [en, ar]). Matches the
 * name-suffix convention apps/strapi/src/admin/rtl-fields.css already uses for the same *Ar
 * fields in Strapi's own Content Manager form, applied here per-activeLocale instead, since this
 * form shows one language's fields at a time rather than an En/Ar pair side by side (see the
 * language LanguageToggle below). */
export const isRtlLocale = (localeCode) => (
  typeof localeCode === 'string' && localeCode.toLowerCase().startsWith('ar')
);

/**
 * The active content locale a POI/Journey template should open with: whichever locale the
 * loaded annotation already has content in (so re-opening an Arabic-only POI doesn't land on an
 * empty English tab), else 'en' if it's configured at all, else just the first configured
 * locale (issue #377 comment: "Replace lang selector with a toggle ar/en. En by default").
 * @param {object} contentByLocale
 * @param {{ code: string }[]} contentLocales
 * @returns {string|undefined}
 */
export const getDefaultActiveLocale = (contentByLocale, contentLocales) => (
  Object.keys(contentByLocale)[0]
  ?? (contentLocales.some(({ code }) => code === 'en') ? 'en' : contentLocales[0]?.code)
);

export const EMPTY_LOCALE_CONTENT = { description: '', title: '' };

/** Read one locale's title/description out of maeData.contentByLocale, defaulting to empty
 * content for a locale the editor hasn't touched yet (never written into state - see
 * applyPoiBodyConversion, which is what keeps an untouched locale from being saved as an empty
 * Strapi row).
 * @param {object} contentByLocale
 * @param {string} locale
 * @returns {{ title: string, description: string }}
 */
export const getLocaleContent = (contentByLocale, locale) => contentByLocale[locale] ?? EMPTY_LOCALE_CONTENT;

/**
 * Groups a saved annotation body (one identifying + at most one describing TextualBody per
 * language - see applyPoiBodyConversion) back into a per-locale content map for a form to bind
 * to. Shared by POITemplate and NestedMapTemplate - both save/rehydrate the exact same
 * title/description shape (issue #350: a nested-map point "shares the same information as
 * POI"). Media (`dbf:mediaEn`/`dbf:mediaAr`, issue #377) is not part of this - each is its own
 * root-level annotation extension, not tied to the title/description body, same as
 * `dbf:linkedMap` (see NestedMapTemplate).
 * @param {object[]} body
 * @returns {object} contentByLocale
 */
export const parseContentByLocale = (body) => {
  const contentByLocale = {};
  const localesWithDescription = new Set();
  body.forEach((item) => {
    const locale = item.language;
    if (!locale) return;
    const content = contentByLocale[locale] ?? { description: '', title: '' };
    if (item.purpose === 'identifying') {
      content.title = item.value ?? '';
    } else if (
      item.purpose === 'describing'
      && item.type === TEXTUAL_BODY_TYPE
      && !localesWithDescription.has(locale)
    ) {
      content.description = item.value ?? '';
      localesWithDescription.add(locale);
    }
    contentByLocale[locale] = content;
  });
  return contentByLocale;
};

/**
 * A POI's spatial target must be exactly one placed POI marker (SHAPES_TOOL.POI, tetras-dbf/
 * mirador-annotation-editor#21's dedicated click-to-place tool - no shared toolbar, no style
 * options, no resize). TargetFormSection's `pointOnly` mode makes drawing anything else
 * structurally impossible in normal use, but this still guards the case where no point has been
 * placed yet (drawingState.shapes is empty).
 *
 * Every POI/NestedMap this actually loads comes back from StrapiAnnotationAdapter without a
 * `maeData` (Strapi never round-trips it - see that adapter's own comment), so maeData.target is
 * always rebuilt fresh from the saved SvgSelector via IIIFUtils.js's convertSvgSelectorToMae.
 * That reconstruction must specifically recognize the marker's `<circle>` as SHAPES_TOOL.POI
 * (not its generic SHAPES_TOOL.RECTANGLE bounding-box fallback used for every other
 * spatial-target template) - otherwise this check fails on every single reopened POI/NestedMap,
 * even completely unmodified, surfacing "you must choose a target" on save (issue #377 review
 * comment: "open in edition a POI, change nothing, save, it's not possible to close").
 * @param maeData
 * @returns {boolean}
 */
export const isValidPointTarget = (maeData) => {
  const shapes = maeData?.target?.drawingState?.shapes;
  return Array.isArray(shapes) && shapes.length === 1 && shapes[0].type === SHAPES_TOOL.POI;
};

/**
 * Whether every configured content locale has a non-empty title (issue #377 review comment:
 * "TitleAr and TitleEn are mandatory in the three template"). Reads straight off
 * maeData.contentByLocale via getLocaleContent, so a locale the editor never switched to (and
 * therefore never wrote into contentByLocale) correctly counts as missing its title too - an
 * empty array of contentLocales (config not set) vacuously passes, matching the "no requirement
 * configured" case. Mirrors isValidPointTarget's shape as the blocking-save guard.
 * @param {object} contentByLocale
 * @param {{ code: string }[]} contentLocales
 * @returns {boolean}
 */
export const isTitleFilled = (contentByLocale, contentLocales) => (
  contentLocales.every(({ code }) => !isEmptyValue(getLocaleContent(contentByLocale, code).title))
);

/**
 * Build the saved `body` array from maeData.contentByLocale: one identifying + at most one
 * describing TextualBody, per locale the editor actually touched, each tagged `language`
 * (root_repo#32 - StrapiAnnotationAdapter merges/splits these per-locale server-side). A locale
 * never written into contentByLocale (the editor never switched to it, or switched but never
 * typed anything) is simply absent from the saved body - it is not re-saved as an empty
 * translation.
 *
 * Media (`dbf:mediaEn`/`dbf:mediaAr`), journey membership (`dbf:journey`), and cross-map linking
 * (`dbf:linkedMap`) are deliberately NOT read or written here: each media field is set directly
 * on `state` by LocalizedMediaSelectionField's onChangeEn/onChangeAr (see updateMediaEn/
 * updateMediaAr in POITemplate/JourneyTemplate/NestedMapTemplate - issue #377, mirrors how
 * NestedMapTemplate already threads `dbf:linkedMap` through), and journey/linkedMap are
 * relations managed from the Strapi backoffice, not from the annotation editor. `stateToSave`
 * is the same object as `state` (mutated in place, matching every other template's convention),
 * so whatever dbf:mediaEn/dbf:mediaAr/dbf:journey/dbf:linkedMap the annotation already carried
 * when it was loaded survives untouched into the saved result - editing a POI's
 * title/description/target in MAE must never silently drop its existing relations.
 * @param {object} state
 * @returns {object} the same state, mutated
 */
export const applyPoiBodyConversion = (state) => {
  const stateToSave = state;
  const { contentByLocale } = stateToSave.maeData;

  stateToSave.body = Object.entries(contentByLocale)
    .flatMap(([language, content]) => {
      const { description, title } = content;
      return [
        {
          language,
          purpose: 'identifying',
          type: TEXTUAL_BODY_TYPE,
          value: title,
        },
        ...(isEmptyValue(description) ? [] : [{
          language, purpose: 'describing', type: TEXTUAL_BODY_TYPE, value: description,
        }]),
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
  const {
    contentLocales = [], searchMediaItems, searchIiifImages, searchUploads,
  } = useSelector((state) => getConfig(state)).annotation ?? {};

  let maeAnnotation = annotation;

  if (!maeAnnotation.id) {
    maeAnnotation = {
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': null,
      'dbf:longitude': null,
      'dbf:mediaAr': null,
      'dbf:mediaEn': null,
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
    // Group the saved body back into a per-locale map for the form to bind to (see
    // parseContentByLocale's own doc for the "first describing item per locale wins" rule this
    // mirrors from annotationConversion.ts server-side).
    maeAnnotation.maeData.contentByLocale = parseContentByLocale(maeAnnotation.body);
    // dbf:mediaEn/dbf:mediaAr are read directly off maeAnnotation below (see
    // `annotationState['dbf:mediaEn']`/`['dbf:mediaAr']`) - no rehydration needed here since
    // neither is stored in the body. dbf:journey / dbf:linkedMap (if present) are intentionally
    // left untouched on maeAnnotation itself - not read into maeData, since there is no UI here
    // to edit them.
  }

  const [annotationState, setAnnotationState] = useState(maeAnnotation);
  const [targetError, setTargetError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState(
    getDefaultActiveLocale(annotationState.maeData.contentByLocale, contentLocales),
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

  /** Update the attached English/Arabic media, or clear it (media is `null`) - each is its own
   * root-level annotation extension (issue #377), same pattern as NestedMapTemplate's
   * updateLinkedMap for `dbf:linkedMap`. Mirroring one into the other while "Keep same media" is
   * checked is LocalizedMediaSelectionField's own concern, not this - it calls both of these in
   * the same handler, so both use the functional setState form (unlike this file's other
   * updaters) to avoid the second call clobbering the first with a stale `annotationState`
   * closure before React re-renders between them. */
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

  /** Update the optional real-world latitude/longitude - each is its own root-level annotation
   * extension (`dbf:latitude`/`dbf:longitude`), same pattern as updateMediaEn/updateMediaAr.
   * An empty input clears the field back to `null` rather than saving an empty string. */
  const updateLatitude = (event) => {
    const { value } = event.target;
    setAnnotationState((prev) => ({
      ...prev,
      'dbf:latitude': value === '' ? null : Number(value),
    }));
  };

  /** Update the optional real-world longitude - see updateLatitude's own doc. */
  const updateLongitude = (event) => {
    const { value } = event.target;
    setAnnotationState((prev) => ({
      ...prev,
      'dbf:longitude': value === '' ? null : Number(value),
    }));
  };

  /** Save function * */
  const saveFunction = async () => {
    const validTarget = isValidPointTarget(annotationState.maeData);
    const validTitle = isTitleFilled(annotationState.maeData.contentByLocale, contentLocales);
    setTargetError(!validTarget);
    setTitleError(!validTitle);
    if (!validTarget || !validTitle) {
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
      <Grid container direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Grid>
          <Typography variant="formSectionTitle">{t('poi')}</Typography>
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
      {(searchMediaItems || searchIiifImages || searchUploads) && (
        <Grid>
          <LocalizedMediaSelectionField
            activeLocaleIsRtl={activeLocaleIsRtl}
            dialogContainer={dialogContainer}
            keepSameLabel={t('poi_media_keep_same')}
            labelAr={t('poi_media_ar')}
            labelEn={t('poi_media_en')}
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
      <Grid container direction="row" spacing={2}>
        <Grid size={6}>
          <TextField
            fullWidth
            label={t('poi_latitude')}
            type="number"
            value={annotationState['dbf:latitude'] ?? ''}
            variant="outlined"
            onChange={updateLatitude}
          />
        </Grid>
        <Grid size={6}>
          <TextField
            fullWidth
            label={t('poi_longitude')}
            type="number"
            value={annotationState['dbf:longitude'] ?? ''}
            variant="outlined"
            onChange={updateLongitude}
          />
        </Grid>
      </Grid>
      <Grid>
        <Typography variant="formSectionTitle">{t('poi_description_section')}</Typography>
      </Grid>
      <Grid>
        <RichTextField
          // Remounts on every locale switch instead of relying on ckeditor5-react's
          // controlled `data` prop sync: that sync runs `editor.data.set()` synchronously
          // inside React's shouldComponentUpdate, before `this.props` has been reassigned
          // to the new render's props, so the resulting 'change:data' event fires the OLD
          // render's onChange (still closed over the locale being switched AWAY from) with
          // the NEW locale's content - silently overwriting the description just edited in
          // the previous locale with whatever the next locale already had (often empty).
          // A fresh instance per locale sidesteps that stale-closure write entirely.
          key={activeLocale}
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
