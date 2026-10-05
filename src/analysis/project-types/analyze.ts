import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpProjectTypePolicy,
} from "../../policy/types/index.js";
import type {
  CsharpProjectTypeClassifications,
} from "./model.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { snapshotCsharpTargetTypes } from "../../target-model/types/snapshot.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export function sealCsharpProjectTypeClassifications(
  policy: CsharpProjectTypePolicy,
  ast: AstReader,
  sourceFiles: readonly SourceFile[],
): CsharpProjectTypeClassifications {
  const containingDefinitions = new WeakMap<
    Node,
    NonNullable<ReturnType<CsharpProjectTypePolicy["catalog"]["definitionContainingDeclaration"]>>
  >();
  const heritageByDeclaration = new WeakMap<
    Node,
    NonNullable<ReturnType<CsharpProjectTypePolicy["heritageForDeclaration"]>>
  >();
  const heritageById = new Map<string, NonNullable<
    ReturnType<CsharpProjectTypePolicy["heritageForDeclaration"]>
  >>();
  const constructorsByDeclaration = new WeakMap<
    Node,
    readonly import("../../policy/types/index.js").CsharpProjectForwardingConstructor[]
  >();

  for (const definition of policy.catalog.definitions) {
    const heritage = policy.heritageForDeclaration(definition.declaration);
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
  for (const sourceFile of sourceFiles) {
    visit(sourceFile);
  }

  const issues = Object.freeze([...policy.issues]);
  const classifications: CsharpProjectTypeClassifications = {
    issues,
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

  function visit(node: Node): void {
    const definition = policy.catalog.definitionContainingDeclaration(node);
    if (definition !== undefined) {
      containingDefinitions.set(node, definition);
    }
    ast.forEachChild(node, (child) => {
      if (child !== undefined) visit(child);
    });
  }
}
