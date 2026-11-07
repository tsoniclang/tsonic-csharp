import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorSum, sourceTypeDescriptorsEqual, substituteSourceTypeDescriptor } from "@tsonic/target-api/source";
import { representCsharpSourceType } from "../../../dist/policy/types/source-type-flow/representation.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpProjectedType, getCsharpGenericSourceUnionParts } from "../../../dist/target-model/types/projections.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms, combineCsharpTargetUnionMembers } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpReadOnlyListTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpClosedInvocationMatches } from "../../../dist/policy/types/callables/value-type.js";
import { resolveCsharpSourceUnionOperations, resolveCsharpSourceUnionRole } from "../../../dist/policy/types/storage/source-union-storage.js";
import { resolveCsharpProjectionArguments, resolveCsharpPublishedSourceSum } from "../../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";

const unexpected = () => assert.fail("Source union projection must not reopen checked types or invent a declaration");
let retained;
function fixture() {
  if (retained !== undefined) return retained;
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": `import { reverse } from "./reverse.js";
      export function forward<T>(value: string | T): string | T { return value; }
      export function partial<U>(value: string | number | U): string | number | U {
        return forward<number | U>(value);
      }
      export function run(value: number): string | number { return forward<number>(value); }
      export function coincident(value: string): string { return forward<string>(value); }
      export function other<Other>(value: Other): Other { return value; }
      export function optional<T>(value: T | undefined): string | T | undefined { return value; }
      export function optionalNumeric(value: number | undefined): string | number | undefined {
        return optional<number>(value);
      }
      export function arrayRole(value: string | number[]): string | number[] { return value; }
      export function opposite(value: number | string): number | string { return reverse(value); }`,
    "/src/reverse.ts": "export function reverse(value: number | string): number | string { return value; }",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "all declaration and instantiated-call programs are genuinely checked");
  const source = createTargetSourceProgram(checked);
  const ast = source.ast;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  source.navigation.sourceFiles.filter(file => ast.getFileName(file).startsWith("/src/")).forEach(visit);
  const named = name => nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === name);
  const forward = named("forward");
  const parameter = ast.typeParameters(forward)[0];
  const union = nodes.find(node => ast.is.IsUnionTypeNode(node) && ast.parent(node) === ast.parameters(forward)[0]);
  const outcome = source.effectiveTypes.get(union);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "union", true,
    "the exact authored open union component has its sealed Source publication");
  const calls = nodes.filter(node => ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "forward")
    .map(node => source.effectiveTypes.callInstantiation(node));
  assert.equal(calls.length === 3 && calls.every(call => call?.method.length === 1), true,
    "concrete partial and coincident bindings come from actual calls");
  const numeric = calls.find(call => call.method[0].type.kind === "primitive").method[0].type;
  const text = calls.find(call => call.method[0].type.kind === "string").method[0].type;
  const partial = calls.find(call => call.method[0].type.kind === "union").method[0].type;
  const host = { target: { id: "csharp" }, typeParameterConstraints: {},
    sourceSum: descriptor => resolveCsharpPublishedSourceSum({ host: { ast, effectiveTypes: source.effectiveTypes } }, descriptor),
    declaredType(declaration) { return csharpSourceTypeParameter(declaration, ast) ?? unexpected(); },
    retainShape: unexpected, indexType: unexpected, callableType: unexpected, constructorType: unexpected,
    shapeKind: unexpected, memberDeclaration: unexpected, classStaticSide: unexpected, memberTypeParameters: unexpected };
  const represent = descriptor => representCsharpSourceType(host, descriptor);
  retained = { source, ast, nodes, named, forward, parameter, open: outcome.type, numeric, text, partial, represent };
  return retained;
}

function closure(input, bindings) {
  const open = sourceTypeDescriptorSum(input.ast, input.open);
  const application = open.identity.application.map(argument => substituteSourceTypeDescriptor(input.ast, argument, bindings));
  const record = input.source.effectiveTypes.sum({ family: open.identity.family, application });
  assert.equal(record !== undefined, true, "the exact family/application has its sealed original Source record");
  return { record, arms: record.arms.map(arm => input.represent(arm.type)) };
}

test("one sealed Source order governs authored reversals in another file and every native carrier", () => {
  const input = fixture();
  const closed = input.nodes.filter(node => input.ast.is.IsUnionTypeNode(node)).flatMap(node => {
    const outcome = input.source.effectiveTypes.get(node);
    return outcome?.kind !== "refused" && outcome?.type.kind === "union" &&
      outcome.type.types.every(type => type.kind === "primitive" || type.kind === "string") ? [outcome.type] : [];
  });
  assert.equal(closed.length >= 3, true, "the real programs include both authored orders across two source files");
  const first = input.represent(closed[0]);
  assert.equal(first !== undefined, true, "the original sealed arm set has a native carrier");
  for (const descriptor of closed) assert.equal(targetTypeRefEquals(input.represent(descriptor), first), true,
    "Native consumes the Host order without a second key-based chooser");
  assert.equal(combineCsharpTargetUnionMembers(getCsharpRuntimeUnionArms(first)) === undefined, true,
    "the retired carrier-only Source sum formation is not admitted");
});

test("open storage snapshots retain original Source template role and binder identities", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  const parts = getCsharpGenericSourceUnionParts(storage);
  assert.equal(parts !== undefined && parts.members.length === 2, true, "a generic union defers physical storage");
  const [snapshot] = snapshotCsharpTargetTypes([storage]);
  assert.equal(snapshot.csharpProjection.source === input.open, true, "Source descriptor identity is retained rather than cloned");
  assert.equal(snapshot.csharpProjection.sum.roles.every((role, index) =>
    role.type === snapshot.csharpProjection.sum.record.arms[index].type && sourceTypeDescriptorsEqual(role.type, input.open.types[index])), true,
    "original ABI roles remain distinct immutable Source components");
  assert.equal(snapshot.csharpProjection.sum.roles.some(role => role.type.kind === "declared" && role.type.declaration === input.parameter), true,
    "the original compiler Node is an opaque identity, never an AST snapshot");
  assert.equal(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.csharpProjection.sum.roles), true,
    "published physical metadata is frozen without mutating Source objects");
});

test("an original single-arm role reuses its already selected native materialization", () => {
  const input = fixture();
  let declarations = 0;
  const storage = representCsharpSourceType({ target: { id: "csharp" }, typeParameterConstraints: {},
    sourceSum: descriptor => resolveCsharpPublishedSourceSum({ host: {
      ast: input.ast, effectiveTypes: input.source.effectiveTypes,
    } }, descriptor),
    declaredType(declaration) {
      assert.equal(declaration === input.parameter, true, "only the original published binder is represented");
      declarations++;
      return csharpSourceTypeParameter(declaration, input.ast);
    },
    retainShape: unexpected, indexType: unexpected, callableType: unexpected, constructorType: unexpected,
    shapeKind: unexpected, memberDeclaration: unexpected, classStaticSide: unexpected, memberTypeParameters: unexpected,
  }, input.open);
  assert.equal(getCsharpGenericSourceUnionParts(storage)?.members.length, 2,
    "the exact original open storage remains a two-role Native projection");
  assert.equal(declarations, 1, "the Source-authorized role is a lookup of the selected arm, not a second materialization");
});

test("distinct original families share canonical storage without overwriting role provenance", () => {
  const input = fixture();
  const returned = input.source.effectiveTypes.get(input.ast.typeNode(input.forward));
  assert.equal(returned !== undefined && returned.kind !== "refused", true, "the return family has its original publication");
  const first = input.represent(input.open);
  const second = input.represent(returned.type);
  assert.equal(first.csharpProjection.sum.record !== second.csharpProjection.sum.record, true,
    "parameter and return retain distinct original family records");
  assert.equal(targetTypeRefEquals(first, second) && first.name === second.name, true,
    "the same canonical Source vector and Native representation have one storage parameter");
  for (const carrier of [first, second]) assert.equal(input.source.effectiveTypes.sum(carrier.csharpProjection.sum.record.identity) ===
    carrier.csharpProjection.sum.record, true, "each family's physical witness retains the exact authenticated Source record");
});

test("Source sum association rejects missing publications foreign programs and forged family records", () => {
  const input = fixture();
  const effectiveTypes = input.source.effectiveTypes;
  const missing = { get: () => undefined, sum: identity => effectiveTypes.sum(identity) };
  const forged = { get: node => effectiveTypes.get(node), sum: identity => {
    const record = effectiveTypes.sum(identity);
    return record === undefined ? undefined : { ...record };
  } };
  assert.equal(resolveCsharpPublishedSourceSum({ host: { ast: input.ast, effectiveTypes: missing } }, input.open) === undefined, true,
    "an absent original open component does not license a syntax or shape reconstruction");
  assert.equal(resolveCsharpPublishedSourceSum({ host: { ast: input.ast, effectiveTypes: forged } }, input.open) === undefined, true,
    "equal-looking cloned records are not the Host's authenticated family/application");
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/foreign.ts": "export function foreign<T>(value: string | T): string | T { return value; }",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const foreign = createTargetSourceProgram(checked);
  assert.equal(resolveCsharpPublishedSourceSum({ host: { ast: foreign.ast, effectiveTypes: foreign.effectiveTypes } }, input.open) === undefined, true,
    "a foreign program cannot adopt another program's otherwise valid Source descriptor");
});

test("exact Source substitution closes storage but retains two coincident ABI roles", () => {
  const input = fixture();
  const selected = substituteSourceTypeDescriptor(input.ast, input.open, new Map([[input.parameter, input.text]]));
  assert.equal(selected?.kind === "string", true, "logical coincident arms collapse at the Source owner");
  const storage = input.represent(selected);
  const roles = input.open.types.map(role => input.represent(substituteSourceTypeDescriptor(input.ast, role,
    new Map([[input.parameter, input.text]]))));
  const proof = closure(input, new Map([[input.parameter, input.text]]));
  const operations = resolveCsharpSourceUnionOperations(storage, roles, proof, [0, 1]);
  assert.equal(roles.length === 2 && roles.every(role => targetTypeRefEquals(role, storage)), true,
    "original role cardinality survives logical collapse");
  assert.equal(operations?.id === "Tsonic.CSharp.Runtime.SourceUnionOperations2`5", true,
    "both static role operations share the same native scalar storage");
});

