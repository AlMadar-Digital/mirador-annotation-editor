import React from 'react';
import { I18nextProvider } from 'react-i18next';
import userEvent from '@testing-library/user-event';
import { i18n } from '../setupTest';
import { fireEvent, render, screen, waitFor } from './test-utils';
import POITemplate, {
  applyPoiBodyConversion,
  convertPoiAnnotationToBeSaved,
  isValidPointTarget,
} from '../src/annotationForm/templates/builtin/POITemplate';
import { TARGET_TOOL_STATE } from '../src/annotationForm/AnnotationFormUtils';
import { SHAPES_TOOL } from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils';

// tetras-dbf/mirador-annotation-editor#4/#21: the POI template's target must be exactly one
// placed POI marker (SHAPES_TOOL.POI, the dedicated click-to-place tool - see
// docs/superpowers/specs/2026-09-01-poi-iiif-annotation-format-design.md in root_repo), so
// getSvg is mocked the same way MultipleBodyTemplate.test.js mocks it, to keep these tests
// independent of react-konva-to-svg's actual serialization.
vi.mock('../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils', async () => {
  const actual = await vi.importActual('../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils');
  return {
    ...actual,
    getSvg: vi.fn().mockResolvedValue('<svg><circle cx="10" cy="20" r="5"/></svg>'),
  };
});

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
      en: { descriptionItems: [], title: "Dome of the Rock" }
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

