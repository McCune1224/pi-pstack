import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUARD_THRESHOLDS,
  formatPercent,
  guardAdvice,
  guardLevel,
  isStronger,
  meterLine,
} from "./context-guard.ts";

test("guardLevel maps usage percentages onto the ladder", () => {
  assert.equal(guardLevel(null), "ok");
  assert.equal(guardLevel(undefined), "ok");
  assert.equal(guardLevel(Number.NaN), "ok");
  assert.equal(guardLevel(0), "ok");
  assert.equal(guardLevel(GUARD_THRESHOLDS.watch - 1), "ok");
  assert.equal(guardLevel(GUARD_THRESHOLDS.watch), "watch");
  assert.equal(guardLevel(GUARD_THRESHOLDS.warn - 1), "watch");
  assert.equal(guardLevel(GUARD_THRESHOLDS.warn), "warn");
  assert.equal(guardLevel(GUARD_THRESHOLDS.compact - 1), "warn");
  assert.equal(guardLevel(GUARD_THRESHOLDS.compact), "compact");
  assert.equal(guardLevel(100), "compact");
});

test("isStronger orders the ladder", () => {
  assert.ok(isStronger("warn", "watch"));
  assert.ok(isStronger("compact", "warn"));
  assert.ok(!isStronger("watch", "warn"));
  assert.ok(!isStronger("ok", "ok"));
});

test("formatPercent rounds and tolerates unknown usage", () => {
  assert.equal(formatPercent(42.4), "42%");
  assert.equal(formatPercent(42.5), "43%");
  assert.equal(formatPercent(null), "?");
  assert.equal(formatPercent(undefined), "?");
});

test("guardAdvice names the percentage and an action at every level", () => {
  for (const level of ["watch", "warn", "compact"] as const) {
    const advice = guardAdvice(level, 91);
    assert.ok(advice.startsWith("pstack context guard: 91%"), advice);
    assert.ok(advice.length > 40, `level ${level} carries real advice`);
  }
  assert.equal(guardAdvice("ok", 10), "");
});

test("meterLine renders the HUD line", () => {
  const line = meterLine({ tokens: 42000, contextWindow: 200000, percent: 21 }, "medium");
  assert.equal(line, "context: 21% of 200k | budget: medium");
  assert.equal(meterLine(undefined, "unlimited"), "context: ? of 0k | budget: unlimited");
});
