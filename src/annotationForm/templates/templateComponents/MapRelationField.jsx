import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Autocomplete, Box, CircularProgress, TextField,
} from '@mui/material';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * A single-select, search-as-you-type field for linking an existing Map (a Strapi content
 * type with its own full edit form) - backs the Nested Map template's cross-map link
 * (issue #350). Mirrors MediaItemRelationField's contract and "search/select an existing
 * record, never create one here" convention, minus a thumbnail (a Map has no equivalent
 * preview asset wired through this field).
 * @param dialogContainer - () => Element, the fullscreen editor's dialog node - see
 *   MediaItemRelationField for why this matters (Radix's outside-pointer-events lock).
 * @param label
 * @param onChange - called with the selected option, or null when cleared
 * @param onSearch - (query: string) => Promise<Array<{ documentId, titleEn }>>
 * @param t - translation function
 * @param value - the currently linked map, or null
 * @constructor
 */
export function MapRelationField({
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Autocomplete
        filterOptions={(opts) => opts}
        getOptionKey={(option) => option.documentId}
        getOptionLabel={(option) => option.titleEn}
        inputValue={inputValue}
        isOptionEqualToValue={(option, val) => option.documentId === val.documentId}
        loading={loading}
        noOptionsText={inputValue ? t('map_relation_no_results') : t('map_relation_search_prompt')}
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
    </Box>
  );
}

MapRelationField.propTypes = {
  dialogContainer: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSearch: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  value: PropTypes.shape({
    documentId: PropTypes.string.isRequired,
    titleEn: PropTypes.string.isRequired,
  }),
};

MapRelationField.defaultProps = {
  value: null,
};
