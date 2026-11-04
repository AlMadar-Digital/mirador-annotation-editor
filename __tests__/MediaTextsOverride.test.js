import React, { useState } from 'react';
import userEvent from '@testing-library/user-event';
import {
  fireEvent, render, screen, waitFor,
} from './test-utils';
import { LocalizedMediaSelectionField } from '../src/annotationForm/templates/templateComponents/LocalizedMediaSelectionField';
import {
  EMPTY_MEDIA_TEXTS, resolveMediaText, withMediaOverride,
} from '../src/annotationForm/templates/templateComponents/mediaTexts';

/** Identity translation stub, matching exampleExternalTemplate.test.js's convention */
const mockT = (key) => key;

/** An IIIF Image media with its own and overridden caption/credit. */
const iiifImage = (inherited, override = EMPTY_MEDIA_TEXTS) => ({
  id: 'iiif-1',
  inherited: { ...EMPTY_MEDIA_TEXTS, ...inherited },
  override: { ...EMPTY_MEDIA_TEXTS, ...override },
  source: 'iiif-image',
  thumbnailUrl: null,
  title: 'Tabula Rogeriana',
});

/** LocalizedMediaSelectionField holding its media in state, like POITemplate, and recording the
 * last media each language's handler got. */
function renderField({
  activeLocaleIsRtl = false, mediaAr = null, mediaEn = null, searchIiifImages = vi.fn(),
} = {}) {
  const last = {};
  /** :nodoc: */
  function Harness() {
    const [en, setEn] = useState(mediaEn);
    const [ar, setAr] = useState(mediaAr);
    return (
      <LocalizedMediaSelectionField
        activeLocaleIsRtl={activeLocaleIsRtl}
        dialogContainer={() => document.body}
        keepSameLabel="poi_media_keep_same"
        labelAr="poi_media_ar"
        labelEn="poi_media_en"
        mediaAr={ar}
        mediaEn={en}
        onChangeAr={(media) => { last.ar = media; setAr(media); }}
        onChangeEn={(media) => { last.en = media; setEn(media); }}
        onSearchIiifImages={searchIiifImages}
        t={mockT}
      />
    );
  }
  render(<Harness />);
  return last;
}

describe('mediaTexts (issue #520)', () => {
  it('resolves English from the override, else the image', () => {
    expect(resolveMediaText(iiifImage({ captionEn: 'image EN' }), 'caption', 'En')).toBe('image EN');
    expect(resolveMediaText(iiifImage({ captionEn: 'image EN' }, { captionEn: 'override EN' }), 'caption', 'En'))
      .toBe('override EN');
  });

  it('resolves Arabic from Arabic first, else what English shows', () => {
    /** :nodoc: */
    const media = (inherited, override) => iiifImage(inherited, override);
    expect(resolveMediaText(media({ creditAr: 'image AR' }, { creditEn: 'override EN' }), 'credit', 'Ar')).toBe('image AR');
    expect(resolveMediaText(media({ creditEn: 'image EN' }, { creditEn: 'override EN' }), 'credit', 'Ar')).toBe('override EN');
    expect(resolveMediaText(media({ creditEn: 'image EN' }, { creditAr: ' ' }), 'credit', 'Ar')).toBe('image EN');
    expect(resolveMediaText(media({}, {}), 'credit', 'Ar')).toBeUndefined();
  });

  it('recomputes the preview caption/credit with the override, and leaves an older backend\'s media as is', () => {
    const media = withMediaOverride(iiifImage({ captionEn: 'image EN' }), { ...EMPTY_MEDIA_TEXTS, captionEn: 'override EN' }, 'Ar');
    expect(media).toMatchObject({ caption: 'override EN', override: { captionEn: 'override EN' } });
    expect(media).not.toHaveProperty('credit');

    const older = { id: 'iiif-1', source: 'iiif-image', title: 'x' };
    expect(withMediaOverride(older, EMPTY_MEDIA_TEXTS, 'En')).toBe(older);
  });
});

