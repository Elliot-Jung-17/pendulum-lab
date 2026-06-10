/**
 * Minimal structural subset of CanvasRenderingContext2D used by the renderers.
 * The real browser context satisfies this interface, and a lightweight test
 * stub can implement just these members — so the renderers unit-test in Node
 * without a DOM canvas.
 */
export interface CtxGradient {
  addColorStop(offset: number, color: string): void;
}

export interface Ctx2D {
  // Widened to the DOM union so a real CanvasRenderingContext2D satisfies this
  // interface (the property is mutable/invariant). A test stub only ever
  // assigns strings, which are in the union.
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CtxGradient;
}

/** Pixel rectangle a renderer draws into. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inset, in pixels, reserved for axis labels and ticks. */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
