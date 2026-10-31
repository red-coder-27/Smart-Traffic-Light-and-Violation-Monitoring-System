import assert from "node:assert/strict";
import test from "node:test";
import { generateChallanNumber, getFineAmount } from "./challanRules.js";

test("challan numbers include the date and have unique high-entropy suffixes", () => {
    const issueDate = new Date("2026-10-31T23:59:59.000Z");
    const numbers = new Set(Array.from({ length: 100 }, () => generateChallanNumber(issueDate)));

    assert.equal(numbers.size, 100);
    for (const number of numbers) {
        assert.match(number, /^CHAL-20261031-[0-9A-F]{32}$/);
    }
});

test("fine calculation returns configured amounts and no fallback for unknown types", () => {
    assert.equal(getFineAmount("RED_LIGHT"), 1000);
    assert.equal(getFineAmount("NO_HELMET"), 500);
    assert.equal(getFineAmount("UNLISTED_TYPE"), null);
});