test("partial Source substitution preserves original role association through a composed sum", () => {
  const input = fixture();
  const selected = substituteSourceTypeDescriptor(input.ast, input.open, new Map([[input.parameter, input.partial]]));
  assert.equal(selected?.kind === "union" && selected.types.length === 3, true,
    "the already observed partial closure flattens at the Source owner");
  const physical = input.represent(selected);
  assert.equal(physical?.csharpProjection.sum.roles.length === 2 && physical.csharpProjection.source.types.length === 3, true,
    "canonical storage has three Source arms while the original family retains two irreducible ABI roles");
  const originalRoles = input.open.types.map(role => substituteSourceTypeDescriptor(input.ast, role,
    new Map([[input.parameter, input.partial]])));
  assert.equal(originalRoles.length === 2 && originalRoles.some(role => role.kind === "union" && role.types.length === 2), true,
    "the method's original second role is not replaced by flattened storage arms");
  const sum = resolveCsharpPublishedSourceSum({ host: { ast: input.ast, effectiveTypes: input.source.effectiveTypes } }, selected);
  const projected = csharpProjectedType({ kind: "source-union", part: "operations", source: selected,
    sum, arguments: [physical, ...originalRoles.map(input.represent)] });
  assert.equal(projected.csharpProjection.sum.roles.length === 2, true, "operations retain the method ABI's two roles");
  assert.equal(sourceTypeDescriptorsEqual(projected.csharpProjection.source, selected), true,
    "partial operations and storage refer to the same sealed Source closure");
});

