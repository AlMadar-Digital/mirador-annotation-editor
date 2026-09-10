import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * A single-select, search-as-you-type field for attaching an existing Media Item
 * (a Strapi content type with its own full edit form) to one language of a POI.
 * Only searches/selects, matching the "create the Media Item first, then attach it
 * here" convention every other Media Item relation in the backend already follows -
 * this never creates a new Media Item itself.
 * @param dialogContainer - () => Element, the fullscreen editor's dialog node (matching every
 *   other MUI popup in POITemplate) - without it, the option list renders outside the dialog's
 *   DOM subtree and Radix's outside-pointer-events lock swallows clicks on it before they reach
 *   an option, making the list visible but unselectable.
 * @param label
 * @param onChange - called with the selected option, or null when cleared
 * @param onSearch - (query: string) => Promise<Array<{ documentId, titleEn, mediaType, purpose }>>
 * @param t - translation function
 * @param value - the currently attached media item, or null
 * @constructor
 */
export function MediaItemRelationField({
  dialogContainer,
  label,
  onChange,
  onSearch,
  t,
  value,
}) {
  const [inputValue, setInputValue] = useState(value?.titleEn ?? '');
  const [options, setOptions] = useState(value ? [value] : []);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const searchTokenRef = useRef(0);

  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    searchTokenRef.current += 1;
  }, []);

  /** Run a search now, ignoring its result if a newer search has started since (stale-response
   * guard: nothing here otherwise cancels an in-flight request when the input changes again). */
  const runSearch = (query) => {
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    setLoading(true);
    Promise.resolve(onSearch(query))
      .then((results) => {
        if (searchTokenRef.current === token) {
          setOptions(results);
        }
      })
      .finally(() => {
        if (searchTokenRef.current === token) {
          setLoading(false);
        }
      });
  };

  /** Debounce search-as-you-type so every keystroke doesn't fire its own request. */
  const scheduleSearch = (query) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
  };

  return (
    <Autocomplete
      filterOptions={(opts) => opts}
      getOptionKey={(option) => option.documentId}
      getOptionLabel={(option) => option.titleEn}
      inputValue={inputValue}
      isOptionEqualToValue={(option, val) => option.documentId === val.documentId}
      loading={loading}
      noOptionsText={inputValue ? t('poi_media_item_no_results') : t('poi_media_item_search_prompt')}
      onChange={(_event, newValue) => onChange(newValue)}
      onInputChange={(_event, newInputValue) => {
        setInputValue(newInputValue);
        scheduleSearch(newInputValue);
      }}
      onOpen={() => runSearch(inputValue)}
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
      slotProps={{ popper: { container: dialogContainer } }}
      value={value}
    />
  );
}

MediaItemRelationField.propTypes = {
  dialogContainer: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSearch: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  value: PropTypes.shape({
    documentId: PropTypes.string.isRequired,
    mediaType: PropTypes.string,
    purpose: PropTypes.string,
    titleEn: PropTypes.string.isRequired,
  }),
};

MediaItemRelationField.defaultProps = {
  value: null,
};
