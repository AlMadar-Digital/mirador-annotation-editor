import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, FormControlLabel } from '@mui/material';
import { MediaSelectionField } from './MediaSelectionField';
import { MediaTextsOverrideField } from './MediaTextsOverrideField';
import { EMPTY_MEDIA_TEXTS, hasMediaTexts, withMediaOverride } from './mediaTexts';

/** Two `dbf:media*` selections (e.g. `id`+`source`) refer to the same underlying media - used
 * only to pick the "Keep same media" checkbox's initial state from an already-loaded
 * annotation, never to decide what to save. `title`/`thumbnailUrl` are display-only (see
 * DbfMedia's own doc server-side) and deliberately excluded from this comparison. */
const sameMedia = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.source === b.source && a.id === b.id;
};

/**
 * The English/Arabic pair of media selections POITemplate/JourneyTemplate each need (issue
 * #377 - reverted issue #391's single shared `dbf:media` back to per-language `dbf:mediaEn`/
 * `dbf:mediaAr`, since a shared field's own bilingual metadata can't carry two different
 * attachments, e.g. separate EN/AR audio-tour recordings). Only ever shows ONE MediaSelectionField
 * at a time - whichever matches the template's active content locale (`activeLocaleIsRtl`,
 * following the same En/Ar toggle as the title/description fields above it - issue #377 comment:
 * "Show mediaEn when english is set, mediaAr when ar is selected") - so this never shows both
 * fields together, checked or not.
 *
 * A "Keep same media" checkbox covers the common case (the same image/item for both languages)
 * without forcing staff to pick it twice: while checked, every change to the field shown is
 * mirrored into the other language's field too (not itself shown); unchecking it makes the two
 * languages independent from then on. Its initial state is derived once from whether the loaded
 * annotation's mediaEn/mediaAr already match (both empty, or the same source+id) - not resynced
 * on further prop changes, same "read once, then owned by local UI state" convention as
 * MediaSelectionField's own activeSource/inputValue/options.
 *
 * `activeLocaleIsRtl` - true while the active content locale is Arabic (mirrors the template's
 *   own activeLocaleIsRtl, used the same way to flip the title/description fields' `dir`).
 * `onChangeEn`/`onChangeAr` - each `(media) => void`, called with the normalized selection or
 *   null (mirrors MediaSelectionField's own `onChange`). While "Keep same media" is checked, a
 *   change to the field shown also calls the other language's handler.
 * `mediaEn`/`mediaAr` - the currently attached selections, already in MediaSelectionField's
 *   normalized shape, or null.
 * Every other prop passes straight through to the shown MediaSelectionField.
 *
 * Under the field, MediaTextsOverrideField edits the caption and credit typed for the POI's
 * image (issue #520), carried on the media as its `override`. Like the title and description
 * fields, it shows the active language's fields only. The override belongs to the image: while
 * "Keep same media" is checked it is written to both media. Picking another media starts it
 * empty.
 */
export function LocalizedMediaSelectionField({
  activeLocaleIsRtl,
  dialogContainer,
  keepSameLabel,
  labelAr,
  labelEn,
  mediaAr,
  mediaEn,
  onChangeAr,
  onChangeEn,
  onSearchIiifImages,
  onSearchMediaItems,
  onSearchUploads,
  t,
}) {
  const [keepSame, setKeepSame] = useState(() => sameMedia(mediaEn, mediaAr));
  const activeMedia = activeLocaleIsRtl ? mediaAr : mediaEn;

  /** `media` with `override`, its preview caption/credit computed for the slot's language. */
  const forEn = (media, override = media?.override) => withMediaOverride(media, override, 'En');
  const forAr = (media, override = media?.override) => withMediaOverride(media, override, 'Ar');

  /** Update the active locale's media, mirroring it into the other locale too while "keep same
   * media" is checked. Another media starts with an empty override; picking the same one again
   * changes nothing. */
  const handleActiveChange = (picked) => {
    if (picked && sameMedia(picked, activeMedia)) return;
    const override = picked && hasMediaTexts(picked) ? EMPTY_MEDIA_TEXTS : undefined;
    if (activeLocaleIsRtl) {
      onChangeAr(forAr(picked, override));
      if (keepSame) {
        onChangeEn(forEn(picked, override));
      }
    } else {
      onChangeEn(forEn(picked, override));
      if (keepSame) {
        onChangeAr(forAr(picked, override));
      }
    }
  };

  /** Update the image's override - on both media while "keep same media" is checked (the same
   * image), else on the active locale's only. */
  const handleOverrideChange = (override) => {
    if (keepSame || !activeLocaleIsRtl) {
      onChangeEn(forEn(mediaEn, override));
    }
    if (keepSame || activeLocaleIsRtl) {
      onChangeAr(forAr(mediaAr, override));
    }
  };

  /** Toggle "keep same media" - checking it immediately syncs the other (hidden) locale to
   * whichever one is currently shown, override included (it's the same image now). */
  const handleKeepSameChange = (event) => {
    const { checked } = event.target;
    setKeepSame(checked);
    if (checked) {
      if (activeLocaleIsRtl) {
        onChangeEn(forEn(mediaAr));
      } else {
        onChangeAr(forAr(mediaEn));
      }
    }
  };

  return (
    <>
      <MediaSelectionField
        // Remounts per active-locale switch, matching RichTextField's own remount-per-locale
        // convention on these templates (see POITemplate's RichTextField comment): reusing one
        // MediaSelectionField instance across languages would leave the other language's stale
        // inputValue/activeSource/options showing, since MediaSelectionField owns those as
        // read-once local state, never resynced from props.
        key={activeLocaleIsRtl ? 'ar' : 'en'}
        dialogContainer={dialogContainer}
        label={activeLocaleIsRtl ? labelAr : labelEn}
        onChange={handleActiveChange}
        onSearchIiifImages={onSearchIiifImages}
        onSearchMediaItems={onSearchMediaItems}
        onSearchUploads={onSearchUploads}
        t={t}
        value={activeMedia}
      />
      {hasMediaTexts(activeMedia) && (
        <MediaTextsOverrideField
          // Remounts per image, so its expanded state follows the image's own override.
          key={`${activeMedia.source}:${activeMedia.id}`}
          language={activeLocaleIsRtl ? 'Ar' : 'En'}
          media={activeMedia}
          onChange={handleOverrideChange}
          t={t}
        />
      )}
      <FormControlLabel
        control={<Checkbox checked={keepSame} onChange={handleKeepSameChange} />}
        label={keepSameLabel}
      />
    </>
  );
}

LocalizedMediaSelectionField.propTypes = {
  activeLocaleIsRtl: PropTypes.bool,
  dialogContainer: PropTypes.func.isRequired,
  keepSameLabel: PropTypes.string.isRequired,
  labelAr: PropTypes.string.isRequired,
  labelEn: PropTypes.string.isRequired,
  mediaAr: MediaSelectionField.propTypes.value,
  mediaEn: MediaSelectionField.propTypes.value,
  onChangeAr: PropTypes.func.isRequired,
  onChangeEn: PropTypes.func.isRequired,
  onSearchIiifImages: PropTypes.func,
  onSearchMediaItems: PropTypes.func,
  onSearchUploads: PropTypes.func,
  t: PropTypes.func.isRequired,
};

LocalizedMediaSelectionField.defaultProps = {
  activeLocaleIsRtl: false,
  mediaAr: null,
  mediaEn: null,
  onSearchIiifImages: undefined,
  onSearchMediaItems: undefined,
  onSearchUploads: undefined,
};
