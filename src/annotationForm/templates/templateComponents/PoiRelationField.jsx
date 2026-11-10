import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Autocomplete, Box, CircularProgress, TextField,
} from '@mui/material';

const SEARCH_DEBOUNCE_MS = 300;

/** A POI is only told apart from its namesake on another map by that map's title, so an option
 * reads "POI title — Map title" (just the POI title when its map is unknown).
 * @param {{ titleEn: string, map?: { titleEn: string } | null }} option
 * @returns {string}
 */
export const poiOptionLabel = (option) => (
  option.map?.titleEn ? `${option.titleEn} — ${option.map.titleEn}` : option.titleEn
);

/** The field's option for an annotation's `dbf:samePlaceAs` extension, or null when it has none.
 * @param {{ id: string, titleEn?: string, mapId?: string, mapTitleEn?: string }|null|undefined}
 *   samePlaceAs
 * @returns {{ documentId: string, titleEn: string, map: object|null }|null}
 */
export const samePlaceAsToOption = (samePlaceAs) => {
  if (!samePlaceAs) return null;
  const hasMap = samePlaceAs.mapId || samePlaceAs.mapTitleEn;
  return {
    documentId: samePlaceAs.id,
    map: hasMap ? { documentId: samePlaceAs.mapId, titleEn: samePlaceAs.mapTitleEn } : null,
    titleEn: samePlaceAs.titleEn ?? '',
  };
};

/** The `dbf:samePlaceAs` extension for a picked option - `null` (not absent) when cleared, which
 * is what tells the server to drop the link rather than leave it as it was.
 * @param {{ documentId: string, titleEn: string, map?: object|null }|null} option
 * @returns {{ id: string, titleEn: string, mapId?: string, mapTitleEn?: string }|null}
 */
export const optionToSamePlaceAs = (option) => (option ? {
  id: option.documentId,
  titleEn: option.titleEn,
  ...(option.map ? { mapId: option.map.documentId, mapTitleEn: option.map.titleEn } : {}),
} : null);

/**
 * A single-select, search-as-you-type field for linking a POI to the same place on another map
 * (platform#553: a paper map and its silver twin each carry their own POI for one place).
 * Mirrors MapRelationField's contract and "search/select an existing record, never create one
 * here" convention; the host decides which POIs are offered (the other maps' ones).
 * @param dialogContainer - () => Element, the fullscreen editor's dialog node - see
 *   MediaItemRelationField for why this matters (Radix's outside-pointer-events lock).
 * @param label
 * @param onChange - called with the selected option, or null when cleared
 * @param onSearch - (query: string) => Promise<Array<{ documentId, titleEn, map }>>
 * @param t - translation function
 * @param value - the currently linked POI, or null
 * @constructor
 */
export function PoiRelationField({
  dialogContainer,
  label,
  onChange,
  onSearch,
  t,
  value,
}) {
  const [inputValue, setInputValue] = useState(value ? poiOptionLabel(value) : '');
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

  /** The input shows "POI — Map" once a POI is picked; search on the POI's own title then, not
   * on a label no POI is called. */
  const queryOf = (text) => (value && text === poiOptionLabel(value) ? value.titleEn : text);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Autocomplete
        filterOptions={(opts) => opts}
        getOptionKey={(option) => option.documentId}
        getOptionLabel={poiOptionLabel}
        inputValue={inputValue}
        isOptionEqualToValue={(option, val) => option.documentId === val.documentId}
        loading={loading}
        noOptionsText={inputValue ? t('poi_relation_no_results') : t('poi_relation_search_prompt')}
        onChange={(_event, newValue) => onChange(newValue)}
        onInputChange={(_event, newInputValue, reason) => {
          setInputValue(newInputValue);
          // 'reset' is the field writing the picked option's label back, not the editor typing.
          if (reason !== 'reset') scheduleSearch(newInputValue);
        }}
        onOpen={() => runSearch(queryOf(inputValue))}
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

const poiShape = PropTypes.shape({
  documentId: PropTypes.string.isRequired,
  map: PropTypes.shape({
    documentId: PropTypes.string,
    titleEn: PropTypes.string,
  }),
  titleEn: PropTypes.string.isRequired,
});

PoiRelationField.propTypes = {
  dialogContainer: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSearch: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  value: poiShape,
};

PoiRelationField.defaultProps = {
  value: null,
};
