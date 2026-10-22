import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

test("binary access preserves exact native index carriers through reads, writes and updates", () => {
  const result = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    export function use(index: uint32, length: int32): uint32 {
      const values = new Uint32Array(length);
      const list = new Array<uint32>(length);
      const view = new DataView(values.buffer);
      values[index] = 7;
      values[index] += 1;
      const previous = values[index]++;
      view.setUint32(index, values[index], true);
      list[0] = view.getUint32(index, true);
      return list[0] + previous;
    }
  ` });
  assertCsharpCompilationSucceeded(result);
  const text = [...result.artifacts.values()].join("\n");
  assert.match(text, /new [\w.]*Uint32Array\(length\)/u);
  assert.match(text, /new [\w.]*JSArray<uint>\(length\)/u);
  assert.match(text, /\.Get\(index\)/u);
  assert.match(text, /\.Update<uint, uint>\(index, true, false\)/u);
  assert.match(text, /\.getUint32\(index, true\)/u);
  assert.doesNotMatch(text, /\(double\)index|Convert\.ToDouble/u);
});
