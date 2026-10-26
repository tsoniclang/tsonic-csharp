import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpExplicitTypeParameters } from "../../../../dist/backend/planner/types/type-parameters.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/factories.js";

test("explicit interface binders retain only proven native primary constraints", () => {
  const reference = csharpTargetNamedType("Proof.Reference", undefined, { kind: "named", name: "Reference" },
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [], constraintRequiresReferenceType: true });
  const contract = csharpTargetNamedType("Proof.Contract", undefined, { kind: "named", name: "Contract" },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [] });
  const dependent = { kind: "type-parameter", identity: "Proof.Dependent", name: "Dependent",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: reference }] } };
  for (const [label, constraints, expected] of [
    ["reference", [{ kind: "keyword", keyword: "class" }], "class"],
    ["value", [{ kind: "keyword", keyword: "struct" }], "struct"],
    ["unmanaged", [{ kind: "keyword", keyword: "unmanaged" }], "struct"],
    ["nominal reference", [{ kind: "type", type: reference }], "class"],
    ["dependent reference", [{ kind: "type", type: dependent }], "class"],
    ["interface only", [{ kind: "type", type: contract }], undefined],
    ["notnull only", [{ kind: "keyword", keyword: "notnull" }], undefined],
    ["constructor only", [{ kind: "constructor" }], undefined],
    ["unconstrained", [], undefined],
    ["unknown dependent", [{ kind: "type", type: { kind: "type-parameter", identity: "Unknown", name: "Unknown" } }], undefined],
    ["inherited full contract", [{ kind: "type", type: reference }, { kind: "type", type: contract },
      { kind: "constructor" }], "class"],
  ]) {
    const selected = planCsharpExplicitTypeParameters([{ name: "AuthoredNative" }], [constraints]);
    assert.equal(selected.length, 1, `${label}: no extra binder is introduced`);
    assert.equal(selected[0].name, "AuthoredNative", `${label}: the already selected native name is unchanged`);
    assert.equal(selected[0].constraints?.length ?? 0, expected === undefined ? 0 : 1,
      `${label}: inherited nominal, constructor and other forbidden clauses are not repeated`);
    assert.equal(selected[0].constraints?.[0]?.kind === "KeywordConstraint", expected !== undefined,
      `${label}: only a permitted native primary constraint is rendered`);
    assert.equal(selected[0].constraints?.[0]?.keyword, expected, `${label}: reference or value classification is exact`);
  }
  assert.throws(() => planCsharpExplicitTypeParameters([{ name: "AuthoredNative" }], []),
    /identical native binder constraint inventory/u, "missing sealed binder evidence has no guessed classification");
});
