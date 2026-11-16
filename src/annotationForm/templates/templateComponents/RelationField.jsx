import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Autocomplete, Box, CircularProgress, TextField,
} from '@mui/material';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * A single-select, search-as-you-type field for linking an existing record of the host's (a
 * Map, a POI on another map...). The shared base of MapRelationField and PoiRelationField: it
 * follows the "search/select an existing record, never create one here" convention, and the
 * host's `onSearch` decides which records are offered.
 * @param dialogContainer - () => Element, the fullscreen editor's dialog node - the dropdown
 *   must render inside it, or the dialog's outside-pointer-events lock makes it unclickable.
 * @param getOptionLabel - (option) => string, what the input and each result read
 * @param getOptionQuery - (option) => string, the text to search on while the input still shows
 *   the picked option's label; defaults to getOptionLabel
 * @param label
 * @param noResultsKey - i18n key shown when a search finds nothing
 * @param onChange - called with the selected option, or null when cleared
 * @param onSearch - (query: string) => Promise<Array<{ documentId: string }>>; an empty query
 *   is sent when the dropdown opens on an empty input. A rejected (or thrown) search empties
 *   the list and shows `relation_search_failed`.
 * @param searchPromptKey - i18n key shown before anything is typed
 * @param t - translation function
 * @param value - the currently linked option, or null. Keep its reference stable between
 *   renders (useMemo): MUI rewrites the typed text whenever it changes by reference.
 * @constructor
 */
export function RelationField({
  dialogContainer,
  getOptionLabel,
  getOptionQuery,
  label,
  noResultsKey,
  onChange,
  onSearch,
  searchPromptKey,
  t,
  value,
}) {
  const [inputValue, setInputValue] = useState(value ? getOptionLabel(value) : '');
  const [options, setOptions] = useState(value ? [value] : []);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounceRef = useRef(null);
  const searchTokenRef = useRef(0);
  // Read by the handlers below rather than from state: MUI calls onInputChange and onOpen in the
  // same event, before a re-render, so state would still hold the text from before the keystroke.
  const inputValueRef = useRef(inputValue);
  const openRef = useRef(false);

  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    searchTokenRef.current += 1;
  }, []);

  /** Run a search now, ignoring its outcome if a newer search has started since (stale-response
   * guard: nothing here otherwise cancels an in-flight request when the input changes again). */
  const runSearch = (query) => {
    clearTimeout(debounceRef.current);
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    setLoading(true);
    // Called inside the executor so that a host throwing synchronously fails like a rejection.
    new Promise((resolve) => { resolve(onSearch(query)); })
      .then((results) => {
        if (searchTokenRef.current === token) {
          setOptions(results);
          setFailed(false);
        }
      })
      .catch((error) => {
        console.error('Relation search failed', error);
        if (searchTokenRef.current === token) {
          // Drop the previous results: they would read as the answer to this query.
          setOptions([]);
          setFailed(true);
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

  /** The input shows the picked option's label, which need not be what the host searches on
   * (a POI reads "POI — Map"); search on the option's own query text then. */
  const queryOf = (text) => (
    value && text === getOptionLabel(value) ? (getOptionQuery ?? getOptionLabel)(value) : text
  );

  /** Only the editor's own edits search: typing ('input'), and clearing while the dropdown is
   * open. The other reasons are the field writing a label back ('reset', 'selectOption', 'blur')
   * or a clear with the dropdown closed, where nothing would show the results - opening it
   * searches anyway. */
  const handleInputChange = (_event, newInputValue, reason) => {
    setInputValue(newInputValue);
    inputValueRef.current = newInputValue;
    if (reason === 'input' || (reason === 'clear' && openRef.current)) {
      scheduleSearch(newInputValue);
    }
  };

  /** Search at once on opening. Typing into a closed field both schedules a search and opens
   * the dropdown; runSearch drops the scheduled one, so a single request goes out. */
  const handleOpen = () => {
    openRef.current = true;
    runSearch(queryOf(inputValueRef.current));
  };

  /** A search still waiting on its debounce has nowhere to show its results once closed. */
  const handleClose = () => {
    openRef.current = false;
    clearTimeout(debounceRef.current);
  };

  let noOptionsText = t(inputValue ? noResultsKey : searchPromptKey);
  if (failed) noOptionsText = t('relation_search_failed');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Autocomplete
        filterOptions={(opts) => opts}
        getOptionKey={(option) => option.documentId}
        getOptionLabel={getOptionLabel}
        inputValue={inputValue}
        isOptionEqualToValue={(option, val) => option.documentId === val.documentId}
        loading={loading}
        noOptionsText={noOptionsText}
        onChange={(_event, newValue) => onChange(newValue)}
        onClose={handleClose}
        onInputChange={handleInputChange}
        onOpen={handleOpen}
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

RelationField.propTypes = {
  dialogContainer: PropTypes.func.isRequired,
  getOptionLabel: PropTypes.func.isRequired,
  getOptionQuery: PropTypes.func,
  label: PropTypes.string.isRequired,
  noResultsKey: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSearch: PropTypes.func.isRequired,
  searchPromptKey: PropTypes.string.isRequired,
  t: PropTypes.func.isRequired,
  value: PropTypes.shape({ documentId: PropTypes.string.isRequired }),
};

RelationField.defaultProps = {
  getOptionQuery: undefined,
  value: null,
};
