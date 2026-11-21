# atomEDU website and verified math engine

A static site with a browser-based math engine. There is no site build step; serve the folder over HTTP so Proof Lab's JavaScript modules can load.

The production site publishes from the root of `main` through GitHub Pages. Keep `CNAME` set to `atom-edu.org` so the custom domain stays attached when replacing site files.

## Math engine

Proof Lab is a locally hosted visual LaTeX workbench with an owned deterministic symbolic math engine. It does not call an LLM, send problems to a remote service, or require an API key. MathLive supplies visual input and KaTeX supplies typesetting, both bundled locally with their licenses; neither decides mathematical correctness. Algebra uses exact rational arithmetic and polynomial identities rather than numerical sampling. Geometry measurements distinguish exact formulas from approximate numerical values.

Start the local server for browser modules:

```sh
npm start
```

Open [Proof Lab](http://127.0.0.1:8080/proof-lab.html). Its four views solve problems, check student work with Ghost steps, generate seeded practice at difficulty `0.000` through `1.000`, and provide a full interactive graphing workspace. Fractions, roots, matrices, piecewise functions, and other templates have editable placeholder boxes. A large symbol and number pad edits the active expression.

The graph offers Cartesian, logarithmic-axis, and polar-grid views. A user may explicitly share a bounded graph link to Google Classroom; that sends the graph expressions and window settings in the URL to Google, where the user chooses a class. This is link sharing, not roster access, automatic grading, or an OAuth-backed Classroom API connection. The math solver still runs locally and never calls Google to decide an answer.

The vendored math assets are ready to serve. To reinstall or refresh the pinned editor/renderer dependencies, run `npm ci`; `npm run build` reproducibly copies their browser files, fonts, and licenses into the served assets. MathLive and KaTeX do not need a CDN at runtime; the site typography still loads from Google Fonts.

```sh
npm test
npm run benchmark
npm run benchmark:curriculum
node engine/cli.js solve 'f(x)=2/(x-3)+1'
node engine/cli.js solve 'x^2+1=0' --domain complex
node engine/cli.js check --problem '2(x+3)=14' --steps '2x+6=14;x=4'
node engine/cli.js generate --topic quadratic --difficulty 0.750 --seed practice --count 10
```

The generator CLI streams newline-delimited JSON, supports up to one million problems per invocation, and checks each problem before emitting its solution. Increasing the count does not create new mathematical rule families. The generated benchmark is a reproducible regression check. The separate curriculum benchmark uses fixed authored answers and includes known gaps; neither is a standardized curriculum assessment.

See [graph embedding and controls](./graph/README.md) for connecting the graph workspace to another page without a paid service.

See [the engine API and supported inputs](./engine/README.md) and [the product plan](./math-engine-plan.md).
The [standards coverage checklist](./docs/standards-coverage.md) maps verified subsets and remaining gaps against Missouri DESE Algebra I, Algebra II, Geometry, and AP Precalculus Units 1–4. It is not a claim of complete course coverage.

The [20-minute product demo script](./docs/product-video-script.md) pairs with the [20-slide browser presentation](./product-video.html). The [30-day education opportunity map](./docs/education-opportunities-30-days.md) separates actions we can take from approvals controlled by each platform.

## Pages
- `index.html` - main page
- `features.html` - Proof Lab's four views, visual editor, and verification boundaries
- `learn.html` - how to use Proof Lab
- `about.html` - why atomEDU exists
- `contact.html` - email contact and FAQ
- `proof-lab.html` - local math engine, work checking, and generated practice
- `math-lab.html` - redirect for old links
- `art-contest.html` - public daily graph-art contest
- `judging.html` - password-protected contest judging view

## Shared files
- `styles.css` - all styling (cream palette, fonts, layout)
- `site.js` - sticky header, mobile menu, active nav link
- `images/` - logos, three graph backgrounds, and footer artwork

## Fonts
Loaded from Google Fonts: Poiret One (headings), Fraunces (serif accent words), Space Grotesk (body), and Roboto (Classroom integration text). They load over the internet. To ship offline, download the font files and point the `@font-face` rules at local copies.

## About the images
The first home slide uses the local polar graph image `images/bg1.png`. The second uses the Webb Cosmic Cliffs image in `images/bg2.jpg`, and the third uses the Table Mountain pelargonium photo in `images/bg3.jpg`. Image credits are listed on the site. The footer uses the original `images/footer.svg` artwork.

## Color and type
Edit the variables at the top of `styles.css` under `:root` to change the palette. The accent is `--accent` (currently a warm clay). Everything keys off those variables.