test("a bound native argument without its retained Source descriptor cannot choose a storage closure", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  const native = csharpSourcePrimitiveTargetType("float64");
  const scope = { host: { ast: input.ast, target: { id: "csharp" }, typeParameterConstraints: {}, effectiveTypes: input.source.effectiveTypes } };
  const state = { depth: 0, sourceBindings: new Map([[input.parameter,
    { sourceType: undefined, targetType: native, descriptor: undefined }]]) };
  assert.equal(resolveCsharpProjectionArguments(scope, input.forward, { bindings: [], definitions: [] }, [], state,
    [storage], []) === undefined, true, "raw Native arguments cannot reconstruct missing Source publication");
  const foreign = input.ast.typeParameters(input.named("other"))[0];
  assert.equal(resolveCsharpProjectionArguments(scope, input.forward,
    { bindings: [{ declaration: foreign, type: input.numeric }], definitions: [] }, [native], { depth: 0 },
    [storage], [input.parameter]) === undefined, true, "same-shaped foreign declaration is not the selected binder");
});

test("optional payload domains retain original absence indexes and reject lost or foreign roles", () => {
  const input = fixture();
  const declaration = input.named("optional");
  const parameter = input.ast.typeParameters(declaration)[0];
  const outcome = input.source.effectiveTypes.get(input.ast.typeNode(declaration));
  assert.equal(outcome !== undefined && outcome.kind !== "refused", true,
    "the optional generic return has its original published Source family");
  const template = sourceTypeDescriptorSum(input.ast, outcome.type);
  const bindings = new Map([[parameter, input.numeric]]);
  const descriptor = substituteSourceTypeDescriptor(input.ast, outcome.type, bindings);
  const record = input.source.effectiveTypes.sum({ family: template.identity.family,
    application: template.identity.application.map(type => substituteSourceTypeDescriptor(input.ast, type, bindings)) });
  assert.equal(record !== undefined && record.arms.some(arm => arm.type.kind === "intrinsic" &&
    arm.type.intrinsic === "absence"), true, "the complete Source record still includes its one absence arm");
  const proof = { record, arms: record.arms.map(arm => input.represent(arm.type)) };
  const storage = input.represent(descriptor);
  const payload = getCsharpNullableElementTargetType(storage);
  const number = input.represent(input.numeric);
  const text = input.represent(input.text);
  const roleFor = predicate => template.roles.find(role => role.arms.some(index => predicate(template.arms[index].type))).role;
  const numberRole = roleFor(type => type.kind === "declared" && type.declaration === parameter);
  const textRole = roleFor(type => type.kind === "string");
  const absentRole = roleFor(type => type.kind === "intrinsic" && type.intrinsic === "absence");
  const payloadRoles = [textRole, numberRole];
  const wholeRoles = record.roles.map(role => role.role);
  assert.equal(payload !== undefined && resolveCsharpSourceUnionOperations(payload, [text, number], proof, payloadRoles) !== undefined,
    true, "the retained payload-role domain projects only its exact present storage");
  assert.equal(resolveCsharpSourceUnionRole(storage, number, proof, numberRole, wholeRoles) !== undefined, true,
    "the whole physical domain preserves the original absence boundary");
  assert.equal(resolveCsharpSourceUnionRole(payload, number, proof, numberRole, wholeRoles) === undefined, true,
    "payload storage cannot silently discard absence from a whole-domain proof");
  for (const roles of [[], [numberRole, numberRole], [textRole], [numberRole, 999], [absentRole]])
    assert.equal(resolveCsharpSourceUnionRole(payload, number, proof, numberRole, roles) === undefined, true,
      "missing duplicate foreign or absent-only domains cannot acquire the numeric role");
  assert.equal(resolveCsharpSourceUnionRole(payload, csharpSourcePrimitiveTargetType("uint32"), proof,
    numberRole, payloadRoles) === undefined, true, "a foreign Native width cannot replace the published numeric role");
  assert.equal(resolveCsharpSourceUnionRole(payload, number, { record, arms: proof.arms.slice(1) },
    numberRole, payloadRoles) === undefined, true, "missing physical arms do not shift original Source indexes");
  assert.equal(resolveCsharpSourceUnionRole(csharpRuntimeUnionTargetType([text, number]), number, proof,
    numberRole, payloadRoles) === undefined, true, "a fixed Native-ordered ABI cannot impersonate the Source payload");
});

