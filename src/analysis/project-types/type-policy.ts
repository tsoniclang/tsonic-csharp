import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy, CsharpProjectMemberTypeInstantiation, CsharpProjectTypeDefinitionSelection, CsharpProjectTypeDefinition, CsharpProjectTypeHeritage, CsharpProjectTypeIssue, CsharpProjectConstructorPolicy } from "../../target-model/records/types/project-types.js";
import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram, SourceRefusal } from "@tsonic/target-api/source";
import { sourceNodeIdentity } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpProjectHeritageKindIssue } from "../../policy/types/project/relationships.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";

export interface CsharpProjectTypeCatalogHost {
  readonly ast: TargetSourceProgram["ast"];
  readonly facts: TargetSourceProgram["facts"];
}

export interface CsharpProjectTypePolicyHost extends CsharpProjectTypeCatalogHost {
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypeQueries;
}

export function createCsharpProjectTypePolicy(
  ast: AstReader,
  catalog: CsharpProjectTypeCatalog,
  heritageById: ReadonlyMap<string, CsharpProjectTypeHeritage>,
  constructors: CsharpProjectConstructorPolicy,
  issues: readonly CsharpProjectTypeIssue[],
): CsharpProjectTypePolicy {
  if (heritageById === undefined || constructors === undefined || issues === undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp", "C# project type policy requires completed heritage, constructors and issues.");
  }
  const directSupertypes = (
    type: TargetTypeRef,
  ): readonly TargetTypeRef[] | undefined => {
    const definition = catalog.definitionForTarget(type);
    if (definition === undefined) {
      return undefined;
    }
    const arguments_ = type.kind === "target-named"
      ? type.typeArguments ?? []
      : [];
    if (arguments_.length !== definition.typeParameterBindings.length) {
      return Object.freeze([]);
    }
    const heritage = heritageById.get(definition.id);
    if (heritage === undefined) {
      return Object.freeze([]);
    }
    const substitutions = new Map(
      definition.typeParameterBindings.map((parameter, index) => [
        parameter.identity,
        arguments_[index]!,
      ]),
    );
    return Object.freeze([
      ...(heritage.baseType === undefined
        ? []
        : [substituteTargetTypeParameters(
            heritage.baseType,
            substitutions,
          )]),
      ...heritage.interfaces.map((candidate) =>
        substituteTargetTypeParameters(candidate, substitutions)
      ),
    ]);
  };

  const instantiateDeclarationType = (
    declaration: Node | undefined,
    receiver: TargetTypeRef | undefined,
    declaredType: TargetTypeRef,
  ): CsharpProjectMemberTypeInstantiation => {
    const owner = catalog.definitionForDeclaration(declaration);
    if (owner === undefined) {
      return { kind: "not-project-member" };
    }
    if (owner.typeParameterBindings.length === 0) {
      return { kind: "resolved", type: declaredType };
    }
    if (receiver === undefined) {
      return {
        kind: "unresolved",
        reason:
          `Project declaration '${owner.sourceName}' requires an exact receiver target type to instantiate its type parameters.`,
      };
    }
    const pending: TargetTypeRef[] = [receiver];
    const visited = new Set<string>();
    const matches = new Map<string, TargetTypeRef>();
    while (pending.length > 0) {
      const candidate = pending.shift()!;
      const key = targetTypeRefKey(candidate);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      const definition = catalog.definitionForTarget(candidate);
      if (definition?.id === owner.id) {
        matches.set(key, candidate);
        continue;
      }
      pending.push(...(directSupertypes(candidate) ?? []));
    }
    if (matches.size !== 1) {
      return {
        kind: "unresolved",
        reason: matches.size === 0
          ? `The selected receiver has no exact target heritage path to project declaration '${owner.sourceName}'.`
          : `The selected receiver has more than one target instantiation of project declaration '${owner.sourceName}'.`,
      };
    }
    const selectedOwner = [...matches.values()][0]!;
    const arguments_ = selectedOwner.kind === "target-named"
      ? selectedOwner.typeArguments ?? []
      : [];
    if (arguments_.length !== owner.typeParameterBindings.length) {
      return {
        kind: "unresolved",
        reason:
          `The selected receiver instantiates project declaration '${owner.sourceName}' with ${arguments_.length} target type arguments instead of ${owner.typeParameterBindings.length}.`,
      };
    }
    const bindings = new Map(owner.typeParameterBindings.map((parameter, index) => [parameter.identity, arguments_[index]!]));
    let missingProjection = false;
    visitCsharpTargetTypeParameters(declaredType, parameter => {
      const projection = parameter.csharpProjection;
      if (projection === undefined || bindings.has(parameter.identity)) return;
      const dependencies = csharpFreeTypeParameterIdentities(projection.arguments);
      if (owner.typeParameterBindings.some(binding => dependencies.has(binding.identity))) missingProjection = true;
    });
    if (missingProjection) {
      return { kind: "unresolved", reason: "The selected project owner has not finalized every required generic projection binding." };
    }
    return {
      kind: "resolved",
      type: substituteTargetTypeParameters(
        declaredType,
        bindings,
      ),
    };
  };

  return Object.freeze({
    catalog,
    issues,
    heritageForDeclaration(declaration: Node) {
      const definition = catalog.definitionForDeclaration(declaration);
      return definition === undefined
        ? undefined
        : heritageById.get(definition.id);
    },
    directSupertypes,
    instantiateDeclarationType,
    instantiateMemberType(
      declaration: Node | undefined,
      receiver: TargetTypeRef | undefined,
      memberType: TargetTypeRef,
    ): CsharpProjectMemberTypeInstantiation {
      const owner = projectMemberOwner(ast, catalog, declaration);
      if (owner === undefined) {
        return { kind: "not-project-member" };
      }
      if (declaration !== undefined && ast.hasModifierKind(declaration, "static") && owner.outerTypeParameters.length === 0) {
        const parameters = csharpFreeTypeParameterIdentities([memberType]);
        return owner.typeParameterBindings.some(parameter => parameters.has(parameter.identity))
          ? { kind: "unresolved", reason: "A static member cannot depend on its class instance type parameters." }
          : { kind: "resolved", type: memberType };
      }
      return instantiateDeclarationType(
        owner.declaration,
        receiver,
        memberType,
      );
    },
    implicitConstructorsForDeclaration:
      constructors.implicitConstructorsForDeclaration,
    implicitConstructorForSignature:
      constructors.implicitConstructorForSignature,
  });
}

