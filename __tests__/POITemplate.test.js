import React from 'react';
import { I18nextProvider } from 'react-i18next';
import userEvent from '@testing-library/user-event';
import { i18n } from '../setupTest';
import {
  fireEvent, render, screen, waitFor,
} from './test-utils';
import POITemplate, {
  applyPoiBodyConversion,
  convertPoiAnnotationToBeSaved,
  isTitleFilled,
  isValidPointTarget,
} from '../src/annotationForm/templates/builtin/POITemplate';
import { TARGET_TOOL_STATE } from '../src/annotationForm/AnnotationFormUtils';
import { SHAPES_TOOL } from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';
import { convertIIIFAnnoToMaeData } from '../src/IIIFUtils';

// tetras-dbf/mirador-annotation-editor#4/#21: the POI template's target must be exactly one
// placed POI marker (SHAPES_TOOL.POI, the dedicated click-to-place tool - see
// docs/superpowers/specs/2026-09-01-poi-iiif-annotation-format-design.md in root_repo), so
// getSvg is mocked the same way MultipleBodyTemplate.test.js mocks it, to keep these tests
// independent of react-konva-to-svg's actual serialization. resizeKonvaStage is mocked too -
// it looks up a real Konva stage by windowId (window.Konva.stages.find(...)), which only
// exists when Konva itself has actually mounted a canvas, never true for these shallow renders.
vi.mock('../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils', async () => {
  const actual = await vi.importActual('../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils');
  return {
    ...actual,
    getSvg: vi.fn().mockResolvedValue('<svg><circle cx="10" cy="20" r="5"/></svg>'),
    resizeKonvaStage: vi.fn(),
  };
});

// RichTextField mounts a real CKEditor instance asynchronously (componentDidMount), which never
// settles synchronously in happy-dom - swapped for a plain textarea test double that exposes the
// same (value, onChange, rtl) contract, so these tests can assert on POITemplate's own
// description-binding/RTL logic without depending on CKEditor actually mounting.
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

/** A single Circle shape (the old, now-removed generic Circle tool) - no longer a valid target */
const circleShape = () => ({
  fill: TARGET_TOOL_STATE.fillColor,
  fillColor: TARGET_TOOL_STATE.fillColor,
  id: 'shape-1',
  radius: 5,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  stroke: TARGET_TOOL_STATE.strokeColor,
  strokeColor: TARGET_TOOL_STATE.strokeColor,
  type: SHAPES_TOOL.CIRCLE,
  x: 10,
  y: 20,
});

