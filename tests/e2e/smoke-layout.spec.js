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

  test("mobile top bar keeps seed controls collapsed by default", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    await expect(page.locator("#toggle-seed-controls")).toBeVisible();
    await expect(page.locator("#seed-form")).toBeHidden();

    await page.locator("#toggle-seed-controls").click();
    await expect(page.locator("#seed-form")).toBeVisible();
    await expect(page.locator("#toggle-seed-controls")).toHaveAttribute("aria-expanded", "true");
  });

  test("mobile status summary keeps score rank and found on one row", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    const rowMetrics = await page.evaluate(() => {
      const score = document.querySelector(".score-chip");
      const rank = document.querySelector(".rank-summary");
      const found = document.querySelector(".found-summary");
      if (!score || !rank || !found) {
        return null;
      }

      const scoreTop = score.getBoundingClientRect().top;
      const rankTop = rank.getBoundingClientRect().top;
      const foundTop = found.getBoundingClientRect().top;
      return {
        maxDelta: Math.max(Math.abs(scoreTop - rankTop), Math.abs(scoreTop - foundTop), Math.abs(rankTop - foundTop))
      };
    });

    expect(rowMetrics).not.toBeNull();
    expect(rowMetrics.maxDelta).toBeLessThan(10);
  });

  test("mobile board actions stay sticky near the bottom", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    const stickyMetrics = await page.evaluate(() => {
      const actions = document.querySelector(".board-actions");
      if (!actions) {
        return null;
      }

      const style = window.getComputedStyle(actions);
      const rect = actions.getBoundingClientRect();
      return {
        position: style.position,
        bottomOffset: window.innerHeight - rect.bottom,
        viewportHeight: window.innerHeight
      };
    });

    expect(stickyMetrics).not.toBeNull();
    expect(stickyMetrics.position).toBe("sticky");
    expect(stickyMetrics.bottomOffset).toBeLessThan(stickyMetrics.viewportHeight * 0.45);
  });

  test("mobile gameplay uses page scroll instead of nested found-words scrolling", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    const foundWordsStyles = await page.evaluate(() => {
      const list = document.querySelector("#found-words");
      if (!list) {
        return null;
      }
      const style = window.getComputedStyle(list);
      return {
        maxHeight: style.maxHeight,
        overflowY: style.overflowY
      };
    });

    expect(foundWordsStyles).not.toBeNull();
    expect(foundWordsStyles.maxHeight).toBe("none");
    expect(foundWordsStyles.overflowY).toBe("visible");
  });

  test("mobile controls meet 44px touch-target minimum", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    const targetMetrics = await page.evaluate(() => {
      const selectors = [".board-actions #delete-letter", ".board-actions #submit-word", ".board-actions #shuffle-letters"];
      return selectors.map((selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) {
          return { selector, width: 0, height: 0 };
        }
        const rect = node.getBoundingClientRect();
        return { selector, width: rect.width, height: rect.height };
      });
    });

    for (const metric of targetMetrics) {
      expect(metric.width).toBeGreaterThanOrEqual(44);
      expect(metric.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("mobile word input uses keyboard-friendly attributes", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    const attrs = await page.evaluate(() => {
      const input = document.querySelector("#word-input");
      if (!(input instanceof HTMLInputElement)) {
        return null;
      }
      return {
        autocapitalize: input.getAttribute("autocapitalize"),
        autocomplete: input.getAttribute("autocomplete"),
        autocorrect: input.getAttribute("autocorrect"),
        inputmode: input.getAttribute("inputmode"),
        enterkeyhint: input.getAttribute("enterkeyhint")
      };
    });

    expect(attrs).not.toBeNull();
    expect(attrs.autocapitalize).toBe("off");
    expect(attrs.autocomplete).toBe("off");
    expect(attrs.autocorrect).toBe("off");
    expect(attrs.inputmode).toBe("text");
    expect(attrs.enterkeyhint).toBe("done");
  });

  test("mobile submit does not force-focus word input", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    const centerHex = page.locator("letter-board").locator("polygon[data-hex='center']");
    await centerHex.click();
    await centerHex.click();
    await centerHex.click();
    await centerHex.click();
    await page.locator("#submit-word").click();

    const isFocused = await page.evaluate(() => document.activeElement?.id === "word-input");
    expect(isFocused).toBe(false);
  });

  test("desktop keeps found-words list internally scrollable", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only assertion");
    await gotoAndWaitForReady(page);

    const foundWordsStyles = await page.evaluate(() => {
      const list = document.querySelector("#found-words");
      if (!list) {
        return null;
      }
      const style = window.getComputedStyle(list);
      return {
        maxHeight: style.maxHeight,
        overflowY: style.overflowY
      };
    });

    expect(foundWordsStyles).not.toBeNull();
    expect(foundWordsStyles.maxHeight).not.toBe("none");
    expect(foundWordsStyles.overflowY).toBe("auto");
  });

  test("board letters expose accessible controls and keyboard activation", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const semantics = await page.locator("letter-board").evaluate((host) => {
      const polygons = [...(host.shadowRoot?.querySelectorAll("polygon.hex[data-slot]") ?? [])];
      const allSemanticallyInteractive = polygons.every((polygon) => {
        return polygon.getAttribute("role") === "button" && polygon.getAttribute("tabindex") === "0";
      });
      const allHaveLabels = polygons.every((polygon) => Boolean(polygon.getAttribute("aria-label")));
      return {
        count: polygons.length,
        allSemanticallyInteractive,
        allHaveLabels
      };
    });

    expect(semantics.count).toBe(7);
    expect(semantics.allSemanticallyInteractive).toBe(true);
    expect(semantics.allHaveLabels).toBe(true);

    const beforeLength = await page.locator("#word-input").evaluate((input) => input.value.length);
    await page.locator("letter-board").evaluate((host) => {
      const centerHex = host.shadowRoot?.querySelector("polygon.hex[data-slot='center']");
      if (centerHex instanceof SVGElement) {
        centerHex.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
    });
    const afterLength = await page.locator("#word-input").evaluate((input) => input.value.length);
    expect(afterLength).toBe(beforeLength + 1);
  });

  test("desktop keeps inline sessions panel visible", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only assertion");
    await gotoAndWaitForReady(page);

    await expect(page.locator(".session-panel")).toBeVisible();
    await expect(page.locator("#open-sessions")).toBeHidden();
    await expect(page.locator("#toggle-seed-controls")).toBeHidden();
    await expect(page.locator("#seed-form")).toBeVisible();
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
