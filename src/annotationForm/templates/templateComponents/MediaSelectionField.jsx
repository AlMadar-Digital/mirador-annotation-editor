import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  Autocomplete, Box, CircularProgress, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MovieIcon from '@mui/icons-material/Movie';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

const SEARCH_DEBOUNCE_MS = 300;

/** Fallback icon per mediaType (issue #333), shown for a media-item option/value with no
 * thumbnailUrl - e.g. an audio file or a research PDF with no poster uploaded. */
const MEDIA_TYPE_ICONS = {
  audio: AudiotrackIcon,
  'research-pdf': PictureAsPdfIcon,
  'uploaded-video': MovieIcon,
  'youtube-video': MovieIcon,
};

const THUMBNAIL_SX = {
  borderRadius: 1,
  flexShrink: 0,
  height: 40,
  objectFit: 'cover',
  width: 40,
};

/** A normalized media option/value's thumbnail image, or (lacking one) a generic icon - a
 * media-item's own mediaType picks a more specific icon (issue #333); upload/iiif-image
 * sources without a thumbnail fall back to a plain image icon, since both sources without a
 * thumbnail are unusual/transient states rather than an expected one like an audio media item. */
function MediaSelectionThumbnail({ media }) {
  if (media.thumbnailUrl) {
    return (
      <Box
        component="img"
        src={media.thumbnailUrl}
        alt=""
        data-testid="media-selection-thumbnail"
        sx={THUMBNAIL_SX}
      />
    );
  }
  const Icon = (media.source === 'media-item' && MEDIA_TYPE_ICONS[media.mediaType])
    || (media.source === 'upload' ? ImageIcon : InsertDriveFileIcon);
  return (
    <Box
      sx={{
        ...THUMBNAIL_SX,
        alignItems: 'center',
        bgcolor: 'action.hover',
        color: 'action.active',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Icon fontSize="small" />
    </Box>
  );
}

MediaSelectionThumbnail.propTypes = {
  media: PropTypes.shape({
    mediaType: PropTypes.string,
    source: PropTypes.string,
    thumbnailUrl: PropTypes.string,
  }).isRequired,
};

/** One source's raw search-result shape -> the common `{ id, title, thumbnailUrl, mediaType }`
 * shape MediaSelectionField's Autocomplete renders and hands to onChange - a media-item's `id`
 * is its documentId, an iiif-image's `id` is its documentId, and an upload's `id` is its
 * numeric Strapi file id coerced to a string (uploads have no documentId - see the `upload`
 * source on `shared.media-selection`, a plain Media Library file relation, issue #391).
 * `mediaType` is only ever populated for a media-item result (used for its icon fallback
 * above) - upload/iiif-image results leave it undefined.
 *
 * Key order here is display/default-selection order (IIIF Image, Media Library, Media Item -
 * issue #391's own spec order) - `Object.keys` on an object with only string keys preserves
 * insertion order, which both the source-selector's button order and the default active
 * source (the first available one, absent a current value - see availableSources below) rely
 * on. */
/* eslint-disable sort-keys -- key order is meaningful here (display/default order) */
const SOURCE_CONFIG = {
  'iiif-image': {
    normalize: (raw) => ({
      id: raw.documentId, source: 'iiif-image', thumbnailUrl: raw.thumbnailUrl ?? null, title: raw.displayTitle,
    }),
    titleKey: 'poi_media_source_iiif_image',
  },
  upload: {
    normalize: (raw) => ({
      id: String(raw.id), source: 'upload', thumbnailUrl: raw.thumbnailUrl ?? null, title: raw.name,
    }),
    titleKey: 'poi_media_source_upload',
  },
  'media-item': {
    normalize: (raw) => ({
      id: raw.documentId,
      mediaType: raw.mediaType ?? null,
      source: 'media-item',
      thumbnailUrl: raw.thumbnailUrl ?? null,
      title: raw.titleEn,
    }),
    titleKey: 'poi_media_source_media_item',
  },
};
/* eslint-enable sort-keys */

/**
 * A single-select, search-as-you-type field for attaching one of: an existing Media Item, an
 * IIIF Image, or a Media Library upload (issue #391's `shared.media-selection` component) to a
 * POI/Journey/Nested Map point. Only searches/selects, matching the "create the record first,
 * then attach it here" convention every other relation field in this codebase follows
 * (MediaItemRelationField, MapRelationField, which this replaces) - it never creates anything.
 *
 * A leading source selector picks which of `onSearchMediaItems`/`onSearchIiifImages`/
 * `onSearchUploads` backs the search list below it - only sources whose search function was
 * actually supplied appear, mirroring the `typeof searchX === 'function'` graceful-degradation
 * convention every template here already uses for optional backend capabilities. When only one
 * source is available the selector is hidden entirely (nothing to choose between) and that
 * source's list is shown directly.
 *
 * `dialogContainer` - () => Element, the fullscreen editor's dialog node (matching every other
 *   MUI popup in these templates) - without it, the option list renders outside the dialog's DOM
 *   subtree and Radix's outside-pointer-events lock swallows clicks on it before they reach an
 *   option, making the list visible but unselectable.
 * `label` - the field's overall label.
 * `onChange` - called with the normalized `{ source, id, title, thumbnailUrl, mediaType }`
 *   selection, or null when cleared.
 * `onSearchMediaItems`/`onSearchIiifImages`/`onSearchUploads` - each optional,
 *   (query: string) => Promise<Array<...>> in that source's own raw result shape (see
 *   SOURCE_CONFIG's `normalize` for each one's expected fields).
 * `t` - translation function.
 * `value` - the currently attached media, already in the normalized shape, or null.
 */
export function MediaSelectionField({
  dialogContainer,
  label,
  onChange,
  onSearchIiifImages,
  onSearchMediaItems,
  onSearchUploads,
  t,
  value,
}) {
  const searchBySource = useMemo(() => ({
    'iiif-image': onSearchIiifImages,
    'media-item': onSearchMediaItems,
    upload: onSearchUploads,
  }), [onSearchIiifImages, onSearchMediaItems, onSearchUploads]);

  const availableSources = useMemo(
    () => Object.keys(SOURCE_CONFIG).filter((source) => typeof searchBySource[source] === 'function'),
    [searchBySource],
  );

  const [activeSource, setActiveSource] = useState(
    (value && availableSources.includes(value.source) ? value.source : availableSources[0]) ?? null,
  );
  const [inputValue, setInputValue] = useState(value?.title ?? '');
  const [options, setOptions] = useState(value ? [value] : []);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const searchTokenRef = useRef(0);

  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    searchTokenRef.current += 1;
  }, []);

  /** Run a search now, ignoring its result if a newer search (or a source switch) has started
   * since (stale-response guard: nothing here otherwise cancels an in-flight request when the
   * input or active source changes again). */
  const runSearch = (source, query) => {
    const search = searchBySource[source];
    if (typeof search !== 'function') return;
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    setLoading(true);
    Promise.resolve(search(query))
      .then((results) => {
        if (searchTokenRef.current === token) {
          setOptions(results.map(SOURCE_CONFIG[source].normalize));
        }
      })
      .finally(() => {
        if (searchTokenRef.current === token) {
          setLoading(false);
        }
      });
  };

  /** Debounce search-as-you-type so every keystroke doesn't fire its own request. */
  const scheduleSearch = (source, query) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(source, query), SEARCH_DEBOUNCE_MS);
  };

  /** Switching source invalidates whatever was mid-flight/listed for the old one, and starts
   * fresh with an empty query - each source's list is independent, not a filter over one
   * combined list. */
  const handleSourceChange = (_event, newSource) => {
    if (!newSource) return;
    searchTokenRef.current += 1;
    clearTimeout(debounceRef.current);
    setActiveSource(newSource);
    setInputValue('');
    setOptions([]);
    setLoading(false);
  };

  if (availableSources.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {value && (
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
          <MediaSelectionThumbnail media={value} />
          <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value.title}
          </Typography>
        </Box>
      )}
      {availableSources.length > 1 && (
        <ToggleButtonGroup
          value={activeSource}
          exclusive
          onChange={handleSourceChange}
          size="small"
          color="primary"
        >
          {availableSources.map((source) => (
            <ToggleButton key={source} value={source}>
              {t(SOURCE_CONFIG[source].titleKey)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      <Autocomplete
        filterOptions={(opts) => opts}
        getOptionKey={(option) => option.id}
        getOptionLabel={(option) => option.title}
        inputValue={inputValue}
        isOptionEqualToValue={(option, val) => option.source === val.source && option.id === val.id}
        loading={loading}
        noOptionsText={inputValue ? t('poi_media_no_results') : t('poi_media_search_prompt')}
        onChange={(_event, newValue) => onChange(newValue)}
        onInputChange={(_event, newInputValue) => {
          setInputValue(newInputValue);
          scheduleSearch(activeSource, newInputValue);
        }}
        onOpen={() => runSearch(activeSource, inputValue)}
        options={options}
        renderInput={(params) => (
          <TextField
            // eslint-disable-next-line react/jsx-props-no-spreading -- MUI's renderInput contract
            {...params}
            label={label}
            variant="outlined"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        renderOption={(props, option) => (
          // eslint-disable-next-line react/jsx-props-no-spreading -- MUI's renderOption contract
          <Box component="li" {...props} key={option.id} sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
            <MediaSelectionThumbnail media={{ ...option, source: activeSource }} />
            {option.title}
          </Box>
        )}
        slotProps={{ popper: { container: dialogContainer } }}
        value={value && value.source === activeSource ? value : null}
      />
    </Box>
  );
}

MediaSelectionField.propTypes = {
  dialogContainer: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSearchIiifImages: PropTypes.func,
  onSearchMediaItems: PropTypes.func,
  onSearchUploads: PropTypes.func,
  t: PropTypes.func.isRequired,
  value: PropTypes.shape({
    id: PropTypes.string.isRequired,
    mediaType: PropTypes.string,
    source: PropTypes.oneOf(['upload', 'iiif-image', 'media-item']).isRequired,
    thumbnailUrl: PropTypes.string,
    title: PropTypes.string,
  }),
};

MediaSelectionField.defaultProps = {
  onSearchIiifImages: undefined,
  onSearchMediaItems: undefined,
  onSearchUploads: undefined,
  value: null,
};
