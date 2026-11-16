import React from 'react';
import PropTypes from 'prop-types';
import { RelationField } from './RelationField';

/** A Map is named by its title alone.
 * @param {{ titleEn: string }} option
 * @returns {string}
 */
const mapOptionLabel = (option) => option.titleEn;

/**
 * A single-select, search-as-you-type field for linking an existing Map (a Strapi content
 * type with its own full edit form) - backs the Nested Map template's cross-map link
 * (issue #350). A RelationField whose options are maps; see it for the search behaviour.
 * @param dialogContainer - () => Element, the fullscreen editor's dialog node
 * @param label
 * @param onChange - called with the selected option, or null when cleared
 * @param onSearch - (query: string) => Promise<Array<{ documentId, titleEn }>>. Only the typed
 *   text is passed, so the host must itself leave out the map being edited.
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
  return (
    <RelationField
      dialogContainer={dialogContainer}
      getOptionLabel={mapOptionLabel}
      label={label}
      noResultsKey="map_relation_no_results"
      onChange={onChange}
      onSearch={onSearch}
      searchPromptKey="map_relation_search_prompt"
      t={t}
      value={value}
    />
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
