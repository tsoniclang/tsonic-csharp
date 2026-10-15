import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { analyzeCsharpValueReadStages } from "../../../dist/analysis/conversions/value-read-stages.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const same = (left, right) => left === right || (left !== undefined && right !== undefined && targetTypeRefEquals(left, right));
const type = name => Object.freeze({ kind: "source-primitive", name });
const [source, declaredStorage, readStorage, narrowed, operation, memberRead, memberRaw, memberUnion, storage] =
  ["source", "declared", "read", "narrowed", "operation", "member-read", "member-raw", "member-union", "storage"].map(type);

function stagedNode(stages) {
  const node = { stages };
  const sourceFile = { children: [node] };
  const policy = { sourceFiles: [sourceFile], ast: { forEachChild: (parent, visit) => { for (const child of parent.children ?? []) visit(child); } } };
  const read = (name) => Object.freeze({ get: subject => subject.stages?.[name] });
  const evidence = {
    nodeTargetType: read("source"),
    storageTargetType: read("declaredStorage"),
    readStorageTargetType: read("readStorage"),
    valueRefinement: Object.freeze({ get: subject => subject.stages?.narrowedRead === undefined ? undefined
      : { flowReadTargetType: subject.stages.narrowedRead } }),
  };
  const operations = {
    operationResultType: read("selectedOperation"),
    sourceMember: Object.freeze({ get: subject => subject.stages?.member }),
  };
  const analysis = analyzeCsharpValueReadStages(policy, evidence, operations);
  const sealed = analysis.seal({ storageType: read("storage") });
  return { node, sourceFile, analysis, sealed };
}

test("each value-read selection keeps the stage order its consumer asks for", () => {
  const all = stagedNode({ source, declaredStorage, readStorage, narrowedRead: narrowed, selectedOperation: operation, storage,
    member: { selectedReadType: memberRead, rawReadType: memberRaw, runtimeUnionProperty: { kind: "resolved", resultType: memberUnion } } });
  const stages = all.analysis.valueReadStages.get(all.node);
  assert.equal(stages.returnedValue, operation, "inferred return: selected operation first");
  assert.equal(stages.literalTarget, operation, "array literal target: selected operation first");
  assert.equal(stages.operationValue, operation);
  const read = all.sealed.valueRead.get(all.node);
  assert.equal(read.assertedValue, operation, "non-null assertion: selected operation before the narrowed read");
  assert.equal(read.value, narrowed, "value at a use: the narrowed read before the selected operation");
  assert.equal(read.storedValue, storage);
  assert.equal(read.readStorageValue, storage);
  assert.equal(read.flowReadValue, memberRead);
  assert.equal(read.flowReadStorage, memberUnion, "a resolved runtime-union member stores its union result");

  const reads = stagedNode({ source, declaredStorage, readStorage,
    member: { rawReadType: memberRaw, runtimeUnionProperty: { kind: "rejected" } } });
  const partial = reads.analysis.valueReadStages.get(reads.node);
  assert.equal(partial.returnedValue, readStorage, "inferred return: read storage before the source type");
  assert.equal(partial.literalTarget, declaredStorage, "array literal target: declared storage before the source type");
  assert.equal(partial.operationValue, source);
  const sealedPartial = reads.sealed.valueRead.get(reads.node);
  assert.equal(sealedPartial.assertedValue, source);
  assert.equal(sealedPartial.value, source);
  assert.equal(sealedPartial.storedValue, source);
  assert.equal(sealedPartial.readStorageValue, readStorage);
  assert.equal(sealedPartial.flowReadValue, source);
  assert.equal(sealedPartial.flowReadStorage, memberRaw, "an unresolved union member stores its raw read type");
  assert.equal(Object.hasOwn(sealedPartial, "storage"), false, "absent stages stay absent");
  assert.deepEqual(Object.keys(stages).sort(), ["literalTarget", "operationValue", "returnedValue"],
    "pre-storage records publish only the selections their consumers read");
  for (const raw of ["declaredStorage", "readStorage", "selectedMemberRead", "selectedMemberStorage"]) {
    assert.equal(Object.hasOwn(read, raw), false, `${raw}: raw stage without a consumer stays private`);
  }
  assert.deepEqual([read.selectedOperation, read.narrowedRead, read.storage, read.source], [operation, narrowed, storage, source],
    "exactSourceTypes reads its four candidate stages");
});

test("value-read stages are computed once, frozen, and sealed once", () => {
  const value = stagedNode({ source, storage });
  const stages = value.analysis.valueReadStages.get(value.node);
  assert.equal(Object.isFrozen(stages), true);
  assert.equal(value.analysis.valueReadStages.get(value.node) === stages, true, "repeated reads return the computed record");
  assert.equal(value.analysis.seal({ storageType: { get: () => narrowed } }) === value.sealed, true,
    "a second seal returns the first sealed result");
  const read = value.sealed.valueRead.get(value.node);
  assert.equal(Object.isFrozen(read) && Object.isFrozen(value.sealed) && Object.isFrozen(value.sealed.valueRead), true);
  assert.equal(Object.hasOwn(value.sealed.valueRead, "set"), false, "no write path");
  assert.equal(value.sealed.valueRead.get(value.sourceFile), undefined, "a node without stages has no record");
  const storageOnly = stagedNode({ storage });
  assert.equal(storageOnly.analysis.valueReadStages.get(storageOnly.node), undefined);
  assert.equal(storageOnly.sealed.valueRead.get(storageOnly.node).value, storage, "the storage stage alone is sealed");
});

function analyzed(sourceText, surface) {
  const checked = checkCsharpSource({ sourceText, surface });
  assertCsharpCheckingSucceeded(checked);
  const program = createTargetSourceProgram(checked.source);
  const result = analyzeCsharpTargetProgram({
    input: { source: program, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(result.kind === "resolved", true, result.diagnostics?.map(value => value.message).join("\n"));
  const nodes = [];
  const pending = [...result.value.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    program.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return { program: result.value, nodes, ast: program.ast };
}

for (const surface of ["native", "js"]) {
  test(`sealed ${surface} value reads equal the stages their owners published`, () => {
    const { program, nodes, ast } = analyzed(`
      import type { int32 } from "@tsonic/core/types.js";
      class Box { constructor(public value: int32 | undefined) {} }
      export function read(box: Box, values: int32[]): int32 {
        const first = values[0]!;
        if (box.value !== undefined) return box.value + first;
        const copy = [first, first];
        return copy[1]!;
      }
    `, surface);
    const records = program.records;
    let narrowedUses = 0;
    for (const node of nodes) {
      const read = records.valueRead.get(node);
      const narrowedRead = records.valueRefinement.get(node)?.flowReadTargetType;
      const expectedValue = narrowedRead ?? records.operationResultType.get(node) ?? records.storageType.get(node) ??
        records.nodeTargetType.get(node);
      const expectedReadStorage = records.storageType.get(node) ?? records.readStorageTargetType.get(node);
      assert.equal(same(read?.value, expectedValue), true,
        `${ast.kindName(node)}: value equals the owners' stages`);
      assert.equal(same(read?.readStorageValue, expectedReadStorage), true,
        `${ast.kindName(node)}: read storage equals the owners' stages`);
      if (narrowedRead !== undefined && ast.is.IsPropertyAccessExpression(node)) narrowedUses += 1;
    }
    assert.equal(narrowedUses > 0, true, "the narrowed property read is covered");
    assert.equal(Object.hasOwn(records, "valueRead") && typeof records.valueRead.get === "function", true);
  });
}
