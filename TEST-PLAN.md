# Autonomous Figma workaround test (ZD-54827)

Goal: check whether an Autonomous Custom Flow can compare a live web page against a Figma design, by first capturing a hosted export of the design as the baseline.

## Test pages

- Design (Figma export, 1280 x 1050 PNG at 1x): https://ssharma007-dev.github.io/autonomous-figma-test/design/
- Faithful site (matches the design): https://ssharma007-dev.github.io/autonomous-figma-test/site/
- Site with 3 seeded bugs: https://ssharma007-dev.github.io/autonomous-figma-test/site-bugs/
- Figma source: https://www.figma.com/design/hdJest9lMIQGKOsAopWtBG (frame "Home – Desktop 1280", node 1:2)

Seeded bugs on site-bugs:
1. Primary button colour is #7C3AED instead of #4F46E5
2. "Docs" link is missing from the nav
3. Headline reads "Ship faster with total confidence"

## How the Figma link works (verified in Chrome, 2026-10-28)

- The Figma REST API (`GET /v1/images/<fileKey>?ids=<nodeId>&format=png&scale=1`, token scope `file_content:read`) returns a public PNG link on Figma's S3 storage. It needs no login, displays in Chrome (no download header) and expires after about 30 days.
- Opened directly, it only looks right when the Chrome viewport exactly matches the image size. Otherwise Chrome shrinks it and adds a dark background.
- Through `wrapper/?img=<link>` it renders at 1x with no margins. The Chrome screenshot is pixel-identical to the Figma image.
- The link only has to work for Run 1. After that, Eyes keeps its own copy as the baseline.

## Step 1: Create the Custom Flow

Requirement: an Autonomous sandbox team (not a customer org).

1. Create a Custom Flow named `Figma workaround – Home`.
2. Set the environment to Chrome, viewport **1280 x 1050**. The width must be exactly 1280 to match the Figma frame.
3. Steps:
   - Go to the Figma-hosted image, through the wrapper (no hosting needed):
     https://ssharma007-dev.github.io/autonomous-figma-test/wrapper/?img=https%3A%2F%2Ffigma-alpha-api.s3.us-west-2.amazonaws.com%2Fimages%2Fa91006e5-00ec-4bf6-89c5-6510eca532ef
     (made with `./get-figma-link.sh "<Figma frame link>"`; the Figma link expires 28 Nov 2026.
     Fallback if it has expired: https://ssharma007-dev.github.io/autonomous-figma-test/design/)
   - Visually check the full page (name the checkpoint `Home`)
4. Set the match level to **Layout**.

## Step 2: Run 1 (design becomes the baseline)

1. Run the flow.
2. In Eyes, open the result and confirm the screenshot is the clean Figma design (no scrollbars, no margin, nothing cut off).
3. Make sure it is saved as the baseline. It is a new test, so it should be saved automatically.

## Step 3: Run 2 (faithful site, noise check)

1. Edit the **same** flow and change only the URL to https://ssharma007-dev.github.io/autonomous-figma-test/site/
2. Keep the checkpoint name, browser, viewport and match level the same.
3. Run it, and record:
   - (1) Was it compared against the Run 1 baseline, or was a new baseline created? This is the key question.
   - (2) If compared: on Layout, did it pass or show differences? Locally, Strict-style pixel diff showed about 3% noise from text rendering, so Layout should pass.
4. Do **not** accept this result as the new baseline.

## Step 4: Run 3 (seeded bugs)

1. Change the URL to https://ssharma007-dev.github.io/autonomous-figma-test/site-bugs/ and run again.
2. Record which of the 3 bugs Eyes flags on Layout:
   - (1) Button colour: Layout ignores colour, so expect this to be missed. Re-check with Strict to see the noise level.
   - (2) Missing Docs link: should be flagged.
   - (3) Headline text change: should be flagged as a layout change.

## Step 5: If Step 3 created a new baseline instead

Try these, in order:
1. Two separate Custom Flows with the **same test name**, one per URL.
2. Run 1 as is, then in Eyes use the baseline from the design run for the site run (if the Eyes dashboard allows linking or copying baselines between tests).
3. Ask R&D (FDE-22) how Autonomous builds the baseline key for Custom Flows.

## Results

| Run | URL | Compared to design baseline? | Result | Notes |
|---|---|---|---|---|
| 1 | design/ | n/a (new baseline) | | |
| 2 | site/ | | | |
| 3 | site-bugs/ | | | |
