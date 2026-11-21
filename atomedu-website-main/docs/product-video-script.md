# atomEDU product demo script

Target length: approximately 18 minutes. Speakers: Rahul Awasthi, Pritam Avuthu, and Akshaj Sanikommu. Rahul opens. This script follows the [20-slide presentation](../product-video.html) in order and combines narration with live product actions. The timing includes short pauses for the audience to read the screen.

## 0:00 to 0:55 | Slide 1 | Rahul opens

**Rahul:** "Hi, I'm Rahul Awasthi, one of the founders of atomEDU. We built Proof Lab around a simple problem: most online math tools tell a student whether an answer is right or wrong, but they do not show where the student's reasoning changed. Proof Lab lets students enter a problem, show their own steps, and inspect the first point where the work breaks down. Today, Pritam, Akshaj, and I will take you through the real product. We will solve a function, check student work, generate practice, explore the graph, and explain what our verification labels actually mean."

**Screen:** Begin on camera, then show the atomEDU logo and slide title. Open Proof Lab near the end of the introduction.

## 0:55 to 1:50 | Slide 2 | Rahul explains the problem

**Rahul:** "This equation shows why we started. The student begins with three x plus two equals two times x plus four. On the next line, they write two x plus four on the right. That looks close, but the two outside the parentheses must multiply both terms. The correct expansion is two x plus eight. Every later line can look organized and still lead to the wrong answer because the problem changed at that first step. A normal answer checker only sees the final response. Proof Lab is designed to identify the exact transition that failed and explain how to continue from there."

**Screen:** Show the submitted lines. Point first to `2(x + 4)`, then to the incorrect `2x + 4`. Pause before revealing the correction.

## 1:50 to 2:40 | Slide 3 | Pritam enters math

**Pritam:** "I'm Pritam Avuthu. Proof Lab starts with a visual math editor. I can type ordinary expressions directly, or open the math pad when I need a fraction, root, exponent, relation, or symbol. The gray spaces inside a template show exactly where each value belongs. I can move between them without writing raw LaTeX. The LaTeX source is still available for people who want it, but it is an optional view rather than a requirement. Here I am entering f of x equals two over x minus three, plus one. Once the expression is ready, I can send the same math into the solver or the graph."

**Screen:** Open the math pad, insert a fraction, complete both boxes, enter `f(x)=2/(x-3)+1`, and close the pad.

## 2:40 to 3:40 | Slide 4 | Pritam solves a function

**Pritam:** "When I press Solve, the engine analyzes the supported features of this rational function. The denominator becomes zero at x equals three, so that value must stay outside the domain. The same value gives us the vertical asymptote. The result also lists the intercepts, horizontal behavior, transformed form, and range when those features can be verified. Each part is separated so the output is readable instead of appearing as one oversized block of notation. The important point is that restrictions remain attached to the result. Rewriting an expression must never silently bring an excluded value back into the domain."

**Screen:** Press Solve. Pause on the verified status, domain, vertical asymptote, and intercept cards. Scroll only far enough to show the grouped result.

## 3:40 to 4:30 | Slide 5 | Pritam reveals the proof timeline

**Pritam:** "The answer is followed by a proof timeline. It does not have to reveal every step immediately. I can choose Show next step, read the transformation and its rule, and then continue when I am ready. Proof Lab also separates two different ideas. LaTeX validation means the notation can be parsed and displayed. Mathematical verification means the supported claim has been checked against the original problem. A polished equation is not automatically true. That distinction keeps the interface honest and gives students time to think before the next line appears."

**Screen:** Reveal two timeline entries one at a time. Keep each rule and verification marker visible for several seconds.

## 4:30 to 5:25 | Slide 6 | Rahul checks student work

**Rahul:** "Now I will submit the student's work from our opening example. The lines stay in the same order the student wrote them. Proof Lab compares each transition with the line before it and stops at the first unsupported change. Here it identifies the distribution mistake: two multiplied x, but did not multiply four. The explanation shows the correct expansion, two x plus eight. That matters because later arithmetic cannot repair an equation that was already changed. The actual solution is x equals six, but the most useful feedback is not the final number. It is the exact step the student can understand and fix."

**Screen:** Submit the incorrect work. Point to the first-error marker, the student's line, and the corrected distribution.

## 5:25 to 6:15 | Slide 7 | Akshaj explains Ghost steps

**Akshaj:** "I'm Akshaj Sanikommu. Students often skip routine arithmetic when they show their work, and that should not automatically count as an error. If a jump is valid and the engine can prove the missing transitions, Ghost steps reconstruct the checkpoints in between. Those lines are translucent and clearly labeled so they cannot be mistaken for work the student actually submitted. When a submitted step is wrong, a corrected continuation can also appear with its own label. The original mistake remains visible, while the student gets a route back into the problem."

