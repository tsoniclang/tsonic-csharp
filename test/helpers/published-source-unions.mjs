import assert from "node:assert/strict";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "./direct-csharp-session.mjs";
import { representCsharpSourceType } from "../../dist/policy/types/source-type-flow/representation.js";
import { resolveCsharpPublishedSourceSum } from "../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";
import { csharpSourceTypeParameter } from "../../dist/source/extension/type-parameters.js";
import { classifyCsharpSourceProfileDeclaration } from "../../dist/policy/identities/source-types.js";
import { selectCsharpSourceProfileCarrier } from "../../dist/policy/operations/source-profiles/type-carriers.js";

export function createPublishedSourceUnionFixture(sourceText, nativeDeclarations = {}) {
  const checked = checkCsharpSource({ sourceText });
  assert.equal(checked.source.diagnostics.length, 0, "the original fixture uses real checked Source primitive declarations");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const file = checked.source.getSourceFile("/project/index.ts");
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const declaration = name => {
    const matches = nodes.filter(node => (ast.is.IsFunctionDeclaration(node) || ast.is.IsClassDeclaration(node)) &&
      ast.text(ast.name(node)) === name);
    assert.equal(matches.length, 1, name + ": one actual original declaration");
    return matches[0];
  };
  const natives = new Map(Object.entries(nativeDeclarations).map(([name, select]) => [declaration(name), select]));
  const unexpected = () => assert.fail("this fixture must not discover a shape, callable or unrelated declaration");
  const descriptor = (name, index = 0) => {
    const parameter = ast.parameters(declaration(name))[index];
    const outcome = source.effectiveTypes.get(parameter);
    assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.provenance.occurrence === parameter, true,
      name + ": the same parameter occurrence has its published Source descriptor");
    return outcome.type;
  };
  const represent = (type, bindings = new Map()) => representCsharpSourceType({
    target: { id: "csharp" },
    typeParameterConstraints: {},
    sourceSum: selected => resolveCsharpPublishedSourceSum({ host: { ast, effectiveTypes: source.effectiveTypes } }, selected),
    declaredType(original, arguments_) {
      if (bindings.has(original)) return bindings.get(original);
      if (natives.has(original)) return natives.get(original)(arguments_);
      const profile = classifyCsharpSourceProfileDeclaration(original, ast);
      if (profile !== undefined) return selectCsharpSourceProfileCarrier({}, profile, arguments_);
      return csharpSourceTypeParameter(original, ast) ?? unexpected();
    },
    retainShape: unexpected, indexType: unexpected, callableType: unexpected, constructorType: unexpected,
    shapeKind: unexpected, memberDeclaration: unexpected, classStaticSide: unexpected, memberTypeParameters: unexpected,
  }, type);
  const carrier = (name, index = 0, bindings) => {
    const selected = represent(descriptor(name, index), bindings);
    assert.equal(selected !== undefined, true, name + ": published descriptor has the required exact native representation");
    return selected;
  };
  return { source, ast, declaration, descriptor, represent, carrier };
}
