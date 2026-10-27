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

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
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

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
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

for (const [name, files] of Array.from([["files", falliblePointerFiles], ["packages", falliblePointerPackageFiles]]).slice(0, 2)) {
for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
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
