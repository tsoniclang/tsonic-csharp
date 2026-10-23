import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpExpectedTypes } from "../../../dist/analysis/expected-types/analyze.js";
import { admitCsharpExpectedNativeUses, collectCsharpExpectedNativeUseSites } from "../../../dist/analysis/expected-types/native-uses.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { analyzeCsharpCallableCreations } from "../../../dist/analysis/callables/creation.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpProviderArgumentSourceCarrier } from "../../../dist/policy/operations/members/native-use-arguments.js";
import { analyzeCsharpConversions } from "../../../dist/analysis/conversions/analyze.js";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { createCsharpNativeFieldBacking } from "../../../dist/analysis/storage/native-field-backing.js";
import { prepareCsharpNativeBacking } from "../../../dist/analysis/storage/native-backing.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { analyzeCsharpFlowReadProjections } from "../../../dist/analysis/conversions/flow-read-projections.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../../dist/policy/types/callables/source-callable-contract.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

test("canonical source callable admission recognizes TypeLiteral signatures without inventing executable bodies", () => {
  const declaration = {};
  const interfaceOwner = {};
  const literalOwner = {};
  const foreignOwner = {};
  for (const [label, owner, expected] of [["interface", interfaceOwner, true], ["type literal", literalOwner, true],
    ["foreign owner", foreignOwner, false], ["missing owner", undefined, false]]) {
    const ast = { is: {
      IsFunctionDeclaration: () => false, IsArrowFunction: () => false, IsFunctionExpression: () => false,
      IsMethodDeclaration: () => false, IsConstructorDeclaration: () => false,
      IsMethodSignatureDeclaration: node => node === declaration,
      IsInterfaceDeclaration: node => node === interfaceOwner, IsTypeLiteralNode: node => node === literalOwner,
    }, parent: () => owner };
    assert.equal(isCsharpSourceCallableArtifactDeclaration(ast, declaration), expected, `${label}: one exact canonical signature classification`);
    assert.equal(isCsharpSourceCallableArtifactDeclaration(ast, {}), false, `${label}: a foreign source node never borrows the signature`);
  }
});

