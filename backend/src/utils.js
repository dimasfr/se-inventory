// Parses a positive integer id from user input; returns null if it isn't one.
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { toId };
