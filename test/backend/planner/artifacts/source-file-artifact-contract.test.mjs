import assert from "node:assert/strict";
import test from "node:test";

import {
  createTargetArtifactContractGraph,
  reconstructTargetArtifacts,
} from "../../../../../tsonic/packages/target-api/dist/public/artifacts.js";

import {
  csharpSourceFileContractCandidate,
} from "../../../../dist/backend/planner/artifacts/source-file-contract.js";

test("source-file contracts separate implementation from public surface", () => {
  const first = resolvedCandidate(methodUnit({
    bodyValue: 1,
    parameter: { name: "actions", type: stringType },
  }));
  const implementationEdit = resolvedCandidate(methodUnit({
    bodyValue: 2,
    parameter: { name: "actions", type: stringType },
  }));
  const publicEdit = resolvedCandidate(methodUnit({
    bodyValue: 1,
    parameter: { name: "actions", type: stringType, isParams: true },
  }));

  assert.equal(
    facet(first, "source-file-public-surface"),
    facet(implementationEdit, "source-file-public-surface"),
  );
  assert.notEqual(
    facet(first, "source-file-implementation"),
    facet(implementationEdit, "source-file-implementation"),
  );
  assert.notEqual(
    facet(first, "source-file-public-surface"),
    facet(publicEdit, "source-file-public-surface"),
  );
});

test("source-file public contracts exclude private implementation details", () => {
  const first = resolvedCandidate(methodUnit({
    bodyValue: 1,
    parameter: { name: "value", type: stringType },
    privateParameterType: stringType,
  }));
  const privateEdit = resolvedCandidate(methodUnit({
    bodyValue: 1,
    parameter: { name: "value", type: stringType },
    privateParameterType: intType,
  }));

  assert.equal(
    facet(first, "source-file-public-surface"),
    facet(privateEdit, "source-file-public-surface"),
  );
  assert.notEqual(
    facet(first, "source-file-implementation"),
    facet(privateEdit, "source-file-implementation"),
  );
});

test("source-file contracts preserve exact public dependencies", () => {
  const dependencies = [{
    owner: "source-file:/project/dependency.ts",
    facet: "source-file-public-surface",
  }];
  const candidate = resolvedCandidate(methodUnit({
    bodyValue: 1,
    parameter: { name: "value", type: stringType },
  }), dependencies);

  assert.deepEqual(candidate.dependencies, dependencies);
});

test("C# public contracts reconstruct direct and transitive source dependents", () => {
  const graph = createTargetArtifactContractGraph();
  let restParameter = false;
  let bodyValue = 1;
  const reconstructed = [];
  const paramsSurface = facet(resolvedCandidate(methodUnit({
    bodyValue,
    parameter: { name: "actions", type: stringType, isParams: true },
  })), "source-file-public-surface");
  const reconstruct = (owner, current) => {
    reconstructed.push(owner);
    if (owner === "callee") {
      return sourceCandidate(methodUnit({
        bodyValue,
        parameter: {
          name: "actions",
          type: stringType,
          ...(restParameter ? { isParams: true } : {}),
        },
      }), []);
    }
    if (owner === "caller") {
      const expanded = graphFacet(
        current,
        "callee",
        "source-file-public-surface",
      ) === paramsSurface;
      return sourceCandidate(methodUnit({
        bodyValue: 1,
        parameter: expanded
          ? { name: "expandedCount", type: intType }
          : { name: "value", type: stringType },
      }), [{
        owner: "callee",
        facet: "source-file-public-surface",
      }]);
    }
    const expanded = graphFacet(
      current,
      "caller",
      "source-file-public-surface",
    ) === facet(resolvedCandidate(methodUnit({
      bodyValue: 1,
      parameter: { name: "expandedCount", type: intType },
    })), "source-file-public-surface");
    return sourceCandidate(methodUnit({
      bodyValue: expanded ? 2 : 1,
      parameter: { name: "value", type: stringType },
    }), [{
      owner: "caller",
      facet: "source-file-public-surface",
    }]);
  };

  assert.deepEqual(reconstructTargetArtifacts(
    graph,
    ["callee", "caller", "entry"],
    reconstruct,
    { maximumReconstructionCount: 16 },
  ), { kind: "completed", reconstructionCount: 3 });
  assert.deepEqual(reconstructed, ["callee", "caller", "entry"]);

  reconstructed.length = 0;
  bodyValue = 3;
  assert.deepEqual(reconstructTargetArtifacts(
    graph,
    ["callee"],
    reconstruct,
    { maximumReconstructionCount: 16 },
  ), { kind: "completed", reconstructionCount: 1 });
  assert.deepEqual(reconstructed, ["callee"]);

  reconstructed.length = 0;
  restParameter = true;
  assert.deepEqual(reconstructTargetArtifacts(
    graph,
    ["callee"],
    reconstruct,
    { maximumReconstructionCount: 16 },
  ), { kind: "completed", reconstructionCount: 3 });
  assert.deepEqual(reconstructed, ["callee", "caller", "entry"]);
});

function resolvedCandidate(unit, dependencies = []) {
  const result = csharpSourceFileContractCandidate(
    "source-file:/project/index.ts",
    unit,
    dependencies,
  );
  assert.equal(result.kind, "resolved");
  return result.candidate;
}

function facet(candidate, name) {
  return candidate.contract.facets.find((entry) => entry.facet === name).value;
}

function graphFacet(graph, owner, name) {
  return graph.contract(owner)?.facets.find((entry) => entry.facet === name)?.value;
}

function sourceCandidate(unit, dependencies) {
  const candidate = resolvedCandidate(unit, dependencies);
  return {
    kind: "resolved",
    contract: candidate.contract,
    dependencies: candidate.dependencies,
    artifact: candidate.artifact,
  };
}

function methodUnit(options) {
  return {
    kind: "CompilationUnit",
    usings: [],
    members: [{
      kind: "NamespaceDeclaration",
      name: "Example",
      members: [{
        kind: "ClassDeclaration",
        name: "Api",
        modifiers: ["public", "static"],
        members: [
          {
            kind: "MethodDeclaration",
            name: "invoke",
            modifiers: ["public", "static"],
            returnType: intType,
            parameters: [options.parameter],
            body: {
              kind: "Block",
              statements: [{
                kind: "ReturnStatement",
                expression: {
                  kind: "LiteralExpression",
                  value: options.bodyValue,
                },
              }],
            },
          },
          {
            kind: "MethodDeclaration",
            name: "implementationDetail",
            modifiers: ["private", "static"],
            returnType: intType,
            parameters: [{
              name: "value",
              type: options.privateParameterType ?? stringType,
            }],
            body: { kind: "Block", statements: [] },
          },
        ],
      }],
    }],
  };
}

const stringType = Object.freeze({
  kind: "PredefinedType",
  name: "string",
});
const intType = Object.freeze({
  kind: "PredefinedType",
  name: "int",
});