describe('applyPoiBodyConversion', () => {
  it("builds body with the title as a language-tagged identifying TextualBody", () => {
    const state = basePoiState();

    const result = applyPoiBodyConversion(state);

    expect(result.body[0]).toEqual({
      language: "en",
      purpose: 'identifying',
      type: 'TextualBody',
      value: 'Dome of the Rock',
    });
  });

  it("appends ordered, language-tagged description items, skipping empty ones", () => {
    const state = basePoiState();
    state.maeData.contentByLocale.en.descriptionItems = [
      { key: '1', type: 'TextualBody', value: 'Built in 691 CE' },
      { key: '2', type: 'Image', value: 'https://example.org/dome.jpg' },
      { key: '3', type: 'Sound', value: 'https://example.org/dome.mp3' },
      { key: '4', type: 'TextualBody', value: '' },
    ];

    const result = applyPoiBodyConversion(state);

    expect(result.body.slice(1)).toEqual([
      { language: "en", purpose: "describing", type: "TextualBody", value: "Built in 691 CE" },
      { id: "https://example.org/dome.jpg", language: "en", purpose: "describing", type: "Image" },
      { id: "https://example.org/dome.mp3", language: "en", purpose: "describing", type: "Sound" }
    ]);
  });

  it("appends a MediaItem describing body when a media item is attached, carrying its title", () => {
    const state = basePoiState();
    state.maeData.contentByLocale.en.mediaItem = { documentId: 'media-1', titleEn: 'Dome of the Rock tour' };

    const result = applyPoiBodyConversion(state);

    expect(result.body.slice(1)).toEqual([
      {
        id: 'media-1', language: 'en', purpose: 'describing', title: 'Dome of the Rock tour', type: 'MediaItem'
      },
    ]);
  });

  it("omits the MediaItem body when no media item is attached", () => {
    const result = applyPoiBodyConversion(basePoiState());

    expect(result.body.some((item) => item.type === 'MediaItem')).toBe(false);
  });

  it("builds one identifying + describing group per locale actually present", () => {
    const state = basePoiState();
    state.maeData.contentByLocale.ar = {
      descriptionItems: [{ key: "1", type: "TextualBody", value: "بني عام 691" }],
      title: "قبة الصخرة"
    };

    const result = applyPoiBodyConversion(state);

    expect(result.body).toEqual([
      { language: "en", purpose: "identifying", type: "TextualBody", value: "Dome of the Rock" },
      { language: "ar", purpose: "identifying", type: "TextualBody", value: "قبة الصخرة" },
      { language: "ar", purpose: "describing", type: "TextualBody", value: "بني عام 691" }
    ]);
  });

  it('leaves an existing dbf:journey/dbf:linkedMap untouched - these are Strapi-managed relations, not editable here', () => {
    const state = basePoiState();
    state['dbf:journey'] = { id: 'journey-1', order: 3 };
    state['dbf:linkedMap'] = { id: 'map-7', type: 'Manifest' };

    const result = applyPoiBodyConversion(state);

    expect(result['dbf:journey']).toEqual({ id: 'journey-1', order: 3 });
    expect(result['dbf:linkedMap']).toEqual({ id: 'map-7', type: 'Manifest' });
  });

  it('does not add dbf:journey/dbf:linkedMap when the annotation never had them', () => {
    const result = applyPoiBodyConversion(basePoiState());

    expect(result).not.toHaveProperty('dbf:journey');
    expect(result).not.toHaveProperty('dbf:linkedMap');
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

  const CONTENT_LOCALES = [{ code: "en", name: "English" }, { code: "ar", name: "Arabic" }];

/** Render POITemplate wrapped the same way exampleExternalTemplate.test.js does */
  const renderPoiTemplate = (
    annotation = {},
    saveAnnotation = vi.fn(),
    contentLocales = [],
    searchMediaItems = undefined,
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
    { preloadedState: { config: { annotation: { contentLocales, searchMediaItems } } } }
  );

  it('does not save and shows an error when the target is not a single point', () => {
    const saveAnnotation = vi.fn();
    renderPoiTemplate({}, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('poi_target_must_be_point')).toBeInTheDocument();
  });

  it('adds and removes a description item', () => {
    renderPoiTemplate();

    expect(screen.queryAllByLabelText('poi_remove_description_item')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'poi_add_description_item' }));
    expect(screen.getAllByLabelText('poi_remove_description_item')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('poi_remove_description_item'));
    expect(screen.queryAllByLabelText('poi_remove_description_item')).toHaveLength(0);
  });

  it('rehydrates title and description items from an existing annotation body', () => {
    renderPoiTemplate({
      body: [
        { language: "en", purpose: "identifying", type: "TextualBody", value: "Dome of the Rock" },
        { language: "en", purpose: "describing", type: "TextualBody", value: "Built in 691 CE" }
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
    expect(screen.getByDisplayValue('Built in 691 CE')).toBeInTheDocument();
  });

  it("hides the language selector when fewer than two content locales are configured", () => {
    renderPoiTemplate({}, vi.fn(), [{ code: "en", name: "English" }]);

    expect(screen.queryByText("poi_language")).not.toBeInTheDocument();
  });

  it("switching the language selector shows that locale's own title, independent of the others", () => {
    renderPoiTemplate({
      body: [
        { language: "en", purpose: "identifying", type: "TextualBody", value: "Dome of the Rock" },
        { language: "ar", purpose: "identifying", type: "TextualBody", value: "قبة الصخرة" }
      ],
      "dbf:kind": "POI",
      id: "canvas1/annotation/1",
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: "poi"
      },
      motivation: "identifying",
      target: {
        selector: [{ type: "SvgSelector", value: "<svg><circle cx=\"10\" cy=\"20\" r=\"5\"/></svg>" }],
        source: "canvas1"
      }
    }, vi.fn(), CONTENT_LOCALES);

    expect(screen.getByDisplayValue("Dome of the Rock")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText("poi_language"));
    fireEvent.click(screen.getByRole("option", { name: "Arabic" }));

    expect(screen.getByDisplayValue("قبة الصخرة")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Dome of the Rock")).not.toBeInTheDocument();
  });

  it("does not render a media item field when no searchMediaItems capability is configured", () => {
    renderPoiTemplate();

    expect(screen.queryByText("poi_media_item")).not.toBeInTheDocument();
  });

  it("lets the editor search and attach a media item, then reflects the pick", async () => {
    const searchMediaItems = vi.fn().mockResolvedValue([
      { documentId: "media-1", mediaType: "audio", purpose: "audio-tour", titleEn: "Dome of the Rock tour" },
    ]);
    renderPoiTemplate({}, vi.fn(), [], searchMediaItems);

    const mediaField = screen.getByLabelText("poi_media_item");
    await userEvent.type(mediaField, "Dome");

    await waitFor(() => expect(searchMediaItems).toHaveBeenCalledWith("Dome"));
    fireEvent.click(await screen.findByRole("option", { name: "Dome of the Rock tour" }));

    expect(screen.getByLabelText("poi_media_item")).toHaveValue("Dome of the Rock tour");
  });

  it("rehydrates an already-attached media item from the saved annotation body", () => {
    renderPoiTemplate({
      body: [
        { language: "en", purpose: "identifying", type: "TextualBody", value: "Dome of the Rock" },
        {
          id: "media-1", language: "en", purpose: "describing", title: "Dome of the Rock tour", type: "MediaItem"
        },
      ],
      "dbf:kind": "POI",
      id: "canvas1/annotation/1",
      maeData: {
        target: { drawingState: JSON.stringify({ shapes: [poiShape()] }) },
        templateType: "poi"
      },
      motivation: "identifying",
      target: {
        selector: [{ type: "SvgSelector", value: "<svg><circle cx=\"10\" cy=\"20\" r=\"5\"/></svg>" }],
        source: "canvas1"
      }
    }, vi.fn(), [], vi.fn().mockResolvedValue([]));

    expect(screen.getByLabelText("poi_media_item")).toHaveValue("Dome of the Rock tour");
  });
});
