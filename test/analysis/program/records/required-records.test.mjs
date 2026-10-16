import assert from "node:assert/strict";
import test from "node:test";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import { createCsharpProgramRecords } from "../../../../dist/analysis/program/records/create.js";
import { assertCsharpRequiredRecords, requireCsharpRecord } from "../../../../dist/analysis/program/records/required-records.js";
import { targetUseSiteRef } from "@tsonic/target-api/analysis";
import {
  compileCsharpRequiredRecordSource,
  csharpRecordInput,
  csharpRecordsOmitting,
  csharpRequiredRecordFailure,
} from "../../../helpers/required-records.mjs";

const sourceText = `
  import type { int32 } from "@tsonic/core/types.js";
  export function apply(mapper: (left: int32, right: int32) => int32, input: int32): int32 {
    return mapper(input, input);
  }
  export function run(seed: int32): int32 {
    class First {
      value: int32;
      constructor(value: int32) { this.value = value; }
    }
    class Second {
      value: int32;
      constructor(value: int32) { this.value = value; }
    }
    const first = new First(seed);
    const second = new Second(seed);
    const [left] = [seed];
    const [right] = [seed];
    const identity: (value: int32) => int32 = value => value;
    return apply((left, right) => left + right + first.value + second.value, seed) + identity(left) + right;
  }
`;
const construct = "checked selected construct";
const producer = "selected native owner";
const { source, program, nodes } = compileCsharpRequiredRecordSource(sourceText, "native");
const { ast } = source;
const records = program.records;
const families = ["classFactory", "requiredStorageType", "nativeParticipation", "callableTarget", "bindingPatternProjection", "sourceArgument"];
const subjects = Object.freeze({
  classFactory: nodes.filter(node => ast.is.IsClassDeclaration(node)),
  requiredStorageType: nodes.filter(node => ast.is.IsParameterDeclaration(node) && records.lambdaParameterType.get(node) !== undefined),
  nativeParticipation: nodes.filter(node => ast.is.IsFunctionDeclaration(node)),
  callableTarget: nodes.filter(node => records.callableTarget.get(node) !== undefined),
  bindingPatternProjection: nodes.filter(node => ast.is.IsArrayBindingPattern(node) && records.bindingPatternProjection.get(node) !== undefined),
  sourceArgument: nodes.filter(node => records.sourceArgument.get(node) !== undefined).slice(0, 2),
});
const ordinaryParameters = nodes.filter(node => ast.is.IsParameterDeclaration(node) &&
  (ast.is.IsFunctionDeclaration(ast.parent(node)) || ast.is.IsConstructorDeclaration(ast.parent(node))));
for (const family of families) {
  const count = family === "requiredStorageType" ? 3 : 2;
  assert.equal(subjects[family].length === count && subjects[family].every(subject => records[family].get(subject) !== undefined), true,
    `${family}: every exact checked subject carries its published plan`);
}
assert.equal(ordinaryParameters.length === 5, true, "five ordinary function and constructor parameters");

function requirement(family, subject) {
  return { family, subject, construct, producer };
}

function failure(family, subject) {
  return error => csharpRequiredRecordFailure(error, family, subject, construct, producer);
}

function readingRecords(base, reads) {
  return Object.freeze(Object.fromEntries(Object.keys(base).map(family => [family, Object.freeze({ get(...key) {
    reads.push(family);
    return base[family].get(...key);
  } })])));
}

test("the record input fixture is the exact inverse of the mandatory assembly", () => {
  const assembled = createCsharpProgramRecords(csharpRecordInput(records), []);
  const names = Object.keys(records);
  assert.equal(Object.isFrozen(assembled) && Object.keys(assembled).length === 117 && names.length === 117, true,
    "the assembly returns every current record family, frozen");
  assert.equal(names.every(family => assembled[family] === records[family]), true, "every assembled reader is the published reader");
});

test("the assembly has no optional requirement list", () => {
  assert.throws(() => createCsharpProgramRecords(csharpRecordInput(records)), TypeError, "the removed one-argument form fails");
  assert.throws(() => createCsharpProgramRecords(csharpRecordInput(records), undefined), TypeError, "an absent list is not an empty list");
});

