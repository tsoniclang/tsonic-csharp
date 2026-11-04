import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeMemberFact } from "../../../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { formCsharpTypeParameterConstraints } from "./type-parameter-constraints.js";
import type { CsharpCallableDeclarationEvidence,
  CsharpTypeParameterConstraintSource } from "../../../../target-model/records/types/callable-source.js";
import type { CsharpProjectedType } from "../../../../target-model/types/projections.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableProjectionReceipt } from "../../../../target-model/records/types/type-projections.js";

type CallableParameters = NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>;

export interface CsharpCompletedCallableConstraint {
  readonly source: CsharpTypeParameterConstraintSource;
  readonly resolution: CsharpTypeParameterConstraintResolution;
}

export interface CsharpCompletedCallableDeclaration {
  readonly source: CsharpCallableDeclarationEvidence;
  readonly typeParameters: CallableParameters;
}

export interface CsharpCallableABI {
  readonly declared: CsharpCompletedCallableDeclaration;
  readonly harvest: CsharpCallableProjectionReceipt | undefined;
  readonly projections: readonly CsharpProjectedType[];
  readonly typeParameters: CallableParameters;
}

export function formCsharpCallableDeclaration(
  declaration: Node | undefined,
  sourceFile: SourceFile,
  ast: AstReader,
): CsharpCallableDeclarationEvidence | undefined {
  if (declaration === undefined) return Object.freeze({ declaration, sourceFile, typeParameters: Object.freeze([]) });
  const selected = ast.typeParameters(declaration).map(declaration => {
    if (declaration === undefined) return undefined;
    const parameter = csharpSourceTypeParameter(declaration, ast);
    if (parameter === undefined) return undefined;
    return Object.freeze({ declaration, identity: parameter.identity, name: parameter.name,
      constraint: formCsharpTypeParameterConstraints(declaration, parameter, sourceFile, ast) });
  });
  if (selected.some(parameter => parameter === undefined)) return undefined;
  const typeParameters = Object.freeze(selected.filter(parameter => parameter !== undefined));
  return new Set(typeParameters.map(parameter => parameter.identity)).size !== typeParameters.length
    ? undefined : Object.freeze({ declaration, sourceFile, typeParameters });
}

export function completeCsharpCallableDeclaration(
  source: CsharpCallableDeclarationEvidence,
  constraints: readonly CsharpCompletedCallableConstraint[],
): CsharpCompletedCallableDeclaration | undefined {
  if (constraints.length !== source.typeParameters.length || constraints.some((constraint, index) =>
    constraint.source !== source.typeParameters[index]?.constraint)) {
    failTargetAnalysisInvariant("tsonic-csharp", "Callable constraint completion requires every exact declared child dependency.", source.declaration);
  }
  const parameters: CallableParameters[number][] = [];
  for (const [index, parameter] of source.typeParameters.entries()) {
    const resolution = constraints[index]!.resolution;
    if (resolution.kind !== "resolved") return undefined;
    parameters.push(Object.freeze({ declaration: parameter.declaration, identity: parameter.identity, name: parameter.name,
      constraints: Object.freeze([...resolution.constraints]) }));
  }
  return Object.freeze({ source, typeParameters: Object.freeze(parameters) });
}

export function completeCsharpCallableABI(
  header: CsharpCompletedCallableDeclaration,
  harvest: CsharpCallableProjectionReceipt | undefined,
): CsharpCallableABI | undefined {
  const declaration = header.source.declaration;
  if (declaration === undefined) {
    if (harvest !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "A native callable projection requires its exact owning declaration header.");
    return Object.freeze({ declared: header, harvest, projections: Object.freeze([]), typeParameters: header.typeParameters });
  }
  if (harvest?.kind === "declaration") {
    if (harvest.declaration !== declaration) return failTargetAnalysisInvariant("tsonic-csharp",
      "A native declaration signature requires its exact no-body source occurrence.", declaration);
    return Object.freeze({ declared: header, harvest, projections: Object.freeze([]), typeParameters: header.typeParameters });
  }
  if (harvest === undefined || harvest.kind !== "source" || harvest.declaration !== declaration ||
    harvest.source.declaration !== declaration || harvest.projections !== harvest.index.genericProjection.get(declaration)) return failTargetAnalysisInvariant("tsonic-csharp",
      "A callable ABI requires its exact declaration's published body-harvest result.", declaration);
  const { projections } = harvest;
  const parameters = [...header.typeParameters,
    ...projections.map(parameter => Object.freeze({
      declaration, identity: parameter.identity, name: parameter.name,
      constraints: parameter.csharpProjectionConstraints,
    }))];
  if (new Set(parameters.map(parameter => parameter.identity)).size !== parameters.length) return undefined;
  const typeParameters = Object.freeze(parameters);
  if (header.typeParameters.some((parameter, index) => typeParameters[index] !== parameter) ||
    projections.some((projection, index) => {
      const parameter = typeParameters[header.typeParameters.length + index];
      return parameter?.declaration !== declaration || parameter.identity !== projection.identity ||
        parameter.constraints !== projection.csharpProjectionConstraints;
    })) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A callable ABI extends its exact authored binders and constraints with the published projections in order.", declaration);
  }
  return Object.freeze({ declared: header, harvest, projections, typeParameters });
}