test("static role selection refuses foreign widths missing arms and native ordered reinterpretation", () => {
  const text = csharpStringTargetType();
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const number = csharpSourcePrimitiveTargetType("float64");
  const input = fixture();
  const descriptor = substituteSourceTypeDescriptor(input.ast, input.open, new Map([[input.parameter, input.numeric]]));
  const storage = input.represent(descriptor);
  const ordered = csharpRuntimeUnionTargetType([text, number]);
  const proof = closure(input, new Map([[input.parameter, input.numeric]]));
  for (const role of [narrow, csharpNullableTargetType(number), ordered])
    assert.equal(resolveCsharpSourceUnionRole(storage, role, proof, 1, proof.record.roles.map(selected => selected.role)) === undefined, true,
      "an absent width optional role or ordered runtime role cannot become a Source union arm");
  assert.equal(resolveCsharpSourceUnionRole(ordered, number, proof, 1, proof.record.roles.map(selected => selected.role)) === undefined, true,
    "an explicit native ordered union remains atomic rather than acquiring Source role semantics");
  assert.equal(resolveCsharpSourceUnionOperations(storage, [text], proof, [0]) === undefined, true,
    "missing original role is not filled from storage");
  assert.equal(resolveCsharpSourceUnionOperations(storage, [text, number], proof, [0, 1]) !== undefined, true,
    "the complete exact role inventory has a static unboxed witness");
});

