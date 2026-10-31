import assert from "node:assert/strict";
import test from "node:test";
import { contextualAsyncResultSource, ordinaryAsyncResultSource } from "../../../../../tsonic/test/fixtures/contextual-async-results.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext, createCsharpMemberPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/index.js";
import { planLocalDeclaration } from "../../../../dist/backend/planner/bindings/locals.js";
import { planTopLevelVariableStatement } from "../../../../dist/backend/planner/program/top-level-variables.js";
import { csharpTypeFromTargetTypeRef } from "../../../../dist/backend/planner/types/render.js";
import { sameCsharpType } from "../../../helpers/csharp-type-equality.mjs";
import {
  csharpSourcePrimitiveTargetType, getCsharpTaskResultTargetType, targetTypeRefEquals,
} from "../../../../dist/target-model/types/index.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

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
    const body = input.program.records.returnContract.get(initializer);
    const emitted = input.program.records.callableDeclaration.get(initializer);
    assert.equal(body?.kind, "resolved", "closed async body contract");
    assert.equal(emitted !== undefined, true, "one completed native method declaration");
    assert.equal(getCsharpTaskResultTargetType(body.type) !== undefined, true, "body produces an exact Task");
    assert.equal(targetTypeRefEquals(emitted.returnCarrier, body.type), true, "method returns its intrinsic Task");
    assert.equal(input.program.records.moduleBindingInitialization.get(declaration), "declaration", "no module value initializer");
    const awaiting = input.awaiting.find(node => {
      const operand = input.source.ast.as.AsAwaitExpression(node).Expression;
      const callee = input.source.ast.as.AsCallExpression(operand)?.Expression;
      return callee !== undefined && input.source.ast.is.IsIdentifier(callee) &&
        input.source.ast.text(callee) === "storedCompletion";
    });
    assert.equal(awaiting !== undefined, true, "direct native method await");
    const completion = input.program.records.awaitCompletion.get(awaiting);
    assert.equal(completion !== undefined, true, "sealed await correspondence");
    assert.equal(completion.alternatives.length, 1, "one physical Task alternative");
    assert.equal(completion.optional, false, "the native method always returns its Task");
    assert.equal(completion.alternatives[0].task, true, "native Task completion");
    assert.equal(targetTypeRefEquals(completion.alternatives[0].carrier, body.type), true, "exact intrinsic Task carrier");
    assert.equal(completion.alternatives[0].sourcePath.length, 0, "no stored union projection");
  });

  test(`local contextual async storage renders its selected carrier on ${surface ?? "native"}`, () => {
    const input = fixture(surface, localSource);
    const context = createCsharpMemberPlanningContext(createCsharpPlanningContext(input.program));
    const diagnostics = [];
    const state = createDestructuringPlannerState(input.file, input.source.ast);
    for (const name of ["empty", "absent", "optional", "named", "captured", "inferred"]) {
      const declaration = input.variables.get(name);
      assert.equal(declaration !== undefined, true, name);
      const carrier = input.program.records.storageType.get(declaration);
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
      const initializer = input.source.ast.as.AsVariableDeclaration(declaration).Initializer;
      const emitted = input.program.records.callableDeclaration.get(initializer);
      assert.equal(emitted !== undefined, true, `${name}: canonical native method declaration`);
      assert.equal(Object.hasOwn(input.program.records, "callableVisibility"), false, "removed use-census selector stays absent");
      const statement = input.source.ast.parent(input.source.ast.parent(declaration));
      planTopLevelVariableStatement(statement, input.file, context, diagnostics, () => assert.fail("Unexpected type declaration"), members, statements, state);
      assert.equal(diagnostics.length, 0, name);
      const method = members.find(member => member.kind === "MethodDeclaration" && member.name === name);
      assert.equal(method !== undefined, true, `${name}: direct native method`);
      assert.equal(method.modifiers.includes("internal") && method.modifiers.includes("static") && method.modifiers.includes("async"), true,
        `${name}: original non-exported async declaration`);
      assert.equal(sameCsharpType(method.returnType, csharpTypeFromTargetTypeRef(emitted.returnCarrier)), true,
        `${name}: exact native body return`);
      assert.equal(getCsharpTaskResultTargetType(emitted.returnCarrier) !== undefined, true, `${name}: intrinsic Task`);
      assert.equal(method.parameters.length, emitted.contract.nativeParameters.length, `${name}: exact callable arity`);
      assert.equal(method.parameters.every((parameter, index) => sameCsharpType(parameter.type,
        csharpTypeFromTargetTypeRef(emitted.contract.nativeParameters[index].targetParameter.type))), true,
        `${name}: original native parameter carriers`);
      assert.equal(asyncLambdaCount(method.body), 0, "one native async method, no inner async delegate or Task wrapper");
      assert.equal(members.some(member => (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") && member.name === name), false,
        `${name}: no module delegate storage`);
      assert.equal(input.program.records.moduleBindingInitialization.get(declaration), "declaration", `${name}: no initialization entry`);
    }
    assert.equal(statements.length, 0, "module const methods emit no initializer or adapter allocation");
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
    planTopLevelVariableStatement(statement, input.file, context, diagnostics, () => assert.fail("Unexpected type declaration"), members, statements,
      createDestructuringPlannerState(input.file, input.source.ast));
    assert.equal(diagnostics.length, 0);
    const name = input.program.records.sourceName.get(input.source.ast.name(declaration));
    assert.equal(name.kind, "resolved", "exact source identifier including native keyword escaping");
    const initializer = input.source.ast.as.AsVariableDeclaration(declaration).Initializer;
    const emitted = input.program.records.callableDeclaration.get(initializer);
    assert.equal(emitted !== undefined, true, "one completed native method declaration");
    assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(emitted.returnCarrier),
      csharpSourcePrimitiveTargetType("int64")), true, "the result never passes through a floating carrier");
    assert.equal(Object.hasOwn(input.program.records, "callableVisibility"), false, "no obsolete use-census publication");
    const method = members.find(member => member.kind === "MethodDeclaration" && member.name === name.name);
    assert.equal(method !== undefined && sameCsharpType(method.returnType, csharpTypeFromTargetTypeRef(emitted.returnCarrier)), true,
      "exact Task<long> method return");
    assert.equal(method.modifiers.includes(exported ? "public" : "internal"), true, "authored module visibility");
    assert.equal(method.modifiers.includes("static") && method.modifiers.includes("async"), true, "native async static method");
    assert.equal(method.parameters.length, emitted.contract.nativeParameters.length, "the same native input vector");
    assert.equal(asyncLambdaCount(method.body), 0, "one native async method, no delegate or extra Task wrapper");
    assert.equal(members.some(member => (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") && member.name === name.name), false,
      "no native module delegate storage");
    assert.equal(input.program.records.moduleBindingInitialization.get(declaration), "declaration", "no module initialization entry");
    assert.equal(statements.length, 0, "no native callable initializer allocation");
  });
}

function asyncLambdaCount(value) {
  if (value === null || typeof value !== "object") return 0;
  return (value.kind === "LambdaExpression" && value.async === true ? 1 : 0) +
    Object.values(value).reduce((count, child) => count + asyncLambdaCount(child), 0);
}

function fixture(surface, sourceText) {
  // The analysis acquires runtime metadata and native inheritance through the session's real providers.
  const analyzed = analyzeCsharpSource({ surface, sourceText });
  assertCsharpCheckingSucceeded(analyzed);
  const { source, analysis } = analyzed;
  assert.equal(analysis.kind, "resolved", JSON.stringify(analysis.diagnostics.map(({ code, message }) => ({ code, message }))));
  assert.equal(analysis.diagnostics.length, 0);
  const program = analysis.value;
  const file = csharpProgramSourceFiles(program).find(selected => source.ast.getFileName(selected) === "/project/index.ts");
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
