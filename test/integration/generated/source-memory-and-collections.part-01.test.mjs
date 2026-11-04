import assert from "node:assert/strict";
import test from "node:test";
import { compileEffectiveSource } from "../../helpers/source-effective-types.mjs";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { valueStructProofFiles } from "../../../../tsonic/test/fixtures/value-structs.mjs";
import { valueRecordMemoryProofFiles } from "../../../../tsonic/test/fixtures/value-record-memory.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { closedGenericDispatchProofFiles, closedGenericDispatchPackageFiles, closedGenericDispatchPackageGraph } from "../../../../tsonic/test/fixtures/closed-generic-dispatch.mjs";
import { fixedArrayMemoryProofFiles } from "../../../../tsonic/test/fixtures/fixed-array-memory.mjs";
import { caughtErrorProofFiles } from "../../../../tsonic/test/fixtures/caught-errors.mjs";
import { numberBoxingProof, numberBoxingOutput } from "../../../../tsonic/test/fixtures/number-boxing.mjs";
import { genericBaseConstructorFiles } from "../../../../tsonic/test/fixtures/generic-base-constructors.mjs";
import { pointerViewFiles } from "../../../../tsonic/test/fixtures/pointer-views.mjs";
import { jsArrayCopyFiles } from "../../../../tsonic/test/fixtures/js-array-copy.mjs";
import { sourcePackageCallbackErrorFiles, sourcePackageCallbackErrorGraph } from "../../../../tsonic/test/fixtures/source-package-callback-errors.mjs";
import { falliblePointerFiles, falliblePointerPackageFiles, falliblePointerPackageGraph } from "../../../../tsonic/test/fixtures/fallible-pointer-views.mjs";
import { nativeV8FlagsSource } from "../../../../tsonic/test/fixtures/native-v8-flags.mjs";
import { nativeV8HeapSource } from "../../../../tsonic/test/fixtures/native-v8-heap.mjs";
import { emptyMemoryRecordProofFiles } from "../../../../tsonic/test/fixtures/empty-memory-records.mjs";
import { broadValueNarrowingSource } from "../../../../tsonic/test/fixtures/broad-value-narrowing.mjs";
import { logicalAccessAssignmentSource } from "../../../../tsonic/test/fixtures/logical-access-assignment.mjs";
import { mixedWidthRecordSource } from "../../../../tsonic/test/fixtures/mixed-width-records.mjs";
import { numberArrayUnionFiles } from "../../../../tsonic/test/fixtures/number-array-unions.mjs";
import { recursiveSourceUnionFiles } from "../../../../tsonic/test/fixtures/recursive-source-unions.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { annotatedEmptyValues, assertUnfilledEmptyObject } from "../../helpers/source-effective-empty-values.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
test(`type-only brands erase without removing ordinary class fields in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
class Box {
  declare private readonly then?: never;
  declare private readonly anotherBrand: void;
  value: number = 3;
  read(): number { return this.value; }
}
export function run(): boolean {
  const first = new Box();
  const second = first;
  second.value = 9;
  return first.read() === 9;
}` });
    executeCsharpConstruction(compiled, `type-only-brands-${surface ?? "native"}`);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\b(?:then|anotherBrand)\b/u);
  });

test(`recursive generic and mutually recursive union records execute in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: recursiveSourceUnionFiles["index.ts"],
      files: Object.fromEntries(Object.entries(recursiveSourceUnionFiles).filter(([path]) => path !== "index.ts")),
    }), `recursive-union-records-${surface ?? "native"}`);
  });
}

for (const initializer of Array.from(["new Array<number>(3)", "[1, 2]"]).slice(0, 2)) {
test(`dense numeric arrays reject deletion before copying for ${initializer}`, { timeout: 300_000 }, () => {
    if (initializer === "[1, 2]") {
      const compiled = compileEffectiveSource("js", `import { copy } from "./arrays.js";
        export function run(): boolean {
          const values = ${initializer};
          let rejected = false;
          try { delete values[0]; } catch { rejected = true; }
          const result = copy(values);
          return rejected && 0 in values && result !== values && result[0] === values[0];
        }`, {
        files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
      });
      const issues = compiled.result.diagnostics.filter(issue =>
        issue.category === "error" && issue.code === "TSONIC_LOCAL_TYPE_UNSUPPORTED");
      const matches = issues.filter(issue => {
        const ast = compiled.targetSource.ast;
        const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
        return range?.kind === "authored" &&
          ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) === "delete values[0]";
      });
      assert.equal(matches.length, 1, "C9 rejects the exact original delete occurrence, independently of any other reported family");
      const issue = matches[0];
      const retained = compiled.targetSource.effectiveTypes.refusals().filter(refusal =>
        refusal.site === issue.sourceNode && refusal.code === issue.code);
      assert.equal(issue.source === "tsonic" && retained.length === 1 && issue.message === retained[0].reason, true,
        "the identical published Host refusal supplies the code, original occurrence and reason");
      assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
        "the refused original program publishes no Native output");
      return;
    }
    const compiled = compileCsharpSource({ surface: "js",
      files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
      sourceText: `import { copy } from "./arrays.js";
        export function run(): boolean {
          const values = ${initializer};
          let rejected = false;
          try { delete values[0]; } catch { rejected = true; }
          const result = copy(values);
          return rejected && 0 in values && result !== values && result[0] === values[0];
        }`,
    });
    executeCsharpConstruction(compiled, "dense-array-deletion");
  });
}

test("typed dense numeric arrays preserve deletion rejection and copy identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js",
    files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
    sourceText: `import { copy } from "./arrays.js";
        export function run(): boolean {
          const values: number[] = [1, 2];
          let rejected = false;
          try { delete values[0]; } catch { rejected = true; }
          const result = copy(values);
          return rejected && 0 in values && result !== values && result[0] === values[0];
        }`,
  });
  executeCsharpConstruction(compiled, "typed-dense-array-deletion");
});

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
test(`nested record fields retain exact signed and unsigned widths in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: mixedWidthRecordSource }), `mixed-width-records-${surface ?? "native"}`);
  });

test(`logical accessor assignments preserve both lanes and short-circuit effects in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: logicalAccessAssignmentSource }), `logical-access-${surface ?? "native"}`);
  });

test(`non-nullish unknown retains its value and identity in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    assertUnfilledEmptyObject(surface, broadValueNarrowingSource, 2);
  });

test(`annotated non-nullish unknown retains every original value and identity predicate in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: annotatedEmptyValues(broadValueNarrowingSource) }), `broad-value-narrowing-${surface ?? "native"}`);
  });
}
