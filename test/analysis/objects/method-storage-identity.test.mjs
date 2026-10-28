import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("selected structural method storage participates in the sole published carrier identity", () => {
  const declaration = Object.freeze({});
  const number = csharpSourcePrimitiveTargetType("float64");
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }),
    sourceName: "read", targetName: "read", memberKind: "method",
    type: csharpDelegateTargetType("System.Func", [number], number),
    sourceDeclarations: Object.freeze([declaration]) });
  const environment = () => assert.fail("the monomorphic method has no generic constraint");
  const targetType = createStructuralObjectShapeTarget([member], undefined, environment, true);
  const storage = Object.freeze({
    source: Object.freeze({ ast: Object.freeze({ is: Object.freeze({
      IsMethodDeclaration: () => false,
      IsMethodSignatureDeclaration: node => node === declaration,
      IsBindingElement: () => false,
      IsSpreadAssignment: () => false,
    }) }), navigation: Object.freeze({ declarationUseSummary: () => Object.freeze({
      firstClassUseCount: 1, exported: false, memberWritten: false,
    }) }) }),
    nodes: Object.freeze([declaration]),
    memberSubjectFor: () => Object.freeze({ kind: "unresolved", reason: "external method value" }),
  });
  const selected = retainCsharpMethodValueContracts({ targetType, members: [member] },
    shape => shape, environment, storage);
  assert.equal(selected.members[0].methodValueStorage?.kind, "delegate",
    "the actual first-class method use selects delegate storage");
  assert.equal(targetTypeRefEquals(selected.targetType, targetType), false,
    "a physical delegate slot cannot reuse the native method-only carrier identity");
  const expected = createStructuralObjectShapeTarget(selected.members, selected.implements, environment, true);
  assert.equal(targetTypeRefEquals(selected.targetType, expected), true,
    "the published carrier is constructed from its final physical members");
  const repeated = retainCsharpMethodValueContracts(selected, shape => shape, environment, storage);
  assert.equal(repeated.targetType === selected.targetType, true,
    "already selected storage keeps one exact published carrier without another identity path");
});

for (const surface of ["native", "js"]) {
  test(`destructured method values share the selected physical carrier on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function invoke({ read }: { read(value: number): number }): number { return read(3); }
export function run(): boolean { return invoke({ read(value: number) { return value + 4; } }) === 7; }
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `method-storage-identity-${surface}`);
  });
}

test("a closed readonly method signature retains the same native invocation contract as its actual producers", () => {
  const number = csharpSourcePrimitiveTargetType("float64");
  const environment = () => assert.fail("the closed monomorphic view needs no invented generic constraints");
  for (const replacement of [false, true]) {
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
      compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
      files: { "/src/index.ts": `
        const holder = { removed: 1, run(value: number): number { return value + 1; } };
        ${replacement ? "holder.run = (value: number): number => value + 2;" : ""}
        export function invoke(value: number): number { return holder.run(value); }
      ` },
    }).checkSource();
    assert.equal(checked.diagnostics.length, 0, "the actual native method and replacement are checked");
    const source = createTargetSourceProgram(checked);
    const declarations = [];
    const visit = node => {
      if (source.ast.is.IsMethodDeclaration(node)) declarations.push(node);
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(checked.getSourceFile("/src/index.ts"));
    assert.equal(declarations.length, 1, "the actual authored native method is selected once");
    const declaration = declarations[0];
    const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
    const subject = storage.memberSubjectFor(declaration);
    assert.equal(subject.kind, "resolved", "exposure belongs to the exact checked physical method declaration");
    const writes = storage.memberWritesFor(subject.subject);
    assert.equal(writes.kind, "complete", "the physical declaration uses its genuine source storage proof");
    assert.equal(writes.writes.length, replacement ? 1 : 0, "the original source replacement is neither hidden nor invented");
    const member = { sourceKey: { kind: "property", name: "run" }, sourceName: "run", targetName: "run",
      memberKind: "method", type: csharpDelegateTargetType("System.Func", [number], number), sourceDeclarations: [declaration] };
    const removed = { sourceKey: { kind: "property", name: "removed" }, sourceName: "removed", targetName: "removed",
      memberKind: "property", type: number };
    const implementation = { identity: "checked-native-method-owner", declaration: source.ast.parent(declaration),
      methods: [declaration], captures: [] };
    const shape = { targetType: createStructuralObjectShapeTarget([removed, member], undefined, environment, false, implementation),
      members: [removed, member], methodImplementation: implementation };
    const selected = retainCsharpMethodValueContracts(shape, value => value, environment, storage);
    const method = selected.members.find(value => value.sourceName === "run");
    assert.equal(method.methodValueStorage === undefined, !replacement,
      "first-class copying cannot manufacture a writable delegate slot for a proven readonly native method view");
    assert.equal(method.methodValueContract !== undefined, !replacement,
      "the checked readonly signature retains its exact existing native protocol; actual replacement retains delegate storage");
    assert.equal(selected.methodImplementation === implementation, true, "the exact checked native body provenance is retained, never fabricated");
    if (replacement) assert.equal(targetTypeRefEquals(method.methodValueStorage.type, member.type), true,
      "a real writable method keeps its exact selected delegate representation");
  }
});

test("a nonphysical checked method signature publishes neither physical writes nor a native body", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
    compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    files: { "/src/index.ts": `
      type View = { removed: number; run(value: number): number };
      export function expose(value: View): (value: number) => number { return value.run; }
    ` },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the signature and its first-class use are genuinely checked");
  const source = createTargetSourceProgram(checked);
  const declarations = [];
  const visit = node => {
    if (source.ast.is.IsMethodSignatureDeclaration(node)) declarations.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(checked.getSourceFile("/src/index.ts"));
  assert.equal(declarations.length, 1, "the exact source signature is selected");
  const declaration = declarations[0];
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  const subject = storage.memberSubjectFor(declaration);
  assert.equal(subject.kind, "resolved", "the checked signature has its exact logical member subject");
  const writes = storage.memberWritesFor(subject.subject);
  assert.equal(writes.kind, "unresolved", "a logical signature is not an authored physical member slot");
  assert.equal(writes.reason, "Member-write selection requires its exact authored physical member slot.");
  assert.equal(Object.hasOwn(writes, "writes"), false, "no physical write inventory is manufactured for a signature");
  const number = csharpSourcePrimitiveTargetType("float64");
  const member = { sourceKey: { kind: "property", name: "run" }, sourceName: "run", targetName: "run",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [number], number), sourceDeclarations: [declaration] };
  const removed = { sourceKey: { kind: "property", name: "removed" }, sourceName: "removed", targetName: "removed",
    memberKind: "property", type: number };
  const environment = () => assert.fail("the checked monomorphic signature has no generic constraints");
  const selected = retainCsharpMethodValueContracts({
    targetType: createStructuralObjectShapeTarget([removed, member], undefined, environment, true), members: [removed, member],
  }, () => assert.fail("an abstract signature cannot manufacture a native method protocol"), environment, storage);
  const method = selected.members.find(value => value.sourceName === "run");
  assert.equal(selected.methodImplementation === undefined, true, "an abstract signature never fabricates a native body");
  assert.equal(method.methodValueContract === undefined, true, "no physical native protocol is inferred from the signature alone");
  assert.equal(method.methodValueStorage?.kind, "delegate", "the actual first-class signature retains its selected value storage");
  assert.equal(targetTypeRefEquals(method.methodValueStorage.type, member.type), true, "the native delegate signature is unchanged");
});
