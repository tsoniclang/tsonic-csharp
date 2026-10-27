import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { transformCsharpTargetAst } from "../../../dist/backend/target-ast/normalization/transformation.js";
import { csharpStructuralObjectShapeIdentity, csharpSourcePrimitiveTargetType, isCsharpJsValueTargetType, isCsharpRecordDictionaryTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { printCsharpType } from "../../../dist/print/source/printer.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { applyCsharpObjectShapeDisplayNames } from "../../../dist/backend/target-ast/normalization/object-shape-names.js";
import { selectCsharpObjectShapeDisplayNames } from "../../../dist/analysis/names/object-shapes.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { header, payload, boxing, nativeCostProgram, originalPrograms, originalNativeProgram } from "./native-demand-boxing.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, body] of Array.from(originalPrograms).slice(0, 6)) {
test(`${surface}: original ${name} has real native observations and idiomatic allocation controls`, { timeout: 300_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(header + body, surface);
    const output = executeCsharpConstruction(selected.compiled, `original-shape-${surface}-${name}`, false, false, [], originalNativeProgram(name, selected));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "the unmodified original program runs; handwritten baselines do not allocate dead rest/capture objects merely to match compiler output");
  });
}
}

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, body] of Array.from(originalPrograms).slice(0, 3)) {
test(`${surface}: original ${name} has real native observations and idiomatic allocation controls`, { timeout: 300_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(header + body, surface);
    const output = executeCsharpConstruction(selected.compiled, `original-shape-${surface}-${name}`, false, false, [], originalNativeProgram(name, selected));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "the unmodified original program runs; handwritten baselines do not allocate dead rest/capture objects merely to match compiler output");
  });
}
}
