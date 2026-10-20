import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { resolveCsharpTypeParameterConstraints, type CsharpTypeParameterConstraintPolicyHost } from "./type-parameter-constraints.js";
import type { CsharpPlanningRepresentationQueries } from "../types/resolution/model.js";

export function resolveCsharpCallableTypeParameters(
  declaration: Node | undefined, sourceFile: SourceFile,
  host: CsharpTypeParameterConstraintPolicyHost & Pick<CsharpPlanningRepresentationQueries, "genericProjections">,
): NonNullable<CsharpObjectShapeMemberFact["typeParameters"]> | undefined {
  if (declaration === undefined) return [];
  const selected = host.ast.typeParameters(declaration).map(declaration => {
    if (declaration === undefined) return undefined;
    const parameter = csharpSourceTypeParameter(declaration, host.ast);
    if (parameter === undefined) return undefined;
    const constraints = resolveCsharpTypeParameterConstraints(declaration, parameter, sourceFile, host);
    return constraints.kind === "resolved" ? Object.freeze({ declaration, identity: parameter.identity, name: parameter.name,
      constraints: Object.freeze([...constraints.constraints]),
    }) : undefined;
  });
  if (selected.some(parameter => parameter === undefined)) return undefined;
  const parameters = [...selected.filter(parameter => parameter !== undefined),
    ...host.genericProjections(declaration).map(parameter => Object.freeze({
      declaration, identity: parameter.identity, name: parameter.name,
      constraints: parameter.csharpProjectionConstraints,
    }))];
  return new Set(parameters.map(parameter => parameter.identity)).size !== parameters.length
    ? undefined : Object.freeze(parameters);
}
