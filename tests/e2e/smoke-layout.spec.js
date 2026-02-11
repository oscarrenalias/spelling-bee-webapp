import { expect, test } from "@playwright/test";

async function gotoAndWaitForReady(page) {
  await page.goto("/");
  await expect(page.locator("#app-shell")).toBeVisible();
  await expect(page.locator("#word-input")).toBeVisible();
  await expect(page.locator("letter-board")).toBeVisible();
}

test.describe("core ui smoke", () => {
  test("loads game shell and allows keyboard submission", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const input = page.locator("#word-input");
    await input.fill("zzzz");
    await input.press("Enter");

    await expect(page.locator("#feedback")).not.toHaveText("");
  });

  test("responsive layout toggles between desktop and mobile modes", async ({ page, isMobile }) => {
    await gotoAndWaitForReady(page);

    const positions = await page.evaluate(() => {
      const left = document.querySelector(".left-panel");
      const right = document.querySelector(".right-panel");
      if (!left || !right) {
        return null;
      }

      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return {
        rightStartsBelowLeft: rightRect.top > leftRect.top + 8,
        rightStartsToRight: rightRect.left > leftRect.left + 80
      };
    });

    expect(positions).not.toBeNull();

    if (isMobile) {
      expect(positions.rightStartsBelowLeft).toBe(true);
    } else {
      expect(positions.rightStartsToRight).toBe(true);
    }
  });

  test("mobile viewport has no horizontal overflow", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");

    await gotoAndWaitForReady(page);

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasOverflow).toBe(false);
  });
});
