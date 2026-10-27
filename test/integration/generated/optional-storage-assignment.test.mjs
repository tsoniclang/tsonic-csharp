import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalStorageAssignmentSource } from "../../../../tsonic/test/fixtures/optional-storage-assignment.mjs";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/structural-implementation.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

test("an outer argument used only in native method constraints retains its source-template relationship", () => {
  const sourceOuter = { kind: "type-parameter", identity: "body:Outer", name: "BodyOuter" };
  const destinationOuter = { kind: "type-parameter", identity: "view:Outer", name: "ViewOuter" };
  const native = { kind: "type-parameter", identity: "body:Native", name: "Native" };
  const value = { kind: "type-parameter", identity: "view:Value", name: "Value" };
  const integer = { kind: "source-primitive", name: "int32" };
  const target = (id, argument, kind) => csharpTargetNamedType(id, [argument], { kind: "named", name: id },
    { sourceDeclarationKind: kind, allowsRefLikeTypeArguments: [false] });
  const member = (parameter, outer) => ({ sourceKey: { kind: "property", name: "read" }, sourceName: "read", targetName: "read",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [parameter], integer),
    typeParameters: [{ declaration: {}, identity: parameter.identity, name: parameter.name, constraints: [{ kind: "type", type: outer }] }] });
  const openSource = member(native, sourceOuter);
  const openDestination = member(value, destinationOuter);
  const sourceTemplate = { targetType: target("BoundedBody", sourceOuter, "class"), members: [openSource] };
  const destinationTemplate = { targetType: target("BoundedView", destinationOuter, "interface"), members: [openDestination] };
  for (const name of ["FirstBound", "SecondBound"]) {
    const bound = csharpTargetNamedType(name, undefined, { kind: "named", name },
      { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [], constraintRequiresReferenceType: true });
    const source = { targetType: target("BoundedBody", bound, "class"), members: [member(native, bound)], declarationTemplate: sourceTemplate };
    const destination = { targetType: target("BoundedView", bound, "interface"), members: [member(value, bound)], declarationTemplate: destinationTemplate };
    const selected = selectCsharpStructuralInterfaceImplementation({}, { sourceNode: {}, source, destination, declaredSupertypes: [],
      members: [{ source: source.members[0], destination: destination.members[0], openSource, openDestination, declaration: {} }] });
    assert.equal(selected !== undefined, true, `${name}: the existing checked member correspondence is admitted`);
    assert.equal(targetTypeRefEquals(selected.interfaceType.typeArguments[0], sourceOuter), true,
      `${name}: one generic class cannot gain a fixed closed interface from a method-bound-only occurrence`);
    assert.equal(targetTypeRefEquals(selected.methods[0].member.typeParameters[0].constraints[0].type, sourceOuter), true,
      `${name}: the real method constraint closes against the source class binder without changing its native ABI`);
    assert.equal(selected.methods[0].member.typeParameters[0].identity, value.identity,
      `${name}: source outer substitution cannot capture the destination method binder`);
  }
});

