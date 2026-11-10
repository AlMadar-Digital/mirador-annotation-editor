import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  fireEvent, render, screen, waitFor,
} from './test-utils';
import {
  optionToSamePlaceAs,
  poiOptionLabel,
  PoiRelationField,
  samePlaceAsToOption,
} from '../src/annotationForm/templates/templateComponents/PoiRelationField';

/** Identity translation stub */
const mockT = (key) => key;

const GATE = { documentId: 'poi-9', map: { documentId: 'map-2', titleEn: 'Silver map' }, titleEn: 'Jaffa Gate' };

describe('poiOptionLabel', () => {
  it('names the map the POI is on', () => {
    expect(poiOptionLabel(GATE)).toBe('Jaffa Gate — Silver map');
  });

  it('falls back to the POI title alone when its map is unknown', () => {
    expect(poiOptionLabel({ documentId: 'poi-9', map: null, titleEn: 'Jaffa Gate' })).toBe('Jaffa Gate');
  });
});

describe('dbf:samePlaceAs conversion', () => {
  it('turns a picked option into the dbf:samePlaceAs extension', () => {
    expect(optionToSamePlaceAs(GATE)).toEqual({
      id: 'poi-9', mapId: 'map-2', mapTitleEn: 'Silver map', titleEn: 'Jaffa Gate',
    });
  });

  it('leaves the map out when the option has none', () => {
    expect(optionToSamePlaceAs({ documentId: 'poi-9', map: null, titleEn: 'Jaffa Gate' }))
      .toStrictEqual({ id: 'poi-9', titleEn: 'Jaffa Gate' });
  });

  it('clears to null, not undefined - null is what drops the link server-side', () => {
    expect(optionToSamePlaceAs(null)).toBeNull();
  });

  it('round-trips the extension back into an option', () => {
    expect(samePlaceAsToOption(optionToSamePlaceAs(GATE))).toEqual(GATE);
  });

  it('has no option for a missing or null extension', () => {
    expect(samePlaceAsToOption(undefined)).toBeNull();
    expect(samePlaceAsToOption(null)).toBeNull();
  });

  it('tolerates an extension carrying only an id', () => {
    expect(samePlaceAsToOption({ id: 'poi-9' })).toEqual({ documentId: 'poi-9', map: null, titleEn: '' });
  });
});

describe('PoiRelationField', () => {
  /** Render the field with a plain document.body popper container */
  const renderField = (props = {}) => {
    const onChange = vi.fn();
    const onSearch = vi.fn().mockResolvedValue([GATE]);
    render(
      <PoiRelationField
        dialogContainer={() => document.body}
        label="same place"
        onChange={onChange}
        onSearch={onSearch}
        t={mockT}
        // eslint-disable-next-line react/jsx-props-no-spreading -- test helper
        {...props}
      />,
    );
    return { onChange, onSearch: props.onSearch ?? onSearch };
  };

  it('searches as the editor types and reports the picked POI', async () => {
    const { onChange, onSearch } = renderField();

    await userEvent.type(screen.getByLabelText('same place'), 'Jaffa');
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Jaffa'));
    fireEvent.click(await screen.findByRole('option', { name: 'Jaffa Gate — Silver map' }));

    expect(onChange).toHaveBeenCalledWith(GATE);
  });

  it('shows the linked POI with its map', () => {
    renderField({ value: GATE });

    expect(screen.getByLabelText('same place')).toHaveValue('Jaffa Gate — Silver map');
  });

  it('searches on the POI title, not the "POI — Map" label, when reopened with a POI picked', async () => {
    const { onSearch } = renderField({ value: GATE });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Jaffa Gate'));
    expect(onSearch).not.toHaveBeenCalledWith('Jaffa Gate — Silver map');
  });

  it('reports null when the link is cleared', async () => {
    const { onChange } = renderField({ value: GATE });

    await userEvent.hover(screen.getByLabelText('same place'));
    fireEvent.click(screen.getByTitle('Clear'));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
