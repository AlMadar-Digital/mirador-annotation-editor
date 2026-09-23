import React from 'react';
import { render } from '@testing-library/react';
import PoiNode from '../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/shapes/PoiNode';

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
  fill: '#1e88e5', id: 'poi-1', radius: 10, stroke: '#ffffff', x: 100, y: 50,
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

  it('draws a cross centered on the point, with arms `radius` long', () => {
    renderPoi();
    const context = createContext();

    rendered.shape.sceneFunc(context, { getAbsoluteScale: () => ({ x: 1 }) });

    expect(context.moveTo.mock.calls).toEqual([[-10, 0], [0, -10]]);
    expect(context.lineTo.mock.calls).toEqual([[10, 0], [0, 10]]);
    // white outline under the blue arms
    expect(context.attrs).toEqual(expect.arrayContaining([['strokeStyle', '#ffffff'], ['strokeStyle', '#1e88e5']]));
    expect(context.stroke).toHaveBeenCalledTimes(2);
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
    const konvaShape = {};

    rendered.shape.hitFunc(context, konvaShape);

    expect(context.rect).toHaveBeenCalledWith(-10, -10, 20, 20);
    expect(context.fillStrokeShape).toHaveBeenCalledWith(konvaShape);
  });
});
