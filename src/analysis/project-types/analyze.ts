import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import { createSourceDeclarationMembership } from "@tsonic/target-api/analysis";
import type { CsharpProjectTypePolicy } from "../../target-model/records/project-types.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { snapshotCsharpTargetTypes } from "../../target-model/types/snapshot.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import { completeCsharpDeclarationHeritage } from "./heritage.js";

export function sealCsharpProjectTypeClassifications(
  policy: CsharpProjectTypePolicy,
  ast: AstReader,
  sourceNodes: readonly Node[],
  objectShapes: Pick<CsharpObjectShapeClassifications, "resolveNode">,
): CsharpProjectTypeClassifications {
  const containingDefinitions = createSourceDeclarationMembership(ast, sourceNodes,
    new Map(policy.catalog.definitions.map(definition => [definition.declaration, definition])));
  const heritageByDeclaration = new WeakMap<
    Node,
    NonNullable<ReturnType<CsharpProjectTypePolicy["heritageForDeclaration"]>>
  >();
  const heritageById = new Map<string, NonNullable<
    ReturnType<CsharpProjectTypePolicy["heritageForDeclaration"]>
  >>();
  const constructorsByDeclaration = new WeakMap<
    Node,
    readonly import("../../target-model/records/project-types.js").CsharpProjectForwardingConstructor[]
  >();

  for (const definition of policy.catalog.definitions) {
    const authoredHeritage = policy.heritageForDeclaration(definition.declaration);
    const heritage = authoredHeritage === undefined ? undefined : completeCsharpDeclarationHeritage(
      authoredHeritage, objectShapes.resolveNode(definition.declaration),
    );
    if (heritage !== undefined) {
      heritageByDeclaration.set(definition.declaration, heritage);
      heritageById.set(definition.id, heritage);
    }
    const constructors = policy.implicitConstructorsForDeclaration(
      definition.declaration,
    );
    if (constructors !== undefined) {
      constructorsByDeclaration.set(
        definition.declaration,
        Object.freeze([...constructors]),
      );
    }
  }
  const issues = Object.freeze([...policy.issues]);
  const declarationScopeNames = Object.freeze([...new Set(policy.catalog.definitions.flatMap(definition =>
    definition.scopeName === undefined ? [] : [definition.scopeName]))].sort());
  const classifications: CsharpProjectTypeClassifications = {
    issues,
    declarationScopeNames,
    definitionContainingDeclaration: (declaration) => declaration === undefined
      ? undefined
      : containingDefinitions.get(declaration),
    heritageForDeclaration: (declaration) =>
      heritageByDeclaration.get(declaration),
    heritageForTarget(type: TargetTypeRef) {
      let selected: TargetTypeRef | undefined;
      try {
        [selected] = snapshotCsharpTargetTypes([type]);
      } catch (error) {
        if (error instanceof TypeError) return undefined;
        throw error;
      }
      if (selected?.kind !== "target-named") return undefined;
      const heritage = heritageById.get(selected.id);
      const arguments_ = selected.typeArguments ?? [];
      if (heritage === undefined ||
        arguments_.length !== heritage.definition.typeParameterBindings.length) return undefined;
      const substitutions = new Map(heritage.definition.typeParameterBindings.map((parameter, index) =>
        [parameter.identity, arguments_[index]!]));
      return Object.freeze({
        definition: heritage.definition,
        ...(heritage.baseType === undefined ? {} : {
          baseType: substituteTargetTypeParameters(heritage.baseType, substitutions),
        }),
        interfaces: Object.freeze(heritage.interfaces.map(candidate =>
          substituteTargetTypeParameters(candidate, substitutions))),
      });
    },
    implicitConstructorsForDeclaration: (declaration) =>
      constructorsByDeclaration.get(declaration),
  };
  return Object.freeze(classifications);
}
