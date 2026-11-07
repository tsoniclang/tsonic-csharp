import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { representCsharpSourceType } from "../../../../dist/policy/types/source-type-flow/representation.js";
import { resolveCsharpPublishedSourceSum } from "../../../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";
import { csharpSourceTypeParameter } from "../../../../dist/source/extension/type-parameters.js";
import { classifyCsharpSourceProfileDeclaration } from "../../../../dist/policy/identities/source-types.js";
import { csharpTaskTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

test("C2529 actual Source void parameter and return publications retain the established optional domain", () => {
  const sourceText = [
    'import type { uint64 } from "@tsonic/core/types.js";',
    "declare function wideParameter(value: uint64 | void): void;",
    "declare function genericParameter<Value extends object>(value: Value | void): void;",
    "declare function taskParameter(value: Promise<void> | void): void;",
    "export function wideReturn(value: uint64, take: boolean): uint64 | void { if (take) return value; }",
    "export function genericReturn<Value extends object>(value: Value, take: boolean): Value | void { if (take) return value; }",
    "export function taskReturn(value: Promise<void>, take: boolean): Promise<void> | void { if (take) return value; }",
  ].join("\n");
  const checked = checkCsharpSource({ sourceText });
  assert.equal(checked.source.diagnostics.length, 0, "every original void union is valid checked Source");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const unexpected = () => assert.fail("the three actual void unions require no shape or foreign declaration");
  const represent = descriptor => representCsharpSourceType({ target: checked.target, typeParameterConstraints: {},
    sourceSum: selected => resolveCsharpPublishedSourceSum({ host: { ast, effectiveTypes: source.effectiveTypes } }, selected),
    declaredType(declaration, arguments_) {
      const parameter = csharpSourceTypeParameter(declaration, ast);
      if (parameter !== undefined) return parameter;
      const profile = classifyCsharpSourceProfileDeclaration(declaration, ast);
      assert.equal(profile?.kind, "promise", "the exact retained provider declaration is the existing Promise identity");
      assert.equal(arguments_.length, 1, "the existing native Task ABI has one result argument");
      return csharpTaskTargetType(arguments_[0]);
    },
    retainShape: unexpected, indexType: unexpected, callableType: unexpected, constructorType: unexpected,
    shapeKind: unexpected, memberDeclaration: unexpected, classStaticSide: unexpected, memberTypeParameters: unexpected,
  }, descriptor);
  const functions = [];
  const visit = node => {
    if (ast.is.IsFunctionDeclaration(node)) functions.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(checked.source.getSourceFile("/project/index.ts"));
  const scalar = type => type === undefined ? undefined : type.kind === "union"
    ? { kind: type.kind, members: type.types.map(scalar) } : type.kind === "optional"
    ? { kind: type.kind, value: scalar(type.value) } : type.kind === "primitive"
    ? { kind: type.kind, primitive: type.primitive } : type.kind === "intrinsic"
    ? { kind: type.kind, intrinsic: type.intrinsic } : type.kind === "declared"
    ? { kind: type.kind, declarationKind: ast.kindName(type.declaration), arguments: type.typeArguments.map(scalar) }
    : { kind: type.kind };
  const observations = functions.map(declaration => {
    const name = ast.text(ast.name(declaration));
    const parameter = name.endsWith("Parameter");
    const occurrence = parameter ? ast.parameters(declaration)[0] : declaration;
    const outcome = parameter ? source.effectiveTypes.get(occurrence) : source.effectiveTypes.callableReturn(occurrence);
    const native = outcome === undefined || outcome.kind === "refused" ? undefined : represent(outcome.type);
    const row = { name, occurrence: ast.kindName(occurrence), publication: outcome?.kind,
      native: native === undefined ? undefined : { kind: native.kind, key: targetTypeRefKey(native) },
      descriptor: outcome?.kind === "refused" ? { code: outcome.code, reason: outcome.reason } : scalar(outcome?.type) };
    process.stdout.write(JSON.stringify(row) + "\n");
    return outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "optional";
  });
  assert.equal(observations.length, 6, "three exact domains each cover parameter and return");
  assert.equal(observations.every(Boolean), true, "all six established void arms publish one optional Source payload");
});

