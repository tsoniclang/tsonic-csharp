import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { createCsharpProjectEmissionProducer } from "../program/records/project-emission.js";

export function analyzeCsharpProjectEmission(input: {
  readonly source: TargetSourceProgram;
  readonly nodes: readonly Node[];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly factories: CsharpClassFactoryIndex;
  readonly evidence: CsharpSourceEvidenceIndex;
}) {
  const producer = createCsharpProjectEmissionProducer();
  const declarations = new Set<Node>();
  const issues: TargetDiagnostic[] = [];
  for (const node of new Set(input.nodes)) {
    const definition = input.projectTypes.definitionContainingDeclaration(node);
    if (definition !== undefined) producer.declaration(node, definition);
    const reference = input.source.navigation.referenceFor(node);
    if (reference === undefined || !input.source.navigation.isProjectDeclaration(reference.declaration) ||
      reference.sourceFile.IsDeclarationFile || input.evidence.providerVirtualDeclaration.get(reference.declaration)) continue;
    const declaration = reference.declaration;
    if (!input.source.ast.is.IsClassDeclaration(declaration) && !input.source.ast.is.IsClassExpression(declaration) &&
      !input.source.ast.is.IsInterfaceDeclaration(declaration) && !input.source.ast.is.IsEnumDeclaration(declaration)) continue;
    producer.reference(node, declaration);
    if (declarations.has(declaration)) continue;
    declarations.add(declaration);
    const name = input.source.ast.name(declaration);
    if (name === undefined && input.factories.classFactory.get(declaration) === undefined) {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: declaration,
        message: "Project source type reference requires a declaration name resolved by TSTS." });
      continue;
    }
    producer.type(declaration, { name, scopeName: input.projectTypes.definitionContainingDeclaration(declaration)?.scopeName });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
