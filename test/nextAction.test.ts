import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeNextAction } from "../src/nextAction.js";

interface Fixture {
  name: string;
  expect_kind: string;
  json: unknown;
}

const path = resolve(__dirname, "../../shared/test-vectors/next-action-fixtures.json");
const doc = JSON.parse(readFileSync(path, "utf8")) as { fixtures: Fixture[] };

describe("decodeNextAction", () => {
  for (const f of doc.fixtures) {
    it(`${f.name} -> ${f.expect_kind}`, () => {
      const decoded = decodeNextAction(f.json);
      expect(decoded?.kind).toBe(f.expect_kind);
    });
  }

  it("returns null for null input", () => {
    expect(decodeNextAction(null)).toBeNull();
  });

  it("throws on unknown discriminator", () => {
    expect(() => decodeNextAction({ type: "bogus" })).toThrow();
  });
});
