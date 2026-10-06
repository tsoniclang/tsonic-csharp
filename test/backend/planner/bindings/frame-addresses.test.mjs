import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpTypedLocationIdentityDeclaration } from "../../../../dist/backend/planner/bindings/typed-location-identities.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { recursiveCallbackProtocolCases } from "../../../../../tsonic/test/fixtures/recursive-callback-protocols.mjs";

test("captured field addresses retain their physical frame identity without an extra local identity allocation", () => {
  const declaration = {};
  const input = { program: { captureStorage: { binding: selected => selected === declaration ? { fieldName: "seed" } : undefined },
    storage: { requiresTypedLocationIdentity: () => { assert.fail("a captured field already has its native frame identity"); } } } };
  assert.equal(planCsharpTypedLocationIdentityDeclaration(declaration, input, createDestructuringPlannerState()), undefined);
});

test("ordinary addressed locals still allocate their one required canonical identity", () => {
  const declaration = {};
  const state = createDestructuringPlannerState();
  let selections = 0;
  const input = { program: { captureStorage: { binding: () => undefined }, storage: {
    requiresTypedLocationIdentity: selected => { selections += 1; return selected === declaration; },
  } } };
  const statement = planCsharpTypedLocationIdentityDeclaration(declaration, input, state);
  assert.equal(selections, 1);
  assert.equal(statement.kind, "LocalDeclarationStatement");
  assert.equal(statement.initializer.kind, "ObjectCreationExpression");
  assert.equal(statement.initializer.type.name, "object");
});

for (const surface of ["native", "js"]) {
  test(`${surface} addressed lexical callbacks use checked frame members, never a reconstructed local identity`, () => {
    const sourceText = recursiveCallbackProtocolCases.find(current => current.name === "addressed-lexical-frame").source;
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const text = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, source]) => source).join("\n");
    assert.equal(text.includes(".CreateMember("), true, "pointer identity belongs to the actual retained frame");
    assert.equal(text.includes("locationIdentity"), false, "no extra local identity accompanies the native frame owner");
    assert.equal(text.includes(".CreateLocal("), false, "no second local-storage address path");
  });
}
