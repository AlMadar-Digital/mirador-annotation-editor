import React from 'react';
import PropTypes from 'prop-types';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { EMPTY_MEDIA_TEXTS, MEDIA_TEXT_FIELDS } from './mediaTexts';

/** The English text an empty Arabic field falls back to, if any (see resolveMediaText). */
const englishFallback = (override, inherited, field) => [override[`${field}En`], inherited[`${field}En`]]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .find(Boolean);

/**
 * The caption and credit line typed for a POI's image (issue #520), replacing the image's own
 * for this POI only - a collapsible section under the selected media. Each field shows the
 * image's own text as its placeholder, which is what the site shows while the field is empty.
 * An empty Arabic field with no Arabic text on the image falls back to English, which its
 * helper text says.
 *
 * `languages` - which languages' fields to show: both while the same image is used for both
 *   languages, else only the active one (see LocalizedMediaSelectionField).
 * `media` - the selected media, with its `override` and `inherited` texts (see mediaTexts.js).
 * `onChange` - called with the whole new override.
 * `t` - translation function.
 */
export function MediaTextsOverrideField({
  languages, media, onChange, t,
}) {
  const override = media.override ?? EMPTY_MEDIA_TEXTS;
  const inherited = media.inherited ?? EMPTY_MEDIA_TEXTS;
  const isOverridden = MEDIA_TEXT_FIELDS.some((field) => override[field]?.trim());

  /** Update one field, keeping the others as they are. */
  const handleChange = (key) => (event) => {
    onChange({ ...EMPTY_MEDIA_TEXTS, ...override, [key]: event.target.value });
  };

  return (
    <Accordion
      defaultExpanded={isOverridden}
      disableGutters
      variant="outlined"
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">{t('poi_media_override')}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {t('poi_media_override_hint')}
        </Typography>
        {languages.map((language) => (
          <Box key={language} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {['caption', 'credit'].map((field) => {
              const key = `${field}${language}`;
              const fallback = language === 'Ar' && !inherited[key]?.trim()
                ? englishFallback(override, inherited, field)
                : undefined;
              const showsFallback = !!fallback && !override[key]?.trim();
              return (
                <TextField
                  key={key}
                  dir={language === 'Ar' ? 'rtl' : 'ltr'}
                  fullWidth
                  helperText={showsFallback ? t('poi_media_override_english_fallback') : undefined}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ 'data-testid': `media-override-${key}` }}
                  label={t(`poi_media_${field}_${language.toLowerCase()}`)}
                  minRows={field === 'caption' ? 2 : 1}
                  multiline
                  onChange={handleChange(key)}
                  placeholder={inherited[key] ?? fallback ?? ''}
                  size="small"
                  value={override[key] ?? ''}
                />
              );
            })}
          </Box>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

const mediaTextsShape = PropTypes.shape({
  captionAr: PropTypes.string,
  captionEn: PropTypes.string,
  creditAr: PropTypes.string,
  creditEn: PropTypes.string,
});

MediaTextsOverrideField.propTypes = {
  languages: PropTypes.arrayOf(PropTypes.oneOf(['En', 'Ar'])).isRequired,
  media: PropTypes.shape({
    inherited: mediaTextsShape,
    override: mediaTextsShape,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
