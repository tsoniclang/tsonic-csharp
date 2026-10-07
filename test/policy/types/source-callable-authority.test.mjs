import assert from "node:assert/strict";
import test from "node:test";
import { isSourceOwnedCallableRuntimeCarrierSubject } from "../../../dist/policy/types/resolution/source-ownership.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const callable = csharpDelegateTargetType("System.Func", [integer], integer);

function fixture() {
  const file = {};
  const expression = {};
  const initializer = { kind: "identifier" };
  const declaration = { kind: "variable" };
  const implementation = { kind: "function", file, project: true };
  const signature = { declaration: implementation };
  const signatures = [signature];
  const input = {
    sourceFiles: [file],
    types: { resolveNode: () => callable },
    navigation: {
      referenceFor: () => ({ declaration, sourceFile: file }),
      isProjectDeclaration: selected => selected.project === true,
      declarationUseSummary: () => { throw new Error("source authority must not invent a closed origin proof"); },
    },
    ast: {
      is: {
        IsDeclarationFile: selected => selected.declarationFile === true,
        IsVariableDeclaration: selected => selected.kind === "variable",
        IsBindingElement: () => false,
        IsFunctionExpression: selected => selected.kind === "function",
        IsFunctionTypeNode: selected => selected.kind === "function-type",
        IsArrowFunction: () => false,
        IsFunctionDeclaration: () => false,
        IsMethodDeclaration: () => false,
        IsConstructorDeclaration: () => false,
        IsParameterDeclaration: () => false,
        IsCallExpression: () => false,
      },
      as: { AsVariableDeclaration: () => ({ Initializer: initializer }) },
      isDeclarationFile: selected => selected.declarationFile === true,
      getSourceFile: selected => selected.file,
    },
    semanticsFor: () => ({
      types: { expressionType: selected => selected === initializer ? {} : undefined, callSignatures: () => signatures },
      declarations: { signatureDeclaration: selected => selected.declaration },
    }),
  };
  return { input, file, expression, initializer, declaration, implementation, signatures };
}

test("inferred aliases retain exact checked source callable signature authority without claiming closed origins", () => {
  const selected = fixture();
  assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), true);
  selected.signatures.push({ declaration: { ...selected.implementation } });
  assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), true, "all selected overload declarations are source owned");
  selected.implementation.kind = "function-type";
  assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), true, "authored source function signatures are authority, not closed origin evidence");
});

test("foreign, unresolved, mixed and declaration-only signatures do not manufacture source callable authority", () => {
  for (const mutate of [
    selected => selected.signatures.splice(0),
    selected => { selected.signatures[0].declaration = undefined; },
    selected => { selected.implementation.project = false; },
    selected => { selected.implementation.file = {}; },
    selected => { selected.implementation.file = { declarationFile: true }; selected.input.sourceFiles.push(selected.implementation.file); },
    selected => { selected.implementation.kind = "noncallable"; },
    selected => { selected.signatures.push({ declaration: { kind: "function", file: {}, project: false } }); },
    selected => { selected.input.types.resolveNode = () => integer; },
  ]) {
    const selected = fixture();
    mutate(selected);
    assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), false, "exact source signature ownership required");
  }
});
