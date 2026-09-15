import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  fireEvent, render, screen, waitFor,
} from './test-utils';
import { MediaSelectionField } from '../src/annotationForm/templates/templateComponents/MediaSelectionField';

/** Identity translation stub, matching exampleExternalTemplate.test.js's convention */
const mockT = (key) => key;

const domeOfTheRockMediaItem = {
  documentId: 'media-1', mediaType: 'audio', purpose: 'audio-tour', titleEn: 'Dome of the Rock tour',
};
const alAqsaMediaItem = {
  documentId: 'media-2', mediaType: 'uploaded-video', purpose: 'gallery-video', titleEn: 'Al-Aqsa video',
};
const domeOfTheRockIiifImage = {
  displayTitle: 'Dome of the Rock', documentId: 'iiif-1', thumbnailUrl: 'https://cdn.example/iiif-thumb.jpg',
};
const photoUpload = {
  id: 42, mime: 'image/jpeg', name: 'photo.jpg', thumbnailUrl: 'https://cdn.example/photo-thumb.jpg', url: 'https://cdn.example/photo.jpg',
};

describe('MediaSelectionField', () => {
  it('shows the current value\'s title when a media item is already attached', () => {
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        onSearchMediaItems={vi.fn()}
        t={mockT}
        value={{
          id: 'media-1', mediaType: 'audio', source: 'media-item', thumbnailUrl: null, title: 'Dome of the Rock tour',
        }}
      />,
    );
    expect(screen.getByText('Dome of the Rock tour')).toBeInTheDocument();
  });

  it('searches the media-item source immediately when opened, and lists normalized results', async () => {
    const onSearchMediaItems = vi.fn().mockResolvedValue([domeOfTheRockMediaItem, alAqsaMediaItem]);
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        onSearchMediaItems={onSearchMediaItems}
        t={mockT}
        value={null}
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    expect(onSearchMediaItems).toHaveBeenCalledWith('');
    expect(await screen.findByRole('option', { name: 'Dome of the Rock tour' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Al-Aqsa video' })).toBeInTheDocument();
  });

  it('debounces search-as-you-type and calls onChange with the normalized selection', async () => {
    const onSearchMediaItems = vi.fn().mockResolvedValue([alAqsaMediaItem]);
    const onChange = vi.fn();
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={onChange}
        onSearchMediaItems={onSearchMediaItems}
        t={mockT}
        value={null}
      />,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Al-Aqsa');
    await waitFor(() => expect(onSearchMediaItems).toHaveBeenCalledWith('Al-Aqsa'));
    fireEvent.click(await screen.findByRole('option', { name: 'Al-Aqsa video' }));
    expect(onChange).toHaveBeenCalledWith({
      id: 'media-2', mediaType: 'uploaded-video', source: 'media-item', thumbnailUrl: null, title: 'Al-Aqsa video',
    });
  });

  it('calls onChange with null when the selection is cleared', async () => {
    const onChange = vi.fn();
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={onChange}
        onSearchMediaItems={vi.fn().mockResolvedValue([])}
        t={mockT}
        value={{
          id: 'media-1', mediaType: 'audio', source: 'media-item', thumbnailUrl: null, title: 'Dome of the Rock tour',
        }}
      />,
    );
    await userEvent.click(screen.getByLabelText(/clear/i));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a "no results" message once a search comes back empty', async () => {
    const onSearchMediaItems = vi.fn().mockResolvedValue([]);
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        onSearchMediaItems={onSearchMediaItems}
        t={mockT}
        value={null}
      />,
    );
    await userEvent.type(screen.getByRole('combobox'), 'nothing matches this');
    await waitFor(() => expect(onSearchMediaItems).toHaveBeenCalledWith('nothing matches this'));
    expect(await screen.findByText('poi_media_no_results')).toBeInTheDocument();
  });

  it('only shows a source selector button for sources whose search function was provided', () => {
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        onSearchIiifImages={vi.fn()}
        onSearchMediaItems={vi.fn()}
        t={mockT}
        value={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'poi_media_source_iiif_image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'poi_media_source_media_item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'poi_media_source_upload' })).not.toBeInTheDocument();
  });

  it('hides the source selector entirely when only one source is available', () => {
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        onSearchMediaItems={vi.fn()}
        t={mockT}
        value={null}
      />,
    );
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('renders nothing when no search function is provided for any source', () => {
    const { container } = render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        t={mockT}
        value={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('switches the active search source and searches the new source fresh', async () => {
    const onSearchMediaItems = vi.fn().mockResolvedValue([domeOfTheRockMediaItem]);
    const onSearchIiifImages = vi.fn().mockResolvedValue([domeOfTheRockIiifImage]);
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={vi.fn()}
        onSearchIiifImages={onSearchIiifImages}
        onSearchMediaItems={onSearchMediaItems}
        t={mockT}
        value={null}
      />,
    );

    // IIIF Image is the default active source (first in SOURCE_CONFIG's display order, absent
    // a current value pointing at a different one - see MediaSelectionField's own doc).
    await userEvent.click(screen.getByRole('combobox'));
    await waitFor(() => expect(onSearchIiifImages).toHaveBeenCalledWith(''));

    await userEvent.click(screen.getByRole('button', { name: 'poi_media_source_media_item' }));
    await userEvent.click(screen.getByRole('combobox'));
    await waitFor(() => expect(onSearchMediaItems).toHaveBeenCalledWith(''));
    expect(await screen.findByRole('option', { name: 'Dome of the Rock tour' })).toBeInTheDocument();
  });

  it('normalizes an iiif-image result into the common shape on selection', async () => {
    const onSearchIiifImages = vi.fn().mockResolvedValue([domeOfTheRockIiifImage]);
    const onChange = vi.fn();
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={onChange}
        onSearchIiifImages={onSearchIiifImages}
        t={mockT}
        value={null}
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Dome of the Rock' }));
    expect(onChange).toHaveBeenCalledWith({
      id: 'iiif-1', source: 'iiif-image', thumbnailUrl: 'https://cdn.example/iiif-thumb.jpg', title: 'Dome of the Rock',
    });
  });

  it('normalizes an upload result into the common shape, coercing its numeric id to a string', async () => {
    const onSearchUploads = vi.fn().mockResolvedValue([photoUpload]);
    const onChange = vi.fn();
    render(
      <MediaSelectionField
        dialogContainer={() => document.body}
        label="Media"
        onChange={onChange}
        onSearchUploads={onSearchUploads}
        t={mockT}
        value={null}
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'photo.jpg' }));
    expect(onChange).toHaveBeenCalledWith({
      id: '42', source: 'upload', thumbnailUrl: 'https://cdn.example/photo-thumb.jpg', title: 'photo.jpg',
    });
  });
});