test("native-use requirements preserve owner, semantic slot and context, not just the expression", () => {
  const entry = nodes.map(node => records.nativeUse.expression(node)).find(entry => entry?.use.kind !== "erased" &&
    entry?.use.completion.kind === "value");
  assert.equal(entry !== undefined, true, "the real program has an admitted exact native conversion use");
  const row = { family: "nativeUse", subject: entry.use.expression, site: entry.site, construct, producer };
  assertCsharpRequiredRecords(records, [row]);
  const other = targetUseSiteRef(entry.site.subject, entry.site.role, entry.site.enclosingContract, "different native context");
  assert.equal(records.nativeUse.get(other) === undefined && records.nativeUse.get(entry.site) === entry.use, true,
    "the published sibling does not satisfy another exact context");
  assert.throws(() => assertCsharpRequiredRecords(records, [{ ...row, site: other }]), failure("nativeUse", row.subject));
});

test("exact conversion requirements cannot fall back to another expression or conversion mode", () => {
  const entry = nodes.map(node => records.nativeUse.expression(node)).find(entry => entry?.use.kind !== "erased" &&
    entry?.use.completion.kind === "value");
  assert.equal(entry !== undefined, true, "the real program contains a completing native conversion use");
  const use = entry.use;
  const row = { family: "expressionConversion", subject: use.expression, source: use.carrier,
    target: use.kind === "converted" ? use.target : use.carrier, mode: use.kind === "converted" ? use.mode : "implicit", construct, producer };
  assertCsharpRequiredRecords(records, [row]);
  assert.equal(records.conversion.get(row.source, row.target, row.mode) !== undefined, true, "the corresponding type pair remains present");
  const omitted = csharpRecordsOmitting(records, "expressionConversion", row.subject);
  assert.throws(() => assertCsharpRequiredRecords(omitted, [row]), failure("expressionConversion", row.subject),
    "a pair is not exact expression evidence");
  assert.throws(() => assertCsharpRequiredRecords(records, [{ ...row, subject: program.sourceFiles[0] }]),
    failure("expressionConversion", program.sourceFiles[0]), "an unrelated source subject cannot borrow the published pair");
});

for (const family of families) {
  test(`the seal detects an omitted ${family} at its exact checked subject and no other`, () => {
    const [present, omitted] = subjects[family];
    const reads = [];
    const observed = readingRecords(csharpRecordsOmitting(records, family, omitted), reads);
    assert.throws(() => createCsharpProgramRecords(csharpRecordInput(observed), [requirement(family, omitted)]), failure(family, omitted),
      "the omitted subject fails the mandatory assembly");
    assert.equal(reads.length === 1 && reads[0] === family, true, "only the required family is read, once");
    reads.length = 0;
    assert.throws(() => assertCsharpRequiredRecords(observed, [requirement(family, present), requirement(family, omitted)]),
      failure(family, omitted), "the present sibling key does not discharge the omitted key");
    assert.equal(reads.length === 2 && reads.every(read => read === family), true, "both keys are read through the same family");
    assertCsharpRequiredRecords(observed, [requirement(family, present)]);
  });
}

test("weaker neighbouring evidence never discharges a required plan", () => {
  const [, storageSubject] = subjects.requiredStorageType;
  const withoutStorage = csharpRecordsOmitting(records, "requiredStorageType", storageSubject);
  assert.equal(withoutStorage.lambdaParameterType.get(storageSubject) !== undefined &&
    withoutStorage.storageType.get(storageSubject) !== undefined, true, "the lambda adaptation and the effective storage stay present");
  assert.throws(() => assertCsharpRequiredRecords(withoutStorage, [requirement("requiredStorageType", storageSubject)]),
    failure("requiredStorageType", storageSubject), "an adaptation without its required source storage fails");
  const [, factorySubject] = subjects.classFactory;
  const withoutFactory = csharpRecordsOmitting(records, "classFactory", factorySubject);
  assert.equal(withoutFactory.classConstructorType.get(factorySubject) !== undefined, true, "the class constructor type stays present");
  assert.throws(() => assertCsharpRequiredRecords(withoutFactory, [requirement("classFactory", factorySubject)]),
    failure("classFactory", factorySubject), "a constructor type is not a completed factory");
  const [, callable] = subjects.nativeParticipation;
  const withoutParticipation = csharpRecordsOmitting(records, "nativeParticipation", callable);
  assert.equal(withoutParticipation.returnContext.get(callable) !== undefined, true, "the callable return context stays present");
  assert.throws(() => assertCsharpRequiredRecords(withoutParticipation, [requirement("nativeParticipation", callable)]),
    failure("nativeParticipation", callable), "other callable facts do not decide participation");
});

