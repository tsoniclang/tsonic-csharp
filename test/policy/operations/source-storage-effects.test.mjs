import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { Node_Initializer } from "@tsonic/target-api/source";
import { createCsharpSourceProfileStorageEffects } from "../../../dist/analysis/operations/source-profiles/source-storage-effects.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { nativeStorageOperationAuthoritySource, nativeStorageOperationFactSource, nativeStorageVirtualOperationSource } from "../../../../tsonic/test/fixtures/native-storage-operation-authority.mjs";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { namedVariable } from "../../../../tsonic/test/fixtures/source-navigation.mjs";

function selectedEffects(sourceText, surface = "js") {
  const checked = checkCsharpSource({ surface, sourceText: `export {};\n${sourceText}` });
  assert.equal(checked.sourceDiagnosticsText, "", "the source fixture remains checked");
  assert.equal(checked.extensionDiagnostics.length, 0, "the source fixture preserves extension validation");
  const source = csharpTestSourceProgram(checked.source);
  const providers = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] });
  const effects = createCsharpSourceProfileStorageEffects(source, providers);
  const selections = new Map();
  const visit = node => {
    if (source.syntax.is.IsVariableDeclaration(node)) {
      const initializer = source.syntax.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && (source.syntax.is.IsCallExpression(initializer) || source.syntax.is.IsNewExpression(initializer))) {
        const selected = source.facts.selections.call(initializer);
        const name = source.syntax.text(source.syntax.name(node));
        assert.equal(selected !== undefined && selected.kind !== "refused", true, `${name} has an exact selected source call`);
        selections.set(name, { node: initializer, selected, effect: effects.callEffect(selected), effects, source, providers });
      }
    }
    for (const child of source.syntax.children(node)) if (child !== undefined) visit(child);
  };
  for (const sourceFile of source.sourceFiles) visit(sourceFile);
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
  const storage = control.source.facts.analyses.storage({ sourceFiles: control.source.sourceFiles, effects: control.effects });
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
  assert.equal(frozen?.effect?.resultAlias === frozen?.selected.arguments[0].argument, true,
    "freeze retains the exact checked actual operand");
  assert.equal(frozen.effect.resultAllocation === undefined, true, "freeze does not allocate a replacement");
  assert.equal(observed?.effect?.resultAlias === undefined, true, "inspection does not claim result identity");
  assert.equal(Object.hasOwn(frozen.effect, "preservedInputs"), false, "the removed preservation API cannot certify native writes");
  assert.equal(observed.effect === undefined, true, "inspection publishes no unchecked preservation contract");
  assert.equal(Object.isFrozen(frozen.effect), true, "materialized native alias evidence remains immutable");
  // nextgen C-2542: analyses.storage takes { sourceFiles, effects } (SourceStorageAnalysisInput).
  const storage = frozen.source.facts.analyses.storage({ sourceFiles: frozen.source.sourceFiles, effects: frozen.effects });
  const subject = storage.subjectFor(observed.selected.arguments[0].argument);
  assert.equal(subject.kind, "resolved", "inspection uses its exact checked operand");
  const domain = storage.closedOriginsFor(subject.subject);
  const file = frozen.source.syntax.getSourceFile(frozen.node);
  assert.equal(file !== undefined, true, "the original allocation belongs to this checked source file");
  const token = Node_Initializer(frozen.source.syntax, namedVariable(frozen.source.syntax, file, "token"));
  assert.equal(token !== undefined, true, "the original empty allocation is present");
  assert.equal(domain.kind, "complete", "a by-value opaque call cannot replace the original container identity");
  assert.equal(domain.origins.length === 1 && domain.origins[0].subject.node === token &&
    domain.origins[0].subject.projection.length === 0, true,
  "freeze and inspection retain exactly the original allocation, not a replacement or a content guarantee");
  assert.equal(storage.failureReason(), undefined, "the native alias query stays within its complete bounded graph");

  const members = selectedEffects(`
    const freeze = Object.freeze;
    const inspect = Object.isFrozen;
    const payload = {};
    const token = { payload };
    const frozen = freeze(token);
    const observed = inspect(frozen);
    const selected = frozen.payload;
  `);
  const memberFrozen = members.get("frozen");
  const memberObserved = members.get("observed");
  assert.equal(memberFrozen !== undefined && memberObserved !== undefined, true,
    "both mutable-backing alias calls have actual checked invocations");
  assert.equal(memberFrozen.effect?.resultAlias === memberFrozen.selected.arguments[0].argument, true,
    "the member fixture retains the exact original freeze operand");
  assert.equal(memberObserved.effect === undefined, true,
    "the member fixture receives no invented native nonmutation guarantee");
  const memberStorage = memberFrozen.source.facts.analyses.storage({ sourceFiles: memberFrozen.source.sourceFiles,
    effects: memberFrozen.effects });
  const memberFile = memberFrozen.source.syntax.getSourceFile(memberFrozen.node);
  assert.equal(memberFile !== undefined, true, "the member fixture has its actual checked source file");
  const initializer = name => Node_Initializer(memberFrozen.source.syntax,
    namedVariable(memberFrozen.source.syntax, memberFile, name));
  const container = memberStorage.subjectFor(memberObserved.selected.arguments[0].argument);
  const payloadRead = memberStorage.subjectFor(initializer("selected"));
  assert.equal(container.kind === "resolved" && payloadRead.kind === "resolved", true,
    "container and contained read are distinct actual checked subjects");
  const containerDomain = memberStorage.closedOriginsFor(container.subject);
  const payloadDomain = memberStorage.closedOriginsFor(payloadRead.subject);
  assert.equal(containerDomain.kind === "complete" && containerDomain.origins.length === 1 &&
    containerDomain.origins[0].subject.node === initializer("token") &&
    containerDomain.origins[0].subject.projection.length === 0, true,
  "the opaque inspection cannot replace the mutable backing container identity");
  assert.equal(payloadDomain.kind, "open", "no native inspection signature proves the physical payload member unmodified");
  assert.equal(payloadDomain.boundaries.some(boundary => boundary.kind === "opaque-write" &&
    boundary.exposure === memberObserved.node), true,
  "the actual selected inspect invocation owns the contained mutation uncertainty");
  assert.equal(payloadDomain.origins.some(origin => origin.subject.node === initializer("payload") &&
    origin.subject.projection.length === 0), true,
  "the opaque member writer cannot erase its original payload producer");
  assert.equal(memberStorage.failureReason(), undefined,
    "identity and member uncertainty share the same complete bounded source graph");
});

