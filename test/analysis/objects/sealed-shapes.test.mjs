import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { instantiateCsharpObjectShape } from "../../../dist/policy/types/objects/instantiation.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { emptyCsharpTypeDefinitions } from "../../../dist/target-model/types/source-union-definitions.js";

test("sealed shape catalogs retain actual generic instances and read undemanded instances as absent", () => {
  const parameter = { kind: "type-parameter", name: "Value", identity: "test.Shape.Value" };
  const integer = { kind: "source-primitive", name: "int64" };
  const string = { kind: "source-primitive", name: "string" };
  const template = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Shape", typeArguments: [parameter] },
    members: [{ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
      memberKind: "property", type: parameter }] };
  const demanded = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Shape", typeArguments: [integer] };
  const file = {};
  let closed = false;
  let nativeQueries = 0;
  const policy = {
    ast: { is: { IsObjectLiteralExpression: () => false }, forEachChild: () => {}, parent: () => undefined,
      properties: () => [], authoredRange: () => ({ kind: "unauthored" }) },
    sourceFiles: [file], typeDefinitions: emptyCsharpTypeDefinitions,
    projectTypes: { directSupertypes: () => undefined },
    objectShapes: {
      resolveNode() { assert.equal(closed, false); return template; },
      resolveTarget(type) {
        assert.equal(closed, false, "native selection finishes before publication");
        nativeQueries += 1;
        return type.kind === "target-named" ? instantiateCsharpObjectShape(template, type) : undefined;
      },
      resolveCopyShape: shape => shape,
    },
  };
  const builder = analyzeCsharpObjectShapes(policy, {
    targetTypes: [demanded], compileTimeMetadata: { get: () => false },
  }, { selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined } });
  const shapes = builder.seal();
  closed = true;
  const queries = nativeQueries;
  const catalog = shapes.knownShapes();
  assert.equal(catalog.length, 2, "only the actual instance and its template are admitted");
  assert.equal(Object.isFrozen(catalog), true);
  const current = shapes.resolveTarget(demanded);
  assert.equal(current !== undefined, true);
  assert.equal(shapes.resolveTarget(demanded) === current, true, "actual instance identity is stable");
  assert.equal(shapes.resolveNode(file) === shapes.resolveNode(file), true, "node DTO does not get reconstructed");
  assert.equal(targetTypeRefEquals(current.members[0].type, integer), true, "exact native generic substitution before publication");
  for (const argument of [string, { kind: "array", element: integer }]) {
    const target = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Shape", typeArguments: [argument] };
    for (let index = 0; index < 32; index += 1) {
      assert.equal(shapes.resolveTarget(target) === undefined, true, "an undemanded instance is a negative lookup, not a late substitution");
      assert.equal(shapes.knownShapes() === catalog, true, "reads never populate the catalog");
    }
  }
  assert.equal(shapes.resolveTarget({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Other", typeArguments: [integer] }) === undefined, true);
  assert.equal(shapes.resolveTarget({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false], id: "Shape", typeArguments: [integer, string] }) === undefined, true);
  assert.equal(nativeQueries, queries, "no final reader selects or validates native types");
  assert.throws(() => builder.seal(), /sealed/u, "the closed producer cannot run a second analysis");
});
