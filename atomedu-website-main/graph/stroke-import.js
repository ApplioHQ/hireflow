// Turn browser ImageData into editable, color-preserving graph strokes. The
// only formula text emitted here is assembled from finite numbers and fixed
// LaTeX tokens; source pixels are never interpreted as expressions.
const MAX_EXPRESSIONS = 640;
const MAX_COLUMNS = 160;
const MAX_ROWS = 72;
const COLOR_TOLERANCE = 24;

function validateImage(imageData) {
  if (!imageData || typeof imageData !== 'object') throw new TypeError('Image data is required.');
  const { width, height, data } = imageData;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1)
    throw new RangeError('Image width and height must be positive safe integers.');
  if (!(data instanceof Uint8ClampedArray) || !Number.isSafeInteger(width * height * 4)
    || data.length !== width * height * 4)
    throw new TypeError('Image data must be an RGBA Uint8ClampedArray of the stated dimensions.');
  return { width, height, data };
}

function decimal(value) {
  // Fixed notation avoids exponents in the LaTeX parser and preserves narrow
  // image bounds. Rounding also keeps the visible formulas compact.
  const result = value.toFixed(12).replace(/\.?0+$/, '');
  return result === '' || result === '-0' ? '0' : result;
}

function channelHex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function mean(run) { return run.sum.map(channel => channel / run.count); }

function colorDistance(a, b) {
  const left = mean(a), right = mean(b);
  return Math.max(...left.map((channel, i) => Math.abs(channel - right[i])));
}

function samplePixels(width, height, data, columns, rows) {
  const xEdges = Array.from({ length: columns + 1 }, (_, i) => Math.floor(i * width / columns));
  const yEdges = Array.from({ length: rows + 1 }, (_, i) => Math.floor(i * height / rows));
  const colors = [];
  for (let row = 0; row < rows; row++) {
    const scanline = [];
    for (let column = 0; column < columns; column++) {
      const sum = [0, 0, 0];
      for (let y = yEdges[row]; y < yEdges[row + 1]; y++) for (let x = xEdges[column]; x < xEdges[column + 1]; x++) {
        const offset = (y * width + x) * 4, alpha = data[offset + 3] / 255;
        for (let channel = 0; channel < 3; channel++)
          sum[channel] += 255 + (data[offset + channel] - 255) * alpha;
      }
      const count = (xEdges[column + 1] - xEdges[column]) * (yEdges[row + 1] - yEdges[row]);
      scanline.push(sum.map(channel => channel / count));
    }
    colors.push(scanline);
  }
  return { colors, xEdges };
}

function segmentScanline(colors) {
  const runs = [];
  for (let x = 0; x < colors.length; x++) {
    const pixel = colors[x], previous = runs.at(-1);
    if (previous && Math.max(...pixel.map((channel, i) => Math.abs(channel - previous.sum[i] / previous.count))) <= COLOR_TOLERANCE) {
      previous.end = x + 1;
      previous.count++;
      for (let channel = 0; channel < 3; channel++) previous.sum[channel] += pixel[channel];
    } else runs.push({ start: x, end: x + 1, count: 1, sum: pixel.slice() });
  }
  return runs;
}

function mergeCost(left, right) {
  const a = mean(left), b = mean(right);
  const contrast = a.reduce((sum, channel, i) => sum + (channel - b[i]) ** 2, 0);
  // Give narrow, high-contrast features more weight than their area alone.
  return contrast * Math.sqrt(Math.min(left.count, right.count));
}

function reduceRuns(runs, target) {
  while (runs.length > target) {
    let best = 0, cost = Infinity;
    for (let i = 0; i < runs.length - 1; i++) {
      const candidate = mergeCost(runs[i], runs[i + 1]);
      if (candidate < cost) { cost = candidate; best = i; }
    }
    const left = runs[best], right = runs[best + 1];
    runs.splice(best, 2, {
      start: left.start, end: right.end, count: left.count + right.count,
      sum: left.sum.map((channel, i) => channel + right.sum[i]),
    });
  }
  return runs;
}

