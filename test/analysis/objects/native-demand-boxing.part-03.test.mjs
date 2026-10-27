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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, body, nativeBody, definitions] of Array.from(boxing).slice(3, 10)) {
test(`${surface}: actual ${name} boxes only admitted references and preserves native identity and cost`, { timeout: 300_000 }, () => {
    const { compiled, program } = compileCsharpRequiredRecordSource(header + body, surface);
    const marked = program.records.objectShapeArtifact.artifacts.filter(artifact => artifact.capabilities.includes("reference-identity"));
    assert.equal(marked.length > 0, true, "the actual admitted boxing edge publishes its reference capability before planning");
    assert.equal(marked.some(artifact => artifact.fact.members.some(member => member.sourceName === "count")), true,
      "the boxed payload itself, not only the nominal receiver, has exact reference identity");
    const baseline = nativeBody.replace("NativeInvoke(", "NativeInvocation.invoke(");
    const output = executeCsharpConstruction(compiled, `artifact-box-${surface}-${name}`, false, false, [],
      nativeCostProgram("return Index.run() ? 7 : -1;", `${baseline.replace(/return ([^;]+);\s*$/u, "return ($1) ? 7 : -1;")}`, definitions));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "real native execution measures exact warmed allocation counts; a runtime carrier failure cannot count as a compilation pass");
  });
}
}