for (const surface of ["native", "js"]) test(`${surface} actual anonymous generic forwarding gets signature-only metadata from the canonical source owner`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `import type { int32 } from "@tsonic/core/types.js";
class Body { calls: int32 = 0; read(value: int32 = 7): int32 { this.calls++; return value; } }
class OuterBody<Outer extends object> { calls: int32 = 0; read(value: int32 = 7): int32 { this.calls++; return value; } }
class ShadowBody<T> { calls: int32 = 0; read(value: int32 = 7): int32 { this.calls++; return value; } }
type AnonymousView = { read<T>(value?: int32): int32 };
export function anonymous(present: boolean): int32 {
  const body = new Body();
  const view: AnonymousView = body;
  const value = present ? view.read<string>(11) : view.read<string>();
  if (body.calls !== 1) return -100;
  return value;
}` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(compiled.result.diagnostics.length === 0 && program !== undefined, true,
    compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const declarations = [];
  const visit = node => {
    if (program.source.ast.is.IsMethodSignatureDeclaration(node)) declarations.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(declarations.length, 1, "the real selected TypeLiteral has one authored method signature");
  const signature = declarations[0];
  assert.equal(isCsharpSourceCallableArtifactDeclaration(program.source.ast, signature), true,
    "the unchanged mandatory callable contract producer receives the actual selected declaration");
  assert.equal(program.records.nativeParticipation.get(signature), "signature", "generic metadata does not materialize a type-only body");
  assert.equal(program.source.ast.body(signature) === undefined, true, "the source signature remains body-free");
  assert.equal(compiled.artifacts.size > 0, true, "actual native generic admission no longer refuses an existing valid source signature");
});

test("flow admission consumes the completed actual shape view and publishes pure reads without a missing-edge fallback", () => {
  const file = Object.freeze({});
  const expression = Object.freeze({});
  const declaration = Object.freeze({});
  const storage = Object.freeze({ kind: "target-named", id: "Owner.Stored", csharpAllowsRefLikeTypeArguments: [] });
  const selected = Object.freeze({ kind: "target-named", id: "Owner.Actual", csharpAllowsRefLikeTypeArguments: [] });
  const actualShape = Object.freeze({ targetType: storage, members: Object.freeze([]), implements: Object.freeze([selected]) });
  const none = Object.freeze({ get: () => undefined });
  const evidence = { compileTimeMetadata: none, valueRefinement: { get: node => node === expression
    ? { source: { kind: "resolved", refinement: { kind: "exact" } }, flowReadTargetType: selected } : undefined } };
  const operations = { nativeUnreachable: none };
  const valueReads = { valueRead: { get: node => node === expression
    ? { flowReadStorage: storage, flowReadValue: selected } : undefined } };
  let shapeReads = 0;
  const actualShapes = Object.freeze({ resolveNode: () => undefined, resolveTarget(type) {
    shapeReads++;
    return type === storage ? actualShape : undefined;
  } });
  const policy = { ast: { is: { IsIdentifier: node => node === expression,
    IsPropertyAccessExpression: () => false, IsElementAccessExpression: () => false },
    forEachChild(node, visit) { if (node === file) visit(expression); }, parent: () => undefined },
    sourceFiles: [file], navigation: { sourceReferenceFor: node => node === expression ? { declaration } : undefined,
      declarationUses: () => [{ kind: "runtime", role: "read", reference: expression }] },
    projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
    target: {}, objectShapes: actualShapes };
  const admitted = analyzeCsharpFlowReadProjections(policy, evidence, operations, valueReads);
  const projection = admitted.flowReadProjection.get(expression);
  assert.equal(admitted.issues.length, 0, "the exact completed structural implementation edge is admitted");
  assert.equal(projection?.kind === "conversion" && projection.source === storage && projection.target === selected &&
    projection.selection.kind === "implicit" && projection.selection.proof === "object-shape-interface", true,
  "the flow selection consumes the same actual native implementation graph as conversion admission");
  assert.equal(shapeReads > 0, true, "the actual completed shape reader supplies the native relation");
  const completedReads = shapeReads;
  for (let index = 0; index < 3; index++) {
    assert.equal(admitted.flowReadProjection.get(expression) === projection, true, "published reads retain exact decision identity");
    assert.equal(admitted.flowReadProjection.get({}) === undefined, true, "a foreign expression has no published projection");
  }
  assert.equal(shapeReads, completedReads, "published flow reads never call the closed shape owner");
  assert.equal(Object.isFrozen(admitted) && Object.isFrozen(admitted.flowReadProjection) && Object.isFrozen(projection), true,
    "the complete flow publication is immutable");
  const missing = analyzeCsharpFlowReadProjections({ ...policy,
    objectShapes: Object.freeze({ resolveNode: () => undefined, resolveTarget: () => undefined }) }, evidence, operations, valueReads);
  assert.equal(missing.flowReadProjection.get(expression) === undefined, true, "missing physical evidence cannot borrow the other run's edge");
  assert.equal(missing.issues.length, 1, "one precise missing-relation diagnostic owns the actual source read");
  assert.equal(missing.issues[0].node === expression && missing.issues[0].code === "CSHARP_FLOW_READ_PROJECTION_NOT_PROVEN" &&
    missing.issues[0].message === "The exact source flow narrows 'target:Owner.Stored<>' to 'target:Owner.Actual<>', but C# has no closed storage-read projection for that relation.",
  true, "no raw policy, late shape registration or synthetic native relation supplies missing evidence");
});

test("early backing exposes no incomplete field store and finalizes exactly once", () => {
  const prepared = prepareCsharpNativeBacking({ ast: {} }, { pointerBackingDemands: [],
    typeParameterConstraints: { get: () => undefined } }, {});
  for (const name of ["nativeField", "nativeFields", "nativeLocation", "closedNativeContracts"]) {
    assert.equal(Object.hasOwn(prepared, name), false, `${name}: no partial physical-field reader is advertised`);
  }
  const final = prepared.finalize({ knownShapes: () => [], resolveTarget: () => undefined });
  assert.equal(final.fields.length === 0 && final.closedContracts.length === 0 && final.issues.length === 0 &&
    Object.isFrozen(final), true, "the actual empty field-demand domain has one immutable complete result");
  assert.throws(() => prepared.finalize({ knownShapes: () => [], resolveTarget: () => undefined }), /finalizes exactly once/u,
    "a second field finalization cannot recompute or replace the complete iteration state");
});

test("native delegate variance uses exact reference edges without adding an adapter or boxing through a variant slot", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const base = Object.freeze({ kind: "target-named", id: "Owner.Base" });
  const concrete = Object.freeze({ kind: "target-named", id: "Owner.Concrete" });
  const foreign = Object.freeze({ kind: "target-named", id: "Owner.Foreign" });
  const shapes = new Map([[concrete.id, { targetType: concrete, members: [], implements: [base] }],
    [base.id, { targetType: base, members: [], implements: [concrete] }]]);
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: id =>
    id === "Owner.Covariant" ? { kind: "resolved", binding: { id, target: "csharp", kind: "interface", sourceName: "Covariant", targetName: "Covariant",
      typeParameters: [{ identity: "Owner.Covariant:T", name: "T", variance: "out" }] } } : { kind: "missing" } }, target: {},
    objectShapes: { resolveTarget: type => type.kind === "target-named" ? shapes.get(type.id) : undefined } };
  const callable = (parameters, result) => csharpDelegateTargetType("System.Func", parameters, result);
  const conversions = [
    [callable([integer], concrete), callable([integer], base)],
    [csharpDelegateTargetType("System.Action", [base]), csharpDelegateTargetType("System.Action", [concrete])],
    [callable([base], concrete), callable([concrete], base)],
  ];
  for (const [index, [source, target]] of conversions.entries()) {
    const selected = selectCsharpConversion(policy, source, target, "implicit");
    assert.equal(selected.kind === "implicit" && selected.proof === "reference", true,
      `native variance ${index}: unchanged value slots and changed reference slots require no wrapper`);
  }
  const boxed = selectCsharpConversion(policy, callable([], integer), callable([], csharpObjectTargetType()), "implicit");
  assert.equal(boxed.kind === "delegate-adapter" && boxed.strategy === "adaptation", true,
    "a changed value-type result needs real adaptation, never native generic covariance");
  assert.equal(selectCsharpConversion(policy, { kind: "target-named", id: "Owner.Covariant", typeArguments: [integer] },
    { kind: "target-named", id: "Owner.Covariant", typeArguments: [csharpObjectTargetType()] }, "implicit").kind,
  "rejected", "provider variance cannot manufacture a reference conversion from boxing");
  const rest = csharpDelegateTargetType("System.Func", [integer], concrete, { restParameterIndex: 0 });
  assert.equal(selectCsharpConversion(policy, rest, callable([integer], base), "implicit").kind, "rejected",
    "native variance does not bypass the existing exact rest-parameter contract");
  assert.equal(selectCsharpConversion(policy, callable([], concrete), callable([], foreign), "implicit").kind, "rejected",
    "an unrelated reference target is not admitted through a cyclic implementation graph");
});

