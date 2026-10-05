import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpNamedSelfCaptureContext } from "../../../../dist/backend/planner/bindings/capture-closures.js";
import { createDestructuringPlannerState, csharpCaptureFrameName } from "../../../../dist/backend/planner/bindings/binding-state.js";

function fixture() {
  const declaration = {};
  const scope = {};
  const first = {};
  const second = {};
  const ordinary = {};
  const type = { kind: "target-named", id: "tsonic.shape:activation", csharpRender: { kind: "named", name: "Activation" } };
  const frame = { scope, shape: { targetType: type, members: [] }, bindings: [
    { declaration: first, fieldName: "first" }, { declaration: second, fieldName: "second" },
  ] };
  const bindings = new Map([[first, { frame }], [second, { frame }]]);
  const state = createDestructuringPlannerState();
  const original = csharpCaptureFrameName(scope, state);
  const registered = [];
  const input = { scope: {}, program: { captureStorage: { binding: node => bindings.get(node) } },
    artifacts: { registerObjectShape: shape => { registered.push(shape); return { kind: "accepted" }; } } };
  const self = { declaration, captures: [first, second, ordinary], capturesReceiver: false, calls: [], values: [{}] };
  const select = (selectedInput = input, selectedSelf = self) => {
    const diagnostics = [];
    return { planned: planCsharpNamedSelfCaptureContext(selectedSelf, selectedInput, diagnostics, state), diagnostics };
  };
  return { declaration, scope, first, second, ordinary, frame, bindings, state, original, registered, input, self, select };
}

test("named self retains one reference to the existing activation for all of its slots", () => {
  const input = fixture();
  const { planned, diagnostics } = input.select();
  assert.equal(diagnostics.length, 0);
  assert.equal(planned !== undefined, true, "closed named-self activation");
  assert.equal(planned.prelude.length, 1, "one native reference assignment, not another frame");
  assert.equal(planned.prelude[0].kind, "LocalDeclarationStatement");
  assert.equal(planned.prelude[0].initializer.kind, "IdentifierName");
  assert.equal(planned.prelude[0].initializer.name, input.original);
  const retained = planned.context.scope.captureFrames.get(input.scope);
  assert.equal(retained?.kind, "IdentifierName");
  assert.equal(retained?.name === input.original, false, "creation reference is distinct from the rotating local");
  assert.equal(planned.context.scope.capturedBindings.get(input.first)?.receiver === retained, true);
  assert.equal(planned.context.scope.capturedBindings.get(input.second)?.receiver === retained, true);
  assert.equal(planned.context.scope.capturedBindings.get(input.first)?.name, "first");
  assert.equal(planned.context.scope.capturedBindings.has(input.ordinary), false, "ordinary native captures remain native");
  assert.equal(input.input.scope.captureFrames === undefined, true, "caller retains its rotating owner");
  assert.equal(input.registered.length, 1);
  assert.equal(input.registered[0] === input.frame.shape, true, "reuse exact owner identity");
});

test("an already retained native method activation requires no further alias", () => {
  const input = fixture();
  const retained = { kind: "IdentifierName", name: "this" };
  const first = { kind: "SimpleMemberAccessExpression", receiver: retained, name: "first" };
  const context = { ...input.input, scope: { captureFrames: new Map([[input.scope, retained]]),
    capturedBindings: new Map([[input.first, first]]) } };
  const { planned, diagnostics } = input.select(context);
  assert.equal(diagnostics.length, 0);
  assert.equal(planned?.prelude.length, 0);
  assert.equal(planned?.context.scope.captureFrames.get(input.scope) === retained, true);
  assert.equal(planned?.context.scope.capturedBindings.get(input.first) === first, true);
  assert.equal(input.registered.length, 0);
});

test("distinct captured activations remain distinct references without duplicating slots", () => {
  const input = fixture();
  const otherScope = {};
  const other = {};
  const otherFrame = { ...input.frame, scope: otherScope, bindings: [{ declaration: other, fieldName: "first" }] };
  input.bindings.set(other, { frame: otherFrame });
  const { planned, diagnostics } = input.select(input.input, { ...input.self, captures: [input.first, other, input.second] });
  assert.equal(diagnostics.length, 0);
  assert.equal(planned?.prelude.length, 2);
  const first = planned.context.scope.captureFrames.get(input.scope);
  const second = planned.context.scope.captureFrames.get(otherScope);
  assert.equal(first !== second, true, "equal type or slot spelling never identifies an activation");
  assert.equal(planned.context.scope.capturedBindings.get(other)?.receiver === second, true);
  assert.equal(planned.context.scope.capturedBindings.get(input.first)?.receiver === first, true);
  assert.equal(planned.prelude.every(statement => statement.initializer.kind === "IdentifierName"), true);
});

test("each creation retains its own current-frame reference without mutating another callable", () => {
  const input = fixture();
  const first = input.select().planned;
  const second = input.select().planned;
  assert.equal(first?.prelude.length, 1);
  assert.equal(second?.prelude.length, 1);
  assert.equal(first.prelude[0].name === second.prelude[0].name, false);
  assert.equal(first.prelude[0].initializer.name, input.original);
  assert.equal(second.prelude[0].initializer.name, input.original);
});

test("unframed native captures need no extra storage and existing overrides are preserved", () => {
  const input = fixture();
  const override = { kind: "IdentifierName", name: "ordinary" };
  const context = { ...input.input, scope: { capturedBindings: new Map([[input.ordinary, override]]) } };
  const { planned, diagnostics } = input.select(context, { ...input.self, captures: [input.ordinary] });
  assert.equal(diagnostics.length, 0);
  assert.equal(planned?.prelude.length, 0);
  assert.equal(planned?.context.scope.capturedBindings.get(input.ordinary) === override, true);
  assert.equal(input.registered.length, 0);
});

test("unrenderable or rejected activation facts fail closed rather than capturing the rotating local", () => {
  for (const reason of ["carrier", "registration"]) {
    const input = fixture();
    if (reason === "carrier") input.frame.shape.targetType = { kind: "opaque", id: "unproven" };
    if (reason === "registration") input.input.artifacts.registerObjectShape = () => ({ kind: "rejected", reason: "unproven activation" });
    const { planned, diagnostics } = input.select();
    assert.equal(planned === undefined, true, reason);
    assert.equal(diagnostics.length > 0, true, reason);
    assert.equal(input.input.scope.captureFrames === undefined, true, "failure preserves caller scope");
  }
});
