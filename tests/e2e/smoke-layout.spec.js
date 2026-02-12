import { expect, test } from "@playwright/test";

async function gotoAndWaitForReady(page) {
  await page.goto("/");
  await expect(page.locator("#app-shell")).toBeVisible();
  await expect(page.locator("#word-input")).toBeVisible();
  await expect(page.locator("letter-board")).toBeVisible();
}

async function appendCenterLetter(page, count = 1) {
  const centerHex = page.locator("letter-board").locator("polygon[data-hex='center']");
  for (let idx = 0; idx < count; idx += 1) {
    await centerHex.click();
  }
}

async function getWordsForActivePuzzle(page) {
  const words = await page.evaluate(async () => {
    const host = document.querySelector("letter-board");
    if (!host?.shadowRoot) {
      return null;
    }

    const centerNode = host.shadowRoot.querySelector("text[data-slot='center']");
    const outerNodes = [...host.shadowRoot.querySelectorAll("text[data-slot='0'], text[data-slot='1'], text[data-slot='2'], text[data-slot='3'], text[data-slot='4'], text[data-slot='5']")];

    const centerLetter = centerNode?.textContent?.trim().toLowerCase();
    const outerLetters = outerNodes.map((node) => node.textContent?.trim().toLowerCase()).filter(Boolean);
    if (!centerLetter || outerLetters.length !== 6) {
      return null;
    }

    const response = await fetch("/data/puzzles-v1.json");
    const payload = await response.json();
    const puzzles = Array.isArray(payload) ? payload : payload?.puzzles;
    if (!Array.isArray(puzzles)) {
      return null;
    }
    const sortedOuter = [...outerLetters].sort().join("");
    const match = puzzles.find(
      (puzzle) => puzzle.centerLetter === centerLetter && [...puzzle.outerLetters].sort().join("") === sortedOuter
    );

    if (!match) {
      return null;
    }

    return match.validWords.slice(0, 10);
  });

  return words;
}

async function getActivePuzzleId(page) {
  const puzzleId = await page.evaluate(async () => {
    const host = document.querySelector("letter-board");
    if (!host?.shadowRoot) {
      return null;
    }

    const centerNode = host.shadowRoot.querySelector("text[data-slot='center']");
    const outerNodes = [...host.shadowRoot.querySelectorAll("text[data-slot='0'], text[data-slot='1'], text[data-slot='2'], text[data-slot='3'], text[data-slot='4'], text[data-slot='5']")];

    const centerLetter = centerNode?.textContent?.trim().toLowerCase();
    const outerLetters = outerNodes.map((node) => node.textContent?.trim().toLowerCase()).filter(Boolean);
    if (!centerLetter || outerLetters.length !== 6) {
      return null;
    }

    const response = await fetch("/data/puzzles-v1.json");
    const payload = await response.json();
    const puzzles = Array.isArray(payload) ? payload : payload?.puzzles;
    if (!Array.isArray(puzzles)) {
      return null;
    }

    const sortedOuter = [...outerLetters].sort().join("");
    const match = puzzles.find(
      (puzzle) => puzzle.centerLetter === centerLetter && [...puzzle.outerLetters].sort().join("") === sortedOuter
    );
    return match?.id ?? null;
  });

  return puzzleId;
}

