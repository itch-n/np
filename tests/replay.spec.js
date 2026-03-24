import { test, expect } from '@playwright/test';

const ANIMATION_DURATION = 1500;
const ANIMATION_START_DELAY = 300;
const SETTLE_BUFFER = 500;
const TOTAL_WAIT = ANIMATION_START_DELAY + ANIMATION_DURATION + SETTLE_BUFFER;

test('replay resets shield visited class before re-animating', async ({ page }) => {
  await page.goto('/');

  // Wait for images to load and the replay button to become enabled
  const replayBtn = page.locator('#replay-btn');
  await expect(replayBtn).toBeEnabled({ timeout: 15000 });

  // Wait for the initial animation to finish
  await page.waitForTimeout(TOTAL_WAIT);
  await expect(replayBtn).toBeEnabled();

  // After initial animation, some shields should be visited
  const visitedCountBefore = await page.evaluate(() =>
    document.querySelectorAll('image.place.visited').length
  );
  console.log('visited shields after initial animation:', visitedCountBefore);
  expect(visitedCountBefore).toBeGreaterThan(0);

  // Click replay
  await replayBtn.click();

  // Immediately check - no shields should have the visited class
  const visitedCountAfterClick = await page.evaluate(() =>
    document.querySelectorAll('image.place.visited').length
  );
  console.log('visited shields immediately after click:', visitedCountAfterClick);
  expect(visitedCountAfterClick).toBe(0);

  // Wait for animation to complete and verify visited shields are back
  await expect(replayBtn).toBeDisabled();
  await expect(replayBtn).toBeEnabled({ timeout: TOTAL_WAIT + 1000 });

  const visitedCountAfterAnimation = await page.evaluate(() =>
    document.querySelectorAll('image.place.visited').length
  );
  console.log('visited shields after replay animation:', visitedCountAfterAnimation);
  expect(visitedCountAfterAnimation).toBe(visitedCountBefore);
});
