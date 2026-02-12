import "./ui/components/letter-board.js";
import { createInitialState, submitWord } from "./core/game-engine.js";
import { RANK_ORDER, toRankLabel } from "./core/rankings.js";
import { getDailyPuzzle, loadPuzzles } from "./puzzles/provider.js";
import { createSeed, pickPuzzleBySeed } from "./puzzles/random-generator.js";
import { loadSessionById, loadSessions, saveSession } from "./storage/repositories.js";
import { normalizeWord } from "./core/validator.js";

const HINTS_VISIBILITY_KEY = "spelling-bee:hints-visible";
const LETTER_KEY_PATTERN = /^[a-z]$/i;

const elements = {
  appShell: document.getElementById("app-shell"),
  initScreen: document.getElementById("app-init"),
  initMessage: document.getElementById("init-message"),
  initError: document.getElementById("init-error"),
  initRetry: document.getElementById("init-retry"),
  board: document.getElementById("letter-board"),
  wordForm: document.getElementById("word-form"),
  wordInput: document.getElementById("word-input"),
  wordInputHighlight: document.getElementById("word-input-highlight"),
  feedback: document.getElementById("feedback"),
  seedDisplay: document.getElementById("seed-display"),
  puzzleDisplay: document.getElementById("puzzle-display"),
  rankName: document.getElementById("rank-name"),
  rankTrack: document.getElementById("rank-track"),
  foundHeading: document.getElementById("found-heading"),
  foundWords: document.getElementById("found-words"),
  remainingPoints: document.getElementById("remaining-points"),
  remainingCount: document.getElementById("remaining-count"),
  hintPrefixes: document.getElementById("hint-prefixes"),
  hintsContent: document.getElementById("hints-content"),
  toggleHintsButton: document.getElementById("toggle-hints"),
  sessions: document.getElementById("sessions"),
  sessionPanel: document.querySelector(".session-panel"),
  openSessionsButton: document.getElementById("open-sessions"),
  goToTodayButton: document.getElementById("go-to-today"),
  closeSessionsButton: document.getElementById("close-sessions"),
  sessionsBackdrop: document.getElementById("sessions-backdrop"),
  toggleSeedControlsButton: document.getElementById("toggle-seed-controls"),
  newRandomButton: document.getElementById("new-random-game"),
  shuffleLettersButton: document.getElementById("shuffle-letters"),
  seedForm: document.getElementById("seed-form"),
  seedInput: document.getElementById("seed-input"),
  deleteLetterButton: document.getElementById("delete-letter")
};

const runtime = {
  puzzles: [],
  activeState: null,
  sessionsCache: [],
  hintsVisible: true,
  boardOuterLetters: null,
  boardPuzzleId: null,
  feedbackTimeoutId: null,
  rankTrackSnapshot: null,
  mobileSessionsOpen: false,
  mobileSeedControlsOpen: false,
  liveDuplicateWord: null
};

const SUCCESS_FEEDBACK_TIMEOUT_MS = 2600;

function syncWordInputCenterLetterState() {
  const state = runtime.activeState;
  const highlight = elements.wordInputHighlight;
  highlight.replaceChildren();

  if (!state) {
    return;
  }

  const centerLetter = state.puzzle.centerLetter;

  for (const char of elements.wordInput.value) {
    const fragment = document.createElement("span");
    fragment.textContent = char;
    if (char.toLowerCase() === centerLetter) {
      fragment.classList.add("is-center-letter");
    }
    highlight.append(fragment);
  }
}

function getOrderedRanks(rankThresholds) {
  return RANK_ORDER.filter((rankKey) => typeof rankThresholds[rankKey] === "number").map((rankKey) => ({
    rankKey,
    label: toRankLabel(rankKey),
    threshold: rankThresholds[rankKey]
  }));
}

