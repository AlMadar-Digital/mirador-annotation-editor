import React, {
  forwardRef, useContext, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import DeleteIcon from '@mui/icons-material/DeleteForever';
import EditIcon from '@mui/icons-material/Edit';
import MapIcon from '@mui/icons-material/Map';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ToggleButton from '@mui/material/ToggleButton';
import SettingsIcon from '@mui/icons-material/Settings';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import flatten from 'lodash/flatten';
import { Tooltip } from '@mui/material';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import InfoIcon from '@mui/icons-material/Info';
import RouteIcon from '@mui/icons-material/Route';
import AnnotationActionsContext from './AnnotationActionsContext';
import WhoAndWhenFormSection, { TOOLTIP_MODE } from './annotationForm/WhoAndWhenFormSection';
import HotkeyTooltip from "./hotkeys/HotkeyTooltip";

// TODO missing TRAD
const CanvasListItem = forwardRef((props, ref) => {
  const theme = useTheme();
  const [isHovering, setIsHovering] = useState(false);
  const [journeyMenuAnchor, setJourneyMenuAnchor] = useState(null);
  const context = useContext(AnnotationActionsContext);
  // Maps-only (issue #377): a poi row's own list of assignable journeys, its current journey
  // (if any) and the callback to reassign it - undefined for every other annotation kind this
  // generic list-item wrapper renders (tagging/notes/expert-mode), so the button below never
  // shows for those. Pulled out before the `{...restProps}` spread onto the raw <li> further
  // down - passing a function/array prop straight through would produce an invalid DOM attribute.
  const {
    currentJourneyId, journeys, onMoveToJourney, ...restProps
  } = props;

  const annotationData = useMemo(() => {
    const { annotationid } = props;
    const {
      canvases,
      annotationsOnCanvases,
    } = context;
    let annotation;
    canvases.some((canvas) => {
      if (annotationsOnCanvases[canvas.id]) {
        Object.entries(annotationsOnCanvases[canvas.id])
          .forEach(([key, value]) => {
            if (value.json && value.json.items) {
              annotation = value.json.items.find((anno) => anno.id === annotationid);
              if (annotation) {
                return annotation;
              }
            }
          });
      }
      return (annotation);
    });
    return annotation;
    // include context deps to avoid stale reads when style-only changes are present
  }, [props.annotationid, context.canvases, context.annotationsOnCanvases]);

  /**
     * Handle deletion of annotation.
     * @function
     * @name handleDelete
     * @returns {void}
     */
  const handleDelete = () => {
    const {
      canvases,
      receiveAnnotation,
      storageAdapter,
    } = context;
    const { annotationid } = props;
    canvases.forEach((canvas) => {
      const adapter = storageAdapter(canvas.id);
      adapter.delete(annotationid)
        .then((annoPage) => {
          receiveAnnotation(canvas.id, adapter.annotationPageId, annoPage);
        });
    });
  };
  /**
   * Handles editing of an annotation.
   * @function handleEdit
   * @returns {void}
   */
  const handleEdit = () => {
    const {
      addCompanionWindow,
    } = context;
    const { annotationid } = props;

    addCompanionWindow('annotationCreation', {
      annotationid,
      position: 'right',
    });
  };
  /**
   * Opens a read-only preview of this annotation in a companion window (issue #375).
   * Unlike 'annotationCreation', 'mapsPoiPreview' isn't a companion window type this
   * package registers itself - it's the maps plugin's own (see platform's
   * poiPreviewPlugin.tsx, registered into the same Mirador.viewer plugins array
   * alongside this package's), rendering whatever it finds via the companion window's own
   * `annotationid` prop rather than "whatever's currently selected".
   * @function handlePreview
   * @returns {void}
   */
  const handlePreview = () => {
    const {
      addCompanionWindow,
    } = context;
    const { annotationid } = props;

    addCompanionWindow('mapsPoiPreview', {
      annotationid,
      position: 'right',
    });
  };
  /**
   * Opens the map linked to a Nested Map point (issue #350/#407) in a brand new Mirador
   * window, instead of previewing it in a companion window like a plain POI/Journey does.
   * Delegates the actual "how" (building the manifest URL, dispatching addWindow) to the
   * host app via `config.annotation.openLinkedMap`, the same way searchMaps/searchMediaItems
   * etc. are host-supplied - this package has no notion of Strapi's manifest endpoint.
   * @function handleOpenNestedMap
   * @returns {void}
   */
  const handleOpenNestedMap = () => {
    context.config?.annotation?.openLinkedMap?.(annotationData?.['dbf:linkedMap']);
  };
    /**
     * Checks if a given annotation ID is editable.
     * @returns {boolean} Returns true if the annotation ID is editable, false otherwise.
     */
  const editable = () => {
    const {
      annotationsOnCanvases,
      canvases,
    } = context;
    const { annotationid } = props;
    const annoIds = canvases.map((canvas) => {
      if (annotationsOnCanvases[canvas.id]) {
        // returns the id of all editable annotations for all canvases in `annotationsOnCanvas`
        return flatten(Object.entries(annotationsOnCanvases[canvas.id])
          .map(([key, value]) => {
            if (value.json && value.json.items) {
              return value.json.items.filter((item) => item.maeData)
                .map((item) => item.id);
            }
            return [];
          }));
      }
      return [];
    });
    return flatten(annoIds)
      .includes(annotationid);
  };

  /** Opens the "move to journey" menu, anchored to the button that triggered it. */
  const handleOpenJourneyMenu = (event) => {
    setJourneyMenuAnchor(event.currentTarget);
  };
  /** Closes the "move to journey" menu. */
  const handleCloseJourneyMenu = () => setJourneyMenuAnchor(null);
  /** Assigns this poi to `journeyId`, or detaches it (back to a standalone top-level poi)
   * when `journeyId` is null - issue #377, a non-drag alternative to reparenting a poi into a
   * journey, since dragging into an empty journey's own nested list proved unreliable. */
  const handleSelectJourney = (journeyId) => {
    onMoveToJourney?.(journeyId);
    handleCloseJourneyMenu();
  };

  // TODO perhaps M4 regression with props
  const { t } = useTranslation();

  return (
    <div
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className="mirador-annotation-list-item"
      data-testid="mirador-annotation-list-item"
      ref={ref}
    >
      {(isHovering && editable()) && (
        <div>
          <ToggleButtonGroup
            aria-label="annotation tools"
            size="small"
            sx={{
              bgcolor: theme.palette.background.paper,
              borderRadius: theme.shape.borderRadius,
              boxShadow: theme.shadows[2],
              position: 'absolute',
              right: 0,
              zIndex: theme.zIndex.modal + 1,
            }}
          >
            {context.config?.annotation.debug && (
            <Tooltip title={t('debugAnnotation')}>
              <span>
                <ToggleButton
                  aria-label="Debug"
                  onClick={() => console.log(annotationData)}
                  value="debug"
                >
                  <SettingsIcon />
                </ToggleButton>
              </span>
            </Tooltip>
            )}

            {!!annotationData?.creator && (
            <Tooltip
              title={(
                <WhoAndWhenFormSection
                  creator={annotationData.creator}
                  creationDate={annotationData.creationDate}
                  lastEditor={annotationData.lastEditor}
                  lastSavedDate={annotationData.lastSavedDate}
                  displayMode={TOOLTIP_MODE}
                  t={t}
                />
                                )}
            >
              <span>
                <ToggleButton aria-label="Metadata" value="metadata">
                  <InfoIcon />
                </ToggleButton>
              </span>
            </Tooltip>
            )}

            {!!annotationData?.['dbf:linkedMap'] && (
            <Tooltip title={t('openNestedMap')}>
              <span>
                <ToggleButton
                  aria-label="Open nested map"
                  onClick={handleOpenNestedMap}
                  value="open-nested-map"
                >
                  <MapIcon />
                </ToggleButton>
              </span>
            </Tooltip>
            )}

            {!annotationData?.['dbf:linkedMap'] && !!annotationData?.['dbf:kind'] && (
            <Tooltip title={t('previewAnnotation')}>
              <span>
                <ToggleButton
                  aria-label="Preview"
                  onClick={handlePreview}
                  value="preview"
                  disabled={!context.annotationPreviewCompanionWindowIsOpened}
                >
                  <VisibilityIcon />
                </ToggleButton>
              </span>
            </Tooltip>
            )}

            {context.config?.annotation?.readonly !== true
              && !!journeys && (journeys.length > 0 || !!currentJourneyId) && (
              <Tooltip title={t('move_to_journey')}>
                <span>
                  <ToggleButton
                    aria-label="Move to journey"
                    onClick={handleOpenJourneyMenu}
                    value="move-to-journey"
                    disabled={!context.annotationEditCompanionWindowIsOpened}
                  >
                    <RouteIcon />
                  </ToggleButton>
                </span>
              </Tooltip>
            )}

            {context.config?.annotation?.readonly !== true && [
              <Tooltip
                title={t('edit_annotation')}
                key="edit"
              >
                <span>
                  <ToggleButton
                    aria-label="Edit"
                    onClick={context.windowViewType === 'single' ? handleEdit : context.toggleSingleCanvasDialogOpen}
                    value="edit"
                    disabled={!context.annotationEditCompanionWindowIsOpened}
                  >
                    <EditIcon />
                  </ToggleButton>
                </span>
              </Tooltip>,

              <Tooltip title={<HotkeyTooltip label={t('deleteAnnotation')} action="delete" />} key="delete">
                <span>
                  <ToggleButton
                    aria-label="Delete"
                    onClick={handleDelete}
                    value="delete"
                    disabled={!context.annotationEditCompanionWindowIsOpened}
                  >
                    <DeleteIcon />
                  </ToggleButton>
                </span>
              </Tooltip>,
            ]}
          </ToggleButtonGroup>
        </div>

      )}
      {!!journeys && (
        <Menu
          anchorEl={journeyMenuAnchor}
          onClose={handleCloseJourneyMenu}
          open={!!journeyMenuAnchor}
        >
          {!!currentJourneyId && [
            <MenuItem key="none" onClick={() => handleSelectJourney(null)}>
              {t('remove_from_journey')}
            </MenuItem>,
            <Divider key="divider" />,
          ]}
          {journeys.map((journey) => (
            <MenuItem
              key={journey.id}
              onClick={() => handleSelectJourney(journey.id)}
              selected={journey.id === currentJourneyId}
            >
              {journey.title}
            </MenuItem>
          ))}
        </Menu>
      )}
      {/* eslint-disable-next-line react/jsx-props-no-spreading */}
      <li {...restProps}>
        {props.children}
      </li>
    </div>
  );
});

CanvasListItem.propTypes = {
  annotationEditCompanionWindowIsOpened: PropTypes.bool.isRequired,
  annotationid: PropTypes.string.isRequired,
  children: PropTypes.oneOfType([PropTypes.func, PropTypes.node]).isRequired,
  currentJourneyId: PropTypes.string,
  journeys: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  })),
  onMoveToJourney: PropTypes.func,
};

CanvasListItem.defaultProps = {
  currentJourneyId: null,
  journeys: undefined,
  onMoveToJourney: undefined,
};

export default CanvasListItem;
