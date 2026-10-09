import type { Node } from "@tsonic/tsts";
import { HasSourceKind, KindExportAssignment, Node_Name, type SourceProjectReference } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { sourceFileClassName } from "../artifacts/source-paths.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { sanitizeIdentifier } from "../../../target-model/names/identifiers.js";

export function planCsharpSourceModuleMemberName(
  declaration: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string {
  return HasSourceKind(input.program.source.ast, declaration, KindExportAssignment)
    ? sanitizeIdentifier("default") : planIdentifierName(
      Node_Name(input.program.source.ast, declaration), "InvalidCrossFileReference",
      input, diagnostics, "Cross-file source reference",
    );
}

export function planCsharpSourceModuleValueReference(
  reference: SourceProjectReference,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const name = planCsharpSourceModuleMemberName(reference.declaration, input, diagnostics);
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: sourceFileClassName(input,
      input.program.source.ast.getFileName(reference.sourceFile)) },
    name,
  };
}

export function csharpSourceModuleValueReferencesEqual(left: CsharpExpression, right: CsharpExpression): boolean {
  return left.kind === "IdentifierName" && right.kind === "IdentifierName" && left.name === right.name ||
    left.kind === "SimpleMemberAccessExpression" && right.kind === "SimpleMemberAccessExpression" &&
    left.typeArguments === undefined && right.typeArguments === undefined && left.name === right.name &&
    csharpSourceModuleValueReferencesEqual(left.receiver, right.receiver);
}
