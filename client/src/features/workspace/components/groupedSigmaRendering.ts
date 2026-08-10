import type { NodeLabelDrawingFunction } from 'sigma/rendering';

export const LABEL_COLOR = '#d8dee9';

export const drawGroupedNodeLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
  context.textBaseline = 'middle';
  const x = data.x + data.size + 4;
  const width = context.measureText(data.label).width;
  context.fillStyle = '#21252b';
  context.fillRect(x - 3, data.y - settings.labelSize / 2 - 3, width + 6, settings.labelSize + 6);
  context.fillStyle = LABEL_COLOR;
  context.fillText(data.label, x, data.y);
};

export function releaseWebglContext(context: WebGLRenderingContext | WebGL2RenderingContext): void {
  context.getExtension('WEBGL_lose_context')?.loseContext();
}