**Screen:** Show the Ghost-step view. Trace one submitted line, one reconstructed line, and the corrected continuation.

## 6:15 to 7:05 | Slide 8 | Akshaj generates practice

**Akshaj:** "After feedback, a student can create another problem in the same area. In Generate, I choose a supported topic, set a difficulty from zero point zero zero zero to one point zero zero zero, and optionally set a seed. The seed makes the result reproducible, so a teacher and student can return to the same question. Difficulty selects a starting tier and changes the structure of the generated family. It is not a universal measurement of how hard math feels to every student. The generator uses atomEDU's own templates and rules, and it creates problems intended for the same engine that checks them."

**Screen:** Choose a topic, move the difficulty control, enter a seed, generate a problem, and show the Check work action.

## 7:05 to 7:55 | Slide 9 | Pritam graphs a function

**Pritam:** "Graph mode gives the expression list its own workspace beside the coordinate plane. I can enter y equals sine of x, press Enter for another expression, and compare the curves without leaving the page. The color control, visibility control, undo, redo, zoom, and window tools stay close to the graph. I can also pan and inspect coordinates. The graph is for numerical exploration. A crossing that looks exact on the screen is still a visual estimate until the mathematical engine proves the corresponding claim."

**Screen:** Enter `y=sin(x)`, add a second expression, zoom once, and undo the zoom or expression change.

## 7:55 to 8:45 | Slide 10 | Rahul changes the graph window

**Rahul:** "The graph window can be adjusted without changing the expressions. I can set exact x and y bounds, reset the view, or fit the visible curves. Linear axes work for most examples, while logarithmic axes help with multiplicative scale. A polar grid is available for circular and angle-based relationships. These are viewing choices, not new solutions. On smaller screens, the expression panel and graph switch cleanly so neither one has to compete for the entire display. The goal is to make experimentation quick while keeping the underlying formulas editable."

**Screen:** Open Window settings, change one bound, reset it, and briefly show a logarithmic axis and the polar grid.

## 8:45 to 9:40 | Slide 11 | Akshaj explains the engine

**Akshaj:** "Behind the interface is a rule-based mathematics engine built by atomEDU. First, it parses the input into a structured mathematical form. Next, it routes the problem to a supported family and applies exact operations where that family allows them. The solver then produces a result with evidence and a certificate. A separate verifier replays that certificate against the original input. We do not ask a language model whether the answer merely looks convincing. We also test false steps, altered domains, forged certificates, and unsupported forms. A checker has to reject incorrect work as reliably as it accepts correct work."

**Screen:** Walk across the four labels on the slide: Input, Rule, Result, and Verification. Pause on Verification.

## 9:40 to 10:30 | Slide 12 | Akshaj explains the three tiers

**Akshaj:** "The engine uses three routing tiers. Problems below zero point four zero zero begin in Engine One. Values from zero point four zero zero through zero point six four nine begin in Engine Two. Values from zero point six five zero through one point zero zero zero begin in Engine Three. A quick inspection can move a problem upward when it needs a stronger route. These are not three outside AI models. They are routing levels across our supported modules. The certificate check, not the difficulty number, decides whether the final result can be called verified."

**Screen:** Highlight each range in order. Keep the scope note visible and do not describe the tiers as trained models.

## 10:30 to 11:20 | Slide 13 | Pritam shares a graph

**Pritam:** "A graph can be shared without taking a screenshot. Copy graph link creates a bounded link containing the expressions, colors, visibility settings, axes, grid, and viewport. When that link opens, the same graph is restored and remains editable. Proof Lab also offers a Google Classroom sharing path for teachers who want to place the link into a class workflow. That is an integration feature, not a claim of an official Google partnership. Because the graph state is carried into the link, users should avoid placing private student information in expression labels or titles they plan to share."

**Screen:** Copy the graph link, open it in another tab, confirm the expressions and viewport, then show the Classroom option.

## 11:20 to 12:10 | Slide 14 | Rahul introduces the team and progress

**Rahul:** "atomEDU began in O'Fallon, Missouri, with students building the math tool we wanted to use ourselves. The company is led by Pritam, Akshaj, and me. Proof Lab has reached more than 3,640 users based on our current count, and our featured corporate partners are VC Boom and MedAestheticsOS. That growth is encouraging, but it also gives us a responsibility to be precise. We publish what the engine supports, label what it cannot verify, and listen when students or educators find a confusing result or missing rule."

**Screen:** Show the user figure, the three founders, and the two partner marks. Verify the current figure and mark permissions before recording.

## 12:10 to 13:05 | Slide 15 | Akshaj demonstrates a study session

