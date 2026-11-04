import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import {
  createCsharpNativeConstructionDemandQuery,
} from "../objects/native-construction-demand.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native/native-construction.js";
import { formCsharpNativeConstructionSource, type CsharpNativeConstructionSource } from "../objects/native-construction-source.js";
import type { CsharpStructuralTypeSourceInput } from "../source-evidence/types/resolution/root-sources.js";
import type { CsharpLiteralCreationContextInput } from "../source-evidence/types/resolution/literal-creation-context.js";
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
import { resolveCsharpObjectShapeSelectedMemberTargetType } from "../operations/members/object-shape-members.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpPlanningRepresentationQueries, CsharpTypePolicy, CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import { createCsharpTypeResolutionServices } from "../source-evidence/types/resolution/engine.js";
import type { CsharpTypeResolutionServices } from "../source-evidence/types/resolution/engine.js";
import type { CsharpProjectTypeABIPolicy, CsharpProjectTypePolicy, CsharpProjectTypeQueries } from "../../target-model/records/types/project-types.js";
import { csharpProjectMemberOwnerDeclaration } from "../project-types/type-policy.js";
import type { createCsharpProjectTypeCatalog } from "../project-types/catalog.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import {
  analyzeCsharpProjectTypeABI,
  completeCsharpProjectTypePolicy,
} from "../project-types/catalog/resolution.js";
import type { CsharpBindingProjectionPolicy } from "../control-flow/binding-projections.js";
import { createCsharpBindingProjectionPolicy } from "../control-flow/binding-projections.js";
import {
  csharpTargetTypeComponents,
} from "../../target-model/types/components.js";
import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import { createCsharpSourceTypeParameterEnvironment } from "../source-evidence/types/resolution/type-parameter-environment.js";
import { resolveCsharpTypeParameterConstraints } from "../source-evidence/types/resolution/type-parameter-constraints.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import type { CsharpDeclaredObjectReceiverSources } from "../../target-model/records/native/native-value-carriers.js";
import { csharpTargetTypeFromBinding } from "../../policy/types/storage/bindings.js";
import type { CsharpTypeParameterConstraint } from "../../target-model/types/generic-constraints.js";

export interface CsharpTypeSystem extends Pick<CsharpTypeResolutionServices,
  "nodeQuerySource" | "completeNodeQuery" | "typeQuerySource" | "completeTypeQuery" | "completeDeclaredReceiverBody" | "completeDeclaredCallableBody" |
  "literalCreationContextSource" | "completeLiteralCreationContext"> {
  readonly typeDefinitions: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly analysisTypes: CsharpTypePolicy;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  readonly projectTypeABI: CsharpProjectTypeABIPolicy;
  readonly projectTypeQueries: CsharpProjectTypeQueries;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly publishCallableProjections: ReturnType<typeof createCsharpProjectTypeCatalog>["publishCallableProjections"];
  publishProjectTypes(projections: CsharpGenericProjectionIndex): void;
}