test("native field closure retains authored keys for every transitive and instantiated structural contract", () => {
  const integer = csharpSourcePrimitiveTargetType("uint32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const constraints = Object.freeze({ kind: "resolved", constraints: Object.freeze([]) });
  const environment = () => constraints;
  const member = (name, type) => Object.freeze({ sourceKey: Object.freeze({ kind: "property", name }),
    sourceName: name, targetName: name, memberKind: "property", type });
  const value = member("value", integer);
  const root = Object.freeze({ targetType: createStructuralObjectShapeTarget([value], undefined, environment, true), members: [value] });
  const typeParameter = Object.freeze({ kind: "type-parameter", identity: "owner:Wide:Payload", name: "Payload", csharpConstraints: constraints });
  const genericMembers = [value, member("payload", typeParameter)];
  const generic = Object.freeze({ targetType: createStructuralObjectShapeTarget(genericMembers, undefined, environment, true),
    members: genericMembers, implements: [root.targetType] });
  const concrete = substituteObjectShapeFactTargetTypeParameters(generic, new Map([[typeParameter.identity, floating]]));
  const leafMembers = [...concrete.members, member("extra", boolean)];
  const leaf = Object.freeze({ targetType: createStructuralObjectShapeTarget(leafMembers, undefined, environment),
    members: leafMembers, implements: [concrete.targetType] });
  const backing = createCsharpNativeFieldBacking([root, concrete, leaf], environment);
  const layout = Object.freeze({ kind: "scalar", pointeeType: integer, size: 4, alignment: 4,
    width: 64, littleEndian: true, fields: Object.freeze([]) });
  assert.equal(backing.select(root, value, layout).kind, "resolved", "the exact data-field layout is admitted once");
  for (const [name, shape] of [["root", root], ["instantiated contract", concrete], ["transitive concrete implementation", leaf]]) {
    assert.equal(backing.get(shape.targetType, "value") !== undefined, true, `${name}: every physical implementation is covered`);
  }
  const expected = [root.targetType, createStructuralObjectShapeTarget(concrete.members, undefined, environment, true)];
  assert.equal(backing.closedContracts().length, 2, "both actual structural contracts feed representation convergence");
  for (const [index, contract] of expected.entries()) {
    assert.equal(backing.closedContracts().some(selected => targetTypeRefEquals(selected, contract)), true,
      `closed contract ${index}: canonical authored key is not rehashed with late implementation edges`);
  }
  assert.equal(targetTypeRefEquals(concrete.members.find(field => field.targetName === "payload").type, floating), true,
    "the instantiated contract key uses its actual substituted native payload");
  const wrong = createStructuralObjectShapeTarget(concrete.members, concrete.implements, environment, true);
  assert.equal(backing.closedContracts().some(selected => targetTypeRefEquals(selected, wrong)), false,
    "an enriched implementation identity is never substituted for the authored native contract");
});

test("actual physical copy roots are ready before publication and all published shape reads are pure", () => {
  const root = { targetType: { kind: "target-named", id: "Owner.Shape" }, members: [] };
  const copy = { targetType: { kind: "target-named", id: "Owner.Copy" }, members: [] };
  const late = { targetType: { kind: "target-named", id: "Owner.Late" }, members: [] };
  const shapes = new Map([[root.targetType.id, root], [copy.targetType.id, copy]]);
  let reads = 0;
  const policy = { ast: {}, sourceFiles: [], typeDefinitions: undefined,
    projectTypes: { directSupertypes: () => [] }, objectShapes: {
      resolveTarget(type) { reads++; return type.kind === "target-named" ? shapes.get(type.id) : undefined; },
      resolveCopyShape(shape) { reads++; return shape.targetType === root.targetType ? copy : shape; },
    } };
  const registry = analyzeCsharpObjectShapes(policy, { targetTypes: [root.targetType] }, {});
  assert.equal(registry.resolveCopyShape(root) === copy, true, "binding copy demand is satisfied before the seal");
  assert.equal(registry.knownShapes().some(shape => shape.targetType === copy.targetType), true,
    "native backing observes the complete actual copy closure");
  assert.equal(registry.resolveTarget(late.targetType) === undefined, true, "an unregistered target is not fabricated");
  shapes.set(late.targetType.id, late);
  assert.equal(registry.resolveTarget(late.targetType) === late, true, "a missing open target is not negatively cached");
  assert.equal(registry.resolveCopyShape(late)?.targetType === late.targetType, true, "a late actual root reaches the same physical owner");
  const sealed = registry.seal();
  const completedReads = reads;
  for (let index = 0; index < 3; index++) {
    assert.equal(sealed.resolveCopyShape(root)?.targetType === copy.targetType, true, "sealed exact copy lookup");
    assert.equal(sealed.resolveTarget(late.targetType)?.targetType === late.targetType, true, "sealed late root lookup");
    assert.equal(sealed.knownShapes().length, 3, "only actual roots and their actual copy are published");
  }
  assert.equal(reads, completedReads, "no sealed reader invokes physical policy or computes a new shape");
});

test("separately rendered provider conversions consume the exact source carrier once", () => {
  const source = csharpSourcePrimitiveTargetType("float64");
  const target = csharpSourcePrimitiveTargetType("int32");
  for (const conversion of [{ kind: "provider-argument-adapter" }, { kind: "lifted-provider-argument-adapter" },
    { kind: "checked-native-integer" }, { kind: "delegate-adapter", strategy: "adaptation" }]) {
    const mapping = { kind: "by-value", effectiveArgumentIndex: 0, sourceType: source, targetType: target, conversion };
    assert.equal(csharpProviderArgumentSourceCarrier(mapping) === source, true,
      `${conversion.kind}: native operand construction is not the later selected conversion`);
  }
  for (const conversion of [{ kind: "identity" }, { kind: "nullable-map" }, { kind: "delegate-adapter", strategy: "native-binding" }]) {
    assert.equal(csharpProviderArgumentSourceCarrier({ kind: "by-value", effectiveArgumentIndex: 0,
      sourceType: source, targetType: target, conversion }) === undefined, true,
      `${conversion.kind}: an ordinary argument keeps its admitted native target`);
  }
  assert.equal(csharpProviderArgumentSourceCarrier({ kind: "checked-source", effectiveArgumentIndex: 0, targetType: target }) === undefined,
    true, "a checked source parameter has no fabricated provider conversion");
});

for (const wrapper of ["direct", "delegate", "tuple", "native-generic"]) test(wrapper === "direct"
  ? "actual native expression conversions complete while structural registration is open, then every view is lookup-only"
  : `${wrapper} actual conversion dependencies complete before structural publication`, () => {
  const expression = {};
  const other = {};
  const source = { kind: "target-named", id: "Source.ActualShape" };
  const target = { kind: "target-named", id: "Source.ActualContract" };
  const wrap = type => wrapper === "direct" ? type : wrapper === "delegate" ? csharpDelegateTargetType("System.Func", [], type)
    : wrapper === "tuple" ? { kind: "tuple", elements: [type] } : { kind: "target-named", id: "Owner.Covariant", typeArguments: [type] };
  const sourceUse = wrap(source);
  const targetUse = wrap(target);
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const none = Object.freeze({ get: () => undefined });
  let structuralClosed = false;
  let registrations = 0;
  const policy = { sourceFiles: [], target: {},
    ast: { is: { IsCallExpression: () => false, IsIdentifier: () => false }, getSourceFile: () => undefined },
    navigation: { referenceFor: () => undefined }, projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: id => id === "Owner.Covariant" ? { kind: "resolved", binding: { id, target: "csharp", kind: "interface",
      sourceName: "Covariant", targetName: "Covariant", typeParameters: [{ identity: "Owner.Covariant:T", name: "T", variance: "out" }] } }
      : { kind: "missing" } }, literalValues: { literalValue: none } };
  const shape = { targetType: source, sourceType: {}, members: [], implements: [] };
  const contract = { targetType: target, sourceType: {}, members: [] };
  const shapes = { resolveNode: () => undefined, resolveTarget: type => type === source ? shape : type === target ? contract : undefined,
    registerStructuralInterface(subject, from, to) {
      assert.equal(structuralClosed, false, "no conversion registers a shape after publication");
      assert.equal(subject === expression && from === source && to === target, true, "only the exact consumed correspondence is registered");
      registrations++;
      shape.implements = [target];
      return true;
    } };
  const analysis = analyzeCsharpConversions(policy, {}, shapes);
  const prepared = analysis.prepare({ operations: { selectedCall: none, selectedConstruction: none },
    expectedTypes: {}, valueReads: {} });
  assert.throws(() => analysis.seal(), /closed preparation/u, "final publication cannot compute or close preparation itself");
  const site = csharpNativeUseSite(expression, { kind: "return" });
  const use = Object.freeze({ kind: "converted", expression, carrier: sourceUse, target: targetUse, mode: "implicit",
    input: Object.freeze({ kind: "value", type: sourceUse }), completion: Object.freeze({ kind: "value", type: targetUse }),
    children: Object.freeze([]), evaluation: Object.freeze({ kind: "sequence", steps: Object.freeze([]) }) });
  analysis.close({ entries: Object.freeze([Object.freeze({ site, use })]) }, []);
  assert.equal(registrations, 1, "the one actual expression key is completed once");
  structuralClosed = true;
  const sealed = analysis.seal();
  assert.equal(analysis.seal() === sealed, true, "publication is one pure completed-index lookup");
  assert.equal(prepared.expressionConversion.get(expression, sourceUse, targetUse, "implicit") ===
    sealed.expressionConversion.get(expression, sourceUse, targetUse, "implicit"), true, "prepared and published views read the same admitted selection");
  assert.equal(sealed.issues.length, 0, "the exact corresponding nested structural pair remains natively admissible");
  assert.equal(prepared.expressionConversion.get(other, sourceUse, targetUse, "implicit") === undefined, true,
    "an absent expression cannot fall back to a pair or classify late");
  assert.equal(prepared.expressionConversion.get(expression, targetUse, sourceUse, "explicit") === undefined, true,
    "a different pair or mode cannot compute through the prepared view");
  assert.equal(prepared.conversion.get(target, boolean, "implicit") === undefined, true, "no speculative cross-product pair exists");
  assert.equal(registrations, 1, "no lookup or final seal touches the closed structural registry");
  assert.equal(Object.isFrozen(prepared.exactLiteralRequests) && Object.isFrozen(prepared.issues) && Object.isFrozen(sealed), true,
    "closed preparation and publication expose immutable data");
  assert.throws(() => analysis.close({ entries: [] }, []), /exactly once/u, "a closed preparation cannot be reopened");
});

