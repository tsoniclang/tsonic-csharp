import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

const source = `
  import type { int32 } from "@tsonic/core/types.js";
  class Box { constructor(public value: int32) {} read(): int32 { return this.value; } }
  export function total(box: Box | undefined, values: int32[]): int32 {
    const first = values[0]!;
    const read = box?.read() ?? 0;
    return first + read + new Box(first).value;
  }
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
  test(`operation result types are materialized once at the operation seal in ${surface}`, () => {
    const { program, nodes } = compiled(surface);
    const records = program.records;
    let results = 0;
    for (const node of nodes) {
      const type = records.operationResultType.get(node);
      assert.equal(records.operationResultType.get(node), type, "repeated reads return the materialized record");
      if (type === undefined) continue;
      results += 1;
      const call = records.selectedCall.get(node);
      if (call?.selectedResultType !== undefined) assert.equal(type, call.selectedResultType, "a call result is its selected result");
      const construction = records.selectedConstruction.get(node);
      if (call === undefined && construction?.selectedResultType !== undefined) {
        assert.equal(type, construction.selectedResultType, "a construction result is its selected result");
      }
    }
    assert.equal(results > 0, true, "operation results are covered");
    assert.equal(records.operationResultType.get({}), undefined, "an unrecorded subject has no result");
  });

  test(`materialized operation results keep diagnostics and generated output deterministic in ${surface}`, () => {
    const first = compiled(surface);
    const second = compiled(surface);
    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual([...first.artifacts.entries()], [...second.artifacts.entries()]);
  });
}
