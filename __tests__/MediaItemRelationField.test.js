import React from 'react';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from './test-utils';
import { MediaItemRelationField } from '../src/annotationForm/templates/templateComponents/MediaItemRelationField';

/** Identity translation stub, matching POITemplate.test.js's convention */
const mockT = (key) => key;

const domeOfTheRock = { documentId: 'media-1', mediaType: 'audio', purpose: 'audio-tour', titleEn: 'Dome of the Rock tour' };
const alAqsa = { documentId: 'media-2', mediaType: 'uploaded-video', purpose: 'gallery-video', titleEn: 'Al-Aqsa video' };

describe('MediaItemRelationField', () => {
  it('shows the current value\'s title when a media item is already attached', () => {
    render(
      <MediaItemRelationField
        label="Media item"
        onChange={vi.fn()}
        onSearch={vi.fn()}
        t={mockT}
        value={domeOfTheRock}
      />
    );

    expect(screen.getByRole('combobox')).toHaveValue('Dome of the Rock tour');
  });

  it('searches immediately when opened, and lists the results', async () => {
    const onSearch = vi.fn().mockResolvedValue([domeOfTheRock, alAqsa]);
    render(
      <MediaItemRelationField
        label="Media item"
        onChange={vi.fn()}
        onSearch={onSearch}
        t={mockT}
        value={null}
      />
    );

    await userEvent.click(screen.getByRole('combobox'));

    expect(onSearch).toHaveBeenCalledWith('');
    expect(await screen.findByRole('option', { name: 'Dome of the Rock tour' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Al-Aqsa video' })).toBeInTheDocument();
  });

  it('debounces search-as-you-type and calls onChange with the picked option', async () => {
    const onSearch = vi.fn().mockResolvedValue([alAqsa]);
    const onChange = vi.fn();
    render(
      <MediaItemRelationField
        label="Media item"
        onChange={onChange}
        onSearch={onSearch}
        t={mockT}
        value={null}
      />
    );

    await userEvent.type(screen.getByRole('combobox'), 'Al-Aqsa');

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Al-Aqsa'));

    fireEvent.click(await screen.findByRole('option', { name: 'Al-Aqsa video' }));
    expect(onChange).toHaveBeenCalledWith(alAqsa);
  });

  it('calls onChange with null when the selection is cleared', async () => {
    const onChange = vi.fn();
    render(
      <MediaItemRelationField
        label="Media item"
        onChange={onChange}
        onSearch={vi.fn().mockResolvedValue([])}
        t={mockT}
        value={domeOfTheRock}
      />
    );

    await userEvent.click(screen.getByLabelText(/clear/i));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a "no results" message once a search comes back empty', async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(
      <MediaItemRelationField
        label="Media item"
        onChange={vi.fn()}
        onSearch={onSearch}
        t={mockT}
        value={null}
      />
    );

    await userEvent.type(screen.getByRole('combobox'), 'nothing matches this');

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('nothing matches this'));
    expect(await screen.findByText('poi_media_item_no_results')).toBeInTheDocument();
  });
});