function renderRankTrack(state) {
  const orderedRanks = getOrderedRanks(state.puzzle.rankThresholds);
  const currentRankIndex = orderedRanks.findIndex((rank) => rank.rankKey === state.rankKey);
  const currentRank = orderedRanks[currentRankIndex] ?? orderedRanks[0];
  const previousCurrentMarker = elements.rankTrack.querySelector(".rank-marker.is-current");
  const previousCurrentRect = previousCurrentMarker?.getBoundingClientRect();
  const previousSnapshot = runtime.rankTrackSnapshot;
  elements.rankName.textContent = currentRank.label;

  elements.rankTrack.innerHTML = "";
  for (const [index, rank] of orderedRanks.entries()) {
    const item = document.createElement("li");
    item.className = "rank-stop";

    const marker = document.createElement("span");
    marker.className = "rank-marker";

    if (state.score >= rank.threshold) {
      marker.classList.add("is-reached");
    }

    if (rank.rankKey === state.rankKey) {
      marker.classList.add("is-current");
      marker.textContent = String(state.score);
    }

    marker.title = `${rank.label} (${rank.threshold})`;
    marker.setAttribute("aria-label", `${rank.label}, ${rank.threshold} points`);

    if (index < currentRankIndex) {
      item.classList.add("is-past");
    } else if (index === currentRankIndex) {
      item.classList.add("is-current");
    }

    item.append(marker);
    if (rank.rankKey !== state.rankKey) {
      const thresholdLabel = document.createElement("span");
      thresholdLabel.className = "rank-threshold-label";
      thresholdLabel.textContent = String(rank.threshold);
      item.append(thresholdLabel);
    }
    elements.rankTrack.append(item);
  }

  const canAnimateRankJump =
    Boolean(previousCurrentRect) &&
    Boolean(previousSnapshot) &&
    previousSnapshot.puzzleId === state.puzzle.id &&
    state.score > previousSnapshot.score &&
    previousSnapshot.rankIndex >= 0 &&
    currentRankIndex > previousSnapshot.rankIndex &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (canAnimateRankJump) {
    const currentMarker = elements.rankTrack.querySelector(".rank-marker.is-current");
    const currentRect = currentMarker?.getBoundingClientRect();

    if (currentMarker && currentRect) {
      const deltaX = previousCurrentRect.left + previousCurrentRect.width / 2 - (currentRect.left + currentRect.width / 2);
      const deltaY = previousCurrentRect.top + previousCurrentRect.height / 2 - (currentRect.top + currentRect.height / 2);

      currentMarker.style.transition = "none";
      currentMarker.style.transform = `translate(${deltaX}px, calc(${deltaY}px + var(--rank-current-lift, -0.05rem)))`;

      requestAnimationFrame(() => {
        currentMarker.style.transition =
          "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms ease, height 180ms ease, background 180ms ease";
        currentMarker.style.transform = "translate(0, var(--rank-current-lift, -0.05rem))";
      });
    }
  }

  runtime.rankTrackSnapshot = {
    puzzleId: state.puzzle.id,
    rankIndex: currentRankIndex,
    score: state.score
  };
}

function formatFoundHeading(foundWordsCount) {
  if (foundWordsCount <= 0) {
    return "No words found yet";
  }

  if (foundWordsCount === 1) {
    return "1 Word Found";
  }

  return `${foundWordsCount} Words Found`;
}

function renderInitLoading(message) {
  elements.initMessage.textContent = message;
  elements.initError.hidden = true;
  elements.initError.textContent = "";
  elements.initRetry.hidden = true;
  elements.appShell.hidden = true;
  elements.initScreen.hidden = false;
}

function renderInitError(message) {
  elements.initMessage.textContent = "Could not start the game.";
  elements.initError.textContent = message;
  elements.initError.hidden = false;
  elements.initRetry.hidden = false;
  elements.appShell.hidden = true;
  elements.initScreen.hidden = false;
}

function renderReady() {
  elements.initScreen.hidden = true;
  elements.appShell.hidden = false;
}

function shuffledOuterLetters(outerLetters) {
  const shuffled = [...outerLetters];
  for (let idx = shuffled.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [shuffled[idx], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[idx]];
  }
  return shuffled;
}

function syncBoardLetters(state) {
  if (
    runtime.boardPuzzleId !== state.puzzle.id ||
    !runtime.boardOuterLetters ||
    runtime.boardOuterLetters.length !== state.puzzle.outerLetters.length
  ) {
    runtime.boardOuterLetters = [...state.puzzle.outerLetters];
    runtime.boardPuzzleId = state.puzzle.id;
  }
}

function appendLetterToWordInput(letter) {
  if (!letter || !LETTER_KEY_PATTERN.test(letter)) {
    return;
  }

  elements.wordInput.value += letter.toLowerCase();
  handleWordInputChanged();
}

function deleteLastLetterFromWordInput() {
  if (!elements.wordInput.value) {
    return;
  }

  elements.wordInput.value = elements.wordInput.value.slice(0, -1);
  handleWordInputChanged();
}

function focusWordInputForTyping() {
  if (isMobileViewport()) {
    elements.wordInput.blur();
    return;
  }

  elements.wordInput.focus({ preventScroll: true });
}

function isTextEditingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function shouldCaptureGlobalTyping(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (event.target === elements.wordInput) {
    return false;
  }

  return !isTextEditingTarget(event.target);
}

function renderHintsVisibility() {
  elements.hintsContent.hidden = !runtime.hintsVisible;
  elements.toggleHintsButton.textContent = runtime.hintsVisible ? "Hide Hints" : "Show Hints";
  elements.toggleHintsButton.setAttribute("aria-expanded", String(runtime.hintsVisible));
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function setMobileSessionsOpen(open) {
  runtime.mobileSessionsOpen = open;
  const shouldOpen = open && isMobileViewport();
  elements.sessionPanel.classList.toggle("is-open-mobile", shouldOpen);
  elements.sessionsBackdrop.hidden = !shouldOpen;
  elements.openSessionsButton.setAttribute("aria-expanded", String(shouldOpen));
}

function setMobileSeedControlsOpen(open) {
  runtime.mobileSeedControlsOpen = open;
  const shouldOpen = open && isMobileViewport();
  elements.seedForm.classList.toggle("is-open-mobile", shouldOpen);
  elements.toggleSeedControlsButton.setAttribute("aria-expanded", String(shouldOpen));
}

function syncLiveDuplicateFeedback() {
  if (!runtime.activeState) {
    return;
  }

  const typedWord = normalizeWord(elements.wordInput.value);
  const nextLiveDuplicateWord =
    typedWord.length >= 4 && runtime.activeState.foundWordSet.has(typedWord) ? typedWord : null;

  if (runtime.liveDuplicateWord === nextLiveDuplicateWord) {
    return;
  }

  runtime.liveDuplicateWord = nextLiveDuplicateWord;
  render(runtime.activeState);
}

function handleWordInputChanged(clearErrorFeedback = true) {
  syncWordInputCenterLetterState();
  syncLiveDuplicateFeedback();

  if (!clearErrorFeedback || !runtime.activeState || runtime.liveDuplicateWord) {
    return;
  }

  if (runtime.activeState.feedbackType === "error" && runtime.activeState.feedback) {
    runtime.activeState = {
      ...runtime.activeState,
      feedback: "",
      feedbackType: "idle"
    };
    render(runtime.activeState);
  }
}

function render(state) {
  const todayPuzzleId = getTodayPuzzleId();
  elements.goToTodayButton.hidden = !todayPuzzleId || todayPuzzleId === state.puzzle.id;
  syncBoardLetters(state);
  elements.board.setLetters(state.puzzle.centerLetter, runtime.boardOuterLetters);
  elements.puzzleDisplay.textContent = `Puzzle: ${state.puzzle.date ?? state.puzzle.id}`;
  elements.foundHeading.textContent = formatFoundHeading(state.foundWords.length);
  renderRankTrack(state);
  const feedbackText = runtime.liveDuplicateWord ? "Word already found." : state.feedback;
  elements.feedback.textContent = feedbackText;
  const feedbackType = runtime.liveDuplicateWord ? "error" : (state.feedbackType ?? "idle");
  elements.feedback.classList.toggle("is-success", feedbackType === "success");
  elements.feedback.classList.toggle("is-error", feedbackType === "error");
  elements.feedback.classList.toggle("is-visible", Boolean(feedbackText));

  if (runtime.feedbackTimeoutId) {
    clearTimeout(runtime.feedbackTimeoutId);
    runtime.feedbackTimeoutId = null;
  }

  if (feedbackType === "success" && state.feedback) {
    const feedbackText = state.feedback;
    runtime.feedbackTimeoutId = window.setTimeout(() => {
      if (!runtime.activeState || runtime.activeState.feedback !== feedbackText) {
        return;
      }

      runtime.activeState = {
        ...runtime.activeState,
        feedback: "",
        feedbackType: "idle"
      };
      render(runtime.activeState);
    }, SUCCESS_FEEDBACK_TIMEOUT_MS);
  }
  elements.seedDisplay.textContent = state.source === "random" && state.seed ? `Seed: ${state.seed}` : "";

  elements.foundWords.innerHTML = "";
  for (const word of state.foundWords) {
    const li = document.createElement("li");
    li.textContent = word;
    elements.foundWords.append(li);
  }

  elements.remainingPoints.textContent = String(state.hints.remainingTotalPoints);
  elements.remainingCount.textContent = String(state.hints.remainingWordCount);

  elements.hintPrefixes.innerHTML = "";
  for (const [prefix, progress] of state.hints.byPrefix2) {
    const row = document.createElement("tr");
    const prefixCell = document.createElement("td");
    const progressCell = document.createElement("td");
    prefixCell.textContent = prefix.toUpperCase();
    progressCell.textContent = `${progress.found} / ${progress.total}`;
    row.append(prefixCell, progressCell);
    elements.hintPrefixes.append(row);
  }

  syncWordInputCenterLetterState();
}

function renderSessionsList() {
  elements.sessions.innerHTML = "";

  const sorted = [...runtime.sessionsCache].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeSessionId = runtime.activeState?.sessionId ?? null;

  for (const session of sorted) {
    const li = document.createElement("li");
    const isActive = Boolean(activeSessionId) && session.sessionId === activeSessionId;

    if (isActive) {
      li.classList.add("is-active-session");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sessionId = session.sessionId;
    button.textContent = `${session.source.toUpperCase()} - ${session.puzzleId} - ${toRankLabel(session.rankKey)} (${session.score})`;

    if (isActive) {
      button.setAttribute("aria-current", "true");
      const badge = document.createElement("span");
      badge.className = "session-current-badge";
      badge.textContent = "Current";
      button.append(" ", badge);
    }

    li.append(button);
    elements.sessions.append(li);
  }
}

function hydrateStateFromSession(session) {
  const puzzle = runtime.puzzles.find((item) => item.id === session.puzzleId);
  if (!puzzle) {
    return null;
  }

  return createInitialState(puzzle, session);
}

function getTodayPuzzleId() {
  if (!runtime.puzzles.length) {
    return null;
  }

  return getDailyPuzzle(runtime.puzzles).id;
}

function findLatestSessionByPuzzleId(puzzleId) {
  return [...runtime.sessionsCache]
    .filter((session) => session.puzzleId === puzzleId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

async function persistAndRefreshSession(state) {
  const record = await saveSession(state);
  const existingIndex = runtime.sessionsCache.findIndex((item) => item.sessionId === record.sessionId);

  if (existingIndex >= 0) {
    runtime.sessionsCache[existingIndex] = record;
  } else {
    runtime.sessionsCache.push(record);
  }

  renderSessionsList();
}

async function activateState(state, { persist = true } = {}) {
  runtime.activeState = state;
  runtime.liveDuplicateWord = null;
  runtime.boardOuterLetters = [...state.puzzle.outerLetters];
  runtime.boardPuzzleId = state.puzzle.id;
  render(runtime.activeState);

  if (persist) {
    await persistAndRefreshSession(runtime.activeState);
    return;
  }

  renderSessionsList();
}

async function startDailySession() {
  const puzzle = getDailyPuzzle(runtime.puzzles);
  const initialState = createInitialState(puzzle, {
    source: "daily",
    puzzleId: puzzle.id,
    foundWords: [],
    score: 0,
    rankKey: "beginner"
  });

  await activateState(initialState);
}

async function startRandomSession(seed = createSeed()) {
  const puzzle = pickPuzzleBySeed(runtime.puzzles, seed);
  const initialState = createInitialState(puzzle, {
    source: "random",
    seed,
    puzzleId: puzzle.id,
    foundWords: [],
    score: 0,
    rankKey: "beginner"
  });

  await activateState(initialState);
}

async function boot() {
  renderInitLoading("Loading settings...");
  runtime.hintsVisible = localStorage.getItem(HINTS_VISIBILITY_KEY) !== "false";
  renderHintsVisibility();

  renderInitLoading("Loading puzzle definitions...");
  runtime.puzzles = await loadPuzzles();
  renderInitLoading("Loading saved sessions...");
  runtime.sessionsCache = await loadSessions();

  if (runtime.sessionsCache.length) {
    renderInitLoading("Restoring your latest session...");
    const latest = [...runtime.sessionsCache].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const recovered = hydrateStateFromSession(latest);
    if (recovered) {
      await activateState(recovered, { persist: false });
      renderReady();
      return;
    }
  }

  renderInitLoading("Preparing today's puzzle...");
  await startDailySession();
  renderReady();
}

window.addEventListener("resize", () => {
  if (!isMobileViewport() && runtime.mobileSessionsOpen) {
    setMobileSessionsOpen(false);
  }

  if (!isMobileViewport() && runtime.mobileSeedControlsOpen) {
    setMobileSeedControlsOpen(false);
  }
});

elements.wordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!runtime.activeState) {
    return;
  }

  const rawWord = elements.wordInput.value;
  const submittedWord = normalizeWord(rawWord);
  const isSubmittingExistingWord = runtime.activeState.foundWordSet.has(submittedWord);

  if (isSubmittingExistingWord) {
    runtime.activeState = {
      ...runtime.activeState,
      feedback: "",
      feedbackType: "idle"
    };
    render(runtime.activeState);
  } else {
    runtime.activeState = submitWord(runtime.activeState, rawWord);
    render(runtime.activeState);
    await persistAndRefreshSession(runtime.activeState);

    if (runtime.activeState.feedbackType !== "success") {
      focusWordInputForTyping();
      return;
    }
  }

  elements.wordInput.value = "";
  handleWordInputChanged(false);
  focusWordInputForTyping();
});

elements.wordInput.addEventListener("input", () => {
  handleWordInputChanged();
});

elements.board.addEventListener("letter-select", (event) => {
  const letter = event.detail?.letter;
  if (typeof letter !== "string") {
    return;
  }

  if (isMobileViewport() && document.activeElement === elements.wordInput) {
    elements.wordInput.blur();
  }

  appendLetterToWordInput(letter);
});

elements.newRandomButton.addEventListener("click", async () => {
  await startRandomSession();
});

elements.goToTodayButton.addEventListener("click", async () => {
  const todayPuzzleId = getTodayPuzzleId();
  if (!todayPuzzleId) {
    return;
  }

  const existingTodaySession = findLatestSessionByPuzzleId(todayPuzzleId);
  if (existingTodaySession) {
    const hydrated = hydrateStateFromSession(existingTodaySession);
    if (hydrated) {
      await activateState(hydrated, { persist: false });
      setMobileSessionsOpen(false);
      return;
    }
  }

  await startDailySession();
  setMobileSessionsOpen(false);
});

elements.openSessionsButton.addEventListener("click", () => {
  setMobileSessionsOpen(true);
});

elements.toggleSeedControlsButton.addEventListener("click", () => {
  setMobileSeedControlsOpen(!runtime.mobileSeedControlsOpen);
});

elements.closeSessionsButton.addEventListener("click", () => {
  setMobileSessionsOpen(false);
});

elements.sessionsBackdrop.addEventListener("click", () => {
  setMobileSessionsOpen(false);
});

elements.deleteLetterButton.addEventListener("click", () => {
  deleteLastLetterFromWordInput();
});

elements.shuffleLettersButton.addEventListener("click", () => {
  if (!runtime.activeState || !runtime.boardOuterLetters) {
    return;
  }

  runtime.boardOuterLetters = shuffledOuterLetters(runtime.boardOuterLetters);
  elements.board.setLetters(runtime.activeState.puzzle.centerLetter, runtime.boardOuterLetters);
});

elements.seedForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawSeed = elements.seedInput.value.trim();
  if (!rawSeed) {
    elements.feedback.textContent = "Enter a seed to start a reproducible random game.";
    elements.seedInput.focus();
    return;
  }

  await startRandomSession(rawSeed);
  elements.seedInput.value = "";
  setMobileSeedControlsOpen(false);
});

