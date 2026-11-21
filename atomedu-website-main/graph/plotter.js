/**
 * Dependency-free numerical canvas workspace. Include graph/plotter.css.
 * createGraph(container, {
 *   expressions: ['y=x^2', 'x^2+y^2=9'], readExpression: latexToInput,
 *   createExpressionField(value, onChange) { return createMathField(value, { onInput: onChange }); },
 *   onChange(state) {}, viewport, equalAspect, xScale: 'linear'|'log',
 *   yScale: 'linear'|'log', gridMode: 'cartesian'|'polar', parameters: { a: 1, b: 0, c: 0 },
 *   showExport: true, compact: false, height: 520,
 * })
 * Editor values/callbacks are strings (LaTeX with a supplied editor/reader).
 * Structured text curves: polar(r=2+sin(theta);theta=0..2*pi) and
 * parametric(x=cos(t);y=sin(t);t=0..2*pi). Their intervals are bounded and
 * samples are numerical approximations, not proofs. Polar grid alone does not
 * plot a polar expression.
 * readExpression may also return {kind:'piecewise', variable:'x'|'y', pieces:
 * [{expression: internalString, condition: comparisonString|'otherwise'}]}.
 * setExpressions accepts strings or { expression, id?, color?, visible?, imported?, strokeWidth? }.
 * Imported regions use lightweight LaTeX previews and become visual math
 * editors when clicked; the formula remains the authoritative geometry.
 * getExpressions returns detached entries suitable for setExpressions; the
 * trailing blank editor is UI-only and never appears in state/history.
 * getState/onChange return detached JSON-safe state: expressions (with error/kind),
 * viewport, parameters, equalAspect, xScale, yScale, gridMode, trace. No sampled result is a proof.
 * Log axes require positive bounds. Polar grid requires linear axes and equal aspect;
 * plotted points use Cartesian x/y world coordinates in either grid mode.
 * zoom(factor, anchor?) uses factor > 1 to zoom in and a WORLD-coordinate anchor.
 * The nominal home viewport is x ±8.89772485081, y ±5. With equalAspect on,
 * resize and reset keep the vertical span and adjust x to the canvas ratio.
 * addExpression returns its row id. setViewport expands to equal units when
 * equalAspect is enabled. setGraphMode({xScale?, yScale?, gridMode?,
 * equalAspect?, viewport?}) updates modes and optionally the bounds atomically.
 * destroy removes only this workspace.
 */
import {
  DEFAULT_PARAMETERS, GRAPH_LIMITS, validateViewport,
  niceStep, getTicks, getPolarGrid, worldToScreen as modelWorldToScreen, screenToWorld as modelScreenToWorld,
  zoomViewport as modelZoomViewport, panViewport as modelPanViewport,
  equalizeViewport as modelEqualizeViewport, compileGraphExpression, sampleExplicit, sampleParametric, contourSegments,
} from './model.js?v=proof-lab-21';

const COLORS = ['#bf5a2e', '#3265a5', '#398064', '#8952aa', '#be4769', '#8b7426', '#24858a', '#5b59b3'];
const PLOTTER_DEFAULT_VIEWPORT = Object.freeze({ xMin: -8.89772485081, xMax: 8.89772485081, yMin: -5, yMax: 5 });
let instanceNumber = 0;
export function canImportGraphImage(hostname, options = {}) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    && options.compact !== true && options.showImageImport !== false;
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const format = n => {
  if (Math.abs(n) < 1e-12) return '0';
  if (Math.abs(n) >= 1e6 || Math.abs(n) < .0001) return n.toExponential(3).replace(/\.0+(?=e)/, '');
  return Number(n.toPrecision(7)).toLocaleString('en-US', { maximumFractionDigits: 9, useGrouping: false });
};

