import assert from "node:assert/strict";
import test from "node:test";
import { sealCsharpProjectTypeClassifications } from "../../../dist/analysis/project-types/analyze.js";

test("project classification uses one checked declaration-membership inventory before publication", () => {
  const root = {};
  const outer = {};
  const method = {};
  const nested = {};
  const parameter = {};
  const erased = {};
  const leaf = {};
  const unrelated = {};
  const parents = new Map([[outer, root], [method, outer], [nested, method], [parameter, nested],
    [erased, outer], [leaf, erased], [unrelated, root]]);
  const outerDefinition = { declaration: outer, id: "Outer", typeParameterBindings: [] };
  const nestedDefinition = { declaration: nested, id: "Nested", typeParameterBindings: [] };
  let open = true;
  let parentReads = 0;
  const classifications = sealCsharpProjectTypeClassifications({
    issues: [], catalog: { definitions: [outerDefinition, nestedDefinition],
      definitionContainingDeclaration() { assert.fail("the target must not run its old per-node owner search"); } },
    heritageForDeclaration() { assert.equal(open, true); return undefined; },
    implicitConstructorsForDeclaration() { assert.equal(open, true); return undefined; },
  }, {
    parent(node) { assert.equal(open, true); parentReads += 1; return parents.get(node); },
    forEachChild() { assert.fail("the existing checked inventory must replace a second source walk"); },
  }, [leaf, parameter, unrelated, method, erased, nested, outer, root]);
  const completedReads = parentReads;
  open = false;
  for (let repeat = 0; repeat < 8; repeat += 1) {
    for (const node of [outer, method, erased, leaf]) {
      assert.equal(classifications.definitionContainingDeclaration(node) === outerDefinition, true, "outer exact identity");
    }
    for (const node of [nested, parameter]) {
      assert.equal(classifications.definitionContainingDeclaration(node) === nestedDefinition, true, "nested exact identity");
    }
    for (const node of [root, unrelated, {}, undefined]) {
      assert.equal(classifications.definitionContainingDeclaration(node) === undefined, true, "unowned identity absent");
    }
  }
  assert.equal(parentReads, completedReads, "sealed membership reads perform no source work");
  assert.equal(Object.isFrozen(classifications), true);
});
