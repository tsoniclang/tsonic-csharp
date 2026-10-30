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

for (const surface of Array.from([undefined, "js"]).slice(0, 2)){
test(`shared fixed-array native layout preserves strides and snapshots in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: fixedArrayMemoryProofFiles["index.ts"], files: { "layout.ts": fixedArrayMemoryProofFiles["layout.ts"] } }),
    `fixed-array-memory-${surface ?? "native"}`, false, true);
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
