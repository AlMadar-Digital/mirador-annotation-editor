import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  fireEvent, render, screen, waitFor,
} from './test-utils';
import { MapRelationField } from '../src/annotationForm/templates/templateComponents/MapRelationField';
import { RelationField } from '../src/annotationForm/templates/templateComponents/RelationField';

/** Identity translation stub */
const mockT = (key) => key;

/** Wait out the field's search debounce (300 ms), so a search that should not happen has had
 * the time to. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 400); });

const HARBOR = { documentId: 'map-2', titleEn: 'Harbor map' };

describe('RelationField', () => {
  /** Render the field with a plain document.body popper container */
  const renderField = (props = {}) => {
    const onChange = vi.fn();
    const onSearch = props.onSearch ?? vi.fn().mockResolvedValue([HARBOR]);
    render(
      <RelationField
        dialogContainer={() => document.body}
        getOptionLabel={(option) => option.titleEn}
        label="linked"
        noResultsKey="no_results"
        onChange={onChange}
        searchPromptKey="search_prompt"
        t={mockT}
        // eslint-disable-next-line react/jsx-props-no-spreading -- test helper
        {...props}
        onSearch={onSearch}
      />,
    );
    return { onChange, onSearch };
  };

  it('says the search failed, and drops the previous results, when the host rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSearch = vi.fn()
      .mockResolvedValueOnce([HARBOR])
      .mockRejectedValue(new Error('500'));
    renderField({ onSearch });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('option', { name: 'Harbor map' })).toBeInTheDocument();
    await userEvent.keyboard('x');

    expect(await screen.findByText('relation_search_failed')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Harbor map' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('treats a host that throws synchronously like a failed search', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderField({ onSearch: vi.fn(() => { throw new Error('offline'); }) });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(await screen.findByText('relation_search_failed')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('recovers from a failed search on the next one', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSearch = vi.fn()
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValue([HARBOR]);
    renderField({ onSearch });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('relation_search_failed')).toBeInTheDocument();
    await userEvent.keyboard('H');

    expect(await screen.findByRole('option', { name: 'Harbor map' })).toBeInTheDocument();
    expect(screen.queryByText('relation_search_failed')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('sends one search, for the typed text, when typing opens the dropdown', async () => {
    const { onSearch } = renderField();

    // Tabbing in focuses the field without opening it; the keystroke then both changes the
    // text and opens the dropdown.
    await userEvent.tab();
    await userEvent.keyboard('H');
    await settle();

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('H');
  });

  it('does not search when the link is cleared with the dropdown closed', async () => {
    const { onChange, onSearch } = renderField({ value: HARBOR });

    await userEvent.hover(screen.getByLabelText('linked'));
    fireEvent.click(screen.getByTitle('Clear'));
    await settle();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('searches again when the link is cleared with the dropdown open', async () => {
    const { onSearch } = renderField({ value: HARBOR });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Harbor map'));
    fireEvent.click(screen.getByTitle('Clear'));

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith(''));
  });
});

describe('MapRelationField', () => {
  it('searches as the editor types and reports the picked map', async () => {
    const onChange = vi.fn();
    const onSearch = vi.fn().mockResolvedValue([HARBOR]);
    render(
      <MapRelationField
        dialogContainer={() => document.body}
        label="linked map"
        onChange={onChange}
        onSearch={onSearch}
        t={mockT}
      />,
    );

    await userEvent.type(screen.getByLabelText('linked map'), 'Harbor');
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Harbor'));
    fireEvent.click(await screen.findByRole('option', { name: 'Harbor map' }));

    expect(onChange).toHaveBeenCalledWith(HARBOR);
  });

  it('prompts with the map wording before anything is typed', async () => {
    render(
      <MapRelationField
        dialogContainer={() => document.body}
        label="linked map"
        onChange={vi.fn()}
        onSearch={vi.fn().mockResolvedValue([])}
        t={mockT}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(await screen.findByText('map_relation_search_prompt')).toBeInTheDocument();
  });
});
