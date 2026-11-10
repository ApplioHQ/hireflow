# Hyperframes Composition Brief: Applio

## Objective
Create a short, polished launch-style brag video for Applio -- a free AI resume builder.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape -- 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: /Users/pritamavuthu/Projects/hireflow-main
- Primary files read: index.html, css/styles.css, ats-checker.html
- Product name: Applio
- Tagline / strongest claim: "The resume that gets you interviews" / "Free forever. No credit card."
- Key UI to recreate: the mock resume card with green ATS score ring (96/100) and "ATS Optimized" stamp
- Copy that must appear verbatim:
  - "The resume that gets you interviews"
  - "ATS Optimized"
  - "96" (the score)
  - "Free forever."
  - "appliohq.com"

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium product film for a genuinely free tool
- Interpretation: fewer scenes, longer holds, confidence through slow reveals and restraint. Mixed case, light-to-medium weight Sora. Slow crossfades. The energy says "we don't need to convince you."
- Angle: the premium product film for a tool that costs nothing. The tension between the production quality and "free" is the hook.
- LOOK: ground #111113, ink #e6e9f5, accent #6d4dfc, accent gradient 135deg #5a3ce8 to #8370ff, success #22c55e to #4ade80, Sora 400-700. BANNED: Inter, Space Grotesk, Geist, linear full-screen gradients, breathing/floating/pulsing loops.
- Hook: Applio logo + "The resume that gets you interviews" -- slow, confident
- Outro: "Free forever." -> "appliohq.com" in accent
- Avoid:
  - Generic SaaS language ("streamline your workflow")
  - Abstract filler visuals
  - Unrelated visual redesign
  - Waveform/equalizer visuals

## Visual Identity
- Background: #111113
- Text: #e6e9f5
- Muted: #9a9aa2
- Accent: #6d4dfc
- Accent deep: #5a3ce8
- Accent hover: #8370ff
- Success green: #22c55e (ring), #4ade80 (light)
- Card surface: #1c1c20 with border #33333a
- Display font: Sora (Google Fonts, 400-800) -- download woff2 to assets/fonts/
- Body font: Sora
- Visual references: hero mock resume, ATS score ring, scoring dimension icons

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook -- 4s -- logo + "The resume that gets you interviews" fade in on dark
2. The Product -- 6s -- mock resume card, ATS score ring filling 0->96, green stamp
3. What We Score -- 5s -- four dimension cards arriving one by one (Keywords, Formatting, Impact, Completeness)
4. The Punchline -- 5s -- "Free forever." then "appliohq.com"

## Audio
- Audio role: steady clean music bed with restrained professional accents
- Audio arc: music establishes in scene 1, steady through 2 and 3, fades out over final 1.5s of scene 4
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3
- Music treatment: volume 0.30, gentle fade-in 0.5s, fade-out over final 1.5s
- Music cue guidance: bundled preset at <skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json. Tempo ~110 BPM. Strong cues: ~8.74s for ATS score reveal, ~13.11s for dimension cards, ~18.56s for punchline.
- Audio-reactive treatment: subtle; RMS/bass on accent glow and card surface presence. No waveform/equalizer visuals.
- Audio-coupled moments:
  - Scene 2 / ATS score ring completion -- soft success bell
  - Scene 3 / first and last dimension card -- gentle card-place
  - Scene 4 / "Free forever." -- single soft bell aligned ~18.56s
- SFX selection guidance: polished tone = minimal SFX. Use impactBell_heavy_000 at 0.5 volume for reveals, interface/drop_001 for card arrivals. Prefer low HF-risk files.
- SFX analysis guidance: <skill-dir>/assets/sfx/sfx-analysis.md
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on implemented animation.
- Audio files: copy music into brag-output/composition/assets/music/

## Hyperframes Instructions
Load the composition-building Hyperframes skills (hyperframes, hyperframes-registry, media-use, hyperframes-cli). /brag is its own workflow: skip the hyperframes storyline step, don't read references/types/*, don't propose storylines, don't write a SPEC.md. The brag plan and composition brief replace them. Also skip usage, history, feedback and REVIEW.md steps; check is brag's gate.

Requirements:
- Show the mock resume with ATS score ring -- real UI from the project
- Keep all text readable in the final render
- Keep the video within 20 seconds
- Include the planned music/SFX layer
- Major reveals may align to strong cues within ~0.15s
- 4 dimension cards snap to beat grid (~0.8s apart)
- Use Sora font via @font-face (download woff2)
- Run hyperframes check before render