function owners(sourceText, surface) {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(item => `${item.code}: ${item.message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of csharpProgramSourceFiles(program)) walk(file);
  const records = program.records;
  const literalValues = analyzeSourceLiteralValues(ast, csharpProgramSourceFiles(program));
  const contracts = nodes.filter(node => ast.is.IsFunctionDeclaration(node) && ast.body(node) !== undefined).flatMap(node => {
    const declared = records.returnContract.get(node);
    return declared?.kind === "resolved" ? [{ sourceDeclaration: node, returnType: declared.type }] : [];
  });
  const expected = analyzeCsharpExpectedTypes({ ast, sourceFiles: csharpProgramSourceFiles(program), literalValues,
    semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode, typeDefinitions: program.typeDefinitions }, records, records, program.objectShapes,
    { declarationContracts: contracts, closedInputType: () => undefined, get: () => undefined },
    { get: node => { const read = records.valueRead.get(node); return read === undefined ? undefined
      : { literalTarget: read.selectedOperation ?? read.source, operationValue: read.selectedOperation ?? read.source }; } }, records);
  const exact = analyzeCsharpExactLiteralSelections(literalValues, [
    ...expected.constructions.propertyKeyRequests,
    ...expected.nativeUseSites.requests.flatMap(request =>
      request.expression === undefined ? [] : [{ expression: request.expression, target: request.targetType }]),
  ], nodes);
  const final = { ast, exactLiteral: exact.exactLiteral, callableCreation: { get: () => undefined }, valueRead: records.valueRead,
    absentValue: { get: () => false }, operations: records };
  const initializer = name => ast.as.AsVariableDeclaration(nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name)).Initializer;
  return { ast, nodes, program, expected, final, initializer };
}

for (const surface of ["native", "js"]) test(`${surface} real expected requests admit selected numeric carriers without integer-summary substitution`, () => {
  const value = owners(`
    import type { int32, float64 } from "@tsonic/core/types.js";
    export const typed: int32 = 7 / 2;
    export const product: float64 = (7 / 2) * 10;
    export function divide(left: int32, right: int32): float64 { return left / right; }
  `, surface);
  const admission = admitCsharpExpectedNativeUses(value.expected, value.final);
  for (const expression of [value.initializer("typed"), value.initializer("product")]) {
    const requests = value.expected.nativeUseSites.requestsOf(expression).filter(request => request.kind === "requested" &&
      request.site.role === "initializer");
    assert.equal(requests.length > 0, true, "real initializer requests");
    for (const request of requests) {
      const use = admission.expectedUse.get(request.site);
      const selected = value.expected.expectedBinary.get(expression, request.targetType);
      assert.equal(use !== undefined && selected?.kind === "resolved" && use.carrier === selected.resultType, true, "actual selected physical carrier");
    }
  }
  const binary = value.nodes.find(node => value.ast.is.IsBinaryExpression(node) &&
    value.ast.is.IsIdentifier(value.ast.as.AsBinaryExpression(node).Left) && value.ast.text(value.ast.as.AsBinaryExpression(node).Left) === "left");
  const uses = admission.entries.filter(entry => entry.use.expression === binary);
  assert.equal(uses.length > 0 && uses.every(entry => entry.use.carrier.kind === "source-primitive" && entry.use.carrier.name === "int32"), true,
    "integer-operand division remains integer before its requested float conversion");
  assert.equal(Object.isFrozen(admission) && Object.isFrozen(admission.entries) && admission.entries.every(entry => Object.isFrozen(entry.use)), true, "native-use-admission:62: Object.isFrozen(admission) && Object.isFrozen(admission.entries) && admission.entries.ever");
  assert.equal(Object.hasOwn(value.program.records, "expectedUse"), false, "private finalizer is not program publication");
});

test("exact dependencies do not borrow another expression's forwarding owner or a different target", () => {
  const value = owners("export const wrapped = (1); export const other = 2;", "native");
  const requests = value.expected.nativeUseSites.requests;
  const parent = requests.find(request => request.kind === "requested" && request.expression === value.initializer("wrapped"));
  assert.equal(parent !== undefined, true, "native-use-admission:70: parent !== undefined");
  const orphan = { ...parent, site: csharpNativeUseSite(value.initializer("other"), { kind: "operand", position: "only" }, { target: parent.targetType }),
    forwardedFrom: csharpNativeUseSite(value.initializer("other"), { kind: "initializer" }, { target: parent.targetType }) };
  const expected = { ...value.expected, nativeUseSites: collectCsharpExpectedNativeUseSites([...requests, orphan]) };
  const admission = admitCsharpExpectedNativeUses(expected, value.final);
  assert.equal(admission.expectedUse.get(orphan.site) === undefined, true, "no expression-wide first owner fallback");
  assert.equal(admission.pending.some(entry => entry.site === orphan.site && entry.reason === "forwarding-owner-unresolved"), true, "native-use-admission:76: admission.pending.some(entry => entry.site === orphan.site && entry.reason === \"forwarding");
});

test("unfinalized callable creation remains pending despite a known requested delegate", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    export const callback: (value: int32) => int32 = value => value;`, "native");
  const admission = admitCsharpExpectedNativeUses(value.expected, value.final);
  const requests = value.expected.nativeUseSites.requestsOf(value.initializer("callback"));
  assert.equal(requests.length > 0, true, "native-use-admission:84: requests.length > 0");
  assert.equal(requests.every(request => admission.expectedUse.get(request.site) === undefined), true, "native-use-admission:85: requests.every(request => admission.expectedUse.get(request.site) === undefined)");
  assert.equal(requests.every(request => admission.pending.some(entry => entry.site === request.site && entry.reason === "callable-creation")), true, "native-use-admission:86: requests.every(request => admission.pending.some(entry => entry.site === request.site && e");
});

