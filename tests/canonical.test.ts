import { test, expect } from "bun:test";
import { canonicalize } from "../src/canonical.ts";

test("sorts object keys recursively", () => {
  expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  expect(canonicalize({ x: { z: 3, y: 4 } })).toBe('{"x":{"y":4,"z":3}}');
});

test("preserves array order", () => {
  expect(canonicalize({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
});

test("no whitespace", () => {
  expect(canonicalize({ a: { b: [1, 2] } })).toBe('{"a":{"b":[1,2]}}');
});

test("rejects non-finite numbers", () => {
  expect(() => canonicalize({ x: NaN })).toThrow();
  expect(() => canonicalize({ x: Infinity })).toThrow();
});

test("identical input produces identical bytes", () => {
  const a = canonicalize({ a: 1, b: { c: 2, d: 3 } });
  const b = canonicalize({ b: { d: 3, c: 2 }, a: 1 });
  expect(a).toBe(b);
});

test("handles primitives at root", () => {
  expect(canonicalize("hello")).toBe('"hello"');
  expect(canonicalize(42)).toBe("42");
  expect(canonicalize(null)).toBe("null");
  expect(canonicalize(true)).toBe("true");
});

test("handles nested arrays of objects", () => {
  expect(
    canonicalize({
      list: [
        { b: 1, a: 2 },
        { d: 3, c: 4 },
      ],
    }),
  ).toBe('{"list":[{"a":2,"b":1},{"c":4,"d":3}]}');
});
