import type { AstReader } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpFinalStructuralInterfaceImplementation } from "../../target-model/records/heritage.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { authoredTypeParameterNames, generatedTypeParameterNames } from "@tsonic/target-api/source";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { createCsharpStructuralInterfaceRecords } from "../program/records/structural-interfaces.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { objectShapeMethodInvocationName } from "../../target-model/names/object-members.js";

export function analyzeCsharpStructuralInterfaceEmission(input: {
  readonly ast: AstReader;
  readonly shapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation>;
  readonly names: CsharpNamePlan;
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly projections: CsharpGenericProjectionIndex;
  readonly declarations: Pick<CsharpDeclarationClassifications, "methodWrite">;
}) {
  const sourceNames = new Map(input.names.typeParameterNames.map(parameter => [parameter.identity, parameter.name]));
  return createCsharpStructuralInterfaceRecords(input.shapes.knownShapes().map(shape => ({ carrier: shape.targetType,
    implementations: Object.freeze(input.shapes.structuralImplementations(shape.targetType).map(implementation => {
      const definition = input.projectTypes.definitionContainingDeclaration(implementation.sourceNode);
      const names = new Map(sourceNames);
      if (definition !== undefined && (definition.outerTypeParameters.length !== 0 || definition.outerTypeProjections.length !== 0)) {
        const parameters = definition.outerTypeParameters.map(parameter => csharpSourceTypeParameter(parameter, input.ast));
        if (parameters.some(parameter => parameter === undefined)) failTargetAnalysisInvariant("tsonic-csharp",
          "A structural interface owner requires its exact lifted native binder identities.", implementation.sourceNode);
        const selected = generatedTypeParameterNames([
          ...parameters.filter(parameter => parameter !== undefined), ...definition.outerTypeProjections,
        ], [...authoredTypeParameterNames(implementation.sourceNode, input.ast),
          ...input.names.typeParameterNames.map(parameter => parameter.name),
          ...input.projections.genericProjection.get(implementation.sourceNode).map(parameter => parameter.name)]);
        for (const [identity, name] of selected) names.set(identity, name);
      }
      return Object.freeze({ ...implementation, methods: Object.freeze(implementation.methods.map(method => {
        const binders = method.forwarding.typeParameters;
        const binderIds = new Set(binders.map(parameter => parameter.identity));
        const bareName = (name: string): string => name.startsWith("@") ? name.slice(1) : name;
        const selected = generatedTypeParameterNames(binders.map(parameter => ({ identity: parameter.identity,
          name: names.get(parameter.identity) ?? parameter.name })), [
          ...method.forwarding.contract.nativeParameters.map(parameter => bareName(parameter.targetParameter.name)),
          ...(shape.targetType.kind === "target-named" ? shape.targetType.typeArguments ?? [] : [])
            .flatMap(type => type.kind === "type-parameter" ? [bareName(names.get(type.identity) ?? type.name)] : []),
          ...[...names].filter(([identity]) => !binderIds.has(identity)).map(([, name]) => bareName(name)),
        ]);
        const invocations = [Object.freeze({ name: method.member.targetName, sourceName: method.sourceName })];
        if (method.member.methodValueContract !== undefined && targetTypeRefEquals(method.member.methodValueContract, implementation.interfaceType)) {
          invocations.push(Object.freeze({ name: objectShapeMethodInvocationName(method.member),
            sourceName: input.declarations.methodWrite.get(method.declaration)?.implementationName ?? method.sourceName }));
        }
        return Object.freeze({ ...method, invocations: Object.freeze(invocations),
          typeParameterNames: Object.freeze([...selected].map(([identity, name]) => Object.freeze({ identity, name }))) });
      })) });
    })),
  })));
}
