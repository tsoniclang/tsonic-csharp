import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { createCsharpSourceProfileStorageEffects } from "../../../dist/policy/operations/source-profiles/source-storage-effects.js";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { nativeStorageOperationAuthoritySource, nativeStorageOperationFactSource, nativeStorageVirtualOperationSource } from "../../../../tsonic/test/fixtures/native-storage-operation-authority.mjs";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";

function selectedEffects(sourceText, surface = "js") {
  const checked = checkCsharpSource({ surface, sourceText: `export {};\n${sourceText}` });
  assert.equal(checked.sourceDiagnosticsText, "", "the source fixture remains checked");
  assert.equal(checked.extensionDiagnostics.length, 0, "the source fixture preserves extension validation");
  const source = createTargetSourceProgram(checked.source);
  const effects = createCsharpSourceProfileStorageEffects(source);
  const selections = new Map();
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node)) {
      const initializer = source.ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && (source.ast.is.IsCallExpression(initializer) || source.ast.is.IsNewExpression(initializer))) {
        const selected = source.semantics.forNode(initializer).operations.call(initializer);
        const name = source.ast.text(source.ast.name(node));
        assert.equal(selected?.sourceSelectedSignatureKind, "resolved", `${name} has an exact selected source call`);
        selections.set(name, { node: initializer, selected, effect: effects.call(initializer, selected), effects, source });
      }
    }
    for (const child of source.ast.children(node)) if (child !== undefined) visit(child);
  };
  for (const sourceFile of source.navigation.sourceFiles) visit(sourceFile);
  return selections;
}

for (const surface of ["native", "js"]) test(`owned Error calls and constructions materialize one exact fresh allocation witness on ${surface}`, () => {
  const selections = selectedEffects(`
    const Alias = Error;
    const constructed = new Error("constructed");
    const called = Error("called");
    const aliasConstructed = new Alias("alias constructed");
    const aliasCalled = Alias("alias called");
  `, surface);
  for (const name of ["constructed", "called", "aliasConstructed", "aliasCalled"]) {
    const selection = selections.get(name);
    assert.equal(selection !== undefined, true, `${name} has its checked invocation`);
    assert.equal(selection?.effect?.resultAllocation === selection?.node, true, `${name} owns the exact selected native allocation`);
    assert.equal(selection.effect.resultAlias === undefined, true, `${name} is not an input alias`);
    assert.equal(Object.isFrozen(selection.effect), true, `${name} effect is immutable`);
  }
});

for (const surface of ["native", "js"]) test(`native allocation effects retain exact unknown callee domains on ${surface}`, () => {
  const selections = selectedEffects(`
    const Alias = Error;
    const constructed = new Error("constructed");
    const called = Error("called");
    const aliasConstructed = new Alias("alias constructed");
    const aliasCalled = Alias("alias called");
    declare const Ambient: typeof Error;
    const ambientConstructed = new Ambient("ambient constructed");
    const ambientCalled = Ambient("ambient called");
    export function external(ctor: ErrorConstructor): Error {
      const externalConstructed = new ctor("external constructed");
      const externalCalled = ctor("external called");
      return externalCalled;
    }
    export function externalTypeof(ctor: typeof Error): Error {
      const externalTypeofConstructed = new ctor("external constructed");
      const externalTypeofCalled = ctor("external called");
      return externalTypeofCalled;
    }
  `, surface);
  const control = selections.get("constructed");
  assert.equal(control !== undefined, true, "the owned allocation has its checked invocation");
  const storage = createSourceStorageQuery(control.source, control.source.navigation.sourceFiles, undefined, control.effects);
  assert.equal(storage.failureReason(), undefined, "the one bounded storage graph is valid");
  const complete = new Set(["constructed", "called", "aliasConstructed", "aliasCalled"]);
  for (const [name, selection] of selections) {
    assert.equal(selection.effect?.resultAllocation === selection.node, complete.has(name),
      `${name} requires actual owned native callee identity before publishing an allocation effect`);
    const subject = storage.subjectFor(selection.node);
    assert.equal(subject.kind, "resolved", `${name} has its exact storage subject`);
    const domains = storage.closedOriginsFor(subject.subject);
    assert.equal(domains.kind, complete.has(name) ? "complete" : "open", `${name} preserves the exact callee domain`);
    if (!complete.has(name)) assert.equal(domains.boundaries.some(boundary => boundary.kind === "external-input"), true,
      `${name} retains an exact native external-input witness`);
  }
  assert.equal(storage.failureReason(), undefined, "complete-domain selection retains the finite graph budget");
});

test("native freeze aliases delegate exact selected operands to the one shared profile owner", () => {
  const selections = selectedEffects(`
    const freeze = Object.freeze;
    const inspect = Object.isFrozen;
    const token: object = {};
    const frozen = freeze(token);
    const observed = inspect(frozen);
  `);
  const frozen = selections.get("frozen");
  const observed = selections.get("observed");
  assert.equal(frozen !== undefined && observed !== undefined, true, "both alias calls have checked invocations");
  assert.equal(frozen?.effect?.resultAlias === frozen?.selected.sourceArguments[0].expression, true,
    "freeze retains the exact checked actual operand");
  assert.equal(frozen.effect.resultAllocation === undefined, true, "freeze does not allocate a replacement");
  assert.equal(observed?.effect?.resultAlias === undefined, true, "inspection does not claim result identity");
  assert.equal(observed?.effect?.preservedInputs[0] === observed?.selected.sourceArguments[0].expression, true,
    "inspection preserves its exact checked operand");
  assert.equal(Object.isFrozen(frozen.effect.preservedInputs) && Object.isFrozen(observed.effect.preservedInputs), true,
    "materialized operand rows remain immutable");
});