for (const surface of [undefined, "js"]) {
  test(`optional field declarations retain native absence, widths and identity (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalStorageAssignmentSource });
    executeCsharpConstruction(compiled, `optional-storage-assignment-${surface ?? "native"}`);
  });
}

const boundedSource = `import type { int32 } from "@tsonic/core/types.js";
class BaseValue { value: int32 = 13; }
class DerivedValue extends BaseValue { extra: int32 = 17; }
interface ReferenceOptionalView {
  read<Value extends object>(fallback: Value, present: boolean): int32;
  payload<Value extends object>(fallback: Value, present: boolean): Value | undefined;
}
class ReferenceOptionalBody implements ReferenceOptionalView {
  read<Native extends object>(fallback: Native, present: boolean): int32 {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
  payload<Native extends object>(fallback: Native, present: boolean): Native | undefined {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending;
  }
}
interface NominalOptionalView { read<Value extends BaseValue>(fallback: Value, present: boolean): int32; }
class NominalOptionalBody implements NominalOptionalView {
  read<Native extends BaseValue>(fallback: Native, present: boolean): int32 {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
}
interface InheritedOptionalView extends ReferenceOptionalView {}
class InheritedOptionalBody extends ReferenceOptionalBody implements InheritedOptionalView {}
interface OuterOptionalView<Outer extends BaseValue> { read<Value extends Outer>(fallback: Value, present: boolean): int32; }
class OuterOptionalBody<Outer extends BaseValue> implements OuterOptionalView<Outer> {
  read<Native extends Outer>(fallback: Native, present: boolean): int32 {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
}
interface DependentOptionalView { read<Value extends object, Item extends Value>(fallback: Item, present: boolean): int32; }
class DependentOptionalBody implements DependentOptionalView {
  read<Native extends object, Payload extends Native>(fallback: Payload, present: boolean): int32 {
    let pending: Payload | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
}
let evaluations: int32 = 0;
function next(value: DerivedValue): DerivedValue { evaluations += 1; return value; }
export function evaluationCount(): int32 { return evaluations; }
export function runBounded(): boolean {
  evaluations = 0;
  const value = new DerivedValue();
  const direct = new ReferenceOptionalBody();
  const reference: ReferenceOptionalView = direct;
  const nominal: NominalOptionalView = new NominalOptionalBody();
  const inherited: InheritedOptionalView = new InheritedOptionalBody();
  const outer: OuterOptionalView<BaseValue> = new OuterOptionalBody<BaseValue>();
  const dependent: DependentOptionalView = new DependentOptionalBody();
  return direct.read<DerivedValue>(value, false) === 7 && reference.read<DerivedValue>(next(value), true) === 11 &&
    direct.payload<DerivedValue>(value, false) === undefined && reference.payload<DerivedValue>(value, true) === value &&
    nominal.read<DerivedValue>(value, false) === 7 && nominal.read<DerivedValue>(value, true) === 11 &&
    inherited.read<DerivedValue>(value, true) === 11 && inherited.payload<DerivedValue>(value, true) === value &&
    outer.read<DerivedValue>(value, false) === 7 && outer.read<DerivedValue>(value, true) === 11 &&
    dependent.read<DerivedValue, DerivedValue>(value, false) === 7 && dependent.read<DerivedValue, DerivedValue>(value, true) === 11 &&
    evaluations === 1;
}`;

const boundedObserver = `
if (!Tsonic.Generated.Index.runBounded() || Tsonic.Generated.Index.evaluationCount() != 1)
    throw new System.Exception("bounded native optional source semantics and single evaluation");
var value = new Tsonic.Generated.DerivedValue();
var body = new Tsonic.Generated.ReferenceOptionalBody();
Tsonic.Generated.ReferenceOptionalView view = body;
if (body.read<Tsonic.Generated.DerivedValue>(value, false) != 7 || view.read<Tsonic.Generated.DerivedValue>(value, true) != 11 ||
    body.payload<Tsonic.Generated.DerivedValue>(value, false) != null ||
    !System.Object.ReferenceEquals(view.payload<Tsonic.Generated.DerivedValue>(value, true), value))
    throw new System.Exception("one native binder, absence and original payload identity");
Tsonic.Generated.DependentOptionalView dependent = new Tsonic.Generated.DependentOptionalBody();
if (dependent.read<object, int>(0, false) != 7 || dependent.read<object, int>(0, true) != 11)
    throw new System.Exception("dependent native value actual distinguishes absent from present zero");
for (int index = 0; index < 8192; index++) { _ = view.read(value, (index & 1) == 0); _ = NativeRead(value, (index & 1) == 0); }
long generatedBefore = System.GC.GetAllocatedBytesForCurrentThread(); long generatedSum = 0;
for (int index = 0; index < 8192; index++) generatedSum += view.read(value, (index & 1) == 0);
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = System.GC.GetAllocatedBytesForCurrentThread(); long nativeSum = 0;
for (int index = 0; index < 8192; index++) nativeSum += NativeRead(value, (index & 1) == 0);
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
if (generatedSum != 8192 * 9 || nativeSum != generatedSum || generatedBytes != 0 || nativeBytes != 0)
    throw new System.Exception($"bounded native optional cost: {generatedBytes}/{nativeBytes}, {generatedSum}/{nativeSum}");
System.Console.Write("bounded native optional; generated=0; native=0");
static int NativeRead<Value>(Value fallback, bool present) where Value : class {
    Value? pending = null;
    if (present) pending = fallback;
    return pending is null ? 7 : 11;
}`;

for (const surface of ["native", "js"]) {
  test(`bounded native optional bodies preserve generic interface ABI and zero-allocation storage (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: boundedSource });
    assert.equal(compiled.sourceDiagnosticsText, "", "all bounded native interface programs remain source accepted");
    assert.equal(compiled.result.diagnostics.length, 0,
      `bounded native admission: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    const ast = compiled.result.program.source.ast;
    const referenceOwners = new Set(["ReferenceOptionalBody", "NominalOptionalBody", "OuterOptionalBody"]);
    let referenceMethods = 0;
    const inspect = node => {
      if (ast.is.IsMethodDeclaration(node)) {
        const owner = ast.parent(node);
        const name = owner === undefined ? undefined : ast.name(owner);
        if (name !== undefined && referenceOwners.has(ast.text(name))) {
          referenceMethods += 1;
          assert.equal(compiled.result.program.records.genericProjection.get(node).length, 0,
            "genuine class and concrete-base binders never add a body-only generic witness");
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) inspect(child); });
    };
    csharpProgramSourceFiles(compiled.result.program).forEach(inspect);
    assert.equal(referenceMethods, 4, "all genuine reference-bound source bodies retain the same exact no-witness check");
    assert.equal(/ReferenceOptionalView\.(?:read|payload)</u.test(generated), false,
      "identical native signatures gain no gratuitous explicit bridge");
    const captureRoot = new URL("../../../.temp/C19-bounded-optional-storage/", import.meta.url);
    mkdirSync(captureRoot, { recursive: true });
    writeFileSync(new URL(`${surface}.json`, captureRoot), JSON.stringify({ sourceText: boundedSource,
      nativeProgram: boundedObserver, artifacts: [...compiled.artifacts] }) + "\n");
    assert.equal(executeCsharpConstruction(compiled, `C19-bounded-optional-${surface}`, false, false, [], boundedObserver),
      "bounded native optional; generated=0; native=0", "real native observers prove identity, ABI, evaluation and zero added allocation");
    let removed = 0;
    const missingConstraint = new Map([...compiled.artifacts].map(([path, source]) => [path,
      source.replace(/(class ReferenceOptionalBody\b[\s\S]*?public int read<Native>\([^)]*\)\s*)where Native : class/u,
        (_match, prefix) => { removed += 1; return prefix; })]));
    assert.equal(removed, 1, "the native inverse removes exactly the selected body class constraint, not an assertion or source program");
    assert.throws(() => executeCsharpConstruction({ ...compiled, artifacts: missingConstraint }, `C19-bounded-constraint-inverse-${surface}`,
      false, false, [], boundedObserver), error => String(error.message).includes("CS0425"),
    "native C# requires the genuine implicit-method class constraint; a checker/import error is not this inverse");
  });
}
