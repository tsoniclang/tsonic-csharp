import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProjectTypeDeclaration, CsharpProjectTypeDefinition } from "../../../../target-model/records/types/project-types.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTargetTypeComponents } from "../../../../target-model/types/components.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { requireCsharpProjectTypeABI } from "../../../project-types/catalog/abi.js";
import type { CsharpNodeQuerySource } from "./root-sources.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveFormedCsharpProjectInstanceTargetType, type CsharpProjectInstanceSource } from "./project-instance-source.js";

interface CsharpDeclaredProjectSelfInput {
  readonly source: CsharpNodeQuerySource;
  readonly self: Extract<CsharpProjectInstanceSource, { readonly kind: "class" }>;
  readonly declaration: CsharpProjectTypeDeclaration;
  readonly arguments: CsharpProjectTypeDeclaration["authoredTypeParameterBindings"];
}

export type CsharpDeclaredProjectSelfBody = CsharpDeclaredProjectSelfInput & (
  | { readonly phase: "declared"; readonly components: CsharpProjectTypeDeclaration["authoredTypeParameterBindings"] }
  | { readonly phase: "published"; readonly definition: CsharpProjectTypeDefinition;
      readonly type: TargetTypeRef; readonly components: readonly TargetTypeRef[] }
);

export function formCsharpDeclaredProjectSelfSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  source: CsharpNodeQuerySource,
): Extract<CsharpDeclaredProjectSelfBody, { readonly phase: "declared" }> | undefined {
  if (source.root.node !== source.node || source.root.sourceFile !== source.sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
    "A project self component requires its exact original body occurrence.", source.node);
  const root = source.root;
  if (root.kind !== "node" || root.projectInstance.kind !== "class") return undefined;
  const self = root.projectInstance;
  const declaration = host.projectTypeCatalog.declarationForNode(self.declaration);
  if (declaration === undefined) return undefined;
  if (self.node !== source.node || declaration.kind !== "class" || declaration.declaration !== self.declaration ||
    declaration.authoredTypeParameterBindings.length !== declaration.outerTypeParameters.length + declaration.sourceTypeParameterCount ||
    Array.from(declaration.authoredTypeParameterBindings).some(parameter => parameter === undefined)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A project self component keeps its class and ordered declared binders.", source.node);
  }
  return Object.freeze({ source, self, declaration, arguments: declaration.authoredTypeParameterBindings,
    phase: "declared", components: declaration.authoredTypeParameterBindings });
}

export function completeCsharpDeclaredProjectSelf(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  body: Extract<CsharpDeclaredProjectSelfBody, { readonly phase: "declared" }>,
): Extract<CsharpDeclaredProjectSelfBody, { readonly phase: "published" }> {
  const { source, self, declaration } = body;
  const root = source.root;
  const catalog = scope.host.projectTypeCatalog;
  if (body.phase !== "declared" || root.kind !== "node" || root.projectInstance !== self || root.node !== source.node ||
    root.sourceFile !== source.sourceFile || self.node !== source.node || self.declaration !== declaration.declaration ||
    declaration.kind !== "class" || catalog.declarationForNode(self.declaration) !== declaration ||
    body.arguments !== declaration.authoredTypeParameterBindings || body.components !== body.arguments) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A project self completion requires its retained class and exact D application.", source.node);
  }
  const definition = catalog.definitionForDeclaration(self.declaration);
  if (definition === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A project self completion requires its current published class ABI.", source.node);
  requireCsharpProjectTypeABI(declaration, definition);
  const type = resolveFormedCsharpProjectInstanceTargetType(scope, self);
  if (type?.kind !== "target-named" || type.id !== declaration.id) return failTargetAnalysisInvariant("tsonic-csharp",
    "A physical project self must retain its exact declared class identity.", source.node);
  const arguments_ = type.typeArguments ?? Object.freeze([]);
  if (arguments_.length !== definition.typeParameterBindings.length ||
    definition.typeParameterBindings.some((parameter, index) => !targetTypeRefEquals(parameter, arguments_[index]))) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A physical project self must be its same class applied to the published D and A binders.", source.node);
  }
  return Object.freeze({ ...body, phase: "published", definition, type, components: csharpTargetTypeComponents(type) });
}

export function requireCsharpDeclaredProjectSelfCompletion(
  body: CsharpDeclaredProjectSelfBody,
  type: TargetTypeRef | undefined,
): void {
  if (body.phase !== "published" || !targetTypeRefEquals(body.type, type)) return failTargetAnalysisInvariant("tsonic-csharp",
    "The physical self type differs from its retained declared class application; a second answer is forbidden.", body.source.node);
}
