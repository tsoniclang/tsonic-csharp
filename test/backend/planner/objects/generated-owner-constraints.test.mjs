import assert from "node:assert/strict";
import test from "node:test";
import { renderObjectShapeTypeParameters } from "../../../../dist/backend/planner/objects/declarations/type-parameters.js";

const parameter = Object.freeze({ kind: "type-parameter", identity: "outer", name: "Outer" });
const declaration = {};
const subject = {};
const fact = {
  targetType: { kind: "target-named", id: "tsonic.shape:owner", typeArguments: [parameter] },
  members: [{ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
    memberKind: "property", type: parameter }],
};

function render(resolution, selected = fact) {
  const diagnostics = [];
  const finalized = { ...selected, targetType: { ...selected.targetType, typeArguments:
    selected.targetType.typeArguments.map(argument => argument.identity !== "outer" ? argument
      : { ...argument, csharpDeclaration: declaration, csharpConstraints: resolution }) } };
  const result = renderObjectShapeTypeParameters(new Map([["outer", "OuterNative"]]), finalized, diagnostics, subject);
  return { result, diagnostics };
}

test("generated owner binders retain exact native constraints and renamed identities", () => {
  const selected = render({ kind: "resolved", constraints: [{ kind: "keyword", keyword: "struct" }] });
  assert.equal(selected.diagnostics.length, 0, "sealed native constraint");
  assert.equal(selected.result.length, 1, "one native owner binder");
  assert.equal(selected.result[0].name, "OuterNative", "exact identity-based name");
  assert.deepEqual(selected.result[0].constraints, [{ kind: "KeywordConstraint", keyword: "struct" }]);
});

test("generated unconstrained owners do not manufacture constraints", () => {
  const selected = render({ kind: "resolved", constraints: [] });
  assert.equal(selected.diagnostics.length, 0);
  assert.equal(selected.result[0].constraints === undefined, true, "native unconstrained binder");
});

test("missing and unsupported native constraints reject before owner emission", () => {
  for (const resolution of [undefined, { kind: "unsupported", reason: "exact native constraint unavailable" }]) {
    const selected = render(resolution);
    assert.equal(selected.result === undefined, true, "unclosed owner constraints");
    assert.equal(selected.diagnostics.length, 1, "bounded native constraint diagnostic");
  }
});

test("an undeclared generic constraint dependency never becomes an unbound native identifier", () => {
  const foreign = { kind: "type-parameter", identity: "foreign", name: "Foreign" };
  const selected = render({ kind: "resolved", constraints: [{ kind: "type",
    type: { kind: "target-named", id: "Container", typeArguments: [foreign], csharpRender: { kind: "named", name: "Container" } },
  }] });
  assert.equal(selected.result === undefined, true, "exact declared dependency guard");
  assert.equal(selected.diagnostics.some(diagnostic => diagnostic.message.includes("undeclared native generic dependency")), true);
});

test("repeated owner constraint rendering is deterministic", () => {
  const resolution = { kind: "resolved", constraints: [{ kind: "constructor" }] };
  assert.deepEqual(render(resolution).result, render(resolution).result);
});

test("finalized transitive constraint dependencies render their exact physical binders", () => {
  const foreign = { kind: "type-parameter", identity: "foreign", name: "Foreign",
    csharpConstraints: { kind: "resolved", constraints: [] } };
  const selected = render({ kind: "resolved", constraints: [{ kind: "type",
    type: { kind: "target-named", id: "Container", typeArguments: [foreign], csharpRender: { kind: "named", name: "Container" } },
  }] }, { ...fact, targetType: { ...fact.targetType, typeArguments: [parameter, foreign] } });
  assert.equal(selected.diagnostics.length, 0, "closed native owner dependencies");
  assert.deepEqual(selected.result.map(parameter => parameter.name), ["OuterNative", "Foreign"]);
  assert.deepEqual(selected.result[0].constraints, [{ kind: "TypeConstraint", type:
    { kind: "IdentifierName", name: "Container", typeArguments: [{ kind: "IdentifierName", name: "Foreign" }] } }]);
});
