// Convert browser ImageData into a bounded set of colored math rectangles.
// A 512-cell grid limits working memory while each cell retains the sums of
// every source pixel it represents (including partially transparent pixels).
const GRID_LIMIT = 512;
const UNIFORM_RMS = 6;

function validateImage(imageData) {
  if (!imageData || typeof imageData !== 'object') throw new TypeError('Image data is required.');
  const { width, height, data } = imageData;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0)
    throw new RangeError('Image width and height must be positive safe integers.');
  if (!(data instanceof Uint8ClampedArray) || !Number.isSafeInteger(width * height * 4) || data.length !== width * height * 4)
    throw new TypeError('Image data must be an RGBA Uint8ClampedArray of the stated dimensions.');
  return { width, height, data };
}

function summedPixels(width, height, data, onProgress) {
  const gridWidth = Math.min(width, GRID_LIMIT), gridHeight = Math.min(height, GRID_LIMIT);
  const xEdges = Array.from({ length: gridWidth + 1 }, (_, x) => Math.floor(x * width / gridWidth));
  const yEdges = Array.from({ length: gridHeight + 1 }, (_, y) => Math.floor(y * height / gridHeight));
  const stride = gridWidth + 1, size = stride * (gridHeight + 1);
  const channels = Array.from({ length: 6 }, () => new Float64Array(size));

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const sums = [0, 0, 0, 0, 0, 0];
      for (let y = yEdges[gy]; y < yEdges[gy + 1]; y++) {
        for (let x = xEdges[gx]; x < xEdges[gx + 1]; x++) {
          const offset = (y * width + x) * 4;
          const alpha = data[offset + 3] / 255;
          for (let c = 0; c < 3; c++) {
            const value = 255 + (data[offset + c] - 255) * alpha;
            sums[c] += value;
            sums[c + 3] += value * value;
          }
        }
      }
      const i = (gy + 1) * stride + gx + 1;
      for (let c = 0; c < 6; c++) {
        const table = channels[c];
        table[i] = sums[c] + table[i - 1] + table[i - stride] - table[i - stride - 1];
      }
    }
    if (onProgress && (gy + 1 === gridHeight || (gy + 1) % 16 === 0))
      onProgress(Math.floor(70 * (gy + 1) / gridHeight));
  }
  return { gridWidth, gridHeight, xEdges, yEdges, stride, channels };
}

function regionStats(grid, x0, y0, x1, y1) {
  const { stride, channels, xEdges, yEdges } = grid;
  const a = y0 * stride + x0, b = y0 * stride + x1;
  const c = y1 * stride + x0, d = y1 * stride + x1;
  const sums = channels.map(table => table[d] - table[b] - table[c] + table[a]);
  const count = (xEdges[x1] - xEdges[x0]) * (yEdges[y1] - yEdges[y0]);
  const error = Math.max(0, sums[3] - sums[0] ** 2 / count)
    + Math.max(0, sums[4] - sums[1] ** 2 / count)
    + Math.max(0, sums[5] - sums[2] ** 2 / count);
  return { x0, y0, x1, y1, sums, count, error };
}

function splitChoices(grid, region) {
  const { x0, y0, x1, y1 } = region;
  const xm = Math.floor((x0 + x1) / 2), ym = Math.floor((y0 + y1) / 2);
  const vertical = xm > x0 && xm < x1;
  const horizontal = ym > y0 && ym < y1;
  const stats = (a, b, c, d) => regionStats(grid, a, b, c, d);
  const choices = [];
  if (vertical) choices.push([stats(x0, y0, xm, y1), stats(xm, y0, x1, y1)]);
  if (horizontal) choices.push([stats(x0, y0, x1, ym), stats(x0, ym, x1, y1)]);
  if (vertical && horizontal) choices.push([
    stats(x0, y0, xm, ym), stats(xm, y0, x1, ym),
    stats(x0, ym, xm, y1), stats(xm, ym, x1, y1),
  ]);
  return choices;
}

function bestSplit(region, remaining) {
  if (region.error / (3 * region.count) <= UNIFORM_RMS ** 2) return null;
  let best = null;
  for (const children of region.choices) {
    const cost = children.length - 1;
    if (cost > remaining) continue;
    const gain = Math.max(0, region.error - children.reduce((sum, child) => sum + child.error, 0));
    const score = gain / cost;
    // A zero-gain quadrant can still reveal detail at the next depth.
    if (!best || score > best.score + 1e-7 || (Math.abs(score - best.score) <= 1e-7 && children.length > best.children.length))
      best = { children, score };
  }
  return best;
}

function decimal(value) {
  // Keep ordinary decimal notation even for very thin images; Number#toString
  // would switch small radii to scientific notation.
  return value.toFixed(15).replace(/0+$/, '').replace(/\.$/, '');
}

function rectangle(region, grid, bounds) {
  const { width, height } = grid;
  const x0 = bounds.xMin + grid.xEdges[region.x0] / width * (bounds.xMax - bounds.xMin);
  const x1 = bounds.xMin + grid.xEdges[region.x1] / width * (bounds.xMax - bounds.xMin);
  const y0 = bounds.yMax - grid.yEdges[region.y0] / height * (bounds.yMax - bounds.yMin);
  const y1 = bounds.yMax - grid.yEdges[region.y1] / height * (bounds.yMax - bounds.yMin);
  const axis = (name, center, radius) => {
    const c = Number(center.toFixed(15));
    return `abs(${name}${c < 0 ? '+' : '-'}${decimal(Math.abs(c))})<=${decimal(radius)}`;
  };
  const color = '#' + region.sums.slice(0, 3).map(sum =>
    Math.max(0, Math.min(255, Math.round(sum / region.count))).toString(16).padStart(2, '0')).join('');
  return {
    expression: `${axis('x', (x0 + x1) / 2, (x1 - x0) / 2)} and ${axis('y', (y0 + y1) / 2, (y0 - y1) / 2)}`,
    color,
    visible: true,
  };
}

export function imageToGraphRegions(imageData, { maxRegions = 384, onProgress } = {}) {
  const { width, height, data } = validateImage(imageData);
  if (typeof maxRegions !== 'number' || Number.isNaN(maxRegions)) throw new RangeError('maxRegions must be a number.');
  if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('onProgress must be a function.');
  const limit = Math.min(768, Math.max(1, Math.floor(maxRegions)));
  onProgress?.(0);
  const grid = summedPixels(width, height, data, onProgress);
  const aspect = width / height;
  const spanX = Math.min(16, 9 * aspect), spanY = Math.min(9, 16 / aspect);
  const bounds = { xMin: -spanX / 2, xMax: spanX / 2, yMin: -spanY / 2, yMax: spanY / 2 };
  const root = regionStats(grid, 0, 0, grid.gridWidth, grid.gridHeight);
  root.choices = splitChoices(grid, root);
  const regions = [root];
  while (regions.length < limit) {
    let selected = null;
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i], split = bestSplit(region, limit - regions.length);
      if (!split) continue;
      const priority = split.score + region.error * 0.001;
      if (!selected || priority > selected.priority) selected = { i, split, priority };
    }
    if (!selected) break;
    const children = selected.split.children;
    for (const child of children) child.choices = splitChoices(grid, child);
    regions.splice(selected.i, 1, ...children);
    onProgress?.(Math.min(99, 70 + Math.floor(29 * regions.length / limit)));
  }
  onProgress?.(100);
  const projection = { ...grid, width, height };
  return { expressions: regions.map(region => rectangle(region, projection, bounds)), bounds, width, height };
}