test("native alias and preservation effects require actual owned operation identity", () => {
  const selections = selectedEffects(nativeStorageOperationAuthoritySource);
  const control = selections.get("owned");
  assert.equal(control !== undefined, true, "owned native operation control");
  const storage = createSourceStorageQuery(control.source, control.source.navigation.sourceFiles, undefined, control.effects);
  const complete = new Set(["owned", "ownedAlias"]);
  for (const name of ["owned", "ownedAlias", "externalMember", "externalFunction"]) {
    const selection = selections.get(name);
    assert.equal(selection !== undefined, true, name);
    assert.equal(selection.effect?.resultAlias === selection.selected.sourceArguments[0].expression, complete.has(name),
      `${name} proves implementation identity, not merely the signature`);
    assert.equal(selection.effect !== undefined, complete.has(name), `${name} cannot publish unchecked preservation either`);
    const subject = storage.subjectFor(selection.node);
    assert.equal(subject.kind, "resolved", name);
    const domain = storage.closedOriginsFor(subject.subject);
    assert.equal(domain.kind, complete.has(name) ? "complete" : "open", name);
  }
  let retained;
  const visit = node => {
    if (control.source.ast.is.IsVariableDeclaration(node) &&
      control.source.ast.text(control.source.ast.name(node)) === "externalPreserved")
      retained = control.source.ast.as.AsVariableDeclaration(node)?.Initializer;
    control.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of control.source.navigation.sourceFiles) visit(file);
  assert.equal(retained !== undefined, true, "the actual selected holder member is checked");
  const selected = storage.subjectFor(retained);
  assert.equal(selected.kind, "resolved");
  const domain = storage.closedOriginsFor(selected.subject);
  assert.equal(domain.kind, "open", "an unknown same-signature operation can mutate the exposed member");
  assert.equal(domain.boundaries.some(boundary => boundary.kind === "opaque-write"), true,
    "the actual unknown invocation retains its member-write witness");
  assert.equal(storage.failureReason(), undefined, "one finite proof graph");
});

test("virtual native operation authority requires its matching provider-owned runtime binding", () => {
  const selection = selectedEffects(nativeStorageVirtualOperationSource).get("frozen");
  assert.equal(selection !== undefined, true, "exact checked virtual operation");
  const identity = { providerId: jsSourceSemanticsIdentity.providerId, providerVersion: "1",
    providerModuleId: "test.selected-js", moduleSpecifier: "@test/selected-js", artifactFileName: "/src/selected-js.d.ts",
    exportName: "ObjectConstructor", memberName: "freeze", memberKey: { kind: "property-key", name: "freeze" } };
  const global = { ...identity, exportName: "Object", memberName: undefined, memberKey: undefined };
  for (const operation of [identity, { ...identity, memberName: undefined }, { ...identity, memberKey: undefined },
    { ...identity, memberName: "assign" }]) {
    const source = nativeStorageOperationFactSource(selection.source, selection.selected, operation, global);
    const effect = createCsharpSourceProfileStorageEffects(source).call(selection.node, selection.selected);
    assert.equal(effect?.resultAlias === selection.selected.sourceArguments[0].expression, true,
      "exact selected provider member and actual binding jointly supply native authority");
  }
  for (const binding of [undefined, { ...global, exportName: "Other" }, { ...global, providerId: "foreign-provider" },
    { ...global, providerModuleId: "other-module" }, { ...global, signatureId: "not-a-global" }]) {
    const source = nativeStorageOperationFactSource(selection.source, selection.selected, identity, binding);
    assert.equal(createCsharpSourceProfileStorageEffects(source).call(selection.node, selection.selected) === undefined, true,
      "a selected virtual signature cannot certify a foreign binding");
  }
});

test("local same-spelled constructors and named globals cannot acquire native allocation evidence", () => {
  const selections = selectedEffects(`
    function Error(message: string): { message: string } { return { message }; }
    class LocalError { constructor(public message: string) {} }
    const local = Error("local");
    const constructed = new LocalError("local");
    const namedGlobal = parseInt("12");
    const unrelated = { freeze(value: object): object { return value; } };
    const retained = unrelated.freeze({});
  `);
  for (const name of ["local", "constructed", "namedGlobal", "retained"]) {
    const selection = selections.get(name);
    assert.equal(selection !== undefined, true, `${name} has its checked invocation`);
    assert.equal(selection.effect === undefined, true, `${name} has no owned native storage effect`);
  }
});

test("untyped invocation evidence never receives a native storage effect", () => {
  const selected = selectedEffects(`const constructed = new Error("checked");`).get("constructed");
  assert.equal(selected !== undefined, true, "the typed control has its checked invocation");
  assert.equal(selected.effects.call(selected.node, { ...selected.selected, sourceSelectedSignatureKind: "untyped" }) === undefined,
    true, "untyped calls reject before identity materialization");
});