function createCsharpTypeSystem(
  host: CsharpTypePolicyBaseHost,
  declarations: ReturnType<typeof createCsharpProjectTypeCatalog>,
  representations: CsharpPlanningRepresentationQueries,
  declaredObjectReceivers: CsharpDeclaredObjectReceiverSources,
): CsharpTypeSystem {
  const projectTypeCatalog = declarations.catalog;
  let objectShapes: CsharpRecursiveObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypeABI: CsharpProjectTypeABIPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const requireProjectTypes = (): CsharpProjectTypePolicy => {
    if (projectTypes === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# project heritage was requested before the type system was fully initialized.");
    return projectTypes;
  };
  const requireProjectTypeABI = (): CsharpProjectTypeABIPolicy => {
    if (projectTypeABI === undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "C# project declaration relations require their current ABI and heritage publication.");
    return projectTypeABI;
  };
  const projectTypeQueries: CsharpProjectTypeQueries = Object.freeze({
    catalog: projectTypeCatalog,
    heritageForDeclaration(declaration: Node) {
      return projectTypeCatalog.declarationForNode(declaration) === undefined ? undefined
        : requireProjectTypeABI().heritageForDeclaration(declaration);
    },
    directSupertypes(type: TargetTypeRef) {
      return projectTypeCatalog.declarationForTarget(type) === undefined ? undefined
        : requireProjectTypeABI().directSupertypes(type);
    },
    instantiateDeclarationType(declaration: Node | undefined, receiver: TargetTypeRef | undefined, type: TargetTypeRef) {
      return projectTypeCatalog.declarationForNode(declaration) === undefined ? Object.freeze({ kind: "not-project-member" as const })
        : requireProjectTypeABI().instantiateDeclarationType(declaration, receiver, type);
    },
    instantiateMemberType(declaration: Node | undefined, receiver: TargetTypeRef | undefined, type: TargetTypeRef) {
      const owner = csharpProjectMemberOwnerDeclaration(host.ast, declaration);
      return projectTypeCatalog.declarationForNode(owner) === undefined ? Object.freeze({ kind: "not-project-member" as const })
        : requireProjectTypeABI().instantiateMemberType(declaration, receiver, type);
    },
    implicitConstructorsForDeclaration(declaration: Node) {
      return projectTypeCatalog.declarationForNode(declaration) === undefined ? undefined
        : requireProjectTypes().implicitConstructorsForDeclaration(declaration);
    },
    implicitConstructorForSignature(declaration: Node,
      signature: Parameters<CsharpProjectTypeQueries["implicitConstructorForSignature"]>[1],
      parameters: Parameters<CsharpProjectTypeQueries["implicitConstructorForSignature"]>[2]) {
      return projectTypeCatalog.declarationForNode(declaration) === undefined ? undefined
        : requireProjectTypes().implicitConstructorForSignature(declaration, signature, parameters);
    },
  });
  const typeParameterConstraints = createCsharpSourceTypeParameterEnvironment(host.ast, (declaration, parameter, source) => {
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
      declaredObjectReceivers,
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
      projectTypeQueries,
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
          const sourceTarget = selected.kind === "resolved" && selectedType !== undefined &&
            isCsharpJsValueTargetType(selected.member.type)
            ? typeResolution.recursive.resolveType(selectedType, sourceFile, { depth: 0 }) : undefined;
          return selected.kind === "resolved"
            ? resolveCsharpObjectShapeSelectedMemberTargetType(
                selected.member,
                selectedType,
                selectedType !== undefined && declaredMemberType !== undefined &&
                  host.semantics(sourceFile).types.relationship(declaredMemberType, selectedType) === "identical",
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
    projectTypeQueries,
    typeResolver: typeResolution.recursive,
    structuralTypeApplication: typeResolution.structuralTypeApplication,
    structuralTypeCapture: typeResolution.structuralTypeCapture,
    bindStructuralTypeCapture: typeResolution.bindStructuralTypeCapture,
    bindStructuralTypeApplication: typeResolution.bindStructuralTypeApplication,
    projectSemanticSource: typeResolution.projectSemanticSource,
    completeAuthoredSelection: typeResolution.completeAuthoredSelection,
  });
  bindingProjections = createCsharpBindingProjectionPolicy({
    ...host,
    projectTypeQueries,
    typeResolver: typeResolution.recursive,
    objectShapes,
    scopedTargetType: representations.scopedTargetType,
  });
  return Object.freeze({
    typeDefinitions: host.typeDefinitions ?? emptyCsharpTypeDefinitions,
    analysisTypes: types,
    objectShapes,
    projectTypeQueries,
    get projectTypeABI() { return requireProjectTypeABI(); },
    get projectTypes() { return requireProjectTypes(); },
    nodeQuerySource: typeResolution.nodeQuerySource,
    completeNodeQuery: typeResolution.completeNodeQuery,
    typeQuerySource: typeResolution.typeQuerySource,
    completeTypeQuery: typeResolution.completeTypeQuery,
    completeDeclaredReceiverBody: typeResolution.completeDeclaredReceiverBody,
    completeDeclaredCallableBody: typeResolution.completeDeclaredCallableBody,
    literalCreationContextSource: typeResolution.literalCreationContextSource,
    completeLiteralCreationContext: typeResolution.completeLiteralCreationContext,
    publishCallableProjections: declarations.publishCallableProjections,
    publishProjectTypes(projections: CsharpGenericProjectionIndex): void {
      if (projectTypes !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Current native project types are published exactly once.");
      declarations.publishABI(projections);
      const abi = analyzeCsharpProjectTypeABI({ ...host, types }, projectTypeCatalog);
      projectTypeABI = abi.policy;
      const completed = completeCsharpProjectTypePolicy({ ...host, types }, abi);
      declarations.complete(completed);
      projectTypes = completed;
    },
  });
}

export interface CsharpTypeAnalysis extends CsharpTypeSystem {
  readonly nativeConstruction: CsharpNativeConstructionDemandQueries;
  readonly nativeConstructionSource: CsharpNativeConstructionSource<CsharpStructuralTypeSourceInput>;
  completeNativeConstruction(source: CsharpNativeConstructionSource<CsharpStructuralTypeSourceInput>): void;
}

export function createCsharpTypeAnalysis(
  host: CsharpTypePolicyBaseHost,
  catalog: ReturnType<typeof createCsharpProjectTypeCatalog>,
  representations: CsharpPlanningRepresentationQueries,
  declaredObjectReceivers: CsharpDeclaredObjectReceiverSources,
): CsharpTypeAnalysis {
  let nativeConstruction: CsharpNativeConstructionDemandQueries | undefined;
  const selectedRepresentations: CsharpPlanningRepresentationQueries = Object.freeze({
    ...representations,
    scopedTargetType(node: Node): TargetTypeRef | undefined {
      return nativeConstruction?.constructionFor(node)?.targetType ?? representations.scopedTargetType(node);
    },
  });
  const system = createCsharpTypeSystem(host, catalog, selectedRepresentations, declaredObjectReceivers);
  const shapeSource = (type: Type, queries: SourceFileSemantics,
    authoredTypeRoot: Node | undefined): CsharpStructuralTypeSourceInput => {
    const state = Object.freeze({ depth: 0 });
    return Object.freeze({ type, queries, state, authoredTypeRoot,
      source: system.objectShapes.formTypeSource(type, queries, state, authoredTypeRoot) });
  };
  const nativeConstructionSource = formCsharpNativeConstructionSource(host, (node, queries) => {
    const source = system.nodeQuerySource(node, queries.sourceFile).root;
    if (source.kind !== "node") return failTargetAnalysisInvariant("tsonic-csharp",
      "Construction publication requires its genuine checked node source occurrence.", node);
    return source;
  }, shapeSource, (creation, context) => {
    const inputs = creation.contexts.map((selected): CsharpLiteralCreationContextInput => {
      const asynchronous = selected.returnedFrom !== undefined && host.ast.hasModifierKind(selected.returnedFrom, "async");
      if (selected.argument !== undefined) {
        const call = selected.argument.source;
        const source = system.nodeQuerySource(call.call, host.semanticsFor(call.call).sourceFile).root;
        const expression = source.kind === "node" ? source.selectedExpression : undefined;
        if (expression?.kind !== "call" || expression.contract?.source !== call) {
          return failTargetAnalysisInvariant("tsonic-csharp",
            "Literal arguments require their retained checked Root call contract.", call.call);
        }
        return Object.freeze({ kind: "argument", context: selected, contract: expression.contract,
          construction: expression.construction, asynchronous });
      }
      const type = asynchronous ? creation.queries.types.typeArguments(selected.component.selectedType)[0]
        : selected.component.selectedType;
      return type === undefined ? Object.freeze({ kind: "unavailable", context: selected, selectedType: undefined })
        : Object.freeze({ kind: "component", context: selected,
          source: shapeSource(type, creation.queries, asynchronous ? undefined : selected.component.authoredTypeNode) });
    });
    return system.literalCreationContextSource(creation, context, inputs);
  });
  return Object.freeze({
    typeDefinitions: system.typeDefinitions,
    analysisTypes: system.analysisTypes,
    objectShapes: system.objectShapes,
    projectTypeQueries: system.projectTypeQueries,
    get projectTypeABI() { return system.projectTypeABI; },
    get projectTypes() { return system.projectTypes; },
    nodeQuerySource: system.nodeQuerySource,
    completeNodeQuery: system.completeNodeQuery,
    typeQuerySource: system.typeQuerySource,
    completeTypeQuery: system.completeTypeQuery,
    completeDeclaredReceiverBody: system.completeDeclaredReceiverBody,
    completeDeclaredCallableBody: system.completeDeclaredCallableBody,
    literalCreationContextSource: system.literalCreationContextSource,
    completeLiteralCreationContext: system.completeLiteralCreationContext,
    publishCallableProjections: system.publishCallableProjections,
    publishProjectTypes: system.publishProjectTypes,
    nativeConstructionSource,
    get nativeConstruction() {
      if (nativeConstruction === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native construction records require their completed current demand publication.");
      return nativeConstruction;
    },
    completeNativeConstruction(source: CsharpNativeConstructionSource<CsharpStructuralTypeSourceInput>): void {
      if (nativeConstruction !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native construction records are completed exactly once.");
      if (source !== nativeConstructionSource) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native construction completion requires its same retained source plan.");
      nativeConstruction = createCsharpNativeConstructionDemandQuery({
        ...host,
        scopedTargetType: representations.scopedTargetType,
        completeShapeSource: system.objectShapes.completeTypeSource,
        completeContextSource: system.completeLiteralCreationContext,
        resolveTargetShape: system.objectShapes.resolveTarget,
        resolveLiteralShape: system.objectShapes.resolveObjectLiteralTargetShape,
        retainSourceShape: system.objectShapes.retainConstructionSource,
      }, source);
    },
  });
}
import { csharpSourceValueResult } from "../source-evidence/types/resolution/call-results.js";
