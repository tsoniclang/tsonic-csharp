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
  const constructorsByDeclaration = new WeakMap<
    Node,
    readonly import("../../policy/types/index.js").CsharpProjectForwardingConstructor[]
  >();

  for (const definition of policy.catalog.definitions) {
    const heritage = policy.heritageForDeclaration(definition.declaration);
    if (heritage !== undefined) {
      heritageByDeclaration.set(definition.declaration, heritage);
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
