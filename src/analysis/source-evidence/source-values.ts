import type { Node, SourceFile } from "@tsonic/tsts";

import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { HasSyntacticModifier, ModifierFlagsAsync, sourceExpressionCallArgument, sourceTransparentExpressionOperand } from "@tsonic/target-api/source";

import type { CsharpTypePolicy } from "./types/resolution/model.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpTaskTargetType, getCsharpTaskResultTargetType, targetTypeRefEquals } from "../../policy/types/index.js";
import { forEachCsharpDirectReturnExpression } from "../callables/calls/return-expressions.js";

export function isCsharpFlowReadEvidenceNode(
  ast: import("@tsonic/tsts").AstReader,
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}

export function inferCallableReturnType(
  declaration: Node,
  sourceFile: SourceFile,
  source: TargetSourceProgram,
  types: CsharpTypePolicy,
): TargetTypeRef | undefined {
  const semantics = source.semantics.forFile(sourceFile);
  const declarationType = semantics.types.expressionType(declaration);
  if (declarationType === undefined) {
    return undefined;
  }
  const signatures = semantics.types.signatureInfos(declarationType, "call")
    .filter((signature) =>
      semantics.declarations.signatureDeclaration(signature.signature) === declaration);
  if (signatures.length !== 1) return undefined;
  const authoredReturn = source.ast.typeNode(declaration);
  let argument = declaration;
  for (let parent = source.ast.parent(argument); parent !== undefined &&
    (source.ast.is.IsParenthesizedExpression(parent) || source.ast.is.IsAsExpression(parent) ||
      source.ast.is.IsSatisfiesExpression(parent)) && sourceTransparentExpressionOperand(source.ast, parent) === argument;
    parent = source.ast.parent(argument)) argument = parent;
  if (authoredReturn === undefined &&
    (source.ast.is.IsArrowFunction(declaration) || source.ast.is.IsFunctionExpression(declaration)) &&
    sourceExpressionCallArgument(argument, source) !== undefined) {
    const asynchronous = HasSyntacticModifier(source.ast, declaration, ModifierFlagsAsync);
    const returned: TargetTypeRef[] = [];
    let incomplete = false;
    forEachCsharpDirectReturnExpression(source.ast, declaration, expression => {
      if (types.nativeUnreachable(expression)) return;
      const selected = types.resolveNode(expression, sourceFile)?.sourceResult?.selectedType;
      if (selected === undefined) incomplete = true;
      else returned.push(asynchronous ? getCsharpTaskResultTargetType(selected) ?? selected : selected);
    });
    if (incomplete) return undefined;
    if (returned.length === 0) return types.resolveSelectedType(authoredReturn, signatures[0]!.returnType, sourceFile);
    const selected = returned[0]!;
    return returned.every(type => targetTypeRefEquals(type, selected))
      ? asynchronous ? csharpTaskTargetType(selected) : selected
      : undefined;
  }
  return types.resolveSelectedType(authoredReturn, signatures[0]!.returnType, sourceFile);
}

export function freezeSourceArgumentClassification(
  value: import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification,
): import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification {
  return value.kind === "resolved"
    ? Object.freeze({
        kind: "resolved",
        argument: Object.freeze({
          passingMode: value.argument.passingMode,
          storageExpression: value.argument.storageExpression,
        }),
      })
    : Object.freeze({
        kind: "rejected",
        reason: value.reason,
      });
}