/** A single Rectangle shape - an invalid POI target */
const rectangleShape = () => ({
  fill: TARGET_TOOL_STATE.fillColor,
  fillColor: TARGET_TOOL_STATE.fillColor,
  height: 40,
  id: 'shape-1',
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  stroke: TARGET_TOOL_STATE.strokeColor,
  strokeColor: TARGET_TOOL_STATE.strokeColor,
  type: SHAPES_TOOL.RECTANGLE,
  width: 30,
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

/** A minimal, valid POITemplate annotationState, with a single 'en' locale filled in */
const basePoiState = () => ({
  body: [],
  'dbf:kind': 'POI',
  maeData: {
    contentByLocale: {
      en: { description: '', title: 'Dome of the Rock' },
    },
    target: {
      drawingState: { shapes: [poiShape()] },
      fullCanvaXYWH: '0,0,800,600',
    },
    templateType: 'poi',
  },
  motivation: 'identifying',
  target: null,
});

describe('isValidPointTarget', () => {
  it('is true for exactly one POI marker', () => {
    const maeData = { target: { drawingState: { shapes: [poiShape()] } } };
    expect(isValidPointTarget(maeData)).toBe(true);
  });

  it('is false with no shapes', () => {
    const maeData = { target: { drawingState: { shapes: [] } } };
    expect(isValidPointTarget(maeData)).toBe(false);
  });

  it('is false with a Circle shape - the old generic Circle tool is no longer a valid POI target (#21)', () => {
    const maeData = { target: { drawingState: { shapes: [circleShape()] } } };
    expect(isValidPointTarget(maeData)).toBe(false);
  });

  it('is false with a Rectangle shape', () => {
    const maeData = { target: { drawingState: { shapes: [rectangleShape()] } } };
    expect(isValidPointTarget(maeData)).toBe(false);
  });

  it('is false with more than one shape', () => {
    const shapes = [poiShape(), poiShape()];
    expect(isValidPointTarget({ target: { drawingState: { shapes } } })).toBe(false);
  });
});

describe('isTitleFilled', () => {
  const contentLocales = [{ code: 'en', name: 'English' }, { code: 'ar', name: 'Arabic' }];

  it('is true when every configured locale has a non-empty title', () => {
    const contentByLocale = {
      ar: { description: '', title: 'قبة الصخرة' },
      en: { description: '', title: 'Dome of the Rock' },
    };
    expect(isTitleFilled(contentByLocale, contentLocales)).toBe(true);
  });

  it('is false when a configured locale is missing its title entirely', () => {
    const contentByLocale = { en: { description: '', title: 'Dome of the Rock' } };
    expect(isTitleFilled(contentByLocale, contentLocales)).toBe(false);
  });

  it('is false when a configured locale has a blank/whitespace-only title', () => {
    const contentByLocale = {
      ar: { description: '', title: '   ' },
      en: { description: '', title: 'Dome of the Rock' },
    };
    expect(isTitleFilled(contentByLocale, contentLocales)).toBe(false);
  });

  it('is vacuously true when no content locales are configured', () => {
    expect(isTitleFilled({}, [])).toBe(true);
  });
});

describe('applyPoiBodyConversion', () => {
  it('saves an empty title as-is, without falling back to a date string (issue #377 review comment)', () => {
    const state = basePoiState();
    state.maeData.contentByLocale.en.title = '';

    const result = applyPoiBodyConversion(state);

    expect(result.body[0]).toEqual({
      language: 'en', purpose: 'identifying', type: 'TextualBody', value: '',
    });
  });

  it('builds body with the title as a language-tagged identifying TextualBody', () => {
    const state = basePoiState();

    const result = applyPoiBodyConversion(state);

    expect(result.body[0]).toEqual({
      language: 'en',
      purpose: 'identifying',
      type: 'TextualBody',
      value: 'Dome of the Rock',
    });
  });

  it('appends a language-tagged describing TextualBody when the description is non-empty', () => {
    const state = basePoiState();
    state.maeData.contentByLocale.en.description = '<p>Built in 691 CE</p>';

    const result = applyPoiBodyConversion(state);

    expect(result.body.slice(1)).toEqual([
      {
        language: 'en', purpose: 'describing', type: 'TextualBody', value: '<p>Built in 691 CE</p>',
      },
    ]);
  });

  it('omits the describing body entirely when the description is empty', () => {
    const state = basePoiState();
    state.maeData.contentByLocale.en.description = '<p><br></p>';

    const result = applyPoiBodyConversion(state);

    expect(result.body.some((item) => item.purpose === 'describing' && item.type === 'TextualBody')).toBe(false);
  });

  it('never adds a MediaItem-typed item to the body - media is a root-level dbf:mediaEn/dbf:mediaAr extension, not a body item (issue #377)', () => {
    const state = basePoiState();
    state['dbf:mediaEn'] = { id: 'media-1', source: 'media-item', title: 'Dome of the Rock tour' };

    const result = applyPoiBodyConversion(state);

    expect(result.body.some((item) => item.type === 'MediaItem')).toBe(false);
  });

  it('builds one identifying + describing group per locale actually present', () => {
    const state = basePoiState();
    state.maeData.contentByLocale.ar = {
      description: '<p>بني عام 691</p>',
      title: 'قبة الصخرة',
    };

    const result = applyPoiBodyConversion(state);

    expect(result.body).toEqual([
      {
        language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
      },
      {
        language: 'ar', purpose: 'identifying', type: 'TextualBody', value: 'قبة الصخرة',
      },
      {
        language: 'ar', purpose: 'describing', type: 'TextualBody', value: '<p>بني عام 691</p>',
      },
    ]);
  });

  it('leaves an existing dbf:journey/dbf:linkedMap/dbf:mediaEn/dbf:mediaAr untouched - these are set/managed outside applyPoiBodyConversion (media directly by LocalizedMediaSelectionField\'s onChangeEn/onChangeAr, issue #377; dbf:journey/dbf:linkedMap from the Strapi backoffice)', () => {
    const state = basePoiState();
    state['dbf:journey'] = { id: 'journey-1', order: 3 };
    state['dbf:linkedMap'] = { id: 'map-7', type: 'Manifest' };
    state['dbf:mediaEn'] = { id: 'media-1', source: 'media-item', title: 'Dome of the Rock tour' };
    state['dbf:mediaAr'] = { id: 'media-2', source: 'media-item', title: 'Arabic tour' };

    const result = applyPoiBodyConversion(state);

    expect(result['dbf:journey']).toEqual({ id: 'journey-1', order: 3 });
    expect(result['dbf:linkedMap']).toEqual({ id: 'map-7', type: 'Manifest' });
    expect(result['dbf:mediaEn']).toEqual({ id: 'media-1', source: 'media-item', title: 'Dome of the Rock tour' });
    expect(result['dbf:mediaAr']).toEqual({ id: 'media-2', source: 'media-item', title: 'Arabic tour' });
  });

  it('does not add dbf:journey/dbf:linkedMap/dbf:mediaEn/dbf:mediaAr when the annotation never had them', () => {
    const result = applyPoiBodyConversion(basePoiState());

    expect(result).not.toHaveProperty('dbf:journey');
    expect(result).not.toHaveProperty('dbf:linkedMap');
    expect(result).not.toHaveProperty('dbf:mediaEn');
    expect(result).not.toHaveProperty('dbf:mediaAr');
  });
});

describe('convertPoiAnnotationToBeSaved', () => {
  it('preserves motivation and dbf:kind, and derives target from the placed POI marker', async () => {
    const state = basePoiState();

    const result = await convertPoiAnnotationToBeSaved(
      state,
      { canvas: { id: 'canvas1' }, playerReferences, windowId: 'window1' },
    );

    expect(result.motivation).toBe('identifying');
    expect(result['dbf:kind']).toBe('POI');
    expect(result.target).toEqual({
      selector: [
        { type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' },
        { type: 'FragmentSelector', value: 'canvas1#' },
      ],
      source: 'canvas1',
    });
  });
});

describe('POITemplate (render)', () => {
  /** Identity translation stub, matching exampleExternalTemplate.test.js's convention */
  const mockT = (key) => key;

  const CONTENT_LOCALES = [{ code: 'en', name: 'English' }, { code: 'ar', name: 'Arabic' }];

  /** Render POITemplate wrapped the same way exampleExternalTemplate.test.js does */
  const renderPoiTemplate = (
    annotation = {},
    saveAnnotation = vi.fn(),
    contentLocales = [],
    searchMediaItems = undefined,
    searchIiifImages = undefined,
    searchUploads = undefined,
  ) => render(
    <I18nextProvider i18n={i18n}>
      <POITemplate
        annotation={annotation}
        closeFormCompanionWindow={vi.fn()}
        playerReferences={playerReferences}
        saveAnnotation={saveAnnotation}
        t={mockT}
        windowId="window1"
      />
    </I18nextProvider>,
    {
      preloadedState: {
        config: {
          annotation: {
            contentLocales, searchIiifImages, searchMediaItems, searchUploads,
          },
        },
      },
    },
  );

  it('does not save and shows an error when the target is not a single point', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({}, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('poi_target_must_be_point')).toBeInTheDocument();
  });

  it('saves an unmodified, real Strapi-loaded POI without a target error (issue #377 review comment: "open in edition a POI, change nothing, save, it\'s not possible to close")', () => {
    // Mirrors what StrapiAnnotationAdapter actually hands POITemplate: no maeData of its own
    // (Strapi never round-trips it - see that adapter's own comment) and a real MAE-saved
    // target's SvgSelector. No <circle> element on purpose - getSvg's real export
    // (react-konva-to-svg -> svgcanvas) traces every shape, POI markers included, as a generic
    // <path>, never a literal <circle> tag - see convertPoiSvgSelectorToMae's own doc. Not the
    // synthetic already-maeData'd fixtures every other test in this file uses.
    const strapiLoadedAnnotation = convertIIIFAnnoToMaeData({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      motivation: 'identifying',
      target: {
        selector: [
          { type: 'SvgSelector', value: "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><path fill='#e53935' stroke='#ffffff' d='M10 20 A5 5 0 1 1 10 20.001 Z'/></svg>" },
          { type: 'FragmentSelector', value: 'canvas1#' },
        ],
      },
    });
    const saveAnnotation = vi.fn();
    renderPoiTemplate(strapiLoadedAnnotation, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(screen.queryByText('poi_target_must_be_point')).not.toBeInTheDocument();
    expect(saveAnnotation).toHaveBeenCalled();
  });

  it('does not save and shows an error when a configured locale is missing its title, even with a valid target (issue #377 review comment)', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation, CONTENT_LOCALES);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('poi_title_required')).toBeInTheDocument();
  });

  it('saves once every configured locale has a title', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
        {
          language: 'ar', purpose: 'identifying', type: 'TextualBody', value: 'قبة الصخرة',
        },
      ],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation, CONTENT_LOCALES);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalled();
    expect(screen.queryByText('poi_title_required')).not.toBeInTheDocument();
  });

  it('binds the description field to the active locale and updates it on change', () => {
    renderPoiTemplate();

    expect(screen.getByTestId('poi-description')).toHaveValue('');

    fireEvent.change(screen.getByTestId('poi-description'), { target: { value: '<p>Built in 691 CE</p>' } });

    expect(screen.getByTestId('poi-description')).toHaveValue('<p>Built in 691 CE</p>');
  });

  it('rehydrates the title and description from an existing annotation body', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
        {
          language: 'en', purpose: 'describing', type: 'TextualBody', value: '<p>Built in 691 CE</p>',
        },
      ],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    });

    expect(screen.getByDisplayValue('Dome of the Rock')).toBeInTheDocument();
    expect(screen.getByTestId('poi-description')).toHaveValue('<p>Built in 691 CE</p>');
  });

  it('only rehydrates the first describing TextualBody per locale, matching annotationConversion.ts server-side', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
        {
          language: 'en', purpose: 'describing', type: 'TextualBody', value: '<p>First</p>',
        },
        {
          language: 'en', purpose: 'describing', type: 'TextualBody', value: '<p>Second</p>',
        },
      ],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    });

    expect(screen.getByTestId('poi-description')).toHaveValue('<p>First</p>');
  });

  it('hides the language selector when fewer than two content locales are configured', () => {
    renderPoiTemplate({}, vi.fn(), [{ code: 'en', name: 'English' }]);

    expect(screen.queryByLabelText('poi_language')).not.toBeInTheDocument();
  });

  it("switching the language selector shows that locale's own title, independent of the others", () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
        {
          language: 'ar', purpose: 'identifying', type: 'TextualBody', value: 'قبة الصخرة',
        },
      ],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, vi.fn(), CONTENT_LOCALES);

    expect(screen.getByDisplayValue('Dome of the Rock')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }));

    expect(screen.getByDisplayValue('قبة الصخرة')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Dome of the Rock')).not.toBeInTheDocument();
  });

  it('switches the title field and description field to RTL for an Arabic active locale', () => {
    renderPoiTemplate({}, vi.fn(), CONTENT_LOCALES);

    expect(screen.getByLabelText('poi_title')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('poi-description')).toHaveAttribute('data-rtl', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }));

    expect(screen.getByLabelText('poi_title')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTestId('poi-description')).toHaveAttribute('data-rtl', 'true');
  });

  it('defaults the active locale to English when a new annotation is created', () => {
    renderPoiTemplate({}, vi.fn(), CONTENT_LOCALES);

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Arabic' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not render a media field when no search capability is configured (issue #391)', () => {
    renderPoiTemplate();

    expect(screen.queryByText('poi_media_en')).not.toBeInTheDocument();
  });

  it('lets the editor search and attach a media item, then reflects the pick (issue #377)', async () => {
    const searchMediaItems = vi.fn().mockResolvedValue([
      {
        documentId: 'media-1', mediaType: 'audio', purpose: 'audio-tour', titleEn: 'Dome of the Rock tour',
      },
    ]);
    renderPoiTemplate({}, vi.fn(), [], searchMediaItems);

    const mediaField = screen.getByLabelText('poi_media_en');
    await userEvent.type(mediaField, 'Dome');

    await waitFor(() => expect(searchMediaItems).toHaveBeenCalledWith('Dome'));
    fireEvent.click(await screen.findByRole('option', { name: 'Dome of the Rock tour' }));

    expect(screen.getByLabelText('poi_media_en')).toHaveValue('Dome of the Rock tour');
  });

  it('rehydrates an already-attached media selection from the annotation\'s root-level dbf:mediaEn (issue #377)', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      'dbf:mediaEn': {
        id: 'media-1', mediaType: 'audio', source: 'media-item', thumbnailUrl: null, title: 'Dome of the Rock tour',
      },
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, vi.fn(), [], vi.fn().mockResolvedValue([]));

    expect(screen.getByLabelText('poi_media_en')).toHaveValue('Dome of the Rock tour');
  });

  it('shows a thumbnail preview for a rehydrated media selection that has one (issue #333, #377)', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      'dbf:mediaEn': {
        id: 'media-1',
        mediaType: 'youtube-video',
        source: 'media-item',
        thumbnailUrl: 'https://img.youtube.com/vi/abc123/mqdefault.jpg',
        title: 'Dome of the Rock tour',
      },
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, vi.fn(), [], vi.fn().mockResolvedValue([]));

    expect(screen.getByTestId('media-selection-thumbnail')).toHaveAttribute('src', 'https://img.youtube.com/vi/abc123/mqdefault.jpg');
  });

  it('falls back to a mediaType icon for a rehydrated media-item selection with no thumbnail (issue #391)', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      'dbf:mediaEn': {
        id: 'media-1', mediaType: 'audio', source: 'media-item', thumbnailUrl: null, title: 'Dome of the Rock tour',
      },
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, vi.fn(), [], vi.fn().mockResolvedValue([]));

    expect(screen.getByTestId('AudiotrackIcon')).toBeInTheDocument();
  });

  it('renders an empty media field when dbf:mediaEn is explicitly null on a loaded annotation, without crashing (issue #377)', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      'dbf:mediaEn': null,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, vi.fn(), [], vi.fn().mockResolvedValue([]));

    expect(screen.getByLabelText('poi_media_en')).toHaveValue('');
  });

  it('shows only the active locale\'s media field, and mirrors a pick into the other language while "keep same" is checked (issue #377)', async () => {
    const searchMediaItems = vi.fn().mockImplementation((query) => Promise.resolve(
      query === 'Dome'
        ? [{
          documentId: 'media-1', mediaType: 'audio', purpose: 'audio-tour', titleEn: 'Dome of the Rock tour',
        }]
        : [],
    ));
    renderPoiTemplate({}, vi.fn(), CONTENT_LOCALES, searchMediaItems);

    expect(screen.queryByLabelText('poi_media_ar')).not.toBeInTheDocument();

    const mediaField = screen.getByLabelText('poi_media_en');
    await userEvent.type(mediaField, 'Dome');
    await waitFor(() => expect(searchMediaItems).toHaveBeenCalledWith('Dome'));
    fireEvent.click(await screen.findByRole('option', { name: 'Dome of the Rock tour' }));

    // A new annotation starts with "keep same" checked (both media start out empty/matching),
    // so switching to the Arabic tab should show the English pick mirrored in, without ever
    // showing both fields together.
    expect(screen.getByRole('checkbox', { name: 'poi_media_keep_same' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }));

    expect(screen.queryByLabelText('poi_media_en')).not.toBeInTheDocument();
    expect(screen.getByLabelText('poi_media_ar')).toHaveValue('Dome of the Rock tour');
  });

  it('unchecking "keep same media" stops further picks from mirroring across languages (issue #377)', async () => {
    const searchMediaItems = vi.fn().mockImplementation((query) => Promise.resolve(
      // eslint-disable-next-line no-nested-ternary -- three fixed mappings, a switch is no clearer
      query === 'Dome'
        ? [{
          documentId: 'media-1', mediaType: 'audio', purpose: 'audio-tour', titleEn: 'Dome of the Rock tour',
        }]
        : query === 'Aqsa'
          ? [{
            documentId: 'media-2', mediaType: 'audio', purpose: 'audio-tour', titleEn: 'Al-Aqsa tour',
          }]
          : [],
    ));
    renderPoiTemplate({}, vi.fn(), CONTENT_LOCALES, searchMediaItems);

    fireEvent.click(screen.getByRole('checkbox', { name: 'poi_media_keep_same' }));

    const englishField = screen.getByLabelText('poi_media_en');
    await userEvent.type(englishField, 'Dome');
    await waitFor(() => expect(searchMediaItems).toHaveBeenCalledWith('Dome'));
    fireEvent.click(await screen.findByRole('option', { name: 'Dome of the Rock tour' }));

    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }));

    const arabicField = screen.getByLabelText('poi_media_ar');
    await userEvent.type(arabicField, 'Aqsa');
    await waitFor(() => expect(searchMediaItems).toHaveBeenCalledWith('Aqsa'));
    fireEvent.click(await screen.findByRole('option', { name: 'Al-Aqsa tour' }));

    expect(screen.getByLabelText('poi_media_ar')).toHaveValue('Al-Aqsa tour');

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByLabelText('poi_media_en')).toHaveValue('Dome of the Rock tour');
  });

  it('starts with "keep same media" unchecked, showing each locale\'s own field, when a loaded annotation already has different mediaEn/mediaAr (issue #377)', () => {
    renderPoiTemplate({
      body: [
        {
          language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Dome of the Rock',
        },
      ],
      'dbf:kind': 'POI',
      'dbf:mediaAr': {
        id: 'media-2', mediaType: 'audio', source: 'media-item', thumbnailUrl: null, title: 'Al-Aqsa tour',
      },
      'dbf:mediaEn': {
        id: 'media-1', mediaType: 'audio', source: 'media-item', thumbnailUrl: null, title: 'Dome of the Rock tour',
      },
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, vi.fn(), CONTENT_LOCALES, vi.fn().mockResolvedValue([]));

    expect(screen.getByRole('checkbox', { name: 'poi_media_keep_same' })).not.toBeChecked();
    expect(screen.getByLabelText('poi_media_en')).toHaveValue('Dome of the Rock tour');
    expect(screen.queryByLabelText('poi_media_ar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }));

    expect(screen.queryByLabelText('poi_media_en')).not.toBeInTheDocument();
    expect(screen.getByLabelText('poi_media_ar')).toHaveValue('Al-Aqsa tour');
  });

  it('shows a spinner and disables Save/Cancel while the save is in flight, then re-enables them', async () => {
    let resolveSave;
    const saveAnnotation = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    resolveSave();
    await waitFor(() => expect(screen.getByRole('button', { name: 'save' })).not.toBeDisabled());
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('starts with empty latitude/longitude fields for a new annotation', () => {
    renderPoiTemplate();

    expect(screen.getByLabelText('poi_latitude')).toHaveValue(null);
    expect(screen.getByLabelText('poi_longitude')).toHaveValue(null);
  });

  it('lets the editor type a latitude and longitude, saved as root-level dbf:latitude/dbf:longitude', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.change(screen.getByLabelText('poi_latitude'), { target: { value: '31.7767' } });
    fireEvent.change(screen.getByLabelText('poi_longitude'), { target: { value: '35.2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ 'dbf:latitude': 31.7767, 'dbf:longitude': 35.2345 }),
    );
  });

  it('rehydrates latitude/longitude from an existing annotation\'s dbf:latitude/dbf:longitude', () => {
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': 31.7767,
      'dbf:longitude': 35.2345,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    });

    expect(screen.getByLabelText('poi_latitude')).toHaveValue(31.7767);
    expect(screen.getByLabelText('poi_longitude')).toHaveValue(35.2345);
  });

  it('clears latitude back to null when the field is emptied', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': 31.7767,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.change(screen.getByLabelText('poi_latitude'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalledWith(expect.objectContaining({ 'dbf:latitude': null }));
  });

  it('does not save and shows an error when latitude is out of the WGS84 range, even with a valid target and title', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': 95,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('poi_latitude_invalid')).toBeInTheDocument();
  });

  it('does not save and shows an error when longitude is out of the WGS84 range', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      'dbf:longitude': -200,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('poi_longitude_invalid')).toBeInTheDocument();
  });

  it('saves once an out-of-range latitude is corrected to a valid value', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': 95,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByText('poi_latitude_invalid')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('poi_latitude'), { target: { value: '31.7767' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(screen.queryByText('poi_latitude_invalid')).not.toBeInTheDocument();
    expect(saveAnnotation).toHaveBeenCalledWith(expect.objectContaining({ 'dbf:latitude': 31.7767 }));
  });

  it('saves when latitude and longitude are at the exact edges of the valid WGS84 range', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({
      body: [],
      'dbf:kind': 'POI',
      'dbf:latitude': -90,
      'dbf:longitude': 180,
      id: 'canvas1/annotation/1',
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: 'poi',
      },
      motivation: 'identifying',
      target: {
        selector: [{ type: 'SvgSelector', value: '<svg><circle cx="10" cy="20" r="5"/></svg>' }],
        source: 'canvas1',
      },
    }, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalled();
    expect(screen.queryByText('poi_latitude_invalid')).not.toBeInTheDocument();
    expect(screen.queryByText('poi_longitude_invalid')).not.toBeInTheDocument();
  });
});
