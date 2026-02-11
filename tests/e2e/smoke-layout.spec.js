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

  test("mobile sessions open in dedicated overlay and stay out of normal flow", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    await expect(page.locator(".session-panel")).toBeHidden();
    await expect(page.locator("#open-sessions")).toBeVisible();

    const layoutOrder = await page.evaluate(() => {
      const board = document.querySelector(".board-stack");
      const found = document.querySelector(".found-panel");
      if (!board || !found) {
        return null;
      }
      const boardRect = board.getBoundingClientRect();
      const foundRect = found.getBoundingClientRect();
      return { foundBelowBoard: foundRect.top > boardRect.bottom };
    });

    expect(layoutOrder).not.toBeNull();
    expect(layoutOrder.foundBelowBoard).toBe(true);

    await page.locator("#open-sessions").click();
    await expect(page.locator(".session-panel")).toBeVisible();

    await page.locator("#close-sessions").click();
    await expect(page.locator(".session-panel")).toBeHidden();
  });

  test("desktop keeps inline sessions panel visible", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only assertion");
    await gotoAndWaitForReady(page);

    await expect(page.locator(".session-panel")).toBeVisible();
    await expect(page.locator("#open-sessions")).toBeHidden();
  });

  test("board click/tap, delete, and submit controls work", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const centerHex = page.locator("letter-board").locator("polygon[data-hex='center']");
    await expect(page.locator("#submit-word")).toBeVisible();
    await expect(page.locator("#delete-letter")).toBeVisible();

    await centerHex.click();
    await centerHex.click();
    await centerHex.click();
    await centerHex.click();
    await expect(page.locator("#word-input")).toHaveValue(/^[a-z]{4}$/);

    await page.locator("#delete-letter").click();
    await expect(page.locator("#word-input")).toHaveValue(/^[a-z]{3}$/);

    await centerHex.click();
    await expect(page.locator("#word-input")).toHaveValue(/^[a-z]{4}$/);

    await page.locator("#submit-word").click();
    await expect(page.locator("#feedback")).not.toHaveText("");
  });

  test("board letters are rendered visibly", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const centerLabelMetrics = await page.locator("letter-board").evaluate((host) => {
      const centerText = host.shadowRoot?.querySelector("text[data-slot='center']");
      if (!(centerText instanceof SVGTextElement)) {
        return null;
      }

      const box = centerText.getBBox();
      return {
        text: centerText.textContent ?? "",
        x: centerText.getAttribute("x"),
        y: centerText.getAttribute("y"),
        width: box.width,
        height: box.height
      };
    });

    expect(centerLabelMetrics).not.toBeNull();
    expect(centerLabelMetrics.text.trim().length).toBeGreaterThan(0);
    expect(centerLabelMetrics.x).toBeTruthy();
    expect(centerLabelMetrics.y).toBeTruthy();
    expect(centerLabelMetrics.width).toBeGreaterThan(0);
    expect(centerLabelMetrics.height).toBeGreaterThan(0);
  });
});
