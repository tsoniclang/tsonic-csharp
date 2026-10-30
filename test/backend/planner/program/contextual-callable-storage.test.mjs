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
  csharpSourcePrimitiveTargetType, getCsharpDelegateSignature, getCsharpTaskResultTargetType, targetTypeRefEquals,
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
    const storage = input.program.records.storageType.get(declaration);
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
    const completion = input.program.records.awaitCompletion.get(awaiting);
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
      const creation = input.program.records.callableCreation.get(initializer);
      assert.equal(creation?.kind, "selected", `${name}: approved C-1405 canonical native creation`);
      assert.equal(Object.hasOwn(input.program.records, "callableVisibility"), false,
        `${name}: the removed promotion selector stays absent`);
      const statement = input.source.ast.parent(input.source.ast.parent(declaration));
      const firstStatement = statements.length;
      planTopLevelVariableStatement(statement, input.file, context, diagnostics, () => assert.fail("Unexpected type declaration"), members, statements, state, false);
      assert.equal(diagnostics.length, 0, name);
      const carrier = input.program.records.storageType.get(declaration);
      const signature = getCsharpDelegateSignature(carrier);
      assert.equal(signature !== undefined, true, `${name}: closed storage signature`);
      const ownStatements = statements.slice(firstStatement);
      const field = members.find(member => (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") && member.name === name);
      assert.equal(field !== undefined && sameCsharpType(field.type, csharpTypeFromTargetTypeRef(carrier)), true,
        `${name}: approved C-1405 exact native module value`);
      assert.equal(ownStatements.filter(statement => statement.kind === "ExpressionStatement" &&
        statement.expression.kind === "AssignmentExpression" && statement.expression.left.kind === "IdentifierName" &&
        statement.expression.left.name === name).length, 1, `${name}: one original-order binding initialization`);
      const nativeSignature = getCsharpDelegateSignature(creation.carrier);
      assert.equal(nativeSignature !== undefined, true, `${name}: approved C-1426 native creation contract`);
      const initialization = ownStatements.find(statement => statement.kind === "ExpressionStatement" &&
        statement.expression.kind === "AssignmentExpression" && statement.expression.left.kind === "IdentifierName" &&
        statement.expression.left.name === name).expression.right;
      let adapted = initialization;
      while (adapted.kind === "CastExpression" || adapted.kind === "ParenthesizedExpression") adapted = adapted.expression;
      if (adapted.kind === "SwitchExpression") {
        assert.equal(adapted.arms.length, 1, "one original native callable evaluation feeds one boundary adapter");
        assert.equal(adapted.arms[0].pattern.kind, "VarPattern", "the adapter retains the original evaluated callable");
        adapted = adapted.arms[0].expression;
        while (adapted.kind === "CastExpression" || adapted.kind === "ParenthesizedExpression") adapted = adapted.expression;
      }
      const adapter = adapted.kind === "LambdaExpression" ? adapted : undefined;
      const adapterStatements = adapter?.body.kind === "Block" ? adapter.body.statements : [];
      const nativeReturn = csharpTypeFromTargetTypeRef(nativeSignature.returnType);
      assert.equal(nativeReturn !== undefined, true, `${name}: renderable method return`);
      const method = [...ownStatements, ...adapterStatements].find(statement => statement.kind === "LocalFunctionStatement" &&
        sameCsharpType(statement.returnType, nativeReturn));
      assert.equal(method !== undefined, true, `${name}: the initializer retains its native producer`);
      assert.equal(sameCsharpType(method.returnType, nativeReturn), true,
        `${name}: native method, adapted body and await use one callable carrier`);
      assert.equal(method.parameters.length, nativeSignature.parameters.length, `${name}: exact callable arity`);
      assert.equal(method.parameters.every((parameter, index) =>
        sameCsharpType(parameter.type, csharpTypeFromTargetTypeRef(nativeSignature.parameters[index]))), true,
        `${name}: selected native parameter carriers`);
      assert.equal(method.modifiers.includes("async"), true,
        `${name}: only the exact intrinsic Task producer is async`);
      if (name === "storedCompletion") {
        assert.equal(adapter !== undefined && adapter.async !== true && adapter.parameters.length === signature.parameters.length, true,
          "approved C-1426: the sole initializer adapts to the exact original union contract");
        assert.equal(adapter.parameters.every((parameter, index) =>
          sameCsharpType(parameter.type, csharpTypeFromTargetTypeRef(signature.parameters[index]))), true,
          "the union adapter preserves each original native input");
        assert.equal([...ownStatements, ...adapterStatements].filter(selected => selected.kind === "LocalFunctionStatement" &&
          selected.modifiers.includes("async")).length, 1, "one existing native async body, no additional Task wrapper");
        assert.equal(adapterStatements.at(-1)?.kind, "ReturnStatement", "adapted union result");
        assert.equal(adapterStatements.at(-1).expression.kind, "InvocationExpression", "native union injection");
        assert.equal(adapterStatements.at(-1).expression.callee.name, "From1", "exact selected Task alternative");
      } else {
        assert.equal(targetTypeRefEquals(nativeSignature.returnType, signature.returnType), true,
          "the inferred native Task body already matches its stored carrier");
      }
    }
    const initializations = statements.filter(statement => statement.kind === "ExpressionStatement" &&
      statement.expression.kind === "AssignmentExpression" && statement.expression.left.kind === "IdentifierName" &&
      ["storedCompletion", "inferredStoredCompletion"].includes(statement.expression.left.name));
    assert.deepEqual(initializations.map(statement => statement.expression.left.name), ["storedCompletion", "inferredStoredCompletion"],
      "approved C-1405: both original module values initialize once in source order");
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
      createDestructuringPlannerState(input.file, input.source.ast), false);
    assert.equal(diagnostics.length, 0);
    const name = input.program.records.sourceName.get(input.source.ast.name(declaration));
    assert.equal(name.kind, "resolved", "exact source identifier including native keyword escaping");
    const carrier = input.program.records.storageType.get(declaration);
    const signature = getCsharpDelegateSignature(carrier);
    assert.equal(signature !== undefined, true, "sealed native callable");
    assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(signature.returnType),
      csharpSourcePrimitiveTargetType("int64")), true, "the result never passes through a floating carrier");
    const field = members.find(member => (member.kind === "FieldDeclaration" || member.kind === "PropertyDeclaration") && member.name === name.name);
    assert.equal(field !== undefined && sameCsharpType(field.type, csharpTypeFromTargetTypeRef(carrier)), true,
      "approved C-1407: the original native module value holds its exact delegate");
    assert.equal(field.modifiers.includes("public"), true, "public module-value visibility stays exact");
    const initializer = input.source.ast.as.AsVariableDeclaration(declaration).Initializer;
    assert.equal(input.program.records.callableCreation.get(initializer)?.kind, "selected", "one completed native creation");
    assert.equal(Object.hasOwn(input.program.records, "callableVisibility"), false, "no obsolete promotion publication");
    const nativeReturn = csharpTypeFromTargetTypeRef(signature.returnType);
    const method = statements.find(statement => statement.kind === "LocalFunctionStatement" &&
      sameCsharpType(statement.returnType, nativeReturn));
    assert.equal(method !== undefined, true, "exact native async producer at the initializer");
    assert.equal(sameCsharpType(method.returnType, csharpTypeFromTargetTypeRef(signature.returnType)), true,
      "promoted native Task<long> matches its body and caller");
    assert.equal(method.modifiers.includes("async"), true);
    assert.equal(statements.filter(statement => statement.kind === "ExpressionStatement" &&
      statement.expression.kind === "AssignmentExpression" && statement.expression.left.kind === "IdentifierName" &&
      statement.expression.left.name === name.name).length, 1, "approved C-1407: one original binding initialization");
    assert.equal(statements.filter(statement => statement.kind === "LocalFunctionStatement" && statement.modifiers.includes("async")).length,
      1, "one native async body, no additional Task wrapper");
  });
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
