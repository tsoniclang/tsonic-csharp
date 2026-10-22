import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/index.js";
import { planCsharpRuntimeParameterDefault } from "../../../../dist/backend/planner/declarations/callables/defaults.js";
import { planParametersWithPrelude } from "../../../../dist/backend/planner/declarations/callables/parameters.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { selectCsharpDefaultValueContract } from "../../../../dist/policy/types/objects/binding-projection.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

const invariantMessage = "A runtime parameter default contract requires its authored parameter initializer.";
const artifactInvariant = "An admitted native type requires its sealed artifact dependency set.";
const sourceText = `import type { int32 } from "@tsonic/core/types.js";
export function withDefault(t: [int32, string] = [1, "a"]): int32 {
  return t[0];
}
export function withoutDefault(u: [int32, string]): int32 {
  return u[0];
}
`;

function compiledParameters() {
  const compiled = compileCsharpSource({ sourceText });
  const program = compiled.result.program;
  assert.equal(program !== undefined && compiled.result.diagnostics.length === 0, true, "the authored defaults compile");
  const ast = program.source.ast;
  const declarations = csharpProgramSourceFiles(program).flatMap(file => ast.statements(file));
  const parameter = name => ast.parameters(declarations.find(node => ast.text(ast.name(node)) === name))[0];
  return { program, ast, withDefault: parameter("withDefault"), withoutDefault: parameter("withoutDefault") };
}

function withRuntimeDefault(program, node, contract) {
  return { ...program, records: { ...program.records,
    runtimeDefault: { get: candidate => candidate === node ? contract : program.records.runtimeDefault.get(candidate) } } };
}

test("a runtime default whose sealed storage has no C# type syntax is reported, never dropped", () => {
  const { program, ast, withDefault } = compiledParameters();
  const contract = program.records.runtimeDefault.get(withDefault);
  assert.equal(contract !== undefined, true, "analysis seals the runtime default contract");
  const unrendered = csharpTargetNamedType("example.Unrendered", undefined, undefined, { allowsRefLikeTypeArguments: [],});
  const changed = withRuntimeDefault(program, withDefault, { ...contract, valueType: unrendered, parameterType: unrendered,
    native: selectCsharpDefaultValueContract(unrendered, unrendered, false) });
  const context = { ...createCsharpPlanningContext(program), program: changed };
  const diagnostics = [];
  // Analysis seals renderable native storage for every runtime default; a sealed type without its emission record is
  // a planner invariant (RULINGS: missing records are refused loudly), so the default is never silently dropped.
  assert.throws(() => planCsharpRuntimeParameterDefault(withDefault, "incoming", ast.getSourceFile(withDefault), context,
    diagnostics, createDestructuringPlannerState()), error => error.phase === "planning" && error.message === artifactInvariant, "the unrendered default fails as a planner invariant");
  assert.equal(diagnostics.length, 0, "no diagnostic replaces the invariant");
});

test("a parameter list never loses a runtime-default parameter without a diagnostic", () => {
  const { program, ast, withDefault } = compiledParameters();
  const contract = program.records.runtimeDefault.get(withDefault);
  const unrendered = csharpTargetNamedType("example.Unrendered", undefined, undefined, { allowsRefLikeTypeArguments: [],});
  const changed = withRuntimeDefault(program, withDefault, { ...contract, valueType: unrendered, parameterType: unrendered,
    native: selectCsharpDefaultValueContract(unrendered, unrendered, false) });
  const context = { ...createCsharpPlanningContext(program), program: changed };
  const diagnostics = [];
  // The parameter list cannot omit the parameter: the unrendered sealed default is a planner invariant.
  assert.throws(() => planParametersWithPrelude([withDefault], ast.getSourceFile(withDefault), context, diagnostics),
    error => error.phase === "planning" && error.message === artifactInvariant, "the unrendered default parameter fails as a planner invariant");
  assert.equal(diagnostics.length, 0, "no diagnostic replaces the invariant");
});

test("a runtime default contract on a parameter without an initializer is a planner invariant", () => {
  const { program, ast, withDefault, withoutDefault } = compiledParameters();
  const contract = program.records.runtimeDefault.get(withDefault);
  const changed = withRuntimeDefault(program, withoutDefault, contract);
  const context = { ...createCsharpPlanningContext(program), program: changed };
  assert.throws(() => planCsharpRuntimeParameterDefault(withoutDefault, "incoming", ast.getSourceFile(withoutDefault), context,
    [], createDestructuringPlannerState()),
  error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" && error.message === invariantMessage,
  "a contract without its initializer fails as a planner invariant");
});

test("an authored runtime default still lowers to one nullable native parameter", () => {
  const { program, ast, withDefault } = compiledParameters();
  const context = createCsharpPlanningContext(program);
  const diagnostics = [];
  const planned = planParametersWithPrelude([withDefault], ast.getSourceFile(withDefault), context, diagnostics);
  assert.equal(diagnostics.length === 0, true, "the authored default plans without diagnostics");
  assert.equal(planned.parameters.length === 1, true, "the parameter is emitted once");
  assert.equal(planned.parameters[0]?.type?.kind === "NullableType", true, "the incoming parameter is nullable");
  assert.equal(planned.prelude.length >= 1, true, "the default is applied in the prelude");
});