test("a required pending request and a cycle stay explicit rather than publishing a partial prefix", () => {
  const value = owners("export const result = 1;", "native");
  const expression = value.initializer("result");
  const request = value.expected.nativeUseSites.requestsOf(expression).find(entry => entry.kind === "requested");
  assert.equal(request !== undefined, true, "native-use-admission:93: request !== undefined");
  const first = csharpNativeUseSite(expression, { kind: "operand", position: "left" }, { target: request.targetType });
  const second = csharpNativeUseSite(expression, { kind: "operand", position: "right" }, { target: request.targetType });
  const pending = { ...request, kind: "pending", reason: "argument-unresolved" };
  const expected = { ...value.expected, nativeUseSites: collectCsharpExpectedNativeUseSites([pending,
    { ...request, site: first, forwardedFrom: second }, { ...request, site: second, forwardedFrom: first }]) };
  const admission = admitCsharpExpectedNativeUses(expected, value.final);
  assert.equal(admission.entries.length, 0, "native-use-admission:100: admission.entries.length");
  assert.deepEqual(admission.pending.map(entry => entry.reason), ["argument-unresolved", "forwarding-cycle", "forwarding-cycle"], "native-use-admission:101: admission.pending.map(entry => entry.reason)");
});

function nativeCreations(value, overrides = {}) {
  const records = value.program.records;
  const contract = declaration => {
    const result = records.returnContract.get(declaration);
    if (result?.kind !== "resolved") return undefined;
    const parameters = records.callableDeclaration.get(declaration).contract.parameters;
    const nativeParameters = parameters.map(parameter => {
      const type = records.lambdaParameterType.get(parameter);
      return type === undefined ? undefined : { sourceParameter: parameter, targetParameter: { type, passingMode: "by-value" } };
    });
    return nativeParameters.some(parameter => parameter === undefined) ? undefined : {
      kind: "source", sourceDeclaration: declaration, nativeSignature: Object.freeze({ methodTypeParameterIdentities: [], methodAllowsRefLikeTypeArguments: [] }),
      parameters, nativeParameters, returnType: result.type,
    };
  };
  return analyzeCsharpCallableCreations({ ast: value.ast, nodes: value.nodes,
    captures: records, contracts: { get: identity => contract(identity.declaration), closedInputType: () => undefined }, expectedTypes: records,
    storage: records, evidence: records, conversions: records, ...overrides });
}

