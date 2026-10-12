import Konva from "konva";
import { rgbaToObj } from "../src/annotationForm/AnnotationFormOverlay/KonvaDrawing/KonvaUtils";

// The app relies on Konva being available as a global (see getKonvaStage), so mirror that here.
window.Konva = Konva;

// Regression coverage for a real bug: POI markers use a hex stroke color ('#ffffff'), but
// rgbaToObj used to assume its input was always a full rgba(...) string and crashed trying to
// read rgbaArray[3] on any other CSS color format (hex, rgb(), named colors) — breaking
// annotation save (via getSvg -> cleanNode) for any shape using such a color.
describe("rgbaToObj", () => {
  it("parses a hex color, defaulting alpha to 1", () => {
    expect(rgbaToObj("#ffffff")).toEqual({
      r: 255, g: 255, b: 255, a: 1
    });
  });

  it("parses an rgb() color with no alpha channel, defaulting alpha to 1", () => {
    expect(rgbaToObj("rgb(229,57,53)")).toEqual({
      r: 229, g: 57, b: 53, a: 1
    });
  });

  it("parses a full rgba() color", () => {
    expect(rgbaToObj("rgba(255,0,0,0.5)")).toEqual({
      r: 255, g: 0, b: 0, a: 0.5
    });
  });
});
