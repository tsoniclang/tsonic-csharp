// Source unions over published sums (c2529 acceptance, ported to the nextgen facts, C-2542; Q91). The Host publishes
// each family, application, arm and role (facts.sums, facts.instantiations); C# maps them with the one mapping (I6):
// closed sums to positional Union<...> (R6, Q73 coincident storage), and a sum with open arms to the SAME generic
// runtime union over its arms (`string | T` -> Union<string, T>), as at baseline. An instantiation is the Host
// descriptor substituted by the Host (facts.sums.substitute) and represented once; C# never forms, sorts or dedupes a
// Source sum itself.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { representSourceSum, csharpRepresentationContext } from "../../../dist/representation/index.js";
import { csharpTypeProjection } from "../../../dist/target-model/types/projections.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpRuntimeUnionArms, isCsharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";

const indexText = `import { reverse } from "./reverse.js";
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
  export function opposite(value: number | string): number | string { return reverse(value); }`;
const reverseText = "export function reverse(value: number | string): number | string { return value; }";

let retained;
function fixture() {
  if (retained !== undefined) return retained;
  const program = hostProgram(indexText, { files: { "reverse.ts": reverseText } });
  const { ast, nodes, facts } = program;
  const named = name => program.named(name, node => ast.is.IsFunctionDeclaration(node));
  const forward = named("forward");
  const parameter = ast.typeParameters(forward)[0];
  const union = nodes.find(node => ast.is.IsUnionTypeNode(node) && ast.parent(node) === ast.parameters(forward)[0]);
  const open = program.type(union);
  assert.equal(open.kind, "union", "the authored open union component has its Host publication");
  const calls = nodes.filter(node => ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "forward");
  const instantiations = calls.map(call => facts.instantiations.at(call));
  assert.equal(instantiations.length === 3 && instantiations.every(selected => selected?.kind !== "refused" &&
    selected?.method.length === 1 && selected.method[0].declaration === parameter), true,
  "concrete, partial and coincident bindings are the Host instantiations of the actual calls (G4)");
  const numeric = instantiations.find(selected => selected.method[0].type.kind === "primitive").method[0].type;
  const text = instantiations.find(selected => selected.method[0].type.kind === "string").method[0].type;
  const partial = instantiations.find(selected => selected.method[0].type.kind === "union").method[0].type;
  const services = representationServices(program);
  const represent = representations(services);
  const at = descriptor => represent.type(descriptor, union, "storage");
  retained = { program, ast, nodes, facts, named, forward, parameter, union, open, calls, instantiations,
    numeric, text, partial, services, represent: descriptor => represented(at(descriptor)) };
  return retained;
}

/** The Host record of the open family under `bindings`, and its arms represented positionally. */
function closure(input, bindings) {
  const open = input.program.sum(input.open);
  const application = open.identity.application.map(argument => input.facts.sums.substitute(argument, bindings));
  const record = input.facts.sums.sum({ family: open.identity.family, application });
  return { record, arms: record.arms.map(arm => input.represent(arm.type)) };
}

test("one Host order governs authored reversals in another file and every native carrier (C-2459, R6)", () => {
  const input = fixture();
  const closed = input.nodes.filter(node => input.ast.is.IsUnionTypeNode(node)).flatMap(node => {
    const outcome = input.facts.values.type(node);
    return outcome.kind !== "refused" && outcome.type.kind === "union" &&
      outcome.type.types.every(type => type.kind === "primitive" || type.kind === "string") ? [outcome.type] : [];
  });
  assert.equal(closed.length >= 3, true, "the programs include both authored orders across two source files");
  const first = input.represent(closed[0]);
  for (const descriptor of closed) assert.equal(targetTypeRefEquals(input.represent(descriptor), first), true,
    "C# consumes the Host order; no second key-based chooser exists");
  const record = input.program.sum(closed[0]);
  assert.deepEqual(getCsharpRuntimeUnionArms(first).map(targetTypeRefKey), record.arms.map(arm => targetTypeRefKey(input.represent(arm.type))),
    "the runtime union arms are the Host arms, positional");
  assert.equal(first.csharpRuntimeUnionSemantics, "source-sum");
});

