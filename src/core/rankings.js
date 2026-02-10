export const RANK_ORDER = [
  "beginner",
  "goodStart",
  "movingUp",
  "good",
  "solid",
  "nice",
  "great",
  "amazing",
  "genius",
  "queenBee"
];

export function getRank(score, rankThresholds) {
  let currentRank = RANK_ORDER[0];

  for (const rank of RANK_ORDER) {
    const threshold = rankThresholds[rank];
    if (threshold === undefined) {
      continue;
    }
    if (score >= threshold) {
      currentRank = rank;
    }
  }

  return currentRank;
}

export function toRankLabel(rankKey) {
  return rankKey
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (ch) => ch.toUpperCase())
    .trim();
}
