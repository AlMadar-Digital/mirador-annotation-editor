import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, FormControlLabel } from '@mui/material';
import { MediaSelectionField } from './MediaSelectionField';

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
 * The English/Arabic pair of MediaSelectionFields POITemplate/JourneyTemplate/NestedMapTemplate
 * each need (issue #377 - reverted issue #391's single shared `dbf:media` back to per-language
 * `dbf:mediaEn`/`dbf:mediaAr`, since a shared field's own bilingual metadata can't carry two
 * different attachments, e.g. separate EN/AR audio-tour recordings).
 *
 * A "Keep same media" checkbox covers the common case (the same image/item for both languages)
 * without forcing staff to pick it twice: while checked, only the English picker shows, and
 * every change to it is mirrored into `mediaAr` too; unchecking it reveals an independent
 * Arabic picker. Its initial state is derived once from whether the loaded annotation's
 * mediaEn/mediaAr already match (both empty, or the same source+id) - not resynced on further
 * prop changes, same "read once, then owned by local UI state" convention as MediaSelectionField's
 * own activeSource/inputValue/options.
 *
 * `onChangeEn`/`onChangeAr` - each `(media) => void`, called with the normalized selection or
 *   null (mirrors MediaSelectionField's own `onChange`). While "Keep same media" is checked,
 *   a change from the English picker calls both.
 * `mediaEn`/`mediaAr` - the currently attached selections, already in MediaSelectionField's
 *   normalized shape, or null.
 * Every other prop passes straight through to both MediaSelectionFields.
 */
export function LocalizedMediaSelectionField({
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

  /** Update the English selection, mirroring it into Arabic too while "keep same" is checked. */
  const handleEnChange = (media) => {
    onChangeEn(media);
    if (keepSame) {
      onChangeAr(media);
    }
  };

  /** Toggle "keep same media" - checking it immediately syncs mediaAr to the current mediaEn. */
  const handleKeepSameChange = (event) => {
    const { checked } = event.target;
    setKeepSame(checked);
    if (checked) {
      onChangeAr(mediaEn);
    }
  };

  return (
    <>
      <MediaSelectionField
        dialogContainer={dialogContainer}
        label={labelEn}
        onChange={handleEnChange}
        onSearchIiifImages={onSearchIiifImages}
        onSearchMediaItems={onSearchMediaItems}
        onSearchUploads={onSearchUploads}
        t={t}
        value={mediaEn}
      />
      <FormControlLabel
        control={<Checkbox checked={keepSame} onChange={handleKeepSameChange} />}
        label={keepSameLabel}
      />
      {!keepSame && (
        <MediaSelectionField
          dialogContainer={dialogContainer}
          label={labelAr}
          onChange={onChangeAr}
          onSearchIiifImages={onSearchIiifImages}
          onSearchMediaItems={onSearchMediaItems}
          onSearchUploads={onSearchUploads}
          t={t}
          value={mediaAr}
        />
      )}
    </>
  );
}

LocalizedMediaSelectionField.propTypes = {
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
  mediaAr: null,
  mediaEn: null,
  onSearchIiifImages: undefined,
  onSearchMediaItems: undefined,
  onSearchUploads: undefined,
};