function allocateRuns(scanlines, limit) {
  const allocations = scanlines.map(() => 1);
  let remaining = limit - scanlines.length;
  while (remaining > 0) {
    let selected = -1, priority = -Infinity;
    for (let row = 0; row < scanlines.length; row++) {
      const runs = scanlines[row];
      if (allocations[row] >= runs.length) continue;
      const variation = runs.slice(1).reduce((total, run, i) => total + colorDistance(runs[i], run), 0);
      const score = variation / (allocations[row] + 1);
      if (score > priority) { priority = score; selected = row; }
    }
    if (selected < 0) break;
    allocations[selected]++;
    remaining--;
  }
  return scanlines.map((runs, row) => reduceRuns(runs, allocations[row]));
}

function fittedBounds(width, height) {
  const aspect = width / height;
  const spanX = Math.min(16, 9 * aspect), spanY = Math.min(9, 16 / aspect);
  return { xMin: -spanX / 2, xMax: spanX / 2, yMin: -spanY / 2, yMax: spanY / 2 };
}

function stroke(run, row, xEdges, width, bounds, rows, style) {
  const spanX = bounds.xMax - bounds.xMin, spanY = bounds.yMax - bounds.yMin;
  const x0 = bounds.xMin + xEdges[run.start] / width * spanX;
  const x1 = bounds.xMin + xEdges[run.end] / width * spanX;
  const base = bounds.yMax - (row + .5) / rows * spanY;
  const rowHeight = spanY / rows;
  let formula;
  if (style === 'waves') {
    const amplitude = rowHeight * .48;
    const cycles = Math.max(1, Math.min(4, (run.end - run.start) / 8));
    const frequency = 2 * Math.PI * cycles / (x1 - x0);
    const phase = (row % 7) * .41 + (run.start % 5) * .17;
    formula = `${decimal(base)}+${decimal(amplitude)}\\sin(${decimal(frequency)}x+${decimal(phase)})`;
  } else {
    // Tilt each bounded segment enough to read as a line, even for narrow
    // color runs, while staying within its source scanline.
    const slope = (row % 2 ? -1 : 1) * rowHeight * .35 / (x1 - x0);
    const intercept = base - slope * (x0 + x1) / 2;
    formula = `${decimal(intercept)}${slope < 0 ? '-' : '+'}${decimal(Math.abs(slope))}x`;
  }
  const color = '#' + mean(run).map(channelHex).join('');
  // Pixel width for an 800x450 rendering of the fitted 16x9 graph frame.
  const strokeWidth = Math.max(.001, Number((450 * spanY / 9 / rows * (style === 'waves' ? .72 : 1.06)).toFixed(3)));
  return {
    expression: `\\begin{cases}${formula} & ${decimal(x0)}\\le x\\le ${decimal(x1)}\\end{cases}`,
    color, strokeWidth, visible: true, imported: true,
  };
}

export function imageToGraphStrokes(imageData, { style = 'waves', maxExpressions = 480 } = {}) {
  const { width, height, data } = validateImage(imageData);
  if (style !== 'waves' && style !== 'lines') throw new RangeError('style must be waves or lines.');
  if (typeof maxExpressions !== 'number' || !Number.isFinite(maxExpressions) || maxExpressions < 1)
    throw new RangeError('maxExpressions must be a positive finite number.');
  const limit = Math.min(MAX_EXPRESSIONS, Math.floor(maxExpressions));
  const rows = Math.min(height, MAX_ROWS, Math.max(1, Math.floor(limit / 3)));
  const columns = Math.min(width, MAX_COLUMNS);
  const { colors, xEdges } = samplePixels(width, height, data, columns, rows);
  const scanlines = allocateRuns(colors.map(segmentScanline), limit);
  const bounds = fittedBounds(width, height);
  const expressions = scanlines.flatMap((runs, row) => runs.map(run => stroke(run, row, xEdges, width, bounds, rows, style)));
  return { expressions, bounds, width, height };
}
