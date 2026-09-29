import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import {
  csharpAuthoredTypeParameterNames,
  csharpGeneratedTypeParameterNames,
  csharpSourceTypeParameter,
} from "../../../target-model/names/type-parameters.js";

export function createCsharpTypeParameterPlanningContext(
  owner: Node,
  input: CsharpPlanningContext,
): CsharpPlanningContext {
  const definition = input.types.projectTypes.definitionContainingDeclaration(owner);
  if (definition === undefined || definition.outerTypeParameters.length === 0 && definition.outerTypeProjections.length === 0) return input;
  const parameters = definition.outerTypeParameters.map(parameter => csharpSourceTypeParameter(parameter, input.program.source.ast));
  if (parameters.some(parameter => parameter === undefined)) throw new Error("A lifted C# generic binder requires its sealed source identity.");
  const typeParameterNames = csharpGeneratedTypeParameterNames([
    ...parameters.filter(parameter => parameter !== undefined), ...definition.outerTypeProjections,
  ], [...csharpAuthoredTypeParameterNames(owner, input.program.source.ast),
    ...input.program.typeProjections.get(owner).map(parameter => parameter.name)]);
  return { ...input, scope: { ...input.scope, typeParameterNames } };
}