function projectMemberOwner(
  ast: AstReader,
  catalog: CsharpProjectTypeCatalog,
  declaration: Node | undefined,
): CsharpProjectTypeDefinition | undefined {
  const member = declaration !== undefined &&
      ast.is.IsParameterDeclaration(declaration)
    ? ast.parent(declaration)
    : declaration;
  if (
    member === undefined ||
    !(
      ast.is.IsMethodDeclaration(member) ||
      ast.is.IsMethodSignatureDeclaration(member) ||
      ast.is.IsPropertyDeclaration(member) ||
      ast.is.IsPropertySignatureDeclaration(member) ||
      ast.is.IsGetAccessorDeclaration(member) ||
      ast.is.IsSetAccessorDeclaration(member) ||
      ast.is.IsConstructorDeclaration(member) ||
      ast.is.IsCallSignatureDeclaration(member) ||
      ast.is.IsConstructSignatureDeclaration(member) ||
      ast.is.IsIndexSignatureDeclaration(member)
    )
  ) {
    return undefined;
  }
  return catalog.definitionForDeclaration(ast.parent(member));
}

export function projectTypeDefinition(host: CsharpProjectTypeCatalogHost, declaration: Node): CsharpProjectTypeDefinitionSelection {
  const { ast, facts } = host;
  const reject = (refusal: SourceRefusal): CsharpProjectTypeDefinitionSelection => ({ kind: "rejected", refusal });
  if (!facts.navigation.isProjectDeclaration(declaration)) return { kind: "not-project-type" };
  const sourceFile = ast.getSourceFile(declaration);
  const name = ast.name(declaration);
  const identity = sourceNodeIdentity(ast, declaration);
  const syntaxKind = ast.is.IsClassDeclaration(declaration) || ast.is.IsClassExpression(declaration) ? "class" as const
    : ast.is.IsInterfaceDeclaration(declaration) ? "interface" as const
    : ast.is.IsEnumDeclaration(declaration) ? "enum" as const : undefined;
  if (sourceFile === undefined || identity === undefined || syntaxKind === undefined && !ast.is.IsVariableDeclaration(declaration)) {
    return { kind: "not-project-type" };
  }
  const slot = facts.values.declaredSlot(declaration);
  if (slot.kind === "refused") return reject(slot);
  let kind: CsharpProjectTypeDefinition["kind"] | undefined = syntaxKind;
  if (kind === undefined) {
    const markers = facts.protocols.typeMarkers(slot.value.type);
    if (markers.kind === "refused") return reject(markers);
    if (markers.value.struct.kind !== "present" || !markers.value.struct.value.valueType) return { kind: "not-project-type" };
    kind = "struct";
  }
  if (name === undefined && kind !== "class") return { kind: "not-project-type" };
  if (kind === "interface") {
    const definition = facts.descriptors.definition(slot.value.type);
    if (definition.kind === "refused") return reject(definition);
    const type = definition.value.type;
    if (type.kind === "array" || type.kind === "callable" || type.kind === "shape" && type.members.length === 0 &&
      type.indexes.length === 0 && type.calls.length + type.constructs.length > 0) return { kind: "not-project-type" };
  }
  let integerWidth: 32 | 64 | undefined;
  if (kind === "enum") {
    const selected = facts.enums.declaration(declaration);
    if (selected.kind === "refused") return reject(selected);
    facts.descriptors.assertEvidence(selected.value.underlying);
    const underlying = selected.value.underlying.type;
    if (underlying.kind !== "primitive" || underlying.primitive !== "int32" && underlying.primitive !== "int64") {
      failTargetAnalysisInvariant("tsonic-csharp", "A Native enum requires its published signed int32 or int64 underlying evidence.", declaration);
    }
    integerWidth = underlying.primitive === "int32" ? 32 : 64;
  }
  const published = facts.descriptors.freeParameters(slot.value.type);
  const own = published.filter(parameter => parameter.owner === declaration);
  const outer = published.filter(parameter => parameter.owner !== declaration);
  const typeParameterBindings = Object.freeze(published.map(parameter => {
    const originalIdentity = sourceNodeIdentity(ast, parameter.declaration);
    const originalName = ast.name(parameter.declaration);
    if (originalIdentity === undefined || originalName === undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "An original Source binder requires its canonical identity and authored Native name.", parameter.declaration);
    return Object.freeze({ kind: "type-parameter" as const, identity: originalIdentity, name: ast.text(originalName), csharpDeclaration: parameter.declaration });
  }));
  const parent = ast.parent(declaration);
  const local = kind === "class" && parent !== undefined && !ast.is.IsSourceFile(parent);
  let publicParameterlessConstructor = kind === "struct";
  if (kind === "class") {
    const selected = facts.navigation.classConstructors(declaration);
    if (selected.kind === "refused") return reject(selected);
    publicParameterlessConstructor = selected.value.kind === "resolved" && selected.value.signatures.some(signature => signature.parameters.length === 0);
  }
  const base = { id: `tsonic.source:${identity}`, declaration, sourceFile, sourceName: name === undefined ? "AnonymousClass" : ast.text(name),
    local, sourceTypeParameterCount: own.length, typeProjections: Object.freeze([]), outerTypeProjections: Object.freeze([]),
    outerTypeParameters: Object.freeze(outer.map(parameter => parameter.declaration)), typeParameters: Object.freeze(own.map(parameter => parameter.declaration)),
    staticCompanion: kind === "class" && published.length > 0 && !local && ast.members(declaration).some(member =>
      ast.hasModifierKind(member, "static") || ast.is.IsClassStaticBlockDeclaration(member)),
    typeParameterBindings, abstract: kind === "class" && ast.hasModifierKind(declaration, "abstract"), publicParameterlessConstructor };
  return { kind: "resolved", definition: Object.freeze(kind === "enum"
    ? { ...base, kind, integerWidth: integerWidth! } : { ...base, kind }) };
}