async function getSeedForDifferentPuzzle(page, puzzleId) {
  const seed = await page.evaluate(async ({ puzzleId }) => {
    const response = await fetch("/data/puzzles-v1.json");
    const payload = await response.json();
    const puzzles = Array.isArray(payload) ? payload : payload?.puzzles;
    if (!Array.isArray(puzzles) || puzzles.length < 2) {
      return null;
    }

    const currentIndex = puzzles.findIndex((puzzle) => puzzle.id === puzzleId);
    if (currentIndex < 0) {
      return null;
    }

    const targetIndex = (currentIndex + 1) % puzzles.length;
    const hashSeed = (rawSeed) => {
      let hash = 0;
      for (let idx = 0; idx < rawSeed.length; idx += 1) {
        hash = (hash << 5) - hash + rawSeed.charCodeAt(idx);
        hash |= 0;
      }
      return Math.abs(hash);
    };

    for (let attempt = 0; attempt < 100_000; attempt += 1) {
      const candidate = `go-to-today-${attempt}`;
      if (hashSeed(candidate) % puzzles.length === targetIndex) {
        return candidate;
      }
    }

    return null;
  }, { puzzleId });

  return seed;
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

  test("mobile sessions overlay closes via Escape and backdrop", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    await page.locator("#open-sessions").click();
    await expect(page.locator(".session-panel")).toBeVisible();
    await expect(page.locator("#open-sessions")).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(page.locator(".session-panel")).toBeHidden();
    await expect(page.locator("#open-sessions")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#sessions-backdrop")).toBeHidden();

    await page.locator("#open-sessions").click();
    await expect(page.locator(".session-panel")).toBeVisible();

    await page.evaluate(() => {
      const backdrop = document.getElementById("sessions-backdrop");
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(page.locator(".session-panel")).toBeHidden();
    await expect(page.locator("#open-sessions")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#sessions-backdrop")).toBeHidden();
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

  test("mobile seed controls collapse again after starting a seed game", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only assertion");
    await gotoAndWaitForReady(page);

    await page.locator("#toggle-seed-controls").click();
    await expect(page.locator("#seed-form")).toBeVisible();
    await expect(page.locator("#toggle-seed-controls")).toHaveAttribute("aria-expanded", "true");

    await page.locator("#seed-input").fill("smoke-seed");
    await page.locator("#seed-form button[type='submit']").click();

    await expect(page.locator("#seed-form")).toBeHidden();
    await expect(page.locator("#toggle-seed-controls")).toHaveAttribute("aria-expanded", "false");
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

    await appendCenterLetter(page, 4);
    await page.locator("#submit-word").click();

    const isFocused = await page.evaluate(() => document.activeElement?.id === "word-input");
    expect(isFocused).toBe(false);
  });

  test("desktop submit keeps word input focused for rapid typing", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only assertion");
    await gotoAndWaitForReady(page);

    const input = page.locator("#word-input");
    await input.fill("zzzz");
    await input.press("Enter");

    const isFocused = await page.evaluate(() => document.activeElement?.id === "word-input");
    expect(isFocused).toBe(true);
  });

  test("resize from mobile to desktop clears mobile overlay states", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only assertion");
    await gotoAndWaitForReady(page);

    await page.setViewportSize({ width: 820, height: 900 });
    await expect(page.locator("#open-sessions")).toBeVisible();
    await expect(page.locator("#toggle-seed-controls")).toBeVisible();

    await page.locator("#toggle-seed-controls").click();
    await page.locator("#open-sessions").click();
    await expect(page.locator("#open-sessions")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#toggle-seed-controls")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".session-panel")).toBeVisible();
    await expect(page.locator("#seed-form")).toBeVisible();

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(page.locator("#open-sessions")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#toggle-seed-controls")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#sessions-backdrop")).toBeHidden();
    await expect(page.locator("#seed-form")).toBeVisible();
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

  test("board letters expose aria labels", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const semantics = await page.locator("letter-board").evaluate((host) => {
      const polygons = [...(host.shadowRoot?.querySelectorAll("polygon.hex[data-slot]") ?? [])];
      const allHaveLabels = polygons.every((polygon) => Boolean(polygon.getAttribute("aria-label")));
      return {
        count: polygons.length,
        allHaveLabels
      };
    });

    expect(semantics.count).toBe(7);
    expect(semantics.allHaveLabels).toBe(true);
  });

  test("board hexes prevent default double-click behavior", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const wasDefaultPrevented = await page.locator("letter-board").evaluate((host) => {
      const centerHex = host.shadowRoot?.querySelector("polygon.hex.center");
      if (!(centerHex instanceof SVGElement)) {
        return null;
      }

      const event = new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true
      });
      centerHex.dispatchEvent(event);
      return event.defaultPrevented;
    });

    expect(wasDefaultPrevented).toBe(true);
  });

  test("desktop keeps inline sessions panel visible", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only assertion");
    await gotoAndWaitForReady(page);

    await expect(page.locator(".session-panel")).toBeVisible();
    await expect(page.locator("#open-sessions")).toBeHidden();
    await expect(page.locator("#toggle-seed-controls")).toBeHidden();
    await expect(page.locator("#seed-form")).toBeVisible();
  });

  test("go to today button switches from a non-today puzzle back to today's puzzle", async ({ page, isMobile }) => {
    await gotoAndWaitForReady(page);

    const todayPuzzleId = await getActivePuzzleId(page);
    expect(todayPuzzleId).toBeTruthy();
    await expect(page.locator("#puzzle-display")).toHaveText(`Puzzle: ${todayPuzzleId}`);

    await expect(page.locator("#go-to-today")).toBeHidden();

    const seed = await getSeedForDifferentPuzzle(page, todayPuzzleId);
    expect(seed).toBeTruthy();

    if (isMobile) {
      await page.locator("#toggle-seed-controls").click();
      await expect(page.locator("#seed-form")).toBeVisible();
    }

    await page.locator("#seed-input").fill(seed);
    await page.locator("#seed-form button[type='submit']").click();

    const otherPuzzleId = await getActivePuzzleId(page);
    expect(otherPuzzleId).toBeTruthy();
    expect(otherPuzzleId).not.toBe(todayPuzzleId);
    await expect(page.locator("#puzzle-display")).toHaveText(`Puzzle: ${otherPuzzleId}`);

    await expect(page.locator("#go-to-today")).toBeVisible();
    await page.locator("#go-to-today").click();

    await expect.poll(async () => getActivePuzzleId(page)).toBe(todayPuzzleId);
    await expect(page.locator("#puzzle-display")).toHaveText(`Puzzle: ${todayPuzzleId}`);
    await expect(page.locator("#go-to-today")).toBeHidden();
  });

  test("board click/tap, delete, and submit controls work", async ({ page }) => {
    await gotoAndWaitForReady(page);

    await expect(page.locator("#submit-word")).toBeVisible();
    await expect(page.locator("#delete-letter")).toBeVisible();

    await appendCenterLetter(page, 4);
    await expect(page.locator("#word-input")).toHaveValue(/^[a-z]{4}$/);

    await page.locator("#delete-letter").click();
    await expect(page.locator("#word-input")).toHaveValue(/^[a-z]{3}$/);

    await appendCenterLetter(page, 1);
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

  test("typing shows duplicate feedback only for exact found words", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const words = await getWordsForActivePuzzle(page);
    expect(words).not.toBeNull();
    expect(words.length).toBeGreaterThan(1);

    const firstWord = words.find((word) => typeof word === "string" && word.length >= 4);
    const secondWord = words.find((word) => typeof word === "string" && word.length >= 4 && word !== firstWord);
    expect(firstWord).toBeTruthy();
    expect(secondWord).toBeTruthy();

    const input = page.locator("#word-input");
    const feedback = page.locator("#feedback");

    await input.fill(firstWord);
    await page.locator("#submit-word").click();
    await expect(feedback).toContainText("Accepted");

    await input.fill(firstWord.slice(0, firstWord.length - 1));
    await expect(feedback).not.toHaveText("Word already found.");

    await input.fill(firstWord);
    await expect(feedback).toHaveText("Word already found.");

    await page.locator("#submit-word").click();
    await expect(feedback).toHaveText("");

    await input.fill(`${firstWord}x`);
    await expect(feedback).not.toHaveText("Word already found.");

    await input.fill(secondWord);
    await expect(feedback).not.toHaveText("Word already found.");
    await page.locator("#submit-word").click();
    await expect(feedback).toContainText("Accepted");
  });

  test("submit error feedback clears when input is edited to empty", async ({ page }) => {
    await gotoAndWaitForReady(page);

    const input = page.locator("#word-input");
    const feedback = page.locator("#feedback");

    await input.fill("1234");
    await page.locator("#submit-word").click();
    await expect(feedback).toContainText("Only letters a-z are allowed.");

    await input.fill("");
    await expect(feedback).toHaveText("");
  });
});
