# Local graph workspace

The graph is an owned numerical canvas renderer. It requires no Desmos service, account, key, subscription, or remote runtime. Its visual math fields and fonts are served locally with Proof Lab. A deployed site still needs ordinary static hosting; the code does not impose a per-use service fee.

## Connect immediately

Open [the graph workspace](http://127.0.0.1:8080/proof-lab#graph) after `npm start`.

To embed the entire local workbench on another page served from the same site:

```html
<iframe src="/proof-lab#graph" title="Math graph workspace"
        style="width:100%;height:900px;border:0"></iframe>
```

To attach only the graph to your own UI:

```html
<link rel="stylesheet" href="/vendor/katex/katex.min.css">
<link rel="stylesheet" href="/graph/plotter.css">
<div id="my-graph"></div>
<script type="module">
  import { createGraph } from '/graph/plotter.js';
  import { latexToInput } from '/engine/latex.js';
  import { createMathField } from '/math-editor.js';

  const graph = createGraph(document.querySelector('#my-graph'), {
    expressions: ['y=x^2', 'y=2x+1', 'x^2+y^2=9'],
    readExpression: latexToInput,
    createExpressionField(value, onChange) {
      return createMathField(value, { onInput: onChange });
    },
  });
  // graph.addExpression('y=1/x');
  // graph.setViewport({ xMin:-5, xMax:5, yMin:-5, yMax:5 });
</script>
```

Serve the entire vendor, graph, engine, and editor paths shown above. Copying just a single script without its fonts and module dependencies is not a complete embed.

## Features

- Multiple editable curves with visibility toggles, colors, and deletion
- Explicit functions in either orientation, vertical/horizontal lines, coordinate points, and implicit curves
- Numerical inequality shading and supported piecewise expressions
- Parameter sliders for `a`, `b`, and `c`
- Numbered major/minor grid lines and equal axis-unit aspect
- Optional logarithmic x and y axes with positive bounds, and a circular polar grid
- Bounded numerical polar and parametric curves, each with an explicit finite parameter interval
- Pointer drag to pan, anchored wheel zoom, touch pinch, and zoom/reset/fit buttons
- Keyboard arrows to pan, plus/minus to zoom, and Home to reset
- Coordinate readout, click-to-trace, editable window bounds, and PNG export
- Image import is available only when the graph is opened from `localhost`, `127.0.0.1`, or the IPv6 loopback address. It is hidden and disabled on the public site, including when an embed requests `showImageImport: true`. On localhost, the control below Window settings offers three drawing styles: bounded sine waves, straight-line functions, and adaptive colored-inequality rectangles. The global graph limit is 768 expressions. Images are not uploaded to a server by this feature.

Image import is a color-and-shape approximation, not a photorealistic tracing system. The wave and line styles create actual function paths with bounded domains; the mosaic style creates actual shaded inequalities. The imported formulas are the source of the rendered art; clicking a formula replaces its lightweight preview with a visual math editor. Keep rights to any source image you use, and check the separate art-contest rules before submitting exported work.

The factory returns `addExpression`, `setExpressions`, `getState`, `setViewport`, `zoom`, `reset`, `resize`, and `destroy`. Call `resize()` after revealing a graph that was mounted in a hidden tab, and `destroy()` when removing a graph permanently.

The Graph view can share a bounded, editable graph link through Google Classroom. The link restores up to 24 expressions, the viewport, parameters, and axis/grid modes. Sharing sends those details in the URL to Classroom when the user chooses the share control. Larger image-import graphs should be exported as PNG instead; this share path does not upload files or access a class roster. The Classroom Share URL is documented by [Google](https://developers.google.com/workspace/classroom/guides/sharebutton).

Use `createGraph(container, { xScale: 'log', yScale: 'linear', gridMode: 'cartesian', viewport: { xMin: 0.1, xMax: 100, yMin: -5, yMax: 5 } })` for a logarithmic x axis, or `gridMode: 'polar'` with linear axes for concentric circles and angle rays. Polar grid lines are a viewing aid; Cartesian `x`/`y` expressions keep their original meaning. `getState()` returns the modes, and `setGraphMode({ xScale, yScale, gridMode, viewport })` changes them on an existing graph. A log axis cannot show zero or negative coordinates.

Polar and parametric expressions are separate from the grid choice. Enter `polar(r=2+sin(theta);theta=0..2*pi)` to draw a polar curve, or `parametric(x=cos(t);y=sin(t);t=0..2*pi)` for a parametric curve. Both are sampled numerically within their stated finite intervals. They can be exported or included in a bounded Classroom graph link, but neither drawing is a proof of an identity or a complete equation solution.

Sampling and contours are bounded. Explicit sampling avoids connecting known poles; implicit contour edges require root-convergence checks rather than sign changes alone. The graph is a numerical exploration tool, not a proof. Features below the sample resolution can be missed; the symbolic verifier remains the authority for mathematical results.

MathLive and KaTeX are pinned, locally bundled MIT-licensed presentation dependencies. Their notices are retained in [the vendor assets](../vendor/). They are not the owned solver or proof checker.