export function createGraph(container, options = {}) {
  if (!container?.ownerDocument) throw new TypeError('createGraph requires a DOM container.');
  const doc = container.ownerDocument, win = doc.defaultView, prefix = `atom-graph-${++instanceNumber}`;
  const imageImportEnabled = canImportGraphImage(win.location.hostname, options);
  const root = doc.createElement('section');
  root.className = `atom-graph${options.compact ? ' graph-compact' : ''}`;
  root.setAttribute('aria-label', options.ariaLabel || 'Graph workspace');
  if (Number.isFinite(options.height)) root.style.setProperty('--graph-height', `${clamp(options.height, 240, 1600)}px`);
  root.innerHTML = `
    <header class="graph-toolbar">
      <div class="graph-heading"><strong>Graph</strong></div>
      <div class="graph-actions">
        <button type="button" data-graph-action="zoom-in" aria-label="Zoom in" title="Zoom in (+)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <button type="button" data-graph-action="zoom-out" aria-label="Zoom out" title="Zoom out (−)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
        <button type="button" data-graph-action="reset" aria-label="Reset window" title="Reset window (Home)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5 12 4l8.5 7.5M6.5 10v9h11v-9M10 19v-5h4v5"/></svg><span>Reset</span></button>
        <button type="button" data-graph-action="fit" aria-label="Fit visible curves" title="Fit visible sampled curves"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5M20 15v5h-5M9 20H4v-5"/></svg><span>Fit</span></button>
        <button type="button" data-graph-action="export" aria-label="Download PNG" title="Download this numerical graph as a PNG"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg><span>PNG</span></button>
        <button type="button" data-graph-action="window" aria-label="Window settings" title="Window settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4l.5 2.4 1.6.7 2.1-1.3L21 6.6l-1.3 2.1.7 1.6 2.4.5v4l-2.4.5-.7 1.6 1.3 2.1-2.8 2.8-2.1-1.3-1.6.7L14 22h-4l-.5-2.4-1.6-.7-2.1 1.3L3 17.4l1.3-2.1-.7-1.6-2.4-.5v-4l2.4-.5.7-1.6L3 5l2.8-2.8 2.1 1.3 1.6-.7L10 2Z"/><circle cx="12" cy="12" r="3"/></svg><span>Settings</span></button>
      </div>
    </header>
    <div class="graph-body">
      <aside class="graph-sidebar" aria-label="Graph expressions">
        <div class="graph-list-heading"><span>Expressions</span><span class="graph-count"></span></div>
        <div class="graph-expression-list"></div>
        <div class="graph-curve-actions" aria-label="Add numerical curve">
          <button type="button" data-graph-action="add-polar">+ Polar r(θ)</button>
          <button type="button" data-graph-action="add-parametric">+ Parametric x(t), y(t)</button>
        </div>
        <p class="graph-curve-note">Polar grid changes only the grid. Polar and parametric curves use bounded numerical samples, which can miss features and are not proofs.</p>
        <section class="graph-parameters" aria-label="Expression parameters" hidden></section>
        <details class="graph-window">
          <summary>Window settings</summary>
          <form class="graph-window-form">
            <div class="graph-window-inputs"></div>
            <div class="graph-window-modes">
              <label>X axis <select class="graph-x-scale" aria-label="X axis scale"><option value="linear">Linear</option><option value="log">Logarithmic</option></select></label>
              <label>Y axis <select class="graph-y-scale" aria-label="Y axis scale"><option value="linear">Linear</option><option value="log">Logarithmic</option></select></label>
              <label>Grid <select class="graph-grid-mode" aria-label="Grid mode"><option value="cartesian">Cartesian</option><option value="polar">Polar circles</option></select></label>
            </div>
            <label class="graph-equal-label"><input type="checkbox" class="graph-equal" checked> Equal axis units</label>
            <button type="submit" class="graph-apply">Apply window</button>
            <p class="graph-window-error" role="status"></p>
          </form>
        </details>
        <details class="graph-image-import">
          <summary>Image import</summary>
          <div class="graph-image-panel">
            <p>Draw your image with bounded sine waves, straight-line functions, or colored inequality regions. Complex photos become an approximation. Use images you have rights to.</p>
            <label class="graph-image-drop">
              <span class="graph-image-drop-icon" aria-hidden="true">⇧</span>
              <strong>Choose or drop an image</strong>
              <small>PNG, JPG, WebP, or GIF. Up to 8 MiB.</small>
              <input class="graph-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif">
            </label>
            <p class="graph-image-name" aria-live="polite">No image selected.</p>
            <img class="graph-image-preview" alt="Selected image preview" hidden>
            <label class="graph-image-style-label">Drawing style
              <select class="graph-image-style">
                <option value="waves" selected>Wave drawing</option>
                <option value="mosaic">Balanced mosaic</option>
                <option value="lines">Line sketch</option>
              </select>
            </label>
            <button type="button" class="graph-image-convert">Draw with math</button>
            <p class="graph-image-status" role="status" aria-live="polite"></p>
          </div>
        </details>
      </aside>
      <div class="graph-plot-area">
        <div class="graph-stage">
          <canvas class="graph-canvas" tabindex="0" role="img" aria-label="Numerical interactive coordinate graph, not a proof. Drag to pan, scroll or pinch to zoom. Plus and minus zoom, arrow keys pan, Home resets."></canvas>
          <output class="graph-coordinate-readout" aria-label="Pointer coordinates">x: n/a &nbsp; y: n/a</output>
          <div class="graph-trace" role="status" aria-live="polite" hidden></div>
        </div>
        <div class="graph-plot-help"><span>Drag to pan. Scroll or pinch to zoom. Click a curve to trace.</span><span>Use +, −, arrows, or Home.</span></div>
      </div>
    </div>`;
  container.append(root);
  const sidebarHost = options.sidebarHost?.ownerDocument === doc ? options.sidebarHost : null;
  const sidebar = root.querySelector('.graph-sidebar');
  if (sidebarHost) sidebarHost.append(sidebar);
  const $ = selector => root.querySelector(selector) || sidebarHost?.querySelector(selector);
  const list = $('.graph-expression-list'), stage = $('.graph-stage'), canvas = $('.graph-canvas');
  const ctx = canvas.getContext('2d'), background = doc.createElement('canvas'), bg = background.getContext('2d');
  if (!ctx || !bg) { sidebar.remove(); root.remove(); throw new Error('This browser does not provide a 2D canvas context.'); }
  const readout = $('.graph-coordinate-readout'), traceOutput = $('.graph-trace'), parameterSection = $('.graph-parameters');
  const fields = {}, listeners = [], pointers = new Map(), geometries = new Map();
  let rows = [], draftRow = null, rowNumber = 0, width = 800, height = 520, dpr = 1, frame = null, sized = false;
  let destroyed = false, sceneDirty = true, pendingChange = false, pointer = null, drag = null, pinch = null, trace = null;
  let bulkLoading = false, selectedImage = null, importOverlay = null, imageImportBusy = false;
  let xScale = options.xScale ?? 'linear', yScale = options.yScale ?? 'linear', gridMode = options.gridMode ?? 'cartesian';
  if (!['cartesian', 'polar'].includes(gridMode)) throw new RangeError('Grid mode must be cartesian or polar.');
  if (gridMode === 'polar' && (xScale !== 'linear' || yScale !== 'linear')) throw new RangeError('Polar grid requires linear axes.');
  let equalAspect = gridMode === 'polar' || options.equalAspect !== false;
  const initialViewport = options.viewport || {
    ...PLOTTER_DEFAULT_VIEWPORT,
    ...(xScale === 'log' ? { xMin: .1, xMax: 100 } : {}),
    ...(yScale === 'log' ? { yMin: .1, yMax: 100 } : {}),
  };
  let viewport = validateViewport(initialViewport, { xScale, yScale });
  const homeViewport = { ...viewport }, parameters = { ...DEFAULT_PARAMETERS };
  const scales = () => ({ xScale, yScale });
  const axisNumber = (value, scale) => scale === 'log' ? Math.log10(value) : value;
  const worldNumber = (value, scale) => scale === 'log' ? 10 ** value : value;
  const worldToScreen = (point, v, w, h) => modelWorldToScreen(point, v, w, h, scales());
  const screenToWorld = (point, v, w, h) => modelScreenToWorld(point, v, w, h, scales());
  const zoomViewport = (v, factor, anchor) => modelZoomViewport(v, factor, anchor, scales());
  const panViewport = (v, dx, dy) => modelPanViewport(v, dx, dy, scales());
  const equalizeViewport = (v, w, h) => modelEqualizeViewport(v, w, h, scales());
  for (const name of ['a', 'b', 'c']) if (Number.isFinite(options.parameters?.[name])) parameters[name] = clamp(options.parameters[name], -100, 100);
  $('.graph-equal').checked = equalAspect;
  $('.graph-equal').disabled = gridMode === 'polar';
  $('.graph-x-scale').value = xScale; $('.graph-y-scale').value = yScale; $('.graph-grid-mode').value = gridMode;
  $('[data-graph-action="export"]').hidden = options.showExport === false;
  $('.graph-image-import').hidden = !imageImportEnabled;
  const on = (target, name, handler, config) => { target.addEventListener(name, handler, config); listeners.push(() => target.removeEventListener(name, handler, config)); };
  const state = () => ({
    // A math-field can update its visible value before its input event reaches
    // onFieldInput. Read it at export time so a just-entered curve is not lost.
    expressions: [...rows, ...(draftRow && typeof draftRow.field?.value === 'string' && draftRow.field.value.trim() ? [draftRow] : [])]
      .map(row => ({ id: row.id,
        expression: typeof row.field?.value === 'string' && row.field.value.trim() ? row.field.value : row.expression,
        color: row.color, visible: row.visible, imported: row.imported, strokeWidth: row.strokeWidth,
        error: row.error, kind: row.compiled?.kind || null })),
    viewport: { ...viewport }, parameters: { ...parameters }, equalAspect, xScale, yScale, gridMode, trace: trace ? { ...trace } : null,
  });
  const getExpressions = () => rows.map(({ id, expression, color, visible, imported, strokeWidth }) => ({ id, expression, color, visible, imported, strokeWidth }));
  function schedule(change = false, scene = true) {
    if (destroyed) return;
    sceneDirty ||= scene; pendingChange ||= change;
    if (frame === null) frame = win.requestAnimationFrame(render);
  }
  function setView(next, { equalize = false, notify = true } = {}) {
    viewport = equalize && equalAspect ? equalizeViewport(next, width, height) : validateViewport(next, scales());
    syncWindow(); schedule(notify);
  }
  function equalizeFromY(next) {
    const cx = (axisNumber(next.xMin, xScale) + axisNumber(next.xMax, xScale)) / 2;
    const span = (axisNumber(next.yMax, yScale) - axisNumber(next.yMin, yScale)) * width / height;
    const candidate = { ...next, xMin: worldNumber(cx - span / 2, xScale), xMax: worldNumber(cx + span / 2, xScale) };
    if (!Number.isFinite(span) || span < GRAPH_LIMITS.minSpan || Math.abs(candidate.xMin) > GRAPH_LIMITS.coordinate || Math.abs(candidate.xMax) > GRAPH_LIMITS.coordinate)
      return equalizeViewport(next, width, height);
    try { return validateViewport(candidate, scales()); } catch { return equalizeViewport(next, width, height); }
  }
  function syncWindow() {
    for (const key of Object.keys(fields)) if (doc.activeElement !== fields[key]) fields[key].value = String(Number(viewport[key].toPrecision(12)));
  }
  function positiveWindow(next, axis, scale) {
    if (scale !== 'log' || next[`${axis}Min`] > 0) return next;
    const max = next[`${axis}Max`] > GRAPH_LIMITS.minSpan * 100 ? next[`${axis}Max`] : 100;
    return { ...next, [`${axis}Min`]: max / 1000, [`${axis}Max`]: max };
  }
  function setGraphMode(next = {}) {
    if (destroyed) return;
    const newX = next.xScale ?? xScale, newY = next.yScale ?? yScale, newGrid = next.gridMode ?? gridMode;
    if (!['linear', 'log'].includes(newX) || !['linear', 'log'].includes(newY)) throw new RangeError('Axis scales must be linear or log.');
    if (!['cartesian', 'polar'].includes(newGrid)) throw new RangeError('Grid mode must be cartesian or polar.');
    if (newGrid === 'polar' && (newX !== 'linear' || newY !== 'linear')) throw new RangeError('Polar circles require linear x and y axes.');
    const view = next.viewport || positiveWindow(positiveWindow(viewport, 'x', newX), 'y', newY);
    validateViewport(view, { xScale: newX, yScale: newY });
    const previous = { xScale, yScale, gridMode, equalAspect, viewport };
    xScale = newX; yScale = newY; gridMode = newGrid; equalAspect = newGrid === 'polar' || (next.equalAspect ?? equalAspect);
    try { setView(view, { equalize: true }); }
    catch (error) { ({ xScale, yScale, gridMode, equalAspect, viewport } = previous); throw error; }
    $('.graph-x-scale').value = xScale; $('.graph-y-scale').value = yScale; $('.graph-grid-mode').value = gridMode;
    $('.graph-equal').checked = equalAspect; $('.graph-equal').disabled = gridMode === 'polar';
    return state();
  }
  for (const [key, label] of [['xMin', 'x min'], ['xMax', 'x max'], ['yMin', 'y min'], ['yMax', 'y max']]) {
    const wrapper = doc.createElement('label'); wrapper.textContent = label;
    const field = doc.createElement('input'); field.type = 'number'; field.step = 'any'; field.name = key; field.id = `${prefix}-${key}`;
    field.setAttribute('aria-label', `${label} window bound`); wrapper.append(field); $('.graph-window-inputs').append(wrapper); fields[key] = field;
  }
  syncWindow();
  for (const axis of ['x', 'y']) on($(`.graph-${axis}-scale`), 'change', () => {
    if ($(`.graph-${axis}-scale`).value !== 'log') return;
    const min = fields[`${axis}Min`], max = fields[`${axis}Max`];
    if (Number(max.value) <= 0) { min.value = '.1'; max.value = '100'; }
    else if (Number(min.value) <= 0) min.value = String(Number(max.value) / 1000);
  });
  on($('.graph-window-form'), 'submit', event => {
    event.preventDefault();
    try {
      const next = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value.trim() ? Number(field.value) : NaN]));
      const nextX = $('.graph-x-scale').value, nextY = $('.graph-y-scale').value, nextGrid = $('.graph-grid-mode').value;
      if (nextGrid === 'polar' && (nextX !== 'linear' || nextY !== 'linear')) throw new RangeError('Polar circles require linear x and y axes.');
      setGraphMode({ xScale: nextX, yScale: nextY, gridMode: nextGrid, equalAspect: $('.graph-equal').checked, viewport: next });
      syncWindow();
      $('.graph-window-error').textContent = '';
    } catch (error) { $('.graph-window-error').textContent = error.message; }
  });

  const imageFile = $('.graph-image-file'), imageDrop = $('.graph-image-drop');
  const imageName = $('.graph-image-name'), imagePreview = $('.graph-image-preview');
  const imageStyle = $('.graph-image-style'), imageConvert = $('.graph-image-convert');
  const imageStatus = $('.graph-image-status');
  imageFile.disabled = imageStyle.disabled = imageConvert.disabled = !imageImportEnabled;
  let imagePreviewUrl = null, imageAbort = null;
  function selectImage(file) {
    if (!imageImportEnabled || imageImportBusy) return;
    if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); imagePreviewUrl = null; }
    selectedImage = null; imagePreview.hidden = true; imagePreview.removeAttribute('src');
    if (!file) { imageName.textContent = 'No image selected.'; return; }
    const type = file.type || (/\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png'
      : /\.webp$/i.test(file.name) ? 'image/webp' : /\.gif$/i.test(file.name) ? 'image/gif' : '');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) {
      imageStatus.textContent = 'Choose a PNG, JPG, WebP, or GIF image.'; return;
    }
    if (!file.size || file.size > 8 * 1024 * 1024) {
      imageStatus.textContent = 'The image must be smaller than 8 MiB.'; return;
    }
    selectedImage = file;
    imageName.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + ' MiB)';
    imageStatus.textContent = 'Ready to draw. This replaces the current graph expressions.';
    imagePreviewUrl = URL.createObjectURL(file);
    imagePreview.src = imagePreviewUrl; imagePreview.hidden = false;
  }
  on(imageFile, 'change', () => selectImage(imageFile.files?.[0]));
  on(imageDrop, 'dragover', event => { event.preventDefault(); imageDrop.classList.add('is-dragging'); });
  on(imageDrop, 'dragleave', () => imageDrop.classList.remove('is-dragging'));
  on(imageDrop, 'drop', event => {
    event.preventDefault(); imageDrop.classList.remove('is-dragging');
    if (imageImportBusy) return;
    selectImage(event.dataTransfer?.files?.[0]);
  });
  function showImportOverlay() {
    const overlay = doc.createElement('div');
    overlay.className = 'graph-import-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Drawing the image with math');
    overlay.innerHTML = '<div class="graph-import-card"><span class="graph-import-spinner" aria-hidden="true"></span><h2>Drawing with math</h2><p class="graph-import-phase">Reading your image…</p><div class="graph-import-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><p class="graph-import-eta">Est. a few seconds</p><button type="button" class="graph-import-cancel">Cancel</button></div>';
    doc.body.append(overlay); importOverlay = overlay;
    root.setAttribute('aria-busy', 'true');
    imageAbort = new AbortController();
    overlay.querySelector('.graph-import-cancel').addEventListener('click', () => imageAbort.abort());
    overlay.querySelector('.graph-import-cancel').focus();
    return overlay;
  }
  async function decodeImage(file) {
    if (typeof win.createImageBitmap === 'function') return win.createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), image = new win.Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be decoded.')); };
      image.src = url;
    });
  }
  on(imageConvert, 'click', async () => {
    if (!imageImportEnabled || imageImportBusy) return;
    if (!selectedImage) { imageStatus.textContent = 'Choose an image first.'; return; }
    imageImportBusy = true; imageFile.disabled = imageStyle.disabled = imageConvert.disabled = true;
    const overlay = showImportOverlay(), started = win.performance.now();
    const phase = overlay.querySelector('.graph-import-phase');
    const track = overlay.querySelector('.graph-import-track');
    const eta = overlay.querySelector('.graph-import-eta');
    const progress = (amount, label) => {
      const percent = Math.max(0, Math.min(100, Math.round(amount)));
      phase.textContent = label; track.setAttribute('aria-valuenow', String(percent));
      track.firstElementChild.style.width = percent + '%';
      const elapsed = win.performance.now() - started;
      const remaining = percent > 5 && percent < 100 ? Math.ceil(elapsed * (100 - percent) / percent / 1000)
        : Math.ceil((imageStyle.value === 'mosaic' ? 384 : 480) / 55);
      eta.textContent = percent === 100 ? 'Complete' : 'Est. ' + Math.max(1, remaining) + ' seconds remaining';
    };
    progress(1, 'Reading your image…');
    let bitmap = null;
    try {
      await new Promise(resolve => win.setTimeout(resolve, 0));
      const signature = new Uint8Array(await selectedImage.slice(0, 12).arrayBuffer());
      const header = String.fromCharCode(...signature);
      const type = selectedImage.type || (/\.jpe?g$/i.test(selectedImage.name) ? 'image/jpeg' : /\.png$/i.test(selectedImage.name) ? 'image/png'
        : /\.webp$/i.test(selectedImage.name) ? 'image/webp' : /\.gif$/i.test(selectedImage.name) ? 'image/gif' : '');
      const valid = type === 'image/png' && header.startsWith('\x89PNG\r\n\x1a\n')
        || type === 'image/jpeg' && signature[0] === 255 && signature[1] === 216 && signature[2] === 255
        || type === 'image/webp' && header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP'
        || type === 'image/gif' && (header.startsWith('GIF87a') || header.startsWith('GIF89a'));
      if (!valid) throw new Error('The image contents do not match the selected file format.');
      bitmap = await decodeImage(selectedImage);
      if (imageAbort.signal.aborted) throw new DOMException('Image import cancelled.', 'AbortError');
      if (bitmap.width * bitmap.height > 16_000_000 || bitmap.width > 4096 || bitmap.height > 4096) {
        throw new Error('Use an image up to 4096 × 4096 pixels.');
      }
      progress(12, 'Scanning colors and shapes…');
      const edge = imageStyle.value === 'mosaic' ? 72 : 96;
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const sample = doc.createElement('canvas');
      sample.width = Math.max(1, Math.round(bitmap.width * scale));
      sample.height = Math.max(1, Math.round(bitmap.height * scale));
      const sampleContext = sample.getContext('2d', { willReadFrequently: true });
      if (!sampleContext) throw new Error('This browser cannot scan image colors.');
      sampleContext.fillStyle = '#fff'; sampleContext.fillRect(0, 0, sample.width, sample.height);
      sampleContext.imageSmoothingQuality = 'high';
      sampleContext.drawImage(bitmap, 0, 0, sample.width, sample.height);
      bitmap.close?.(); bitmap = null;
      await new Promise(resolve => win.setTimeout(resolve, 0));
      const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height);
      const converted = imageStyle.value === 'mosaic'
        ? (await import('./image-import.js')).imageToGraphRegions(pixels, { maxRegions: 384 })
        : (await import('./stroke-import.js')).imageToGraphStrokes(pixels,
          { style: imageStyle.value, maxExpressions: 560 });
      if (!converted.expressions.length) throw new Error('This image did not produce graph expressions.');
      if (imageAbort.signal.aborted) throw new DOMException('Image import cancelled.', 'AbortError');
      progress(30, 'Writing ' + converted.expressions.length + ' mathematical expressions…');
      await setExpressionsInBatches(converted.expressions.map(entry => ({ ...entry, imported: true })),
        (done, total) => progress(30 + 65 * done / total, 'Writing expression ' + done + ' of ' + total + '…'),
        imageAbort.signal);
      setView(equalAspect ? equalizeFromY(homeViewport) : homeViewport);
      progress(100, 'Your graph art is ready.');
      imageStatus.textContent = 'Created ' + converted.expressions.length + ' editable math expressions. Adjust their colors or formulas in the expression list.';
    } catch (error) {
      imageStatus.textContent = error.name === 'AbortError' ? 'Image import cancelled. Your previous graph was restored.'
        : (error.message || 'Could not import this image.');
    } finally {
      bitmap?.close?.();
      overlay.remove(); importOverlay = null; imageAbort = null;
      root.removeAttribute('aria-busy');
      imageImportBusy = false; imageFile.disabled = imageStyle.disabled = imageConvert.disabled = false;
      if (!destroyed) imageConvert.focus();
    }
  });

  function updateCount() {
    $('.graph-count').textContent = `${rows.length} / ${GRAPH_LIMITS.expressions}`;
    for (const button of sidebar.querySelectorAll('.graph-curve-actions button')) button.disabled = rows.length >= GRAPH_LIMITS.expressions;
  }
  function updateParameters() {
    const used = [...new Set(rows.flatMap(row => row.compiled?.parameters || []))].sort();
    const existing = [...parameterSection.querySelectorAll('[data-parameter]')].map(node => node.dataset.parameter);
    parameterSection.hidden = !used.length;
    if (used.join() === existing.join()) return;
    parameterSection.replaceChildren();
    const title = doc.createElement('h3'); title.textContent = 'Parameters'; parameterSection.append(title);
    for (const name of used) {
      const group = doc.createElement('div'); group.className = 'graph-parameter'; group.dataset.parameter = name;
      const label = doc.createElement('label'); label.htmlFor = `${prefix}-parameter-${name}`; label.textContent = `${name} = `;
      const output = doc.createElement('output'); output.textContent = format(parameters[name]); label.append(output);
      const slider = doc.createElement('input'); slider.type = 'range'; slider.min = '-10'; slider.max = '10'; slider.step = '.05';
      // Honor configured values outside the usual slider range.
      slider.min = String(Math.min(-10, parameters[name])); slider.max = String(Math.max(10, parameters[name]));
      slider.value = parameters[name]; slider.id = label.htmlFor; slider.setAttribute('aria-label', `Parameter ${name}`);
      slider.addEventListener('input', () => { parameters[name] = Number(slider.value); output.textContent = format(parameters[name]); clearTrace(); schedule(true); });
      const limits = doc.createElement('span'); limits.className = 'graph-parameter-limits'; limits.textContent = `${slider.min} to ${slider.max}`;
      group.append(label, slider, limits); parameterSection.append(group);
    }
  }
  function compileRow(row) {
    row.compiled = null; row.error = null;
    if (row.expression.trim()) {
      try { row.compiled = compileGraphExpression(row.expression, { readExpression: options.readExpression }); }
      catch (error) { row.error = error.message || 'This expression could not be graphed.'; }
    }
    row.messageNode.textContent = row.error || (['polar', 'parametric'].includes(row.compiled?.kind)
      ? 'Numerical curve approximation. Sampling can miss features; this graph is not a proof.'
      : row.compiled?.kind === 'inequality' ? 'Approximate shading. Undefined samples are omitted, so edges may have gaps.'
        : row.compiled?.piecewise ? 'Piecewise function. The first matching branch is used, and open endpoints are excluded.' : '');
    row.warningIcon.hidden = !row.error;
    row.warningIcon.title = row.error || '';
    row.errorNode.classList.toggle('graph-expression-error', !!row.error);
    row.element.classList.toggle('graph-row-invalid', !!row.error);
    row.field.setAttribute('aria-invalid', row.error ? 'true' : 'false');
    row.element.classList.toggle('graph-row-hidden', !row.visible);
    if (!bulkLoading) { updateParameters(); clearTrace(); schedule(!row.draft); }
  }
  function renumberRows() {
    rows.forEach((row, index) => { row.number.textContent = String(index + 1); });
    if (draftRow) draftRow.number.textContent = String(rows.length + 1);
  }
  function ensureDraft() {
    if (!draftRow && rows.length < GRAPH_LIMITS.expressions) makeRow('', {}, true);
    renumberRows();
  }
  function commitDraft(row) {
    if (!row.draft || rows.length >= GRAPH_LIMITS.expressions) return;
    row.draft = false; draftRow = null; rows.push(row);
    row.element.classList.remove('graph-row-draft');
    row.visibleInput.disabled = false; row.picker.disabled = false; row.remove.hidden = false;
    ensureDraft(); updateCount(); schedule(true);
  }
  function makeRow(expression, config = {}, draft = false) {
    const element = doc.createElement('div'); element.className = `graph-expression-row${draft ? ' graph-row-draft' : ''}`;
    const id = typeof config.id === 'string' && config.id && !rows.some(row => row.id === config.id) && draftRow?.id !== config.id ? config.id : `${prefix}-curve-${++rowNumber}`;
    const color = /^#[0-9a-f]{6}$/i.test(config.color || '') ? config.color : COLORS[rows.length % COLORS.length];
    const row = { id, expression, color, visible: config.visible !== false, imported: config.imported === true,
      strokeWidth: Number.isFinite(config.strokeWidth) ? clamp(config.strokeWidth, 1, 16) : 2.2,
      error: null, compiled: null, element, draft };
    const controls = doc.createElement('div'); controls.className = 'graph-expression-controls';
    const visible = doc.createElement('input'); visible.type = 'checkbox'; visible.checked = row.visible; visible.className = 'graph-visibility'; visible.title = 'Show or hide curve'; visible.setAttribute('aria-label', 'Show expression');
    visible.disabled = draft;
    const visibilityLabel = doc.createElement('label'); visibilityLabel.className = 'graph-visibility-label'; visibilityLabel.title = 'Show or hide expression';
    const picker = doc.createElement('input'); picker.type = 'color'; picker.value = color; picker.className = 'graph-color'; picker.title = 'Curve color'; picker.setAttribute('aria-label', 'Curve color');
    picker.disabled = draft;
    const number = doc.createElement('span'); number.className = 'graph-expression-number'; number.textContent = String(rows.length + 1);
    const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'graph-delete'; remove.textContent = '×'; remove.title = 'Delete expression'; remove.setAttribute('aria-label', 'Delete expression');
    remove.hidden = draft;
    visibilityLabel.append(visible, number); controls.append(visibilityLabel, picker, remove);
    const onFieldInput = value => {
      if (destroyed || (!rows.includes(row) && draftRow !== row)) return;
      row.expression = typeof value === 'string' ? value : String(value?.target?.value ?? '');
      if (row.draft && row.expression.trim()) commitDraft(row);
      compileRow(row);
    };
    const createEditable = () => {
      const structured = /^\s*(?:polar|parametric)\s*\(/i.test(row.expression);
      const input = options.createExpressionField && !structured ? options.createExpressionField(row.expression, onFieldInput) : doc.createElement('input');
      if (!input?.setAttribute || !input?.classList) throw new TypeError('createExpressionField must return an HTMLElement.');
      if (!options.createExpressionField || structured) {
        input.type = 'text'; input.value = row.expression; input.placeholder = 'e.g. y=x^2';
        input.maxLength = GRAPH_LIMITS.expressionLength; input.autocomplete = 'off'; input.spellcheck = false;
        input.addEventListener('input', () => onFieldInput(input.value));
      }
      input.classList.add('graph-expression-field'); input.setAttribute('aria-label', structured ? 'Numerical polar or parametric expression' : 'Graph expression');
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault(); event.stopPropagation();
        if (row.draft) commitDraft(row);
        draftRow?.field.focus();
      }, true);
      return input;
    };
    let field;
    if (row.imported && typeof options.renderExpression === 'function') {
      field = doc.createElement('button'); field.type = 'button';
      field.className = 'graph-expression-field graph-imported-formula';
      field.setAttribute('aria-label', 'Imported graph expression. Click to edit');
      field.title = 'Click to edit this mathematical expression';
      field.append(options.renderExpression(expression));
      field.addEventListener('click', () => {
        const live = createEditable();
        live.setAttribute('aria-describedby', errorNode.id);
        field.replaceWith(live); row.field = field = live; row.imported = false;
        live.focus(); schedule(true, false);
      });
    } else field = createEditable();
    const errorNode = doc.createElement('p'); errorNode.className = 'graph-expression-message'; errorNode.id = `${prefix}-message-${++rowNumber}`; errorNode.setAttribute('role', 'status');
    const warningIcon = doc.createElement('span'); warningIcon.className = 'graph-warning-icon'; warningIcon.setAttribute('aria-hidden', 'true'); warningIcon.hidden = true;
    warningIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>';
    const messageNode = doc.createElement('span'); messageNode.className = 'graph-message-text'; errorNode.append(warningIcon, messageNode);
    field.setAttribute('aria-describedby', errorNode.id);
    Object.assign(row, { field, errorNode, warningIcon, messageNode, number, visibleInput: visible, picker, remove }); element.style.setProperty('--curve-color', color); element.append(controls, field, errorNode);
    element.addEventListener('click', event => {
      if (row.draft && event.target !== field && !field.contains(event.target)) field.focus();
    });
    visible.addEventListener('change', () => { row.visible = visible.checked; element.classList.toggle('graph-row-hidden', !row.visible); clearTrace(); schedule(true); });
    picker.addEventListener('input', () => { row.color = picker.value; element.style.setProperty('--curve-color', row.color); schedule(true); });
    remove.addEventListener('click', () => {
      rows = rows.filter(other => other !== row); disposeRow(row); updateCount(); updateParameters(); clearTrace();
      ensureDraft(); schedule(true); draftRow?.field.focus();
    });
    if (draft) draftRow = row; else rows.push(row);
    list.insertBefore(element, draft ? null : draftRow?.element || null);
    compileRow(row); if (!bulkLoading) updateCount();
    return row;
  }
  function disposeRow(row) { row.field.destroy?.(); row.element.remove(); }
  function addExpression(expression = '', config = {}) {
    if (destroyed) return null;
    if (rows.length >= GRAPH_LIMITS.expressions) throw new RangeError(`A graph can contain at most ${GRAPH_LIMITS.expressions} expressions.`);
    if (typeof expression !== 'string') throw new TypeError('Graph expressions must be strings.');
    const row = makeRow(expression, config); ensureDraft(); return row.id;
  }
  function setExpressions(expressions) {
    if (destroyed) return;
    if (!Array.isArray(expressions) || expressions.length > GRAPH_LIMITS.expressions) throw new RangeError(`Supply an array of at most ${GRAPH_LIMITS.expressions} graph expressions.`);
    const entries = expressions.map(entry => typeof entry === 'string' ? { expression: entry } : entry);
    if (entries.some(entry => !entry || typeof entry.expression !== 'string')) throw new TypeError('Each expression must be a string or an object with an expression string.');
    rows.forEach(disposeRow); if (draftRow) disposeRow(draftRow);
    rows = []; draftRow = null; clearTrace();
    entries.forEach(entry => makeRow(entry.expression, entry)); ensureDraft(); updateCount(); updateParameters(); schedule(true);
  }
  async function setExpressionsInBatches(expressions, onProgress = () => {}, signal) {
    if (destroyed) return;
    if (!Array.isArray(expressions) || expressions.length > GRAPH_LIMITS.expressions
      || expressions.some(entry => !entry || typeof entry.expression !== 'string')) {
      throw new RangeError(`Supply at most ${GRAPH_LIMITS.expressions} valid graph expressions.`);
    }
    const previous = getExpressions();
    rows.forEach(disposeRow); if (draftRow) disposeRow(draftRow);
    rows = []; draftRow = null; clearTrace(); bulkLoading = true;
    try {
      for (let i = 0; i < expressions.length; i += 16) {
        if (destroyed || signal?.aborted) throw new DOMException('Image import cancelled.', 'AbortError');
        for (const entry of expressions.slice(i, i + 16)) makeRow(entry.expression, entry);
        onProgress(Math.min(expressions.length, i + 16), expressions.length);
        await new Promise(resolve => win.setTimeout(resolve, 0));
      }
      if (destroyed || signal?.aborted) throw new DOMException('Image import cancelled.', 'AbortError');
      bulkLoading = false; ensureDraft(); updateCount(); updateParameters(); schedule(true);
    } catch (error) {
      bulkLoading = false; if (!destroyed) setExpressions(previous); throw error;
    }
  }

  function polarGrid(context) {
    const origin = worldToScreen({ x: 0, y: 0 }, viewport, width, height);
    const pixelsPerUnit = width / (viewport.xMax - viewport.xMin);
    const { radii, angles, maxRadius } = getPolarGrid(viewport, width, height);
    context.save(); context.beginPath(); context.rect(0, 0, width, height); context.clip();
    context.lineWidth = 1; context.strokeStyle = '#e3e7eb'; context.beginPath();
    for (const radius of radii) { context.moveTo(origin.x + radius * pixelsPerUnit, origin.y); context.arc(origin.x, origin.y, radius * pixelsPerUnit, 0, Math.PI * 2); }
    for (const angle of angles) {
      const endpoint = worldToScreen({ x: maxRadius * Math.cos(angle), y: maxRadius * Math.sin(angle) }, viewport, width, height);
      context.moveTo(origin.x, origin.y); context.lineTo(endpoint.x, endpoint.y);
    }
    context.stroke(); context.beginPath(); context.strokeStyle = '#848c88'; context.lineWidth = 1.3;
    if (origin.x >= 0 && origin.x <= width) { context.moveTo(origin.x, 0); context.lineTo(origin.x, height); }
    if (origin.y >= 0 && origin.y <= height) { context.moveTo(0, origin.y); context.lineTo(width, origin.y); }
    context.stroke(); context.restore();
    context.font = '11px system-ui, sans-serif'; context.fillStyle = '#626b68'; context.textAlign = 'center'; context.textBaseline = 'top';
    for (const radius of radii) {
      const x = origin.x + radius * pixelsPerUnit;
      if (x >= 22 && x <= width - 22 && origin.y >= 0 && origin.y <= height - 20) context.fillText(format(radius), x, clamp(origin.y + 5, 6, height - 20));
    }
    context.font = 'italic 13px system-ui, sans-serif'; context.textAlign = 'right'; context.textBaseline = 'bottom';
    context.fillText('x', width - 10, clamp(origin.y - 7, 20, height - 8));
    context.fillText('y', clamp(origin.x + 17, 18, width - 8), 20);
  }
  function logGrid(context) {
    const ticks = (axis, target) => {
      const scale = axis === 'x' ? xScale : yScale, min = viewport[`${axis}Min`], max = viewport[`${axis}Max`];
      const lo = axisNumber(min, scale), hi = axisNumber(max, scale);
      return { major: getTicks(lo, hi, target).map(n => worldNumber(n, scale)),
        minor: getTicks(lo, hi, target * 5).map(n => worldNumber(n, scale)) };
    };
    const xt = ticks('x', Math.max(2, width / 85)), yt = ticks('y', Math.max(2, height / 65));
    context.lineWidth = 1;
    for (const minor of [true, false]) {
      context.beginPath(); context.strokeStyle = minor ? '#f1f3f5' : '#e3e7eb';
      for (const x of minor ? xt.minor : xt.major) {
        const px = worldToScreen({ x, y: viewport.yMin }, viewport, width, height).x;
        if (Number.isFinite(px)) { context.moveTo(px, 0); context.lineTo(px, height); }
      }
      for (const y of minor ? yt.minor : yt.major) {
        const py = worldToScreen({ x: viewport.xMin, y }, viewport, width, height).y;
        if (Number.isFinite(py)) { context.moveTo(0, py); context.lineTo(width, py); }
      }
      context.stroke();
    }
    const origin = worldToScreen({ x: xScale === 'log' ? viewport.xMin : 0, y: yScale === 'log' ? viewport.yMin : 0 }, viewport, width, height);
    context.beginPath(); context.lineWidth = 1.3; context.strokeStyle = '#848c88';
    if (xScale === 'linear' && origin.x >= 0 && origin.x <= width) { context.moveTo(origin.x, 0); context.lineTo(origin.x, height); }
    if (yScale === 'linear' && origin.y >= 0 && origin.y <= height) { context.moveTo(0, origin.y); context.lineTo(width, origin.y); }
    context.stroke(); context.font = '11px system-ui, sans-serif'; context.fillStyle = '#626b68';
    context.textAlign = 'center'; context.textBaseline = 'top';
    for (const x of xt.major) {
      const px = worldToScreen({ x, y: viewport.yMin }, viewport, width, height).x;
      if (px >= 22 && px <= width - 22) context.fillText(format(x), px, clamp(origin.y + 5, 6, height - 20));
    }
    context.textAlign = 'right'; context.textBaseline = 'middle';
    for (const y of yt.major) {
      const py = worldToScreen({ x: viewport.xMin, y }, viewport, width, height).y;
      if (py >= 15 && py <= height - 15) context.fillText(format(y), clamp(origin.x - 7, 34, width - 12), py);
    }
    context.font = 'italic 13px system-ui, sans-serif'; context.textBaseline = 'bottom';
    context.fillText('x', width - 10, clamp(origin.y - 7, 20, height - 8));
    context.fillText('y', clamp(origin.x + 17, 18, width - 8), 20);
  }
  function grid(context) {
    context.clearRect(0, 0, width, height); context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    if (gridMode === 'polar') { polarGrid(context); return; }
    if (xScale === 'log' || yScale === 'log') { logGrid(context); return; }
    const xSpan = viewport.xMax - viewport.xMin, ySpan = viewport.yMax - viewport.yMin;
    const xTarget = Math.max(2, width / 85), yTarget = Math.max(2, height / 65);
    const xStep = niceStep(xSpan, xTarget), yStep = niceStep(ySpan, yTarget);
    // getTicks chooses a nice step; request the matching subdivision count.
    const xt = getTicks(viewport.xMin, viewport.xMax, xTarget), yt = getTicks(viewport.yMin, viewport.yMax, yTarget);
    const line = (x1, y1, x2, y2) => { context.moveTo(x1, y1); context.lineTo(x2, y2); };
    context.lineWidth = 1;
    for (const minor of [true, false]) {
      context.beginPath(); context.strokeStyle = minor ? '#f1f3f5' : '#e3e7eb';
      const xs = minor ? xStep / 5 : xStep, ys = minor ? yStep / 5 : yStep;
      // Use integer indexes, capped independently of potentially huge bounds.
      const xi = Math.ceil(viewport.xMin / xs), yi = Math.ceil(viewport.yMin / ys);
      for (let n = 0; n < Math.min(600, Math.floor(viewport.xMax / xs) - xi + 1); n++) {
        const x = worldToScreen({ x: (xi + n) * xs, y: 0 }, viewport, width, height).x;
        line(x, 0, x, height);
      }
      for (let n = 0; n < Math.min(600, Math.floor(viewport.yMax / ys) - yi + 1); n++) {
        const y = worldToScreen({ x: 0, y: (yi + n) * ys }, viewport, width, height).y;
        line(0, y, width, y);
      }
      context.stroke();
    }
    const origin = worldToScreen({ x: 0, y: 0 }, viewport, width, height);
    context.beginPath(); context.lineWidth = 1.3; context.strokeStyle = '#848c88';
    if (origin.x >= 0 && origin.x <= width) line(origin.x, 0, origin.x, height);
    if (origin.y >= 0 && origin.y <= height) line(0, origin.y, width, origin.y);
    context.stroke(); context.font = '11px system-ui, sans-serif'; context.fillStyle = '#626b68';
    const yLabel = clamp(origin.y + 5, 6, height - 20), xLabel = clamp(origin.x - 7, 34, width - 12);
    context.textBaseline = 'top'; context.textAlign = 'center';
    for (const value of xt) {
      const p = worldToScreen({ x: value, y: 0 }, viewport, width, height);
      if (p.x < 22 || p.x > width - 22 || (value === 0 && origin.x > 20 && origin.x < width - 20)) continue;
      context.fillText(format(value), p.x, yLabel);
    }
    context.textAlign = 'right'; context.textBaseline = 'middle';
    for (const value of yt) {
      const p = worldToScreen({ x: 0, y: value }, viewport, width, height);
      if (p.y < 15 || p.y > height - 15 || (value === 0 && origin.y >= 0 && origin.y <= height)) continue;
      context.fillText(format(value), xLabel, p.y);
    }
    context.font = 'italic 13px system-ui, sans-serif'; context.textAlign = 'right'; context.textBaseline = 'bottom';
    context.fillText('x', width - 10, clamp(origin.y - 7, 20, height - 8));
    context.fillText('y', clamp(origin.x + 17, 18, width - 8), 20);
  }
  function shade(row, budget) {
    // A tile is shaded only if its center and all four corners satisfy the
    // relation. This leaves a conservative gap along sampled domain boundaries
    // and sign changes, rather than spreading a valid center across invalid x/y.
    const step = Math.max(5, Math.ceil(Math.sqrt(width * height / Math.max(1, budget / 5))));
    let columns = Math.max(1, Math.ceil(width / step)), lines = Math.max(1, Math.ceil(height / step));
    const scale = Math.min(1, Math.sqrt(Math.floor(budget / 5) / (columns * lines)));
    columns = Math.max(1, Math.floor(columns * scale)); lines = Math.max(1, Math.floor(lines * scale));
    const dx = width / columns, dy = height / lines;
    const contains = (x, y) => { const p = screenToWorld({ x, y }, viewport, width, height); return row.compiled.contains(p.x, p.y, parameters); };
    bg.fillStyle = row.color; bg.globalAlpha = .12;
    for (let j = 0; j < lines; j++) for (let i = 0; i < columns; i++) {
      const x = i * dx, y = j * dy, right = (i + 1) * dx, bottom = (j + 1) * dy;
      if (contains(x + dx / 2, y + dy / 2) && contains(x, y) && contains(right, y) && contains(x, bottom) && contains(right, bottom)) bg.fillRect(x, y, dx, dy);
    }
    bg.globalAlpha = 1;
  }
  function drawPaths(context, paths, color, dashed = false, strokeWidth = 2.2) {
    context.beginPath(); context.lineWidth = strokeWidth; context.strokeStyle = color; context.lineJoin = 'round'; context.lineCap = 'round'; context.setLineDash(dashed ? [6, 4] : []);
    for (const path of paths) {
      let connected = false;
      for (const point of path) {
        const p = worldToScreen(point, viewport, width, height);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { connected = false; continue; }
        if (connected) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y);
        connected = true;
      }
    }
    context.stroke(); context.setLineDash([]);
  }
  function drawScene() {
    grid(bg); geometries.clear();
    const active = rows.filter(row => row.visible && row.compiled), count = Math.max(1, active.length);
    // Total frame work remains bounded even at the expression-count limit.
    const explicitBudget = Math.max(500, Math.min(6500, Math.floor(36000 / count)));
    const implicitBudget = Math.max(600, Math.min(22000, Math.floor(60000 / count)));
    const shadeBudget = Math.max(200, Math.min(5000, Math.floor(14000 / count)));
    for (const row of active) if (row.compiled.kind === 'region') {
      const b = row.compiled.bounds;
      if (xScale === 'log' && b.xMax <= 0 || yScale === 'log' && b.yMax <= 0) continue;
      const topLeft = worldToScreen({ x: xScale === 'log' ? Math.max(b.xMin, viewport.xMin) : b.xMin, y: b.yMax }, viewport, width, height);
      const bottomRight = worldToScreen({ x: b.xMax, y: yScale === 'log' ? Math.max(b.yMin, viewport.yMin) : b.yMin }, viewport, width, height);
      if (!Number.isFinite(topLeft.x) || !Number.isFinite(topLeft.y) || !Number.isFinite(bottomRight.x) || !Number.isFinite(bottomRight.y)) continue;
      bg.fillStyle = row.color;
      bg.fillRect(Math.floor(topLeft.x), Math.floor(topLeft.y),
        Math.ceil(bottomRight.x) - Math.floor(topLeft.x), Math.ceil(bottomRight.y) - Math.floor(topLeft.y));
      geometries.set(row.id, [[
        { x: b.xMin, y: b.yMin }, { x: b.xMax, y: b.yMin },
        { x: b.xMax, y: b.yMax }, { x: b.xMin, y: b.yMax }, { x: b.xMin, y: b.yMin },
      ]]);
    }
    for (const row of active) if (row.compiled.kind === 'inequality') shade(row, shadeBudget);
    bg.save(); bg.beginPath(); bg.rect(0, 0, width, height); bg.clip();
    for (const row of active) {
      const descriptor = row.compiled;
      if (descriptor.kind === 'region') continue;
      if (descriptor.kind === 'point') {
        const p = descriptor.point(parameters);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const s = worldToScreen(p, viewport, width, height);
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || Math.abs(s.x) > 1e6 || Math.abs(s.y) > 1e6) continue;
        bg.beginPath(); bg.arc(s.x, s.y, 5, 0, Math.PI * 2); bg.fillStyle = row.color; bg.fill(); bg.lineWidth = 1.5; bg.strokeStyle = '#fff'; bg.stroke();
        bg.font = '11px system-ui, sans-serif'; bg.fillStyle = row.color; bg.textAlign = 'left'; bg.textBaseline = 'bottom'; bg.fillText(`(${format(p.x)}, ${format(p.y)})`, s.x + 9, s.y - 6);
        geometries.set(row.id, [[p]]); continue;
      }
      const curve = descriptor.kind === 'polar' || descriptor.kind === 'parametric';
      const config = { width, height, parameters, xScale, yScale, maxSamples: descriptor.kind === 'explicit' || curve ? explicitBudget : implicitBudget };
      const paths = curve ? sampleParametric(descriptor, viewport, config)
        : descriptor.kind === 'explicit' ? sampleExplicit(descriptor, viewport, config) : contourSegments(descriptor, viewport, config);
      geometries.set(row.id, paths);
      drawPaths(bg, paths, row.color, descriptor.kind === 'inequality' && ['<', '>'].includes(descriptor.relation), row.strokeWidth);
      for (const endpoint of descriptor.endpoints?.(parameters) || []) {
        const p = worldToScreen(endpoint, viewport, width, height);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -6 || p.x > width + 6 || p.y < -6 || p.y > height + 6) continue;
        bg.beginPath(); bg.arc(p.x, p.y, 4.5, 0, Math.PI * 2); bg.lineWidth = 1.8;
        bg.fillStyle = endpoint.open ? '#fff' : row.color; bg.strokeStyle = row.color; bg.fill(); bg.stroke();
        if (!endpoint.open) paths.push([{ x: endpoint.x, y: endpoint.y }]);
      }
    }
    bg.restore();
  }
  function drawOverlay() {
    ctx.clearRect(0, 0, width, height); ctx.drawImage(background, 0, 0, width, height);
    if (pointer && !drag && !pinch) {
      ctx.save(); ctx.strokeStyle = '#62746d77'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath();
      ctx.moveTo(pointer.x, 0); ctx.lineTo(pointer.x, height); ctx.moveTo(0, pointer.y); ctx.lineTo(width, pointer.y); ctx.stroke(); ctx.restore();
    }
    if (trace) {
      const p = worldToScreen(trace, viewport, width, height), row = rows.find(row => row.id === trace.expressionId);
      if (row && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2); ctx.fillStyle = row.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
  function render() {
    frame = null;
    if (destroyed) return;
    if (sceneDirty) { drawScene(); sceneDirty = false; }
    drawOverlay();
    if (pendingChange) { pendingChange = false; options.onChange?.(state()); }
  }
  function resize() {
    if (destroyed) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return; // A hidden tab will be observed again when revealed.
    const oldWidth = width, oldHeight = height;
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    dpr = clamp(win.devicePixelRatio || 1, 1, 3);
    const backingWidth = Math.round(width * dpr), backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = background.width = backingWidth; canvas.height = background.height = backingHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    const viewChanged = equalAspect && (!sized || oldWidth !== width || oldHeight !== height);
    if (viewChanged) viewport = equalizeFromY(viewport);
    sized = true; syncWindow(); schedule(viewChanged);
  }
  function zoom(factor, anchor) { if (!destroyed) setView(zoomViewport(viewport, factor, anchor)); }
  function reset() { if (!destroyed) { clearTrace(); const home = positiveWindow(positiveWindow(homeViewport, 'x', xScale), 'y', yScale); setView(equalAspect ? equalizeFromY(home) : home); } }
  function fit() {
    if (sceneDirty) { drawScene(); sceneDirty = false; }
    let points = [...geometries.values()].flat(2).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    // Try a bounded wider survey so offscreen points/ordinary curves can be found.
    const survey = { xMin: -20, xMax: 20, yMin: -20, yMax: 20 };
    for (const row of rows.filter(row => row.visible && row.compiled)) {
      if (row.compiled.kind === 'point') points.push(row.compiled.point(parameters));
      else if (row.compiled.kind === 'region') {
        const b = row.compiled.bounds;
        points.push({ x: b.xMin, y: b.yMin }, { x: b.xMax, y: b.yMax });
      }
      else if (row.compiled.kind === 'explicit') {
        points.push(...sampleExplicit(row.compiled, survey, { width: 400, height: 300, parameters, maxSamples: 1200 }).flat());
        // Include offscreen values: otherwise even a horizontal y=1000 line
        // could never be discovered by a visible-samples-only fit.
        const axis = row.compiled.axis, min = axis === 'y' ? viewport.xMin : viewport.yMin, max = axis === 'y' ? viewport.xMax : viewport.yMax;
        for (let i = 0; i <= 80; i++) {
          const t = min + (max - min) * i / 80, value = row.compiled.sample(t, parameters);
          if (Number.isFinite(value)) points.push(axis === 'y' ? { x: t, y: value } : { x: value, y: t });
        }
      }
      else if (row.compiled.kind === 'polar' || row.compiled.kind === 'parametric') {
        const descriptor = row.compiled;
        for (let i = 0; i <= 160; i++) {
          const t = descriptor.tMin + (descriptor.tMax - descriptor.tMin) * i / 160;
          try { points.push(descriptor.point(t, parameters)); } catch { /* An undefined sample is omitted. */ }
        }
      }
      else points.push(...contourSegments(row.compiled, survey, { width: 300, height: 220, parameters, maxSamples: 1500 }).flat());
    }
    points = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e11 && Math.abs(p.y) < 1e11
      && (xScale !== 'log' || p.x > 0) && (yScale !== 'log' || p.y > 0));
    if (!points.length) { traceOutput.textContent = 'No visible samples to fit. Try another window.'; traceOutput.hidden = false; return; }
    // Quantiles keep reciprocal tails from making the fitted graph unreadable.
    const xs = points.map(p => p.x).sort((a, b) => a - b), ys = points.map(p => p.y).sort((a, b) => a - b);
    const trim = points.length > 200 ? Math.floor(points.length * .02) : 0;
    let x0 = xs[trim], x1 = xs[xs.length - 1 - trim], y0 = ys[trim], y1 = ys[ys.length - 1 - trim];
    // Deliberately entered points must survive the curve-tail quantile trim.
    for (const row of rows.filter(row => row.visible && row.compiled?.kind === 'point')) {
      const p = row.compiled.point(parameters);
      if (Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e11 && Math.abs(p.y) < 1e11
        && (xScale !== 'log' || p.x > 0) && (yScale !== 'log' || p.y > 0)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    }
    for (const row of rows.filter(row => row.visible && row.compiled?.kind === 'region')) {
      const b = row.compiled.bounds;
      if (xScale !== 'log' || b.xMax > 0) { x0 = Math.min(x0, xScale === 'log' ? Math.max(b.xMin, viewport.xMin) : b.xMin); x1 = Math.max(x1, b.xMax); }
      if (yScale !== 'log' || b.yMax > 0) { y0 = Math.min(y0, yScale === 'log' ? Math.max(b.yMin, viewport.yMin) : b.yMin); y1 = Math.max(y1, b.yMax); }
    }
    const padAxis = (min, max, scale) => {
      if (scale === 'log') {
        const lo = Math.log10(min), hi = Math.log10(max), pad = Math.max(.15, (hi - lo) * .12);
        return [10 ** (lo - pad), 10 ** (hi + pad)];
      }
      const pad = Math.max(.5, (max - min) * .12);
      return [min - pad, max + pad];
    };
    const [xMin, xMax] = padAxis(x0, x1, xScale), [yMin, yMax] = padAxis(y0, y1, yScale);
    clearTrace(); setView({ xMin, xMax, yMin, yMax }, { equalize: true });
  }
  function exportPNG() {
    if (sceneDirty) { drawScene(); sceneDirty = false; }
    const link = doc.createElement('a'); link.download = 'atom-graph.png'; link.href = background.toDataURL('image/png');
    link.hidden = true; doc.body.append(link); link.click(); link.remove();
  }
  function clearTrace() { trace = null; traceOutput.hidden = true; }
  function traceAt(screen) {
    if (sceneDirty) { drawScene(); sceneDirty = false; }
    let best = null, distance = 25;
    for (const row of rows.filter(row => row.visible && row.compiled)) for (const path of geometries.get(row.id) || []) {
      for (let i = 0; i < path.length; i++) {
        const a = worldToScreen(path[i], viewport, width, height), b = i ? worldToScreen(path[i - 1], viewport, width, height) : a;
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
        const t = length ? clamp(((screen.x - a.x) * dx + (screen.y - a.y) * dy) / length, 0, 1) : 0;
        const p = { x: a.x + t * dx, y: a.y + t * dy }, d = Math.hypot(screen.x - p.x, screen.y - p.y);
        if (d < distance) { distance = d; best = { row, point: screenToWorld(p, viewport, width, height), t: a.t != null && b.t != null ? b.t + (a.t - b.t) * t : null }; }
      }
    }
    clearTrace();
    if (best) {
      const p = best.point, descriptor = best.row.compiled;
      if (descriptor.kind === 'explicit') {
        if (descriptor.axis === 'y') p.y = descriptor.sample(p.x, parameters); else p.x = descriptor.sample(p.y, parameters);
      }
      if ((descriptor.kind === 'polar' || descriptor.kind === 'parametric') && best.t != null) {
        try { Object.assign(p, descriptor.point(best.t, parameters)); } catch { p.x = p.y = NaN; }
      }
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        trace = { expressionId: best.row.id, x: p.x, y: p.y };
        traceOutput.textContent = `Numerical trace ≈ (${format(p.x)}, ${format(p.y)})`; traceOutput.hidden = false;
      }
    }
    schedule(true, false);
  }
  const local = event => { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; };
  function showPointer(p) { pointer = p; const world = screenToWorld(p, viewport, width, height); readout.textContent = `x: ${format(world.x)}   y: ${format(world.y)}`; }
  on(canvas, 'wheel', event => {
    event.preventDefault(); const p = local(event); showPointer(p);
    const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    zoom(Math.exp(-clamp(dy, -600, 600) * .0018), screenToWorld(p, viewport, width, height)); showPointer(p);
  }, { passive: false });
  on(canvas, 'pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture?.(event.pointerId);
    const p = local(event); pointers.set(event.pointerId, p);
    if (pointers.size === 1) drag = { start: p, viewport: { ...viewport }, moved: false };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), viewport: { ...viewport }, anchor: screenToWorld(midpoint, viewport, width, height) };
      if (drag) drag.moved = true;
    }
    root.classList.add('graph-dragging'); schedule(false, false);
  });
  on(canvas, 'pointermove', event => {
    const p = local(event); showPointer(p);
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()], midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const next = zoomViewport(pinch.viewport, Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance, pinch.anchor);
        const currentAnchor = screenToWorld(midpoint, next, width, height);
        setView(panViewport(next, axisNumber(pinch.anchor.x, xScale) - axisNumber(currentAnchor.x, xScale),
          axisNumber(pinch.anchor.y, yScale) - axisNumber(currentAnchor.y, yScale)));
      } else if (drag) {
        const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        drag.moved ||= Math.hypot(dx, dy) > 4;
        if (drag.moved) setView(panViewport(drag.viewport,
          -dx / width * (axisNumber(drag.viewport.xMax, xScale) - axisNumber(drag.viewport.xMin, xScale)),
          dy / height * (axisNumber(drag.viewport.yMax, yScale) - axisNumber(drag.viewport.yMin, yScale))));
      }
      showPointer(p);
    }
    schedule(false, false);
  });
  function endPointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    const clicked = !cancelled && pointers.size === 1 && drag && !drag.moved && !pinch;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) drag = { start: [...pointers.values()][0], viewport: { ...viewport }, moved: true };
    else { drag = null; root.classList.remove('graph-dragging'); }
    if (clicked) traceAt(local(event));
    if (cancelled || event.pointerType === 'touch') pointer = null;
    schedule(false, false);
  }
  on(canvas, 'pointerup', event => endPointer(event));
  on(canvas, 'pointercancel', event => endPointer(event, true));
  on(canvas, 'lostpointercapture', event => endPointer(event, true));
  on(canvas, 'pointerleave', () => { if (!pointers.size) { pointer = null; readout.textContent = 'x: n/a   y: n/a'; schedule(false, false); } });
  on(canvas, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const dx = (axisNumber(viewport.xMax, xScale) - axisNumber(viewport.xMin, xScale)) * .1;
    const dy = (axisNumber(viewport.yMax, yScale) - axisNumber(viewport.yMin, yScale)) * .1;
    const actions = { '+': () => zoom(1.25), '=': () => zoom(1.25), '-': () => zoom(.8), '_': () => zoom(.8), Home: reset,
      ArrowLeft: () => setView(panViewport(viewport, -dx, 0)), ArrowRight: () => setView(panViewport(viewport, dx, 0)),
      ArrowUp: () => setView(panViewport(viewport, 0, dy)), ArrowDown: () => setView(panViewport(viewport, 0, -dy)),
      Escape: () => { clearTrace(); schedule(true, false); } };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  const handleGraphAction = event => {
    const action = event.target.closest('[data-graph-action]')?.dataset.graphAction;
    if (action === 'add-polar' || action === 'add-parametric') {
      if (rows.length < GRAPH_LIMITS.expressions) {
        const expression = action === 'add-polar' ? 'polar(r=2+sin(theta);theta=0..2*pi)'
          : 'parametric(x=3*cos(t);y=2*sin(t);t=0..2*pi)';
        const id = addExpression(expression); rows.find(row => row.id === id)?.field.focus();
      }
    }
    if (action === 'window') { options.onShowSidebar?.(); $('.graph-window').open = true; $('.graph-window summary').focus(); }
    if (action === 'zoom-in') zoom(1.3);
    if (action === 'zoom-out') zoom(1 / 1.3);
    if (action === 'reset') reset();
    if (action === 'fit') fit();
    if (action === 'export') exportPNG();
  };
  on(root, 'click', handleGraphAction);
  if (sidebarHost) on(sidebar, 'click', handleGraphAction);
  on(win, 'resize', resize);
  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null; observer?.observe(stage);
  // A resolution media query also catches moving between monitors without a resize.
  let resolutionQuery = null;
  function observeResolution() {
    resolutionQuery?.removeEventListener?.('change', resolutionChanged);
    resolutionQuery = win.matchMedia?.(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    resolutionQuery?.addEventListener?.('change', resolutionChanged, { once: true });
  }
  function resolutionChanged() { resize(); observeResolution(); }
  observeResolution();
  setExpressions(options.expressions || []); resize(); schedule();
  return {
    addExpression, getExpressions, setExpressions, setExpressionsInBatches, getState: state,
    setViewport(next) { if (!destroyed) setView(validateViewport(next, scales()), { equalize: true }); },
    setGraphMode,
    zoom, reset, resize,
    destroy() {
      if (destroyed) return;
      destroyed = true; if (frame !== null) win.cancelAnimationFrame(frame);
      observer?.disconnect(); resolutionQuery?.removeEventListener?.('change', resolutionChanged);
      imageAbort?.abort(); importOverlay?.remove();
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      listeners.forEach(remove => remove()); rows.forEach(disposeRow); if (draftRow) disposeRow(draftRow); rows = []; draftRow = null; pointers.clear(); geometries.clear(); sidebar.remove(); root.remove();
    },
  };
}