export function selectCsharpProjectTypeHeritage(host: CsharpProjectTypePolicyHost, catalog: CsharpProjectTypeCatalog,
  definition: CsharpProjectTypeDefinition):
  | { readonly kind: "resolved"; readonly heritage: CsharpProjectTypeHeritage }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
  const selected = host.facts.navigation.declaredHeritage(definition.declaration);
  if (selected.kind === "refused") return { kind: "unresolved", issue: { node: selected.site, code: selected.code, source: selected.source, message: selected.message } };
  if (selected.value.kind === "unresolved") return { kind: "unresolved", issue: { node: selected.value.heritage,
    code: "CSHARP_PROJECT_HERITAGE_SOURCE_UNRESOLVED", message: selected.value.reason } };
  let baseType: TargetTypeRef | undefined;
  const interfaces: TargetTypeRef[] = [];
  for (const edge of selected.value.edges) {
    const represented = host.types.representation.represent(edge.selected, "storage", edge.heritage);
    if (represented.kind !== "represented") {
      const diagnostic = csharpRepresentationDiagnostic(represented);
      return { kind: "unresolved", issue: { node: diagnostic.sourceNode ?? edge.heritage,
        code: diagnostic.code, source: diagnostic.source, message: diagnostic.message } };
    }
    const target = represented.value.carrier;
    const project = catalog.definitionForTarget(target);
    const binding = project === undefined && target.kind === "target-named" ? host.providers.findTargetBindingByTargetId(target.id, "inheritance") : undefined;
    const targetKind = project?.kind ?? (binding?.kind === "resolved" ? binding.binding.kind : undefined);
    const kindError = csharpProjectHeritageKindIssue(definition, edge.kind, targetKind, target);
    if (kindError !== undefined) return { kind: "unresolved", issue: { node: edge.heritage,
      code: "CSHARP_PROJECT_HERITAGE_KIND_UNSUPPORTED", message: kindError } };
    if (definition.kind === "class" && edge.kind === "extends") {
      if (baseType !== undefined) return { kind: "unresolved", issue: { node: edge.heritage,
        code: "CSHARP_PROJECT_MULTIPLE_BASE_TYPES", message: `Project class '${definition.sourceName}' has more than one selected C# base class.` } };
      baseType = target;
    } else interfaces.push(target);
  }
  return { kind: "resolved", heritage: Object.freeze({ definition, ...(baseType === undefined ? {} : { baseType }), interfaces: Object.freeze(interfaces) }) };
}