test("projection creation rejects missing and oversized original role vectors", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  for (const roles of [[], [input.text], Array.from({ length: 9 }, () => input.text)])
    assert.throws(() => csharpProjectedType({ ...storage.csharpProjection, sum: { ...storage.csharpProjection.sum, roles } }), TypeError,
      "storage cannot invent a role from the normalized Source sum");
  assert.notEqual(targetTypeRefKey(storage), targetTypeRefKey(csharpRuntimeUnionTargetType(getCsharpRuntimeUnionArms(storage))),
    "deferred Source storage never erases the native ordered ABI distinction");
});

test("published array roles retain rank width readonly and exact carrier identity", () => {
  const input = fixture();
  const declaration = input.named("arrayRole");
  const union = input.nodes.find(node => input.ast.is.IsUnionTypeNode(node) &&
    input.ast.parent(node) === input.ast.parameters(declaration)[0]);
  const outcome = input.source.effectiveTypes.get(union);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "union", true,
    "the array role comes from its real authored Source component");
  const storage = input.represent(outcome.type);
  const roles = getCsharpRuntimeUnionArms(storage);
  const array = roles.find(role => role.kind === "array");
  const record = sourceTypeDescriptorSum(input.ast, outcome.type);
  const proof = { record, arms: record.arms.map(arm => input.represent(arm.type)) };
  const roleIndex = record.roles.find(role => role.arms.length === 1 && record.arms[role.arms[0]].type.kind === "array").role;
  assert.equal(array !== undefined && resolveCsharpSourceUnionRole(storage, array, proof, roleIndex, proof.record.roles.map(selected => selected.role)) !== undefined, true,
    "the exact native array role has one static storage projection");
  for (const foreign of [{ ...array, rank: 2 }, { ...array, element: csharpSourcePrimitiveTargetType("int32") },
    csharpJsArrayTargetType(array.element), csharpReadOnlyListTargetType(array.element)])
    assert.equal(resolveCsharpSourceUnionRole(storage, foreign, proof, roleIndex, proof.record.roles.map(selected => selected.role)) === undefined, true,
      "a different rank width JS carrier or readonly role does not acquire the original array identity");
  assert.equal(resolveCsharpSourceUnionOperations(storage, [roles[0]], proof, [0]) === undefined, true,
    "missing role cardinality remains unavailable rather than inferring a storage arm");
});

