import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpTypePolicy, TargetTypeRef } from "../types/index.js";
import { targetTypeRefEquals } from "../types/index.js";
import { resolveCsharpTypeParameterConstraints } from "./type-parameter-constraints.js";

export interface CsharpNumericConstraintEvidenceHost {
  readonly ast: AstReader;
  readonly types: CsharpTypePolicy;
  readonly navigation: SourceProgramNavigation;
  semantics(file: SourceFile): SourceFileSemantics;
}

export function csharpSourceHasNumericConstraint(
  expression: Node,
  carrier: TargetTypeRef,
  sourceFile: SourceFile,
  host: CsharpNumericConstraintEvidenceHost,
): boolean {
  if (carrier.kind !== "type-parameter") return false;
  const semantics = host.semantics(sourceFile);
  const binding = host.navigation.referenceFor(expression)?.declaration;
  const bindingFile = binding === undefined ? undefined : host.ast.getSourceFile(binding);
  const type = binding === undefined ? semantics.types.expressionType(expression)
    : bindingFile === undefined ? undefined : host.semantics(bindingFile).declarations.declaredValueType(binding);
  const symbol = type === undefined ? undefined : semantics.declarations.typeSymbol(type);
  const declaration = symbol === undefined ? undefined : semantics.declarations.primarySymbolDeclaration(symbol);
  if (declaration === undefined || !host.ast.is.IsTypeParameterDeclaration(declaration)) return false;
  const declared = type === undefined ? undefined : host.types.resolveSelectedValue(expression, type, sourceFile);
  if (declared === undefined || !targetTypeRefEquals(declared, carrier)) return false;
  const declarationFile = host.ast.getSourceFile(declaration);
  if (declarationFile === undefined) return false;
  const constraints = resolveCsharpTypeParameterConstraints(declaration, carrier, declarationFile, host);
  return constraints.kind === "resolved" && constraints.constraints.some(constraint =>
    constraint.kind === "type" && constraint.type.kind === "target-named" &&
    constraint.type.id === "System.Numerics.INumber`1" &&
    constraint.type.typeArguments?.[0] !== undefined &&
    targetTypeRefEquals(constraint.type.typeArguments[0], carrier));
}
