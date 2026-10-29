/**
 * A chart on the report as a PNG, for the Word file (29 October): the Word
 * file had the maps but not the charts, which are drawn in the page as SVG.
 *
 * The chart's SVG is drawn on a canvas at twice its size; its legend, which
 * the chart library writes as HTML beside the SVG, is drawn under it, swatch
 * and words. Returns { data: ArrayBuffer, width, height } or null when the
 * browser cannot draw it (no canvas, as in the tests) — the Word file then
 * goes without that chart rather than not at all.
 */
const SCALE = 2;
const FONT = 'Arial, Helvetica, sans-serif';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error('timed out')), 5000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('could not load'));
    };
    image.src = url;
  });
}

export async function chartPng(holder) {
  // The chart's own SVG, not one of its legend's little icons (also "recharts-surface").
  const svg = holder?.querySelector('.recharts-wrapper > svg.recharts-surface');
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const width = Math.round(box.width);
  const height = Math.round(box.height);
  if (!width || !height) return null;

  const legend = [...holder.querySelectorAll('.recharts-legend-item')].map((item) => ({
    colour: item.querySelector('path, rect')?.getAttribute('fill') || item.querySelector('path, rect')?.getAttribute('stroke') || '#64748b',
    text: item.querySelector('.recharts-legend-item-text')?.textContent ?? item.textContent ?? '',
  }));
  const legendHeight = legend.length ? 18 * Math.ceil(legend.length / 3) + 6 : 0;

  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = (height + legendHeight) * SCALE;
  const context = canvas.getContext?.('2d');
  if (!context) return null;

  // The SVG on its own carries no page styles: give it its size and a font.
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.setAttribute('style', `font-family:${FONT};font-size:9px;background:#fff`);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, width * SCALE, height * SCALE);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }

  // The legend, three to a row.
  context.font = `${10 * SCALE}px ${FONT}`;
  context.textBaseline = 'middle';
  const column = width / 3;
  legend.forEach((entry, i) => {
    const x = (i % 3) * column + 8;
    const y = height + 6 + Math.floor(i / 3) * 18 + 9;
    context.fillStyle = entry.colour;
    context.fillRect(x * SCALE, (y - 5) * SCALE, 10 * SCALE, 10 * SCALE);
    context.fillStyle = '#334155';
    context.fillText(entry.text, (x + 15) * SCALE, y * SCALE, (column - 26) * SCALE);
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return { data: await blob.arrayBuffer(), width, height: height + legendHeight };
}
