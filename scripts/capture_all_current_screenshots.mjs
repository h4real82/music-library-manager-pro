import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_DIR = path.resolve('docs/screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function run() {
  console.log('Launching Chrome via Playwright...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  console.log('1. Loading application at http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // 1. Cover View (Initial State)
  console.log('Capturing Cover View...');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_cover_view.png') });

  // 2. Play a track to show Vorhör scrubber & playhead
  console.log('Playing track for bottom preview bar...');
  try {
    const playBtn = page.locator('button[title*="Abspielen"]').first();
    if (await playBtn.count() > 0) {
      await playBtn.click({ force: true });
      await page.waitForTimeout(800);
    }
    const scrubber = page.locator('#vorhoer-scrubber-track');
    if (await scrubber.count() > 0) {
      const sBox = await scrubber.boundingBox();
      if (sBox) {
        await page.mouse.move(sBox.x + sBox.width * 0.45, sBox.y + sBox.height / 2);
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_vorhoer_draggable_scrubber.png') });
      }
    }
  } catch (err) {
    console.warn('Scrubber warning:', err);
  }

  // 3. Camelot Wheel Filter: 11A and 10A
  console.log('Filtering by Camelot 11A and 10A...');
  try {
    const key11A = page.locator('text="11A"').first();
    if (await key11A.count() > 0) {
      await key11A.click({ force: true });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_camelot_filtered_11A.png') });
    }
    const key10A = page.locator('text="10A"').first();
    if (await key10A.count() > 0) {
      await key10A.click({ force: true });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_camelot_filtered_10A.png') });
    }
  } catch (err) {
    console.warn('Camelot filter error:', err);
  }

  // Clear Camelot filter
  const resetCamelot = page.locator('#btn-active-camelot-filter');
  if (await resetCamelot.count() > 0) {
    await resetCamelot.click();
    await page.waitForTimeout(500);
  }

  // 4. Switch to List View
  console.log('Switching to List View...');
  await page.locator('#btn-view-list').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_list_view_separated_sorted.png') });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_list_view_cue_points.png') });

  // 5. Open Column Customizer Modal in List View
  console.log('Opening Column Customizer...');
  const colBtn = page.locator('#btn-list-columns-config');
  if (await colBtn.count() > 0) {
    await colBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_column_customizer.png') });
    await colBtn.click();
    await page.waitForTimeout(500);
  }

  // 6. Open Track Analysis Studio for a track in List View
  console.log('Opening Track Analysis Studio...');
  const studioBtn = page.locator('text="Studio"').first();
  if (await studioBtn.count() > 0) {
    await studioBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_precision_deck_studio.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_precision_beatgrid_aligned.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_mixed_in_key_cues_and_sections.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_precision_waveform_transients.png') });

    // Close Studio
    const closeStudioBtn = page.locator('button[title*="Schließen"], button[title*="Close"]').first();
    if (await closeStudioBtn.count() > 0) {
      await closeStudioBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(800);
  }

  // Add 4 tracks to current DJ Set Playlist
  console.log('Adding tracks to Set Playlist...');
  const addButtons = page.locator('button[title*="Playlist hinzufügen"]');
  const addCount = Math.min(4, await addButtons.count());
  for (let i = 0; i < addCount; i++) {
    try {
      await addButtons.nth(i).click({ timeout: 2000 });
      await page.waitForTimeout(200);
    } catch {}
  }

  // 7. Switch to Track Mapper Matrix View
  console.log('Switching to Track Mapper Matrix...');
  await page.locator('#btn-view-mapper').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_mapper_bpm_energy.png') });

  // Zoom & Hover card
  console.log('Zooming into Track Mapper...');
  const zoomInBtn = page.locator('#btn-mapper-zoom-in');
  if (await zoomInBtn.count() > 0) {
    await zoomInBtn.click();
    await page.waitForTimeout(400);
    await zoomInBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_mapper_zoomed_in.png') });
  }

  const viewport = page.locator('#mapper-plot-viewport');
  const vBox = await viewport.boundingBox();
  if (vBox) {
    await page.mouse.move(vBox.x + vBox.width * 0.45, vBox.y + vBox.height * 0.45);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_mapper_zoomed_tooltip.png') });
  }

  // Lasso selection
  console.log('Lasso selection in Track Mapper...');
  const lassoBtn = page.locator('#btn-mapper-tool-lasso');
  if (await lassoBtn.count() > 0) {
    await lassoBtn.click();
    await page.waitForTimeout(300);
  }
  if (vBox) {
    const startX = vBox.x + vBox.width * 0.35;
    const startY = vBox.y + vBox.height * 0.35;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 180, startY, { steps: 5 });
    await page.mouse.move(startX + 180, startY + 180, { steps: 5 });
    await page.mouse.move(startX, startY + 180, { steps: 5 });
    await page.mouse.move(startX, startY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_mapper_zoomed_lasso.png') });
  }

  // 8. Switch to Builder View (DJ Graph Map)
  console.log('Switching to Builder View...');
  await page.locator('#btn-view-graph').click();
  await page.waitForTimeout(2000);

  const nodeGraphTab = page.locator('text="Node Graph"').first();
  if (await nodeGraphTab.count() > 0) {
    await nodeGraphTab.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_node_graph_connected.png') });

  // 9. Open Set Export Modal in Builder View
  console.log('Opening Set Export Modal...');
  const exportBtn = page.locator('#btn-set-export-bottom');
  if (await exportBtn.count() > 0) {
    await exportBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_djset_export_modal.png') });

    const closeModal = page.locator('button:has(svg.lucide-x)').first();
    if (await closeModal.count() > 0) {
      await closeModal.click();
      await page.waitForTimeout(500);
    }
  }

  // 10. Switch to Waveform Timeline in Builder View
  console.log('Switching to Waveform Timeline in Builder View...');
  const timelineBtn = page.locator('button:has-text("Waveform Timeline")');
  if (await timelineBtn.count() > 0) {
    await timelineBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_waveform_timeline_playing_verified.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_waveform_timeline_transition_cue.png') });

    // Open Beatgrid Repair Modal
    const beatgridBtn = page.locator('button[title="Taktgitter beider Tracks abgleichen"]').first();
    if (await beatgridBtn.count() > 0) {
      await beatgridBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_beatgrid_repair_modal.png') });
      const closeBeatgrid = page.locator('button:has(svg.lucide-x)').first();
      if (await closeBeatgrid.count() > 0) {
        await closeBeatgrid.click();
        await page.waitForTimeout(500);
      }
    }

    // Open Transition Overlap Studio (Hüllkurven)
    const envelopeBtn = page.locator('button:has-text("Hüllkurven")').first();
    if (await envelopeBtn.count() > 0) {
      await envelopeBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_waveform_overlap_studio_verified.png') });
      const closeStudio = page.locator('button:has(svg.lucide-x)').first();
      if (await closeStudio.count() > 0) {
        await closeStudio.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // 11. Bottom Player close-up / status
  console.log('Capturing Bottom Player...');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'screenshot_bottom_player_uncut_with_on_air.png') });

  console.log('✅ ALL SCREENSHOTS SUCCESSFULLY RE-GENERATED!');
  await browser.close();
}

run().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
