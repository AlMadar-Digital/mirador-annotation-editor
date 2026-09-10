import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../setupTest';
import { render, screen } from './test-utils';
import AnnotationForm from '../src/annotationForm/AnnotationForm';

// AnnotationForm wraps everything in dbf-mirador's ConnectedCompanionWindow, which needs a full
// window/companion-window redux slice this test doesn't set up - swapped for a passthrough so
// these tests can exercise AnnotationForm's own template-resolution logic (picker vs. auto-select,
// issue #333) without depending on Mirador's window chrome.
vi.mock('dbf-mirador', async () => {
  const actual = await vi.importActual('dbf-mirador');
  return {
    ...actual,
    // eslint-disable-next-line react/prop-types -- test-only passthrough stand-in
    ConnectedCompanionWindow: ({ children }) => <div>{children}</div>,
  };
});

/** A minimal playerReferences stub, pre-initialized so AnnotationForm skips its retry loop */
const playerReferences = () => ({
  getCanvases: vi.fn().mockReturnValue([{ id: 'canvas1', index: 0 }]),
  getContainer: vi.fn().mockReturnValue(null),
  getMediaTrueHeight: vi.fn().mockReturnValue(200),
  getMediaTrueWidth: vi.fn().mockReturnValue(300),
  getMediaType: vi.fn().mockReturnValue('Image'),
  getScale: vi.fn().mockReturnValue(1),
  isInitCorrectly: true,
  isInitializedCorrectly: vi.fn().mockReturnValue(true),
});

/** Minimal AnnotationForm props for a new (unsaved) annotation on an Image canvas */
const baseProps = (annotationConfig = {}) => ({
  annotation: {},
  canvases: [{ id: 'canvas1', index: 0 }],
  closeCompanionWindow: vi.fn(),
  config: { annotation: { adapter: vi.fn(), ...annotationConfig } },
  id: 'form1',
  playerReferences: playerReferences(),
  receiveAnnotation: vi.fn(),
  windowId: 'window1',
});

/**
 * Renders AnnotationForm wrapped the same way other template tests wire up i18n/redux.
 * AnnotationFormTemplateSelector/AnnotationFormBody read `config.annotation` from the Redux
 * store (via dbf-mirador's getConfig selector), not from the `config` prop AnnotationForm itself
 * receives - both must be kept in sync here, matching POITemplate.test.js's own pattern.
 * @param {object} props
 */
const renderForm = (props) => render(
  <I18nextProvider i18n={i18n}>
    {/* eslint-disable-next-line react/jsx-props-no-spreading -- forwarding a full test fixture */}
    <AnnotationForm {...props} />
  </I18nextProvider>,
  { preloadedState: { config: props.config } },
);

describe('AnnotationForm', () => {
  it('shows the full template picker for a new annotation when nothing narrows the templates down', () => {
    renderForm(baseProps());

    expect(screen.getByText('note')).toBeInTheDocument();
    expect(screen.getByText('tag')).toBeInTheDocument();
    expect(screen.getByText('poi')).toBeInTheDocument();
    expect(screen.getByText('expert_mode')).toBeInTheDocument();
  });

  it("skips the picker and opens the sole enabled template directly (issue #333: enabledTemplateTypes: ['poi'])", () => {
    renderForm(baseProps({ enabledTemplateTypes: ['poi'] }));

    expect(screen.queryByText('note')).not.toBeInTheDocument();
    expect(screen.queryByText('tag')).not.toBeInTheDocument();
    expect(screen.queryByText('expert_mode')).not.toBeInTheDocument();
    // POITemplate itself rendered (its own section title), not just the picker's "poi" card.
    expect(screen.getByText('poi_description_section')).toBeInTheDocument();
  });

  it('still shows a (now single-card) picker when enabledTemplateTypes disables everything but one AND defaultForm is unset, matching a plain click-through, not a silent auto-open bypass for more than one match', () => {
    renderForm(baseProps({ enabledTemplateTypes: ['poi', 'tagging'] }));

    // More than one enabled template remains - no auto-select, the picker still shows, but only
    // the enabled cards.
    expect(screen.getByText('poi')).toBeInTheDocument();
    expect(screen.getByText('tag')).toBeInTheDocument();
    expect(screen.queryByText('note')).not.toBeInTheDocument();
    expect(screen.queryByText('expert_mode')).not.toBeInTheDocument();
  });

  it('defaultForm still opens its template directly, unaffected by enabledTemplateTypes being unset', () => {
    renderForm(baseProps({ defaultForm: 'poi' }));

    expect(screen.getByText('poi_description_section')).toBeInTheDocument();
  });
});
