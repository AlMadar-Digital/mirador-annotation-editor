import React from 'react';
import { render } from '@testing-library/react';
import PoiNode, { CROSS_ARM_PX } from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/shapes/PoiNode';

const rendered = {};

vi.mock('react-konva', () => ({
  Group: (props) => {
    rendered.group = props;
    return props.children;
  },
  Shape: (props) => {
    rendered.shape = props;
    return null;
  },
}));

/** A Konva scene/hit context stand-in recording its calls */
const createContext = () => ({
  attrs: [],
  beginPath: vi.fn(),
  closePath: vi.fn(),
  fillStrokeShape: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  rect: vi.fn(),
  /** Records an attribute set on the context */
  setAttr(name, value) { this.attrs.push([name, value]); },
  stroke: vi.fn(),
});

const shape = {
  fill: '#1e88e5', id: 'poi-1', stroke: '#ffffff', x: 100, y: 50,
};

/** Renders the POI marker for `shape` */
const renderPoi = () => render(
  <PoiNode
    handleDragEnd={vi.fn()}
    handleDragStart={vi.fn()}
    onShapeClick={vi.fn()}
    shape={shape}
  />,
);

describe('PoiNode', () => {
  it('puts the marker id and position on the draggable node, which the drag handlers read back', () => {
    renderPoi();

    expect(rendered.group).toEqual(expect.objectContaining({
      draggable: true, id: 'poi-1', x: 100, y: 50,
    }));
  });

  it('draws a cross centered on the point, with arms CROSS_ARM_PX long at zoom 1', () => {
    renderPoi();
    const context = createContext();

    rendered.shape.sceneFunc(context, { getAbsoluteScale: () => ({ x: 1 }) });

    expect(context.moveTo.mock.calls).toEqual([[-CROSS_ARM_PX, 0], [0, -CROSS_ARM_PX]]);
    expect(context.lineTo.mock.calls).toEqual([[CROSS_ARM_PX, 0], [0, CROSS_ARM_PX]]);
    // white outline under the blue arms
    expect(context.attrs).toEqual(expect.arrayContaining([['strokeStyle', '#ffffff'], ['strokeStyle', '#1e88e5']]));
    expect(context.stroke).toHaveBeenCalledTimes(2);
  });

  // AlMadar-Digital/map-mirador#17: arms sized in image pixels shrank to a dot on high-res
  // images shown zoomed out, so the arm length is counter-scaled by the zoom like line widths.
  it.each([0.05, 0.5, 4])('keeps its arms the same length on screen at zoom %p', (zoom) => {
    renderPoi();
    const context = createContext();

    rendered.shape.sceneFunc(context, { getAbsoluteScale: () => ({ x: zoom }) });

    const [[armStart]] = context.moveTo.mock.calls;
    expect(-armStart * zoom).toBeCloseTo(CROSS_ARM_PX);
  });

  it('keeps its line widths constant on screen whatever the zoom', () => {
    renderPoi();
    const context = createContext();

    rendered.shape.sceneFunc(context, { getAbsoluteScale: () => ({ x: 0.5 }) });

    const lineWidths = context.attrs.filter(([name]) => name === 'lineWidth').map(([, value]) => value);
    expect(lineWidths).toEqual([14, 6]);
  });

  it('can be grabbed anywhere in the square around the cross, not just on its arms', () => {
    renderPoi();
    const context = createContext();
    const konvaShape = { getAbsoluteScale: () => ({ x: 0.5 }) };

    rendered.shape.hitFunc(context, konvaShape);

    // the grab square follows the drawn cross, so it is counter-scaled by the zoom too
    const arm = CROSS_ARM_PX / 0.5;
    expect(context.rect).toHaveBeenCalledWith(-arm, -arm, arm * 2, arm * 2);
    expect(context.fillStrokeShape).toHaveBeenCalledWith(konvaShape);
  });
});