test("callback ABI agreement keeps exact parameters and the same canonical array result", () => {
  const input = fixture();
  const descriptor = substituteSourceTypeDescriptor(input.ast, input.open, new Map([[input.parameter, input.numeric]]));
  const result = { kind: "array", element: input.represent(descriptor) };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const source = csharpDelegateTargetType("System.Func", [integer], result);
  assert.equal(csharpClosedInvocationMatches(source, csharpDelegateTargetType("System.Func", [integer], result)), true,
    "a shared Source arm set already has one native result before callable matching");
  assert.equal(csharpClosedInvocationMatches(source,
    csharpDelegateTargetType("System.Func", [csharpSourcePrimitiveTargetType("float64")], result)), false,
  "Source union closure does not widen a callable parameter");
  assert.equal(csharpClosedInvocationMatches(source,
    csharpDelegateTargetType("System.Func", [integer], { kind: "array", element: integer })), false,
  "Source union closure does not replace a callable result with a different native width");
});
test("Source projection identities are local to each actual program view", () => {
  const independent = () => {
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/view", files: {
      "/view/index.ts": "declare function select<Value>(value: string | Value): void;",
    }, compilerOptions: { strict: true } }).checkSource();
    assert.equal(checked.diagnostics.length, 0);
    const source = createTargetSourceProgram(checked);
    const ast = source.ast;
    let declaration;
    ast.forEachChild(checked.getSourceFile("/view/index.ts"), node => {
      if (node !== undefined && ast.is.IsFunctionDeclaration(node)) declaration = node;
    });
    const selected = source.effectiveTypes.get(ast.parameters(declaration)[0]);
    assert.equal(selected !== undefined && selected.kind !== "refused" && selected.type.kind === "union", true);
    const represented = representCsharpSourceType({ target: { id: "csharp" }, typeParameterConstraints: {},
      sourceSum: descriptor => resolveCsharpPublishedSourceSum({ host: { ast, effectiveTypes: source.effectiveTypes } }, descriptor),
      declaredType: original => csharpSourceTypeParameter(original, ast) ?? unexpected(),
      retainShape: unexpected, indexType: unexpected, callableType: unexpected, constructorType: unexpected,
      shapeKind: unexpected, memberDeclaration: unexpected, classStaticSide: unexpected, memberTypeParameters: unexpected,
    }, selected.type);
    assert.equal(represented !== undefined, true);
    return represented;
  };
  const first = independent();
  const unrelated = fixture().represent(fixture().open);
  assert.equal(unrelated !== undefined, true, "another program may allocate its own projections between these views");
  const second = independent();
  assert.equal(first.name, second.name, "emitted names are already independent of other program activity");
  assert.equal(first.identity, second.identity, "semantic projection identities must not consume a module-global counter");
});

test("malformed Source union descriptors cannot retain nested sums or absence payload members", () => {
  const input = fixture();
  const native = [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int64")];
  for (const component of [{ kind: "intrinsic", intrinsic: "absence" },
    { kind: "intrinsic", intrinsic: "void" },
    { kind: "optional", value: input.text }, input.open]) {
    const malformed = { ...input.open, types: [input.open.types[0], component] };
    assert.throws(() => combineCsharpTargetUnionMembers(native, malformed, undefined),
      { message: "A published Source union descriptor must be flattened and lift every absence payload." });
  }
});

