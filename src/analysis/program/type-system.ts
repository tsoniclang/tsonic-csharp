import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import {
  createCsharpNativeConstructionDemandQuery,
} from "../objects/native-construction-demand.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native/native-construction.js";
import type { CsharpNativeConstructionPublicationSource } from "../objects/native-construction-publication.js";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import { emptyCsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { selectCsharpArrayTypeGuard } from "../operations/source-profiles/js/type-tests.js";
import type {
  CsharpRecursiveObjectShapePolicy,
} from "../objects/shapes/model.js";
import { createCsharpObjectShapePolicy } from "../objects/shapes/api.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { csharpObjectShapeMemberRetainsNativeReference } from "../../policy/types/objects/member-reads.js";
import { resolveCsharpObjectShapeMemberReadTargetType } from "../operations/members/object-shape-members.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpPlanningRepresentationQueries, CsharpTypePolicy, CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { createCsharpTypeResolutionServices } from "../source-evidence/types/resolution/engine.js";
import type { CsharpTypeResolutionServices } from "../source-evidence/types/resolution/engine.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import type { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import {
  analyzeCsharpProjectTypePolicy,
} from "../project-types/catalog/resolution.js";
import type { CsharpBindingProjectionPolicy } from "../control-flow/binding-projections.js";
import { createCsharpBindingProjectionPolicy } from "../control-flow/binding-projections.js";
import {
  csharpTargetTypeComponents,
} from "../../target-model/types/components.js";
import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import { createCsharpTypeParameterEnvironment } from "../source-evidence/types/resolution/type-parameter-environment.js";
import { resolveCsharpTypeParameterConstraints } from "../source-evidence/types/resolution/type-parameter-constraints.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import { csharpTargetTypeFromBinding } from "../../policy/types/storage/bindings.js";
import type { CsharpTypeParameterConstraint } from "../../target-model/types/generic-constraints.js";

export interface CsharpTypeSystem extends Pick<CsharpTypeResolutionServices,
  "nodeQuerySource" | "completeNodeQuery" | "typeQuerySource" | "completeTypeQuery"> {
  readonly typeDefinitions: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly analysisTypes: CsharpTypePolicy;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  publishProjectTypes(projections: CsharpGenericProjectionIndex): void;
}

