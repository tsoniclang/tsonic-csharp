import assert from "node:assert/strict";
import test from "node:test";
import { sourceValueDeclaration } from "../../../dist/policy/types/resolution/calls.js";
import { resolveStorage } from "../../../dist/policy/types/resolution/public-api.js";

function fixture(kind, project) {
  const expression = { kind };
  const declaration = { kind: "variable" };
  const declarationFile = {};
  const referenceFile = {};
  const scope = {
    host: {
      ast: {
        is: {
          IsVariableDeclaration: node => node?.kind === "variable",
          IsBindingElement: () => false,
          IsParameterDeclaration: () => false,
          IsPropertyDeclaration: () => false,
          IsPropertyAccessExpression: node => node?.kind === "property",
          IsElementAccessExpression: node => node?.kind === "element",
        },
        getSourceFile: node => node === declaration ? declarationFile : undefined,
      },
      navigation: {
        referenceFor: () => ({ declaration, sourceFile: referenceFile }),
        isProjectDeclaration: node => project && node === declaration,
      },
      semanticsFor: () => ({ operations: {
        propertyAccess: () => ({ selectedDeclaration: declaration }),
        elementAccess: () => ({ selectedDeclaration: declaration }),
      } }),
    },
    catchVariableStorageCarrier: () => undefined,
  };
  scope.sourceValueDeclaration = (node, reference) => sourceValueDeclaration(scope, node, reference);
  return { scope, expression, declaration, declarationFile };
}

test("project storage selection excludes checked external and virtual provider members", () => {
  for (const kind of ["property", "element"]) {
    for (const project of [true, false]) {
      const { scope, expression, declaration } = fixture(kind, project);
      const selected = sourceValueDeclaration(scope, expression, declaration);
      assert.equal(selected === declaration, project, `${kind}: exact project ownership`);
      assert.equal(selected === undefined, !project, `${kind}: provider owns external members`);
    }
  }
});

test("project storage queries use the selected declaration's file, not another reference owner", () => {
  for (const kind of ["property", "element"]) {
    const { scope, expression, declaration, declarationFile } = fixture(kind, true);
    const carrier = { kind: "source-primitive", name: "int32" };
    scope.resolveNode = (selected, file) => {
      assert.equal(selected === declaration, true, `${kind}: exact storage declaration`);
      assert.equal(file === declarationFile, true, `${kind}: exact checked declaration file`);
      return carrier;
    };
    assert.equal(resolveStorage(scope, expression, {}) === carrier, true, `${kind}: native carrier`);
  }
});