**Akshaj:** "Here is how the pieces work together in a study session. I generate a problem in the topic I am practicing, but I do not open the full solution first. I move it into Check work and enter the steps I would normally write on paper. If the checker finds an invalid transition, I stop at that line and try again. If the move was valid but too large, Ghost steps can expose the missing checkpoints. Only after I make another attempt do I open Solve and compare methods. That order keeps the student's reasoning at the center of the experience."

**Screen:** Generate a problem, move it to Check work, enter two lines, and inspect the first piece of feedback before opening Solve.

## 13:05 to 14:00 | Slide 16 | Pritam explains verification

**Pritam:** "The verified badge has a narrow, testable meaning. The solver produced a result for a supported family, and the verifier successfully replayed the attached certificate against the original problem. If the answer, restriction, evidence, or input is changed, that replay should fail. The same principle applies to student work: a transition must preserve the mathematics and its domain, not just resemble a familiar step. This is still software, so it can have bugs. Verification is not a promise of perfection. It is a concrete record of which checks this supported result passed."

**Screen:** Point to the verified badge, the original input, and one certificate-backed result. Contrast it with the separate LaTeX-valid label.

## 14:00 to 14:55 | Slide 17 | Akshaj describes coverage

**Akshaj:** "Coverage is listed by rule family rather than by a broad promise about an entire course. Proof Lab currently supports selected families across Algebra One, Algebra Two, Geometry, and Precalculus. Those families include equations, inequalities, functions, coordinate geometry, exact trigonometric cases, conics, and geometry proofs with explicit premises. A topic name does not mean every possible textbook question is supported. Diagram-based geometry is a good example because a picture may suggest facts that were never stated. We expand coverage by implementing the rule, defining its limits, and adding acceptance and rejection tests."

**Screen:** Open Coverage and show several supported families from different subjects. Pause on one visible limitation.

## 14:55 to 15:50 | Slide 18 | Akshaj describes boundaries

**Akshaj:** "The boundaries are part of the product. Some notation can be displayed correctly but is not yet supported by the solver. Some graphs can be explored numerically but do not provide an exact proof. Geometry steps may depend on an assumption that was never given. In each case, Proof Lab should say unsupported, partial, numerical, or unverified instead of turning uncertainty into a confident answer. Students can still use those views to investigate and discuss the problem with a teacher. The label tells them what kind of evidence they are actually looking at."

**Screen:** Compare a numerical graph with a verified result, then show an unsupported status. Keep the status label in frame.

## 15:50 to 16:50 | Slide 19 | Rahul offers a starting point

**Rahul:** "If this is your first time using Proof Lab, start with one real problem you are already working on. Open Check work, enter the original problem, and add the first step you are unsure about. Read the first explanation before revealing a full solution. If you do not know how to begin, Solve can show a supported method one step at a time. If you want another attempt, Generate can create a reproducible problem in the same topic. Graph can help you explore how a function behaves. You do not need every mode at once. The basic habit is simple: write the reasoning, check the transition, and try again."

**Screen:** Begin on the atomEDU home page, choose Start math, and finish in Check work with the first step field active.

## 16:50 to 18:00 | Slide 20 | All three close

**Rahul:** "That is Proof Lab. We began with one incorrect line in an otherwise familiar equation, and we followed that line through the editor, solver, checker, generator, graph, and verification system."

**Pritam:** "When you try it, bring a problem that matters to you. Enter the math, show the steps you would actually write, and use the first piece of feedback before opening the whole answer."

**Akshaj:** "Look at the status labels as you work. Verified mathematics, valid notation, numerical exploration, and unsupported requests are different things, and Proof Lab is designed to keep those differences visible."

**Rahul:** "We are Rahul Awasthi, Pritam Avuthu, and Akshaj Sanikommu. You can use Proof Lab at atom-edu.org. Thanks for watching, and we hope it helps you find the step that changes the problem."

**Screen:** Return to camera for the three closing lines. Finish on slide 20 with the three founder portraits, atomEDU logo, and site address for five seconds.

## Recording notes

- Rehearse with a timer. The full run should land between 17:30 and 18:30, including screen actions and reading pauses.
- Rahul opens and handles the motivating problem, graph window, company progress, and first-visit workflow. Pritam handles the editor, Solve, timeline, graph, sharing, and verification. Akshaj handles Ghost steps, generation, engine architecture, routing tiers, study flow, coverage, and boundaries.
- Record demonstrations at 1024 by 768 or wider. Enlarge the cursor and pause on the first-error explanation, one Ghost step, one timeline rule, and every status label mentioned aloud.
- Use the live rule-based product. Do not claim complete Algebra I, Algebra II, Geometry, or Precalculus coverage. The [current coverage checklist](./standards-coverage.md) records the bounded scope.
- Verify the current user count and permission to display each partner mark before filming. Do not describe atomEDU as an official Google or Google Classroom partner.
- Re-record any product scene if the interface changes before publication so the narration always matches the screen.