test("optional discovery stays optional", () => {
  assertCsharpRequiredRecords(records, []);
  const [functionDeclaration] = subjects.nativeParticipation;
  const [classDeclaration] = subjects.classFactory;
  assert.equal(records.classFactory.get(functionDeclaration) === undefined, true, "a function has no class factory");
  assert.equal(records.nativeParticipation.get(classDeclaration) === undefined, true, "a class declaration has no callable participation");
  assert.equal(ordinaryParameters.every(parameter => records.lambdaParameterType.get(parameter) === undefined), true,
    "ordinary parameters publish no lambda adaptation");
  assert.throws(() => assertCsharpRequiredRecords(records, [requirement("classFactory", functionDeclaration)]),
    failure("classFactory", functionDeclaration), "an absent fact fails only when a producer required it");
});

test("validation is linear and stops at the first missing premise", () => {
  const [present] = subjects.classFactory;
  const [, omitted] = subjects.classFactory;
  const reads = [];
  const observed = readingRecords(csharpRecordsOmitting(records, "classFactory", omitted), reads);
  const complete = Object.freeze(Array.from({ length: 4096 }, () => Object.freeze(requirement("classFactory", present))));
  assertCsharpRequiredRecords(observed, complete);
  assert.equal(reads.length === 4096, true, "one read per required row");
  for (const position of [0, 97, 2048, 4095]) {
    reads.length = 0;
    const rows = complete.map((row, index) => index === position ? requirement("classFactory", omitted) : row);
    assert.throws(() => assertCsharpRequiredRecords(observed, rows), failure("classFactory", omitted), "the omitted row fails");
    assert.equal(reads.length === position + 1, true, "validation reads exactly through the first omitted premise");
  }
});

test("requirements are rows appended only to the caller's own list", () => {
  const first = [];
  const second = [];
  const row = requirement("classFactory", subjects.classFactory[0]);
  requireCsharpRecord(first, row);
  assert.equal(first.length === 1 && first[0] === row && second.length === 0, true, "a row is appended only to its own list");
});

for (const family of families) {
  test(`an omitted ${family} publication rejects in the real stage runner before any observation`, () => {
    const required = [];
    for (const selected of families) {
      for (const subject of subjects[selected]) requireCsharpRecord(required, requirement(selected, subject));
    }
    const events = [];
    const complete = runTargetCompilationStages({
      analyze: () => resolvedTargetStage(createCsharpProgramRecords(csharpRecordInput(records), required)),
      plan: assembled => { events.push("plan"); return resolvedTargetStage(assembled); },
      materialize: () => { events.push("materialize"); return []; },
    }, { analyzed() { events.push("analyzed"); }, planned() { events.push("planned"); } });
    assert.equal(complete.kind === "resolved" && events.join() === "analyzed,plan,planned,materialize", true,
      "the complete requirement list reaches every stage");
    const omitted = subjects[family][1];
    const result = runTargetCompilationStages({
      analyze: () => resolvedTargetStage(createCsharpProgramRecords(csharpRecordInput(csharpRecordsOmitting(records, family, omitted)), required)),
      plan() { assert.fail("a missing required plan never reaches planning"); },
      materialize() { assert.fail("a missing required plan never produces artifacts"); },
    }, {
      analyzed() { assert.fail("a rejected analysis is never observed"); },
      planned() { assert.fail("a rejected analysis never publishes a plan"); },
    });
    assert.equal(result.kind === "rejected" && !Object.hasOwn(result, "value") && result.diagnostics.length === 1, true,
      "exactly one analysis diagnostic and no program");
    assert.equal(csharpRequiredRecordFailure({ diagnostic: result.diagnostics[0] }, family, omitted, construct, producer), true,
      "the stage diagnostic is the required-record invariant");
  });
}
