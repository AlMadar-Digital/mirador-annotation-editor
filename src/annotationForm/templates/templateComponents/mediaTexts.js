/**
 * A POI image's caption and credit line (issue #520). The backend sends each `dbf:mediaEn`/
 * `dbf:mediaAr` with:
 * - `inherited` - the image record's own caption/credit, per language (IIIF Image, Media
 *   Library upload or Media Item, whichever the media is);
 * - `override` - the caption/credit typed for this POI's image, per language, saved back with
 *   the media.
 * Both are `{ captionEn, captionAr, creditEn, creditAr }`. A backend that predates them sends
 * neither, and the override fields are not shown.
 */

export const MEDIA_TEXT_FIELDS = ['captionEn', 'captionAr', 'creditEn', 'creditAr'];

export const EMPTY_MEDIA_TEXTS = Object.freeze({
  captionAr: null, captionEn: null, creditAr: null, creditEn: null,
});

/** The first non-blank text, trimmed, or undefined. */
const firstText = (...values) => values
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .find(Boolean);

/** Whether the backend sent this media's caption/credit, so it can be overridden here. */
export const hasMediaTexts = (media) => !!media?.inherited;

/** What the site shows for one of a media's `field` ('caption' or 'credit') in a slot's
 * `language` ('En' or 'Ar') - the same rule as the backend: English shows the override, else the
 * image's own; Arabic shows the Arabic override, else the image's Arabic, else what English
 * shows. */
export const resolveMediaText = (media, field, language) => {
  const override = media.override ?? EMPTY_MEDIA_TEXTS;
  const inherited = media.inherited ?? EMPTY_MEDIA_TEXTS;
  const english = firstText(override[`${field}En`], inherited[`${field}En`]);
  return language === 'En'
    ? english
    : firstText(override[`${field}Ar`], inherited[`${field}Ar`], english);
};

/** `media` with `override` as its override, and the `caption`/`credit` its preview shows
 * recomputed for the slot's `language`. A media without `inherited` (an older backend) is
 * returned as is. */
export const withMediaOverride = (media, override, language) => {
  if (!media || !hasMediaTexts(media)) return media;
  const { caption: _caption, credit: _credit, ...rest } = media;
  const next = { ...rest, override };
  const caption = resolveMediaText(next, 'caption', language);
  const credit = resolveMediaText(next, 'credit', language);
  return {
    ...next,
    ...(caption ? { caption } : {}),
    ...(credit ? { credit } : {}),
  };
};