test("native alias and preservation effects require actual owned operation identity", () => {
  const selections = selectedEffects(nativeStorageOperationAuthoritySource);
  const control = selections.get("owned");
  assert.equal(control !== undefined, true, "owned native operation control");
  const storage = control.source.facts.analyses.storage({ sourceFiles: control.source.sourceFiles, effects: control.effects });
  const complete = new Set(["owned", "ownedAlias"]);
  for (const name of ["owned", "ownedAlias", "externalMember", "externalFunction"]) {
    const selection = selections.get(name);
    assert.equal(selection !== undefined, true, name);
    assert.equal(selection.effect?.resultAlias === selection.selected.arguments[0].argument, complete.has(name),
      `${name} proves implementation identity, not merely the signature`);
    assert.equal(selection.effect !== undefined, complete.has(name), `${name} cannot publish unchecked preservation either`);
    const subject = storage.subjectFor(selection.node);
    assert.equal(subject.kind, "resolved", name);
    const domain = storage.closedOriginsFor(subject.subject);
    assert.equal(domain.kind, complete.has(name) ? "complete" : "open", name);
  }
  let retained;
  const visit = node => {
    if (control.source.syntax.is.IsVariableDeclaration(node) &&
      control.source.syntax.text(control.source.syntax.name(node)) === "externalPreserved")
      retained = control.source.syntax.as.AsVariableDeclaration(node)?.Initializer;
    control.source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of control.source.sourceFiles) visit(file);
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
    const effect = createCsharpSourceProfileStorageEffects(source, selection.providers).call(selection.node, selection.selected);
    assert.equal(effect?.resultAlias === selection.selected.arguments[0].argument, true,
      "exact selected provider member and actual binding jointly supply native authority");
  }
  for (const binding of [undefined, { ...global, exportName: "Other" }, { ...global, providerId: "foreign-provider" },
    { ...global, providerModuleId: "other-module" }, { ...global, signatureId: "not-a-global" }]) {
    const source = nativeStorageOperationFactSource(selection.source, selection.selected, identity, binding);
    assert.equal(createCsharpSourceProfileStorageEffects(source, selection.providers).call(selection.node, selection.selected) === undefined, true,
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
