import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

const source = `
  import type { int32 } from "@tsonic/core/types.js";
  export function widen(left: int32, right: int32): number { return left + right; }
  export function pick(flag: boolean, value: int32): number | string { return flag ? value : "none"; }
  export const values: number[] = [1, 2, 3];
`;

function compiled(surface) {
  const result = compileCsharpSource({ sourceText: source, surface });
  assertCsharpCompilationSucceeded(result);
  const { program } = result.result;
  const nodes = [];
  const pending = [...program.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return { program, nodes, artifacts: result.artifacts, diagnostics: result.targetDiagnostics };
}

for (const surface of ["native", "js"]) {
  test(`expected-type views are materialized once and read by lookup in ${surface}`, () => {
    const { program, nodes } = compiled(surface);
    const records = program.records;
    let expectedNodes = 0;
    for (const node of nodes) {
      const all = records.expectedType.get(node);
      const required = records.requiredExpectedType.get(node);
      const storage = records.storageExpectedType.get(node);
      assert.equal(records.expectedType.get(node), all, "repeated reads return the materialized view");
      assert.equal(records.requiredExpectedType.get(node), required);
      assert.equal(records.storageExpectedType.get(node), storage);
      assert.equal(Object.isFrozen(all) && Object.isFrozen(required) && Object.isFrozen(storage), true);
      const keys = all.map(targetTypeRefKey);
      assert.deepEqual(keys, [...keys].sort((left, right) => left.localeCompare(right)), "contextual keys keep their order");
      assert.equal(required.every(type => keys.includes(targetTypeRefKey(type))), true, "required uses are a subset");
      assert.equal(storage, required.length > 0 ? required : all, "storage reads required uses when present");
      if (all.length > 0) expectedNodes += 1;
    }
    assert.equal(expectedNodes > 0, true, "expected uses are covered");
    assert.equal(records.expectedType.get({}).length, 0, "an unrecorded subject has no expected use");
  });

  test(`expected binary selections are materialized per contextual target in ${surface}`, () => {
    const { program, nodes } = compiled(surface);
    const records = program.records;
    const binaries = nodes.filter(node => program.source.ast.is.IsBinaryExpression(node));
    let selected = 0;
    for (const node of binaries) {
      for (const target of records.expectedType.get(node)) {
        const selection = records.expectedBinary.get(node, target);
        assert.equal(records.expectedBinary.get(node, target), selection, "repeated reads return the materialized selection");
        if (selection !== undefined) selected += 1;
      }
    }
    assert.equal(selected > 0, true, "the widened addition has an expected binary selection");
  });

  test(`materialized views keep diagnostics and generated output deterministic in ${surface}`, () => {
    const first = compiled(surface);
    const second = compiled(surface);
    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual([...first.artifacts.entries()], [...second.artifacts.entries()]);
  });
}