describe('LocalizedMediaSelectionField caption/credit override (issue #520)', () => {
  it('is not shown for a media from a backend that sends no caption/credit', () => {
    const media = {
      id: 'iiif-1', source: 'iiif-image', thumbnailUrl: null, title: 'Tabula Rogeriana',
    };
    renderField({ mediaAr: media, mediaEn: media });

    expect(screen.queryByText('poi_media_override')).not.toBeInTheDocument();
  });

  it('shows both languages for the same image, with the image\'s own text as placeholders', () => {
    const media = iiifImage({ captionEn: 'The world map', creditAr: 'بإذن', creditEn: 'Courtesy of the Bodleian' });
    renderField({ mediaAr: media, mediaEn: media });

    expect(screen.getByTestId('media-override-captionEn')).toHaveAttribute('placeholder', 'The world map');
    expect(screen.getByTestId('media-override-creditAr')).toHaveAttribute('placeholder', 'بإذن');
    // No Arabic caption on the image: the Arabic page falls back to the English one.
    expect(screen.getByTestId('media-override-captionAr')).toHaveAttribute('placeholder', 'The world map');
    expect(screen.getByText('poi_media_override_english_fallback')).toBeInTheDocument();
  });

  it('starts collapsed when the POI does not override the image', () => {
    const media = iiifImage({ captionEn: 'The world map' });
    renderField({ mediaAr: media, mediaEn: media });
    expect(screen.getByRole('button', { name: 'poi_media_override' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts expanded when the POI already overrides the image', () => {
    const media = iiifImage({ captionEn: 'The world map' }, { captionEn: 'Detail of Sicily' });
    renderField({ mediaAr: media, mediaEn: media });
    expect(screen.getByRole('button', { name: 'poi_media_override' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('media-override-captionEn')).toHaveValue('Detail of Sicily');
  });

  it('writes the override to both languages\' media while they hold the same image', () => {
    const media = iiifImage({ captionEn: 'The world map' });
    const last = renderField({ mediaAr: media, mediaEn: media });

    fireEvent.change(screen.getByTestId('media-override-captionEn'), { target: { value: 'Detail of Sicily' } });

    expect(last.en).toMatchObject({ caption: 'Detail of Sicily', override: { captionEn: 'Detail of Sicily' } });
    // The Arabic page shows the English the editor typed, not the image's English.
    expect(last.ar).toMatchObject({ caption: 'Detail of Sicily', override: { captionEn: 'Detail of Sicily' } });
  });

  it('shows and writes only the active language when each language has its own image', () => {
    const mediaEn = iiifImage({ captionEn: 'The world map' });
    const mediaAr = { ...iiifImage({ captionAr: 'خريطة' }), id: 'iiif-2' };
    const last = renderField({ activeLocaleIsRtl: true, mediaAr, mediaEn });

    expect(screen.getByRole('checkbox', { name: 'poi_media_keep_same' })).not.toBeChecked();
    expect(screen.queryByTestId('media-override-captionEn')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('media-override-captionAr'), { target: { value: 'تفصيل' } });

    expect(last.ar).toMatchObject({ caption: 'تفصيل', override: { captionAr: 'تفصيل' } });
    expect(last).not.toHaveProperty('en');
  });

  it('starts another picked image with an empty override and that image\'s own text', async () => {
    const searchIiifImages = vi.fn().mockResolvedValue([{
      displayTitle: 'Dome of the Rock',
      documentId: 'iiif-2',
      inherited: { ...EMPTY_MEDIA_TEXTS, captionEn: 'The Dome' },
      thumbnailUrl: null,
    }]);
    const media = iiifImage({ captionEn: 'The world map' }, { captionEn: 'Detail of Sicily' });
    const last = renderField({ mediaAr: media, mediaEn: media, searchIiifImages });

    const field = screen.getByLabelText('poi_media_en');
    await userEvent.clear(field);
    await userEvent.type(field, 'Dome');
    await waitFor(() => expect(searchIiifImages).toHaveBeenCalledWith('Dome'));
    fireEvent.click(await screen.findByRole('option', { name: 'Dome of the Rock' }));

    expect(last.en).toMatchObject({ caption: 'The Dome', id: 'iiif-2', override: EMPTY_MEDIA_TEXTS });
    expect(last.ar).toMatchObject({ caption: 'The Dome', id: 'iiif-2', override: EMPTY_MEDIA_TEXTS });
    expect(screen.getByTestId('media-override-captionEn')).toHaveValue('');
    expect(screen.getByTestId('media-override-captionEn')).toHaveAttribute('placeholder', 'The Dome');
  });

  it('copies the override with the image when "keep same media" is checked', () => {
    const mediaEn = iiifImage({ captionEn: 'The world map' }, { captionEn: 'Detail of Sicily' });
    const mediaAr = { ...iiifImage({}), id: 'iiif-2' };
    const last = renderField({ mediaAr, mediaEn });

    fireEvent.click(screen.getByRole('checkbox', { name: 'poi_media_keep_same' }));

    expect(last.ar).toMatchObject({ caption: 'Detail of Sicily', id: 'iiif-1', override: { captionEn: 'Detail of Sicily' } });
  });
});
