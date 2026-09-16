import React from 'react';
import PropTypes from 'prop-types';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

/**
 * An exclusive EN/AR toggle for POITemplate/JourneyTemplate/NestedMapTemplate's active content
 * locale (issue #377 comment: "Replace lang selector with a toggle ar/en") - replaces the
 * previous MUI Select dropdown these templates each used, since there are only ever two content
 * locales in practice (Strapi's GET /maps/locales hardcodes [en, ar] - see POITemplate's
 * isRtlLocale doc) and a one-click toggle suits that better than an open-then-pick dropdown.
 * Hidden entirely when fewer than two locales are configured, matching the dropdown's own
 * `contentLocales.length > 1` guard.
 *
 * `contentLocales` - `[{ code, name }]`, in display order.
 * `label` - the toggle group's accessible name (e.g. `t('poi_language')`).
 * `onChange` - `(code) => void`, called with the newly selected locale code.
 * `value` - the currently active locale code.
 */
export function LanguageToggle({
  contentLocales, label, onChange, value,
}) {
  if (contentLocales.length < 2) {
    return null;
  }

  return (
    <ToggleButtonGroup
      aria-label={label}
      exclusive
      onChange={(_event, next) => {
        // MUI's exclusive ToggleButtonGroup passes `null` when clicking the already-selected
        // button - ignored here so the toggle can never end up with nothing selected.
        if (next !== null) {
          onChange(next);
        }
      }}
      size="small"
      value={value ?? null}
    >
      {contentLocales.map(({ code, name }) => (
        <ToggleButton aria-label={name ?? code} key={code} value={code}>
          {code.toUpperCase()}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

LanguageToggle.propTypes = {
  contentLocales: PropTypes.arrayOf(PropTypes.shape({
    code: PropTypes.string.isRequired,
    name: PropTypes.string,
  })),
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string,
};

LanguageToggle.defaultProps = {
  contentLocales: [],
  value: null,
};