for (const surface of ["native", "js"]) {
  test(`${surface} actual callable creation consumes closed native parameters rather than an unrelated requested delegate`, () => {
    const value = owners(`import type { int32 } from "@tsonic/core/types.js";
      export const callback: (value: int32) => int32 = value => value;`, surface);
    const expression = value.initializer("callback");
    const actual = nativeCreations(value);
    const selected = actual.callableCreation.get(expression);
    assert.equal(selected?.kind === "selected", true, "the completed callable has one selected creation");
    assert.equal(actual.callableTarget.get(expression) === selected.carrier, true, "publication reads the canonical creation object");
    const missingStorage = nativeCreations(value, { storage: { lambdaParameterType: { get: () => undefined } } });
    assert.equal(missingStorage.callableCreation.get(expression)?.kind === "pending" && missingStorage.callableTarget.get(expression) === undefined,
      true, "a callable contract cannot replace the exact parameter storage that native emission consumes");
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(actual), true, "creation evidence is immutable");
    const unrelated = csharpDelegateTargetType("System.Func", [csharpSourcePrimitiveTargetType("float64")],
      csharpSourcePrimitiveTargetType("float64"));
    const mismatched = nativeCreations(value, { expectedTypes: { callableTarget: { get: () => unrelated } } });
    assert.equal(mismatched.callableCreation.get(expression)?.kind, "selected", "actual native creation remains available independently of an unrelated destination");
    assert.equal(mismatched.callableTarget.get(expression) !== unrelated, true, "an unproved requested carrier never replaces actual creation");
    const unproven = nativeCreations(value, { contracts: { get: () => undefined, closedInputType: () => undefined }, storage: { lambdaParameterType: { get: () => undefined } } });
    assert.equal(unproven.callableCreation.get(expression)?.kind, "pending", "known contextual demand alone is not physical creation proof");
  });
}