function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
  declarations: ReturnType<typeof createCsharpProjectTypeCatalog>,
  representations: CsharpPlanningRepresentationQueries,
): CsharpTypeSystem {
  const projectTypeCatalog = declarations.catalog;
  let objectShapes: CsharpRecursiveObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const requireProjectTypes = (): CsharpProjectTypePolicy => {
    if (projectTypes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# project heritage was requested before the type system was fully initialized.");
    return projectTypes;
  };
  const typeParameterConstraints = createCsharpTypeParameterEnvironment(host.ast, (declaration, parameter, source) => {
    const sourceFile = source?.sourceFile ?? host.ast.getSourceFile(declaration);
    if (sourceFile === undefined || !host.hasSemantics(sourceFile)) return undefined;
    const sourceType = source?.sourceType ?? host.semantics(sourceFile).declarations.declaredType(declaration);
    if (sourceType === undefined) return undefined;
    const resolution = resolveCsharpTypeParameterConstraints(declaration, parameter, sourceFile, {
      ast: host.ast,
      types: { resolveNode: (node, file) => {
        let rejected: Extract<import("../../policy/model/type-resolution.js").CsharpNodeTypeResolution, { readonly kind: "rejected" }> | undefined;
        const type = typeResolution.recursive.resolveNode(node, file, {
          depth: 0, sourceBindings: new Map([[declaration, { sourceType, targetType: parameter }]]),
          rejectNativeResolution: rejection => { rejected ??= rejection; },
        });
        return rejected ?? (type === undefined ? undefined : Object.freeze({ kind: "resolved" as const,
          sourceResult: csharpSourceValueResult(type)! }));
      } },
    });
    if (resolution.kind !== "resolved") return resolution;
    const constraints: CsharpTypeParameterConstraint[] = [];
    for (const constraint of resolution.constraints) {
      const selected = constraint.kind === "type" && constraint.type.kind === "target-named"
        ? csharpNativeInheritanceLookup(constraint.type) : undefined;
      if (selected?.kind !== "metadata-name" || constraint.kind !== "type" || constraint.type.kind !== "target-named") {
        constraints.push(constraint);
        continue;
      }
      const binding = host.providers.findTargetBindingByMetadataName(selected.metadataName, "ordinary");
      if (binding.kind !== "resolved") return Object.freeze({ kind: "unsupported" as const,
        reason: binding.kind === "missing"
          ? "The selected native generic constraint has no exact C# provider binding."
          : binding.diagnostic.message });
      const type = csharpTargetTypeFromBinding(binding.binding, constraint.type.typeArguments);
      if (type === undefined) return Object.freeze({ kind: "unsupported" as const,
        reason: "The selected native generic constraint has no exact C# binding carrier." });
      constraints.push(Object.freeze({ kind: "type", type }));
    }
    return Object.freeze({ kind: "resolved" as const, constraints: Object.freeze(constraints) });
  });
  const createTypeResolution = (
    representations: CsharpPlanningRepresentationQueries,
  ) => createCsharpTypeResolutionServices({
      ...host,
      typeParameterConstraints,
      representations,
      projectTypeCatalog,
      closedTypeGuard(node) {
        const semantics = host.semanticsFor(node);
        return selectCsharpArrayTypeGuard(host, semantics.operations.call(node), semantics.sourceFile);
      },
      bindingProjection(node: Node, sourceFile: SourceFile) {
        if (bindingProjections === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# binding projection ran before type-system initialization.");
        return bindingProjections.resolveProjection(node, sourceFile, { depth: 0 });
      },
      get objectShapes() {
        if (objectShapes === undefined) {
          failTargetAnalysisInvariant("tsonic-csharp", "C# object-shape selection ran before the type system was fully initialized.");
        }
        return objectShapes;
      },
      projectTypes: requireProjectTypes,
      targetTypeComponents(type) {
        return csharpTargetTypeComponents(
          type,
          objectShapes?.resolveTarget(type),
        );
      },
      structuralTypes: {
        memberInheritance(application, memberIndex) {
          if (objectShapes === undefined) failTargetAnalysisInvariant("tsonic-csharp",
            "Structural inheritance requires its initialized current shape owner.");
          return objectShapes.memberInheritance(application, memberIndex);
        },
        resolveReference(type) {
          if (objectShapes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# structural references requested before type-system initialization.");
          return objectShapes.resolveReference(type);
        },
        resolveUnion(type, sourceFile, state) {
          if (objectShapes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# structural definitions requested before type-system initialization.");
          return objectShapes.resolveUnion(type, sourceFile, state);
        },
        resolveTarget(type) {
          if (objectShapes === undefined) {
            failTargetAnalysisInvariant("tsonic-csharp", "C# structural type resolution ran before the type system was fully initialized.");
          }
          return objectShapes.resolveTarget(type);
        },
        formNodeSource(node, queries, state) {
          if (objectShapes === undefined) {
            return failTargetAnalysisInvariant("tsonic-csharp", "Structural source capture requires its initialized shape owner.", node);
          }
          return objectShapes.formNodeSource(node, queries, state);
        },
        completeNodeSource(input) {
          if (objectShapes === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
            "Structural native completion requires its initialized shape owner.", input.node);
          if (bindingProjections === undefined) {
            failTargetAnalysisInvariant("tsonic-csharp", "C# binding projection ran before the type system was fully initialized.");
          }
          return bindingProjections.resolveNode(input.node, input.queries.sourceFile, input.state) ??
            objectShapes.completeNodeSource(input)?.targetType;
        },
        formTypeSource(type, queries, state, authoredTypeRoot) {
          if (objectShapes === undefined) {
            return failTargetAnalysisInvariant("tsonic-csharp", "Structural source capture requires its initialized shape owner.", authoredTypeRoot);
          }
          return objectShapes.formTypeSource(type, queries, state, authoredTypeRoot);
        },
        completeTypeSource(input) {
          if (objectShapes === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
            "Structural native completion requires its initialized shape owner.", input.authoredTypeRoot);
          return objectShapes.completeTypeSource(input)?.targetType;
        },
        resolveSelectedProperty(
          receiverType: TargetTypeRef | undefined,
          selectedSubjects: readonly ExtensionFactSubject[],
          selectedType: Type | undefined,
          sourceFile: SourceFile,
          declaredMemberType: Type | undefined,
        ): TargetTypeRef | undefined {
          if (objectShapes === undefined || receiverType === undefined) {
            return undefined;
          }
          const shape = objectShapes.resolveTarget(receiverType);
          if (shape === undefined) {
            return undefined;
          }
          const selected = resolveCsharpObjectShapeMemberBySelectedSubject(
            shape,
            selectedSubjects,
          );
          if (selected.kind === "resolved" && selectedType === undefined) return selected.member.type;
          const sourceTarget = selected.kind === "resolved" && selectedType !== undefined &&
            isCsharpJsValueTargetType(selected.member.type)
            ? typeResolution.recursive.resolveType(selectedType, sourceFile, { depth: 0 }) : undefined;
          if (selected.kind === "resolved" && selectedType !== undefined && declaredMemberType !== undefined &&
            host.semantics(sourceFile).types.relationship(declaredMemberType, selectedType) === "identical" &&
            !csharpObjectShapeMemberRetainsNativeReference(sourceTarget, selected.member.type)) {
            return selected.member.type;
          }
          return selected.kind === "resolved"
            ? resolveCsharpObjectShapeMemberReadTargetType(
                selected.member,
                selectedType,
                (left, right) =>
                  host.semantics(sourceFile).types.relationship(left, right) !==
                    "unrelated",
                sourceTarget,
              )
            : undefined;
        },
      },
    });
  const typeResolution = createTypeResolution(representations);
  const types = typeResolution.policy;
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    typeParameterConstraints,
    representations,
    projectTypeCatalog,
    projectDeclarations: declarations.declarations,
    projectTypes: requireProjectTypes,
    typeResolver: typeResolution.recursive,
    structuralTypeApplication: typeResolution.structuralTypeApplication,
    bindStructuralTypeApplication: typeResolution.bindStructuralTypeApplication,
    projectSemanticSource: typeResolution.projectSemanticSource,
    completeAuthoredSelection: typeResolution.completeAuthoredSelection,
    callContractSource: typeResolution.callContractSource,
    completeCallContract: typeResolution.completeCallContract,
  });
  bindingProjections = createCsharpBindingProjectionPolicy({
    ...host,
    projectTypes: requireProjectTypes,
    typeResolver: typeResolution.recursive,
    objectShapes,
    scopedTargetType: representations.scopedTargetType,
  });
  return Object.freeze({
    typeDefinitions: host.typeDefinitions ?? emptyCsharpTypeDefinitions,
    analysisTypes: types,
    objectShapes,
    get projectTypes() { return requireProjectTypes(); },
    nodeQuerySource: typeResolution.nodeQuerySource,
    completeNodeQuery: typeResolution.completeNodeQuery,
    typeQuerySource: typeResolution.typeQuerySource,
    completeTypeQuery: typeResolution.completeTypeQuery,
    publishProjectTypes(projections: CsharpGenericProjectionIndex): void {
      if (projectTypes !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Current native project types are published exactly once.");
      declarations.publish(projections);
      projectTypes = analyzeCsharpProjectTypePolicy({ ...host, types }, projectTypeCatalog);
    },
  });
}

export interface CsharpTypeAnalysis extends CsharpTypeSystem {
  readonly nativeConstruction: CsharpNativeConstructionDemandQueries;
  completeNativeConstruction(publicationSources: readonly CsharpNativeConstructionPublicationSource[]): void;
}

export function createCsharpTypeAnalysis(
  host: CsharpTypePolicyBaseHost,
  catalog: ReturnType<typeof createCsharpProjectTypeCatalog>,
  representations: CsharpPlanningRepresentationQueries,
): CsharpTypeAnalysis {
  let nativeConstruction: CsharpNativeConstructionDemandQueries | undefined;
  const selectedRepresentations: CsharpPlanningRepresentationQueries = Object.freeze({
    ...representations,
    scopedTargetType(node: Node): TargetTypeRef | undefined {
      return nativeConstruction?.constructionFor(node)?.targetType ?? representations.scopedTargetType(node);
    },
  });
  const system = createCsharpTypeSystem(host, catalog, selectedRepresentations);
  return Object.freeze({
    typeDefinitions: system.typeDefinitions,
    analysisTypes: system.analysisTypes,
    objectShapes: system.objectShapes,
    get projectTypes() { return system.projectTypes; },
    nodeQuerySource: system.nodeQuerySource,
    completeNodeQuery: system.completeNodeQuery,
    typeQuerySource: system.typeQuerySource,
    completeTypeQuery: system.completeTypeQuery,
    publishProjectTypes: system.publishProjectTypes,
    get nativeConstruction() {
      if (nativeConstruction === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native construction records require their completed current demand publication.");
      return nativeConstruction;
    },
    completeNativeConstruction(publicationSources: readonly CsharpNativeConstructionPublicationSource[]): void {
      if (nativeConstruction !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native construction records are completed exactly once.");
      nativeConstruction = createCsharpNativeConstructionDemandQuery({
        ...host,
        scopedTargetType: representations.scopedTargetType,
        resolveShape: system.objectShapes.resolveType,
        resolveLiteralShape: system.objectShapes.resolveObjectLiteralTargetShape,
        retainSourceShape: system.objectShapes.retainConstructionSource,
      }, publicationSources);
    },
  });
}
import { csharpSourceValueResult } from "../source-evidence/types/resolution/call-results.js";
