import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { SourceEffectiveTypes } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../policy/types/index.js";
import type { CsharpTypeQueries } from "../../../../policy/model/type-resolution.js";
import { targetTypeRefEquals } from "../../../../policy/types/index.js";
import { resolveCsharpTypeParameterConstraints } from "./type-parameter-constraints.js";

export interface CsharpNumericConstraintEvidenceHost {
  readonly ast: AstReader;
  readonly types: Pick<CsharpTypeQueries, "resolveNode">;
  readonly effectiveTypes: Pick<SourceEffectiveTypes, "get">;
}

export function csharpSourceHasNumericConstraint(
  expression: Node,
  carrier: TargetTypeRef,
  sourceFile: SourceFile,
  host: CsharpNumericConstraintEvidenceHost,
): boolean {
  if (carrier.kind !== "type-parameter") return false;
  const publication = host.effectiveTypes.get(expression);
  if (publication === undefined || publication.kind === "refused") return false;
  if (publication.provenance.occurrence !== expression) failTargetAnalysisInvariant("tsonic-csharp",
    "A Host numeric operand type must retain its exact value occurrence.", expression);
  const descriptor = publication.type;
  if (descriptor.kind !== "declared" || !host.ast.is.IsTypeParameterDeclaration(descriptor.declaration)) return false;
  const declaration = descriptor.declaration;
  const declared = host.types.resolveNode(expression, sourceFile);
  if (declared?.kind !== "resolved" || !targetTypeRefEquals(declared.sourceResult.selectedType, carrier)) return false;
  const declarationFile = host.ast.getSourceFile(declaration);
  if (declarationFile === undefined) return false;
  const constraints = resolveCsharpTypeParameterConstraints(declaration, carrier, declarationFile, host);
  return constraints.kind === "resolved" && constraints.constraints.some(constraint =>
    constraint.kind === "type" && constraint.type.kind === "target-named" &&
    constraint.type.id === "System.Numerics.INumber`1" &&
    constraint.type.typeArguments?.[0] !== undefined &&
    targetTypeRefEquals(constraint.type.typeArguments[0], carrier));
}
