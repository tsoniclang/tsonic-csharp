import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { contextualAsyncResultSource, ordinaryAsyncResultSource } from "../../../../../tsonic/test/fixtures/contextual-async-results.mjs";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../../dist/options/csharp-target-options.js";
import { createCsharpPlanningContext, createCsharpMemberPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/index.js";
import { planLocalDeclaration } from "../../../../dist/backend/planner/bindings/locals.js";
import { planTopLevelVariableStatement } from "../../../../dist/backend/planner/program/top-level-variables.js";
import { csharpTypeFromTargetTypeRef } from "../../../../dist/backend/planner/types/target-types.js";
import { sameCsharpType } from "../../../../dist/backend/planner/types/csharp-type-equality.js";
import { csharpSourcePrimitiveTargetType, getCsharpDelegateSignature, getCsharpTaskResultTargetType, targetTypeRefEquals } from "../../../../dist/target-model/types/index.js";

const localSource = `
  class Reply { constructor(public count: number) {} }
  type HandlerResult = void | Reply | Promise<void | Reply>;
  interface Handler { (present: boolean): HandlerResult; }
  async function pause(): Promise<void> {}
  export async function localResults(): Promise<boolean> {
    const empty: Handler = async (_present: boolean) => { await pause(); };
    let absent: Handler = async (_present: boolean) => { await pause(); return undefined; };
    const optional: Handler = async (present: boolean) => { await pause(); if (present) return new Reply(7); };
    const named: Handler = async function completed(_present: boolean) { await pause(); };
    let count = 0;
    const captured: Handler = async (present: boolean) => { await pause(); count += 1; if (present) return new Reply(count); };
    const inferred = async (present: boolean) => { await pause(); if (present) return new Reply(9); };
    const completed = await inferred(true);
    return await empty(false) === undefined && await absent(false) === null &&
      await optional(false) === undefined && await named(false) === undefined &&
      await captured(false) === undefined && completed !== undefined && completed.count === 9;
  }
`;

for (const surface of [undefined, "js"]) {
  test(`contextual async analysis retains distinct body, storage and await contracts on ${surface ?? "native"}`, () => {
    const input = fixture(surface, contextualAsyncResultSource);
    const declaration = input.variables.get("storedCompletion");
    assert.equal(declaration !== undefined, true, "authored Handler storage declaration");
    const initializer = input.source.ast.as.AsVariableDeclaration(declaration).Initializer;
    const body = input.program.declarations.returnContract(initializer);
    const storage = input.program.storage.type(declaration);
    const signature = getCsharpDelegateSignature(storage);
    assert.equal(body?.kind, "resolved", "closed async body contract");
    assert.equal(getCsharpTaskResultTargetType(body.type) !== undefined, true, "body produces an exact Task");
    assert.equal(signature !== undefined, true, "closed contextual storage signature");
    assert.equal(targetTypeRefEquals(body.type, signature.returnType), false, "contextual union is not the intrinsic Task");
    const awaiting = input.awaiting.find(node => {
      const operand = input.source.ast.as.AsAwaitExpression(node).Expression;
      const callee = input.source.ast.as.AsCallExpression(operand)?.Expression;
      return callee !== undefined && input.source.ast.is.IsIdentifier(callee) &&
        input.source.ast.text(callee) === "storedCompletion";
    });
    assert.equal(awaiting !== undefined, true, "direct stored callable await");
    const completion = input.program.operations.awaitCompletion(awaiting);
    assert.equal(completion !== undefined, true, "sealed await correspondence");
    assert.equal(completion.alternatives.length, 2, "Task and synchronous Reply alternatives");
    assert.equal(completion.optional, true, "one native absence state");
    assert.equal(completion.alternatives.some(alternative => alternative.task &&
      targetTypeRefEquals(alternative.carrier, body.type)), true, "await retains the body's exact Task alternative");
    assert.equal(completion.alternatives.every(alternative => alternative.sourcePath.length > 0), true,
      "the awaited storage is a union rather than a bare Task");
  });

  test(`local contextual async storage renders its selected carrier on ${surface ?? "native"}`, () => {
    const input = fixture(surface, localSource);
    const context = createCsharpMemberPlanningContext(createCsharpPlanningContext(input.program));
    const diagnostics = [];
    const state = createDestructuringPlannerState(input.file, input.source.ast);
    for (const name of ["empty", "absent", "optional", "named", "captured", "inferred"]) {
      const declaration = input.variables.get(name);
      assert.equal(declaration !== undefined, true, name);
      const carrier = input.program.storage.type(declaration);
      const nativeType = csharpTypeFromTargetTypeRef(carrier);
      assert.equal(nativeType !== undefined, true, `${name}: renderable physical storage`);
      const planned = planLocalDeclaration(declaration, input.file, context, diagnostics, state);
      assert.equal(diagnostics.length, 0, name);
      assert.equal(sameCsharpType(planned.type, nativeType), true, `${name}: physical local type`);
      assert.equal(planned.initializer?.completion.kind, "value", `${name}: callable producer`);
      assert.equal(targetTypeRefEquals(planned.initializer.completion.carrier, carrier), true,
        `${name}: adapted initializer and storage agree`);
    }
  });

  test(`direct top-level callable promotion uses the adapted producer signature on ${surface ?? "native"}`, () => {
    const input = fixture(surface, contextualAsyncResultSource);
    const context = createCsharpMemberPlanningContext(createCsharpPlanningContext(input.program));
    const diagnostics = [];
    const state = createDestructuringPlannerState(input.file, input.source.ast);
    const members = [];
    const statements = [];
    for (const name of ["storedCompletion", "inferredStoredCompletion"]) {
      const declaration = input.variables.get(name);
      assert.equal(declaration !== undefined, true, name);
      assert.equal(input.program.moduleInitialization.directCallableVisibility(declaration) !== undefined, true,
        `${name}: exact call-only native method selection`);
      const statement = input.source.ast.parent(input.source.ast.parent(declaration));
      planTopLevelVariableStatement(statement, input.file, context, diagnostics, [], members, statements, state, false);
      assert.equal(diagnostics.length, 0, name);
      const method = members.find(member => member.kind === "MethodDeclaration" && member.name === name);
      assert.equal(method !== undefined, true, `${name}: promoted native method`);
      const carrier = input.program.storage.type(declaration);
      const signature = getCsharpDelegateSignature(carrier);
      assert.equal(signature !== undefined, true, `${name}: closed storage signature`);
      const nativeReturn = csharpTypeFromTargetTypeRef(signature.returnType);
      assert.equal(nativeReturn !== undefined, true, `${name}: renderable method return`);
      assert.equal(sameCsharpType(method.returnType, nativeReturn), true,
        `${name}: native method, adapted body and await use one callable carrier`);
      assert.equal(method.parameters.length, signature.parameters.length, `${name}: exact callable arity`);
      assert.equal(method.parameters.every((parameter, index) =>
        sameCsharpType(parameter.type, csharpTypeFromTargetTypeRef(signature.parameters[index]))), true,
        `${name}: selected native parameter carriers`);
      assert.equal(method.modifiers.includes("async"), name === "inferredStoredCompletion",
        `${name}: only the exact intrinsic Task producer is async`);
      if (name === "storedCompletion") {
        assert.equal(method.body.statements.filter(selected => selected.kind === "LocalFunctionStatement" &&
          selected.modifiers.includes("async")).length, 1, "one existing native async body, no additional Task wrapper");
        assert.equal(method.body.statements.at(-1)?.kind, "ReturnStatement", "adapted union result");
        assert.equal(method.body.statements.at(-1).expression.kind, "InvocationExpression", "native union injection");
        assert.equal(method.body.statements.at(-1).expression.callee.name, "From1", "exact selected Task alternative");
      }
    }
    assert.equal(statements.length, 0, "call-only promotion adds no module delegate allocation");
  });

  for (const exported of [false, true]) test(`${exported ? "exported" : "direct"} async storage preserves its native int64 result on ${surface ?? "native"}`, () => {
    const input = fixture(surface, exported ? ordinaryAsyncResultSource
      : ordinaryAsyncResultSource.replace("export const explicit", "const explicit"));
    const declaration = input.variables.get("explicit");
    assert.equal(declaration !== undefined, true, "authored wide async producer");
    const context = createCsharpMemberPlanningContext(createCsharpPlanningContext(input.program));
    const diagnostics = [];
    const members = [];
    const statements = [];
    const statement = input.source.ast.parent(input.source.ast.parent(declaration));
    planTopLevelVariableStatement(statement, input.file, context, diagnostics, [], members, statements,
      createDestructuringPlannerState(input.file, input.source.ast), false);
    assert.equal(diagnostics.length, 0);
    const name = context.names.resolve(input.source.ast.name(declaration));
    assert.equal(name.kind, "resolved", "exact source identifier including native keyword escaping");
    const method = members.find(member => member.kind === "MethodDeclaration" && member.name === name.name);
    const signature = getCsharpDelegateSignature(input.program.storage.type(declaration));
    assert.equal(signature !== undefined, true, "sealed native callable");
    assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(signature.returnType),
      csharpSourcePrimitiveTargetType("int64")), true, "the result never passes through a floating carrier");
    assert.equal(method !== undefined, true, "exact native static producer");
    const visibility = input.program.moduleInitialization.directCallableVisibility(declaration);
    assert.equal(visibility !== undefined, true, "exact call-only native method classification");
    assert.equal(method.modifiers.includes(visibility), true, "sealed native visibility survives promotion");
    assert.equal(sameCsharpType(method.returnType, csharpTypeFromTargetTypeRef(signature.returnType)), true,
      "promoted native Task<long> matches its body and caller");
    assert.equal(method.modifiers.includes("async"), true);
    assert.equal(statements.length, 0, "no module delegate initialization");
  });
}

function fixture(surface, sourceText) {
  const checked = checkCsharpSource({ surface, sourceText });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  assert.equal(analysis.diagnostics.length, 0);
  const program = analysis.value;
  const file = program.sourceFiles.find(selected => source.ast.getFileName(selected) === "/project/index.ts");
  assert.equal(file !== undefined, true, "authored project file");
  const variables = new Map();
  const awaiting = [];
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node)) variables.set(source.ast.text(source.ast.name(node)), node);
    if (source.ast.is.IsAwaitExpression(node)) awaiting.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return { program, source, file, variables, awaiting };
}
