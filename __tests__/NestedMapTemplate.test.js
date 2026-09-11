import React from 'react';
import { I18nextProvider } from 'react-i18next';
import userEvent from '@testing-library/user-event';
import { i18n } from '../setupTest';
import {
  fireEvent, render, screen, waitFor,
} from './test-utils';
import NestedMapTemplate, {
  convertNestedMapAnnotationToBeSaved,
} from '../src/annotationForm/templates/builtin/NestedMapTemplate';
import { SHAPES_TOOL } from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

// Same target-capture mocking as POITemplate.test.js - see that file's own comment for why.
vi.mock('../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils', async () => {
  const actual = await vi.importActual('../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils');
  return {
    ...actual,
    getSvg: vi.fn().mockResolvedValue('<svg><circle cx="10" cy="20" r="5"/></svg>'),
    resizeKonvaStage: vi.fn(),
  };
});

// Same CKEditor stand-in as POITemplate.test.js - see that file's own comment for why.
vi.mock('../src/annotationForm/templates/templateComponents/RichTextField', () => ({
  // eslint-disable-next-line react/prop-types -- test-only stand-in
  RichTextField: ({ onChange, rtl, value }) => (
    <textarea
      data-rtl={rtl ? 'true' : 'false'}
      data-testid="poi-description"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

/** A single POI marker, as placed by the dedicated POI tool (see PoiNode.jsx) */
const poiShape = () => ({
  fill: '#e53935',
  id: 'shape-1',
  radius: 10,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  stroke: '#ffffff',
  strokeWidth: 2,
  type: SHAPES_TOOL.POI,
  x: 10,
  y: 20,
});

const playerReferences = {
  getContainer: vi.fn().mockReturnValue(null),
  getDisplayedMediaHeight: vi.fn().mockReturnValue(100),
  getMediaTrueHeight: vi.fn().mockReturnValue(200),
  getMediaTrueWidth: vi.fn().mockReturnValue(300),
  getMediaType: vi.fn().mockReturnValue('Image'),
  getScale: vi.fn().mockReturnValue(1),
  getZoom: vi.fn().mockReturnValue(1),
};

/** A minimal, valid NestedMapTemplate annotationState, with a single 'en' locale and a linked
 * map already chosen. */
const baseNestedMapState = () => ({
  body: [],
  'dbf:kind': 'POI',
  'dbf:linkedMap': { id: 'map-7', titleEn: 'Old City' },
  id: 'canvas1/annotation/1',
  maeData: {
    contentByLocale: {
      en: { description: '', title: 'Gate to the Old City' },
    },
    target: {
      drawingState: { shapes: [poiShape()] },
      fullCanvaXYWH: '0,0,800,600',
    },
    templateType: 'nestedMap',
  },
  motivation: 'identifying',
  target: null,
});

describe('convertNestedMapAnnotationToBeSaved', () => {
  it('preserves motivation, dbf:kind and dbf:linkedMap, and derives target from the placed POI marker', async () => {
    const state = baseNestedMapState();

    const result = await convertNestedMapAnnotationToBeSaved(
      state,
      { canvas: { id: 'canvas1' }, playerReferences, windowId: 'window1' },
    );

    expect(result.motivation).toBe('identifying');
    expect(result['dbf:kind']).toBe('POI');
    expect(result['dbf:linkedMap']).toEqual({ id: 'map-7', titleEn: 'Old City' });
    expect(result.target).toEqual({
      selector: [
        { type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' },
        { type: 'FragmentSelector', value: 'canvas1#' },
      ],
      source: 'canvas1',
    });
  });
});

describe('NestedMapTemplate (render)', () => {
  /** Identity translation stub, matching POITemplate.test.js's convention */
  const mockT = (key) => key;

  /** Render NestedMapTemplate wrapped the same way POITemplate.test.js does */
  const renderNestedMapTemplate = (
    annotation = {},
    saveAnnotation = vi.fn(),
    searchMaps = vi.fn().mockResolvedValue([]),
  ) => render(
    <I18nextProvider i18n={i18n}>
      <NestedMapTemplate
        annotation={annotation}
        closeFormCompanionWindow={vi.fn()}
        playerReferences={playerReferences}
        saveAnnotation={saveAnnotation}
        t={mockT}
        windowId="window1"
      />
    </I18nextProvider>,
    { preloadedState: { config: { annotation: { contentLocales: [], searchMaps } } } },
  );

  it('does not save and shows an error when the target is not a single point', () => {
    const saveAnnotation = vi.fn();
    renderNestedMapTemplate({}, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('poi_target_must_be_point')).toBeInTheDocument();
  });

  it('does not save and shows an error when no map is linked yet, even with a valid target', () => {
    const saveAnnotation = vi.fn();
    const state = baseNestedMapState();
    state['dbf:linkedMap'] = null;
    renderNestedMapTemplate(state, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('nested_map_linked_map_required')).toBeInTheDocument();
  });

  it('saves once a point is placed and a map is linked', () => {
    const saveAnnotation = vi.fn();
    renderNestedMapTemplate(baseNestedMapState(), saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalled();
    expect(screen.queryByText('poi_target_must_be_point')).not.toBeInTheDocument();
    expect(screen.queryByText('nested_map_linked_map_required')).not.toBeInTheDocument();
  });

  it('does not render the linked-map field when no searchMaps capability is configured', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <NestedMapTemplate
          annotation={{}}
          closeFormCompanionWindow={vi.fn()}
          playerReferences={playerReferences}
          saveAnnotation={vi.fn()}
          t={mockT}
          windowId="window1"
        />
      </I18nextProvider>,
      { preloadedState: { config: { annotation: { contentLocales: [] } } } },
    );

    expect(screen.queryByLabelText('nested_map_linked_map')).not.toBeInTheDocument();
  });

  it('rehydrates the already-linked map from the saved annotation', () => {
    renderNestedMapTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Gate to the Old City',
        },
      ],
      'dbf:kind': 'POI',
      'dbf:linkedMap': { id: 'map-7', titleEn: 'Old City' },
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'nestedMap',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    });

    expect(screen.getByLabelText('nested_map_linked_map')).toHaveValue('Old City');
  });

  it('lets the editor search and link a map, then reflects the pick', async () => {
    const searchMaps = vi.fn().mockResolvedValue([
      { documentId: 'map-9', titleEn: 'Harbor District' },
    ]);
    renderNestedMapTemplate({}, vi.fn(), searchMaps);

    const mapField = screen.getByLabelText('nested_map_linked_map');
    await userEvent.type(mapField, 'Harbor');

    await waitFor(() => expect(searchMaps).toHaveBeenCalledWith('Harbor'));
    fireEvent.click(await screen.findByRole('option', { name: 'Harbor District' }));

    expect(screen.getByLabelText('nested_map_linked_map')).toHaveValue('Harbor District');
  });

  it('clears the linked-map error once a map is picked after a failed save attempt', async () => {
    const saveAnnotation = vi.fn();
    const searchMaps = vi.fn().mockResolvedValue([
      { documentId: 'map-9', titleEn: 'Harbor District' },
    ]);
    const state = baseNestedMapState();
    state['dbf:linkedMap'] = null;
    renderNestedMapTemplate(state, saveAnnotation, searchMaps);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByText('nested_map_linked_map_required')).toBeInTheDocument();

    const mapField = screen.getByLabelText('nested_map_linked_map');
    await userEvent.type(mapField, 'Harbor');
    await waitFor(() => expect(searchMaps).toHaveBeenCalledWith('Harbor'));
    fireEvent.click(await screen.findByRole('option', { name: 'Harbor District' }));

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(screen.queryByText('nested_map_linked_map_required')).not.toBeInTheDocument();
    expect(saveAnnotation).toHaveBeenCalled();
  });
});
