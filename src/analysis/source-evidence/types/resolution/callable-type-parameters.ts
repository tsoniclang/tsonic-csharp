import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeMemberFact } from "../../../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { formCsharpTypeParameterConstraints,
  type CsharpTypeParameterConstraintSource } from "./type-parameter-constraints.js";
import type { CsharpProjectedType } from "../../../../target-model/types/projections.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

type CallableParameters = NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>;

export interface CsharpCallableDeclarationEvidence {
  readonly declaration: Node | undefined;
  readonly sourceFile: SourceFile;
  readonly typeParameters: readonly {
    readonly declaration: Node;
    readonly identity: string;
    readonly name: string;
    readonly constraint: CsharpTypeParameterConstraintSource;
  }[];
}

export interface CsharpCompletedCallableConstraint {
  readonly source: CsharpTypeParameterConstraintSource;
  readonly resolution: CsharpTypeParameterConstraintResolution;
}

export interface CsharpCompletedCallableDeclaration {
  readonly source: CsharpCallableDeclarationEvidence;
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

export function completeCsharpCallableTypeParameters(
  header: CsharpCompletedCallableDeclaration,
  projections: readonly CsharpProjectedType[],
): CallableParameters | undefined {
  const declaration = header.source.declaration;
  if (declaration === undefined) {
    if (projections.length !== 0) failTargetAnalysisInvariant("tsonic-csharp",
      "A native callable projection requires its exact owning declaration header.");
    return header.typeParameters;
  }
  const parameters = [...header.typeParameters,
    ...projections.map(parameter => Object.freeze({
      declaration, identity: parameter.identity, name: parameter.name,
      constraints: parameter.csharpProjectionConstraints,
    }))];
  return new Set(parameters.map(parameter => parameter.identity)).size !== parameters.length
    ? undefined : Object.freeze(parameters);
}
