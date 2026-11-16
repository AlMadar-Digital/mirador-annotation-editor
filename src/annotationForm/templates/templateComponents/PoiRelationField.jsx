import React from 'react';
import PropTypes from 'prop-types';
import { RelationField } from './RelationField';

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

/** A POI is searched by its own title, not by the "POI — Map" label no POI is called.
 * @param {{ titleEn: string }} option
 * @returns {string}
 */
const poiOptionQuery = (option) => option.titleEn;

/**
 * A single-select, search-as-you-type field for linking a POI to the same place on another map
 * (platform#553: a paper map and its silver twin each carry their own POI for one place). A
 * RelationField whose options are POIs, each named with its map; see it for the search
 * behaviour.
 * @param dialogContainer - () => Element, the fullscreen editor's dialog node
 * @param label
 * @param onChange - called with the selected option, or null when cleared
 * @param onSearch - (query: string) => Promise<Array<{ documentId, titleEn, map }>>. Only the
 *   typed text is passed, so the host must itself leave out the POIs of the map being edited:
 *   a POI is linked to a place on another map, never to one on its own.
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
  return (
    <RelationField
      dialogContainer={dialogContainer}
      getOptionLabel={poiOptionLabel}
      getOptionQuery={poiOptionQuery}
      label={label}
      noResultsKey="poi_relation_no_results"
      onChange={onChange}
      onSearch={onSearch}
      searchPromptKey="poi_relation_search_prompt"
      t={t}
      value={value}
    />
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
