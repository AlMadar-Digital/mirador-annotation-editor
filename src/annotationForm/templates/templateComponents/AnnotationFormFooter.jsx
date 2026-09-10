import {
  Button, CircularProgress, Divider, Grid, Tooltip,
} from '@mui/material';
import PropTypes from 'prop-types';
import React, { useEffect, useRef } from 'react';
import WhoAndWhenFormSection, { SECTION_MODE } from '../../WhoAndWhenFormSection';
import { MAE_SAVE_EVENT } from '../../../hotkeys/hotkeysEvents';
import HotkeyTooltip from '../../../hotkeys/HotkeyTooltip';

/** Annotation form footer, save or cancel the edition/creation of an annotation */
function AnnotationFormFooter({
  annotationState,
  closeFormCompanionWindow,
  saveAnnotation,
  saving,
  t,
}) {
  // Refs to not re-register the listener on every render, while still reading each render's
  // latest saveAnnotation/saving (the effect's own closure only ever sees their initial values).
  const saveRef = useRef(saveAnnotation);
  saveRef.current = saveAnnotation;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  useEffect(() => {
    /** When MAE_SAVE_EVENT triggers, validate form and save annotation - unless a save from
     * a previous trigger (this event, or the Save button) is already in flight. */
    const handleSave = () => {
      if (!savingRef.current) saveRef.current();
    };
    document.addEventListener(MAE_SAVE_EVENT, handleSave);
    return () => document.removeEventListener(MAE_SAVE_EVENT, handleSave);
  }, []);

  return (
    <>
      {
        (annotationState.creator && annotationState.creationDate) && (
          <Grid container>
            <WhoAndWhenFormSection
              lastSavedDate={annotationState.lastSavedDate}
              lastEditor={annotationState.lastEditor}
              creator={annotationState.creator}
              creationDate={annotationState.creationDate}
              displayMode={SECTION_MODE}
              t={t}
            />
          </Grid>
        )
      }
      <Divider sx={{ m: 1 }} />
      <Grid sx={{ mt: 1 }} container spacing={1} justifyContent="flex-end">
        <Tooltip title={<HotkeyTooltip label={t('cancel')} action="escape" />}>
          <Button
            sx={{ m: 1 }}
            disabled={saving}
            onClick={closeFormCompanionWindow}
          >
            {t('cancel')}
          </Button>
        </Tooltip>
        <Tooltip title={<HotkeyTooltip label={t('save')} action="save" />}>
          <Button
            sx={{ m: 1 }}
            variant="contained"
            color="primary"
            type="submit"
            disabled={saving}
            startIcon={saving ? <CircularProgress color="inherit" size={16} /> : undefined}
            onClick={saveAnnotation}
          >
            {t('save')}
          </Button>
        </Tooltip>
      </Grid>
    </>
  );
}

AnnotationFormFooter.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  annotationState: PropTypes.object.isRequired,
  closeFormCompanionWindow: PropTypes.func.isRequired,
  saveAnnotation: PropTypes.func.isRequired,
  saving: PropTypes.bool,
  t: PropTypes.func.isRequired,
};

AnnotationFormFooter.defaultProps = {
  saving: false,
};

export default AnnotationFormFooter;