elements.toggleHintsButton.addEventListener("click", () => {
  runtime.hintsVisible = !runtime.hintsVisible;
  localStorage.setItem(HINTS_VISIBILITY_KEY, String(runtime.hintsVisible));
  renderHintsVisibility();
});

elements.sessions.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const sessionId = target.dataset.sessionId;
  if (!sessionId) {
    return;
  }

  const session = await loadSessionById(sessionId);
  if (!session) {
    return;
  }

  const hydrated = hydrateStateFromSession(session);
  if (!hydrated) {
    return;
  }

  await activateState(hydrated, { persist: false });
  setMobileSessionsOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (!runtime.activeState || !shouldCaptureGlobalTyping(event)) {
    return;
  }

  if (LETTER_KEY_PATTERN.test(event.key)) {
    event.preventDefault();
    appendLetterToWordInput(event.key);
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    deleteLastLetterFromWordInput();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    elements.wordForm.requestSubmit();
    return;
  }

  if (event.key === "Escape" && runtime.mobileSessionsOpen) {
    event.preventDefault();
    setMobileSessionsOpen(false);
  }
});

elements.initRetry.addEventListener("click", () => {
  void boot().catch((error) => {
    renderInitError(error.message);
  });
});

void boot().catch((error) => {
  renderInitError(error.message);
});
