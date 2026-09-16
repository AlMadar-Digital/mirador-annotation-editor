import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../setupTest';
import { fireEvent, render, screen } from './test-utils';
import JourneyTemplate, {
  convertJourneyAnnotationToBeSaved,
} from '../src/annotationForm/templates/builtin/JourneyTemplate';

// Same CKEditor stand-in as POITemplate.test.js - see that file's own comment for why.
vi.mock('../src/annotationForm/templates/templateComponents/RichTextField', () => ({
  // eslint-disable-next-line react/prop-types -- test-only stand-in
  RichTextField: ({ onChange, rtl, value }) => (
    <textarea
      data-rtl={rtl ? 'true' : 'false'}
      data-testid="journey-description"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

const CONTENT_LOCALES = [{ code: 'en', name: 'English' }, { code: 'ar', name: 'Arabic' }];

/** A minimal, valid JourneyTemplate annotationState, with both locales' titles filled */
const baseJourneyState = () => ({
  body: [
    {
      language: 'en', purpose: 'identifying', type: 'TextualBody', value: 'Old City Walk',
    },
    {
      language: 'ar', purpose: 'identifying', type: 'TextualBody', value: 'جولة المدينة القديمة',
    },
  ],
  'dbf:kind': 'Journey',
  id: 'canvas1/annotation/1',
  maeData: {
    contentByLocale: {
      ar: { description: '', title: 'جولة المدينة القديمة' },
      en: { description: '', title: 'Old City Walk' },
    },
    templateType: 'journey',
  },
  motivation: 'identifying',
  target: 'canvas1',
});

describe('convertJourneyAnnotationToBeSaved', () => {
  it('preserves motivation and dbf:kind, and sets target to the whole canvas', async () => {
    const state = baseJourneyState();

    const result = await convertJourneyAnnotationToBeSaved(state, { canvas: { id: 'canvas1' } });

    expect(result.motivation).toBe('identifying');
    expect(result['dbf:kind']).toBe('Journey');
    expect(result.target).toBe('canvas1');
  });
});

describe('JourneyTemplate (render)', () => {
  /** Identity translation stub, matching POITemplate.test.js's convention */
  const mockT = (key) => key;

  /** Render JourneyTemplate wrapped the same way POITemplate.test.js does */
  const renderJourneyTemplate = (
    annotation = {},
    saveAnnotation = vi.fn(),
    contentLocales = [],
  ) => render(
    <I18nextProvider i18n={i18n}>
      <JourneyTemplate
        annotation={annotation}
        closeFormCompanionWindow={vi.fn()}
        saveAnnotation={saveAnnotation}
        t={mockT}
      />
    </I18nextProvider>,
    { preloadedState: { config: { annotation: { contentLocales } } } },
  );

  it('does not save and shows an error when a configured locale is missing its title', () => {
    const saveAnnotation = vi.fn();
    const state = baseJourneyState();
    state.body = state.body.filter((item) => item.language !== 'ar');
    renderJourneyTemplate(state, saveAnnotation, CONTENT_LOCALES);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('journey_title_required')).toBeInTheDocument();
  });

  it('does not save a brand-new journey with no title yet, once locales are configured', () => {
    const saveAnnotation = vi.fn();
    renderJourneyTemplate({}, saveAnnotation, CONTENT_LOCALES);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).not.toHaveBeenCalled();
    expect(screen.getByText('journey_title_required')).toBeInTheDocument();
  });

  it('saves once every configured locale has a title', () => {
    const saveAnnotation = vi.fn();
    renderJourneyTemplate(baseJourneyState(), saveAnnotation, CONTENT_LOCALES);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalled();
    expect(screen.queryByText('journey_title_required')).not.toBeInTheDocument();
  });

  it('saves without a title requirement when no content locales are configured', () => {
    const saveAnnotation = vi.fn();
    renderJourneyTemplate({}, saveAnnotation);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(saveAnnotation).toHaveBeenCalled();
  });
});
