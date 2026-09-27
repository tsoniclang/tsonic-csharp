import assert from "node:assert/strict";
import test from "node:test";
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

for (const surface of [undefined, "js"]) {
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

for (const initializer of ["new Array<number>(3)", "[1, 2]"]) {
  test(`dense numeric arrays reject deletion before copying for ${initializer}`, { timeout: 300_000 }, () => {
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

for (const surface of [undefined, "js"]) {
  test(`nested record fields retain exact signed and unsigned widths in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: mixedWidthRecordSource }), `mixed-width-records-${surface ?? "native"}`);
  });
  test(`logical accessor assignments preserve both lanes and short-circuit effects in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: logicalAccessAssignmentSource }), `logical-access-${surface ?? "native"}`);
  });
  test(`non-nullish unknown retains its value and identity in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: broadValueNarrowingSource }), `broad-value-narrowing-${surface ?? "native"}`);
  });
  test(`empty memory records preserve zero-field bindings in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const files = emptyMemoryRecordProofFiles(surface === "js");
    executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: files["index.ts"],
      files: { "schema.ts": files["schema.ts"] },
    }), `empty-memory-record-${surface ?? "native"}`);
  });
  test(`native V8 heap observations fail only on invocation in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [nodejsCapability()],
      sourceText: nativeV8HeapSource }), `native-v8-heap-${surface ?? "native"}`, false, false, [
        join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
      ]);
  });
  test(`native V8 flags fail only on explicit invocation in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [nodejsCapability()],
      sourceText: nativeV8FlagsSource }), `native-v8-flags-${surface ?? "native"}`, false, false, [
        join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
      ]);
  });
}

for (const [name, files] of [["files", falliblePointerFiles], ["packages", falliblePointerPackageFiles]]) {
  for (const surface of [undefined, "js"]) {
    test(`fallible pointer callbacks preserve aliases and errors across ${name}, ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      executeCsharpConstruction(compileCsharpSource({ surface, sourceText: files["index.ts"],
        sourcePackages: name === "packages" ? falliblePointerPackageGraph : undefined,
        files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== "index.ts")),
      }), `fallible-locations-${name}-${surface ?? "native"}`);
    });
  }
}

test("retained cross-package callbacks preserve the original thrown object", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: sourcePackageCallbackErrorFiles["index.ts"],
    sourcePackages: sourcePackageCallbackErrorGraph,
    files: Object.fromEntries(Object.entries(sourcePackageCallbackErrorFiles).filter(([path]) => path !== "index.ts")),
  }), "package-callback-errors");
});

test("Array.from preserves dense copies and explicit undefined entries", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: jsArrayCopyFiles["index.ts"] }), "js-array-copy");
});

for (const source of ["const values = [1, , 3];", "const values = [, undefined];"]) {
  test(`omitted array elements reject: ${source}`, () => {
    const result = compileCsharpSource({ surface: "js", sourceText: `
export function copy(): number { ${source} return Array.from(values).length; }
` });
    assert.equal(result.result.artifacts.length, 0);
    assert.ok(result.result.diagnostics.some(diagnostic => diagnostic.message.includes("Sparse array literals")));
  });
}

test("number-domain scalar boxing preserves complete values and evaluation order", { timeout: 300_000 }, () => {
  assert.equal(executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: numberBoxingProof }),
    "number-boxing"), numberBoxingOutput);
});

test("broad values collapse absence and preserve source reference identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
class Item { value = 3; }
function absent(value: unknown): boolean { return value === undefined && value === null; }
function nil(value: unknown): boolean { return value === null && value === undefined; }
function same(left: unknown, right: unknown): boolean { return left === right; }
export function run(): boolean {
  const value = new Item();
  const empty = {};
  return absent(undefined) && absent(null) && nil(null) && nil(undefined) &&
    same(value, value) && !same(value, new Item()) && same(empty, empty) && !same(empty, {});
}` }), "broad-reference-nullish");
});

test("inferred pointer loads preserve concrete conditional aliases and native widths", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
import type { Pointer, uint32 } from "@tsonic/core/types.js";
import { allocateptr, loadptr } from "@tsonic/core/lang.js";
type Selected<T> = T extends string ? string : T;
class Box<T> { value: T; constructor(value: T) { this.value = value; } }
function read(pointer: Pointer<Box<Selected<uint32>>>): Selected<uint32> {
  return loadptr(pointer).value;
}
export function run(): boolean {
  const maximum: uint32 = 4294967295;
  return read(allocateptr(new Box<uint32>(maximum))) === maximum;
}
` }), "inferred-pointer-alias");
});

for (const surface of [undefined, "js"]) {
  test(`read-free pointer views retain aliases and optional ownership in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: pointerViewFiles["index.ts"],
      files: { "view.ts": pointerViewFiles["view.ts"] } }), `pointer-views-${surface ?? "native"}`);
  });
  test(`installed source-package generic dispatch executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: closedGenericDispatchPackageFiles["index.ts"],
      sourcePackages: closedGenericDispatchPackageGraph,
      files: Object.fromEntries(Object.entries(closedGenericDispatchPackageFiles).filter(([path]) => path !== "index.ts")) }),
    `package-generic-dispatch-${surface ?? "native"}`);
  });
  test(`implicit generic base constructors retain owner and initializer effects in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: genericBaseConstructorFiles["index.ts"],
      files: { "base.ts": genericBaseConstructorFiles["base.ts"] } }), `generic-base-${surface ?? "native"}`);
  });
  test(`caught builtin Errors retain identity and stack in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: caughtErrorProofFiles["index.ts"],
      files: { "failures.ts": caughtErrorProofFiles["failures.ts"] } }), `caught-errors-${surface ?? "native"}`);
  });
  test(`shared fixed-array native layout preserves strides and snapshots in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: fixedArrayMemoryProofFiles["index.ts"], files: { "layout.ts": fixedArrayMemoryProofFiles["layout.ts"] } }),
    `fixed-array-memory-${surface ?? "native"}`, false, true);
  });
  test(`shared cross-file generic virtual dispatch executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: closedGenericDispatchProofFiles["index.ts"],
      files: { "dispatch.ts": closedGenericDispatchProofFiles["dispatch.ts"] } }),
    `closed-generic-dispatch-${surface ?? "native"}`);
  });
  test(`shared value record native layout preserves copies and aliases in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: valueRecordMemoryProofFiles["index.ts"], files: { "layout.ts": valueRecordMemoryProofFiles["layout.ts"] } }),
    `value-record-memory-${surface ?? "native"}`, false, true);
  });
  test(`shared value-struct storage and location contract executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: valueStructProofFiles["index.ts"],
      files: { "records.ts": valueStructProofFiles["records.ts"] } }), `value-struct-${surface ?? "native"}`);
  });
}
