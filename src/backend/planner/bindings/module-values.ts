import type { Node } from "@tsonic/tsts";
import { HasSourceKind, KindExportAssignment, Node_Name, type SourceProjectReference } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { qualifiedCsharpType } from "../types/primitives.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function planCsharpSourceModuleMemberName(
  declaration: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string {
  if (HasSourceKind(input.program.source.ast, declaration, KindExportAssignment)) return "@default";
  const selected = input.program.names.resolve(Node_Name(input.program.source.ast, declaration));
  if (selected.kind !== "resolved") failCsharpPlannerInvariant("An admitted cross-file reference requires its exact native declaration name.", declaration);
  return selected.name;
}

export function planCsharpSourceModuleValueReference(
  reference: SourceProjectReference,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const name = planCsharpSourceModuleMemberName(reference.declaration, input, diagnostics);
  const identity = input.program.records.sourceFile.get(input.program.source.ast.getFileName(reference.sourceFile));
  if (identity === undefined) failCsharpPlannerInvariant("An admitted cross-file reference requires its selected native module identity.", reference.declaration);
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "AliasQualifiedName", alias: "global", name: qualifiedCsharpType(
      identity.namespace,
      identity.className,
    ) },
    name,
  };
}