test("frame callable creation retains the selected implementation carrier before contextual conversion", () => {
  const value = owners(`export function create(): () => number {
    for (let index = 0; index < 3; index++) { const read = () => index; return read; }
    return () => 0;
  }`, "native");
  const expression = value.nodes.find(node => value.ast.is.IsArrowFunction(node) &&
    value.program.records.captureClosure.get(node) !== undefined);
  assert.equal(expression !== undefined, true, "the real capture owner publishes a shared-frame method");
  const closure = value.program.records.captureClosure.get(expression);
  const selected = nativeCreations(value).callableCreation.get(expression);
  assert.equal(selected?.kind === "selected" && selected.carrier === closure.method.type, true,
    "actual frame method identity is authoritative, not the consumer's delegate request");
});

test("discarded callable definitions do not manufacture a carrier or a runtime value", () => {
  const value = owners("export function run(): void { (() => 1); }", "native");
  const expression = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  assert.equal(expression !== undefined, true, "one checked discarded definition");
  const actual = nativeCreations(value);
  assert.equal(actual.callableCreation.get(expression)?.kind, "discarded", "completed allocation decision is retained");
  assert.equal(actual.callableTarget.get(expression) === undefined, true, "no delegate carrier for an erased definition");
});

test("creation checks native passing modes and params shape before accepting a contextual signature", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    export const callback: (value: int32) => int32 = value => value;`, "native");
  const expression = value.initializer("callback");
  const integer = csharpSourcePrimitiveTargetType("int32");
  const original = csharpDelegateTargetType("System.Func", [integer], integer);
  for (const [label, signature] of [
    ["ref", { ...original.csharpDelegateSignature, parameterPassingModes: ["byref-readwrite"] }],
    ["in", { ...original.csharpDelegateSignature, parameterPassingModes: ["byref-readonly"] }],
    ["out", { ...original.csharpDelegateSignature, parameterPassingModes: ["byref-writeonly-must-init"] }],
    ["params", { ...original.csharpDelegateSignature, restParameterIndex: 0 }],
  ]) {
    const mismatched = Object.freeze({ ...original, csharpDelegateSignature: Object.freeze(signature) });
    const selected = nativeCreations(value, { expectedTypes: { callableTarget: { get: () => mismatched } } });
    assert.equal(selected.callableCreation.get(expression)?.kind, "selected", `${label}: actual native creation remains available`);
    assert.equal(selected.callableTarget.get(expression) !== mismatched, true,
      `${label}: a destination modifier cannot change the native parameter storage`);
  }
});