test("Q91: an open sum is the generic runtime union over its Host arms, with no projection or constraint", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  assert.equal(csharpTypeProjection(storage), undefined, "no SourceUnionStorage projection, no ISourceUnionN constraint");
  assert.equal(isCsharpRuntimeUnionTargetType(storage) && storage.csharpRuntimeUnionSemantics === "source-sum", true);
  const record = input.program.sum(input.open);
  assert.deepEqual(getCsharpRuntimeUnionArms(storage).map(targetTypeRefKey), record.arms.map(arm => targetTypeRefKey(input.represent(arm.type))),
    "the arms are the Host arms in Host order, one of them the binder");
  assert.equal(getCsharpRuntimeUnionArms(storage).some(arm => arm.kind === "type-parameter"), true);
  const [snapshot] = snapshotCsharpTargetTypes([storage]);
  assert.equal(targetTypeRefEquals(snapshot, storage) && Object.isFrozen(snapshot), true, "the open union snapshots like any union");
});

test("Q91: an instantiation substitutes the Host descriptor, then represents it once", () => {
  const input = fixture();
  const bindings = new Map([[input.parameter, input.numeric]]);
  const closed = input.represent(input.facts.sums.substitute(input.open, bindings));
  assert.deepEqual(getCsharpRuntimeUnionArms(closed).map(targetTypeRefKey),
    [csharpStringTargetType(), csharpSourcePrimitiveTargetType("float64")].map(targetTypeRefKey), "string | number -> Union<string, double>");
  const storage = input.represent(input.open);
  const binder = getCsharpRuntimeUnionArms(storage).find(arm => arm.kind === "type-parameter");
  const substituted = substituteTargetTypeParameters(storage, new Map([[binder.identity, csharpSourcePrimitiveTargetType("float64")]]));
  assert.equal(targetTypeRefEquals(substituted, closed), true, "the substituted generic union is the represented instantiation");
  const coincident = input.represent(input.facts.sums.substitute(input.open, new Map([[input.parameter, input.text]])));
  assert.equal(targetTypeRefEquals(coincident, csharpStringTargetType()), true,
    "a coincident instantiation (T = string) collapses at the Source owner; C# represents the Host result");
});

test("generic arguments come from the Host instantiation, never from a bound .NET argument", () => {
  const input = fixture();
  const other = input.ast.typeParameters(input.named("other"))[0];
  for (const instantiation of input.instantiations) {
    assert.equal(instantiation.signature === input.forward, true, "the selected signature is the original declaration");
    assert.equal(instantiation.method[0].declaration === input.parameter && instantiation.method[0].declaration !== other, true,
      "a same-shaped foreign binder is not the selected binder");
  }
  const run = input.instantiations.find(selected => selected.method[0].type.kind === "primitive");
  assert.equal(targetTypeRefEquals(input.represent(run.method[0].type), csharpSourcePrimitiveTargetType("float64")), true,
    "the number argument is the Host descriptor represented, not a raw .NET argument");
});

test("malformed Host sums (void arm, nested sum, optional arm, two absence arms) are invariant failures (A11)", () => {
  const input = fixture();
  const context = csharpRepresentationContext(input.services, input.union, "storage");
  const family = input.union;
  const sum = types => Object.freeze({ identity: Object.freeze({ family, application: Object.freeze([]) }),
    arms: Object.freeze(types.map((type, role) => Object.freeze({ role, type }))),
    roles: Object.freeze(types.map((_, role) => Object.freeze({ role, arms: Object.freeze([role]) }))) });
  for (const component of [{ kind: "intrinsic", intrinsic: "void" }, { kind: "optional", value: input.text }, input.open]) {
    assert.throws(() => representSourceSum(sum([input.text, component]), context), /flattened and publish void as absence/u);
  }
  const absence = { kind: "intrinsic", intrinsic: "absence" };
  assert.throws(() => representSourceSum(sum([input.text, absence, absence]), context), /at most one absence arm/u);
});
