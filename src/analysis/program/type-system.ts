// The C# type system of one program view (nextgen C-2542, I2, I6).
//
// It builds the representation services (C1's representation/: the one descriptor -> TargetTypeRef mapping) once,
// and implements the policy model's CsharpTypeQueries on them. Every Source answer is a published fact read
// (SourceProgramFacts); this file decides no Source meaning and never reads a checker Type. A Host refusal reached
// here is an invariant failure: Host refusals are forwarded before C# analysis runs (analyze.ts).
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { TsonicMemoryBindingIndex, TsonicPointerStorageRelation } from "@tsonic/source-core/facts";
import type { AstReader, Node, ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";
import {
  createCsharpRepresentationServices,
  csharpRepresentationContext,
  isSourceRefusal,
  representAwaited,
  representCallableReturn,
  representInstantiation,
  representSlot,
  representSourceSum,
  representSourceType,
  representTypeParameterConstraints,
  representValue,
  type CsharpPlatformBridge,
  type CsharpRepresentation,
  type CsharpRepresentationProfile,
  type CsharpRepresentationServices,
  type CsharpValueRepresentation,
} from "../../representation/index.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import { createCsharpNativeConstructionDemandQuery } from "../objects/native-construction-demand.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native/native-construction.js";
import { emptyCsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpRecursiveObjectShapePolicy } from "../objects/shapes/model.js";
import { createCsharpObjectShapePolicy } from "../objects/shapes/api.js";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import { analyzeCsharpProjectTypePolicy } from "../project-types/catalog/resolution.js";
import { createCsharpBindingProjectionPolicy, type CsharpBindingProjectionPolicy } from "../control-flow/binding-projections.js";
import { createCsharpSourceEvidenceTypeQueries } from "../source-evidence/type-queries.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpProjectedType } from "../../target-model/types/projections.js";
import type { SourceCallableContract, SourceCallableSourceContract } from "../../target-model/records/callables/source-callable-contract.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpObjectMethodSources } from "../../target-model/records/native/native-value-carriers.js";
import type { CsharpTypeDefinitionWriter } from "./records/types/type-definitions.js";
import { csharpCapturedBindingInitialization } from "../callables/values/capture-initialization.js";

/** Representation contracts of the previous fixed-point iteration (iteration.ts) the type system reads. */
export interface CsharpPlanningRepresentationQueries {
  genericProjections(declaration: Node): readonly CsharpProjectedType[];
  requiresClosedStructuralContract(type: TargetTypeRef): boolean;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  closedInputContract(node: Node): SourceCallableSourceContract | undefined;
  /** The callable contract a call use reaches, from the Host call selection. */
  sourceCallable(use: Node, selection: "checked" | "implementation"): SourceCallableContract | undefined;
}

/** Program-level inputs of the type system: published facts, syntax, extension facts and the C# target catalogs. */
export interface CsharpTypeSystemHost {
  readonly facts: SourceProgramFacts;
  readonly platform: CsharpPlatformBridge;
  readonly profile: CsharpRepresentationProfile;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  readonly moduleCallables: import("../../target-model/records/callables/module-callables.js").CsharpModuleCallableIdentities;
  readonly integerRanges: import("../../target-model/records/operations/integer-ranges.js").CsharpIntegerRangeIndex;
  readonly objectMethodSources: CsharpObjectMethodSources;
  readonly sourceStorage: SourceStorageQueries;
  callOnlyAlias(declaration: Node): import("../operations/source-profiles/callable-aliases.js").CsharpCallOnlyAlias | undefined;
  readonly pointerStorage: TsonicPointerStorageRelation;
  readonly memoryBindings: TsonicMemoryBindingIndex;
  readonly typeDefinitions?: CsharpTypeDefinitionWriter;
}

export interface CsharpTypeSystem {
  readonly typeDefinitions: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly representation: CsharpRepresentationServices;
  readonly analysisTypes: CsharpTypeQueries;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
}

function initialized<T>(value: T | undefined, subject: string): T {
  return value ?? failTargetAnalysisInvariant("tsonic-csharp", `${subject} was requested before the C# type system was initialized.`);
}

/** A Node-keyed representation with the Host refusal ruled out (forwarded before analysis, I4). */
function admitted(value: CsharpValueRepresentation, site: Node): CsharpRepresentation {
  return isSourceRefusal(value) ? failTargetAnalysisInvariant("tsonic-csharp",
    `A Host refusal (${value.code}) reached C# representation; Host refusals are forwarded before C# analysis.`, site) : value;
}

/**
 * CsharpTypeQueries over the representation services. Source facts in, .NET types out; the target-only queries
 * (array literal storage, guard folding, fixed arrays, pointers, typed locations) come from source-evidence, and the
 * binding projection from the control-flow binding projection policy.
 */
function createCsharpTypeQueries(
  services: CsharpRepresentationServices,
  bindingProjections: () => CsharpBindingProjectionPolicy,
  targetHost: Parameters<typeof createCsharpSourceEvidenceTypeQueries>[1],
): CsharpTypeQueries {
  const { facts, syntax } = services;
  const at = (occurrence: Node, position: Parameters<typeof csharpRepresentationContext>[2]) =>
    csharpRepresentationContext(services, occurrence, position);
  const targetOnly = createCsharpSourceEvidenceTypeQueries(services, targetHost);
  const queries: CsharpTypeQueries = {
    represent: (descriptor, occurrence, position) => representSourceType(descriptor, at(occurrence, position)),
    representSum: (sum, occurrence, position) => representSourceSum(sum, at(occurrence, position)),
    value: node => admitted(representValue(node, at(node, "value")), node),
    storage: slot => admitted(representSlot(slot, at(slot, "storage")), slot),
    readStorage(read) {
      const operand = facts.navigation.expressions.transparentOperand(read);
      if (syntax.is.IsElementAccessExpression(operand)) {
        return representSourceType(facts.values.elementAccess(operand).result, at(read, "storage"));
      }
      if (syntax.is.IsIdentifier(operand) || syntax.is.IsPropertyAccessExpression(operand)) {
        const declaration = facts.navigation.identity.target(operand)?.declaration;
        const slot = declaration === undefined ? undefined : facts.values.slot(declaration);
        if (slot !== undefined && slot.kind === "slot") return representSourceType(slot.type, at(read, "storage"));
      }
      return queries.value(read);
    },
    callableReturn: declaration => admitted(representCallableReturn(declaration, at(declaration, "return")), declaration),
    awaited: node => admitted(representAwaited(node, at(node, "value")), node),
    instantiation(use) {
      const instantiation = facts.instantiations.at(use);
      if (instantiation === undefined) return undefined;
      if (instantiation.kind === "refused") return failTargetAnalysisInvariant("tsonic-csharp",
        `A Host refusal (${instantiation.code}) reached C# instantiation; Host refusals are forwarded before C# analysis.`, use);
      return Object.freeze({ instantiation, ...representInstantiation(instantiation, at(use, "type-argument")) });
    },
    typeParameterConstraints: (declaration, parameter) => representTypeParameterConstraints(declaration, parameter, services),
    resolveArrayLiteral: targetOnly.resolveArrayLiteral,
    nativeGuardResult: targetOnly.nativeGuardResult,
    resolveBindingProjection: node => bindingProjections().resolveProjection(node),
    selectFixedArray: targetOnly.selectFixedArray,
    resolvePointerReturn: targetOnly.resolvePointerReturn,
    resolvePointerStoragePointee: targetOnly.resolvePointerStoragePointee,
    resolveTypedLocationOperationPointee: targetOnly.resolveTypedLocationOperationPointee,
  };
  return Object.freeze(queries);
}

function createCsharpTypeSystem(
  host: CsharpTypeSystemHost,
  projectTypeCatalog: CsharpProjectTypeCatalog,
  representations: CsharpPlanningRepresentationQueries,
): CsharpTypeSystem {
  let objectShapes: CsharpRecursiveObjectShapePolicy | undefined;
  let bindingProjections: CsharpBindingProjectionPolicy | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const typeDefinitions = host.typeDefinitions ?? failTargetAnalysisInvariant("tsonic-csharp",
    "The C# type system requires its program type-definition registry.");
  const services = createCsharpRepresentationServices({
    facts: host.facts,
    platform: host.platform,
    profile: host.profile,
    syntax: host.ast,
    sourceFacts: host.sourceFacts,
    providers: host.providers,
    projectTypes: projectTypeCatalog,
    memoryBindings: host.memoryBindings,
    objectMethodSources: host.objectMethodSources,
    captureInitialization: declaration => csharpCapturedBindingInitialization(declaration, host.facts.analyses),
    shapes: {
      retainShape: (shape, occurrence) => initialized(objectShapes, "The object-shape registry").retainShape(shape, occurrence),
      resolveCallableValue: (signature, typeParameters) =>
        initialized(objectShapes, "The object-shape registry").resolveCallableValue(signature, typeParameters),
    },
    typeDefinitions,
    genericProjections: representations.genericProjections,
  });
  // The array-literal element fit needs the CLR conversion proof and pointer pointees need storage activations (R-C2-4).
  const types = createCsharpTypeQueries(services, () => initialized(bindingProjections, "The binding projection policy"), {
    pointerStorage: host.pointerStorage,
    sourceStorage: host.sourceStorage,
    conversions: () => ({
      typeDefinitions,
      projectTypes: initialized(projectTypes, "C# project heritage"),
      providers: host.providers,
      target: host.target,
      objectShapes: initialized(objectShapes, "The object-shape registry"),
    }),
  });
  objectShapes = createCsharpObjectShapePolicy({
    ...host,
    representation: services,
    types,
    representations,
    projectTypeCatalog,
    projectTypes: () => initialized(projectTypes, "C# project heritage"),
  });
  bindingProjections = createCsharpBindingProjectionPolicy({
    ...host,
    types,
    objectShapes,
    projectTypes: () => initialized(projectTypes, "C# project heritage"),
    scopedTargetType: representations.scopedTargetType,
  });
  projectTypes = analyzeCsharpProjectTypePolicy({ ...host, types }, projectTypeCatalog);
  return Object.freeze({
    typeDefinitions: host.typeDefinitions ?? emptyCsharpTypeDefinitions,
    representation: services,
    analysisTypes: types,
    objectShapes,
    projectTypes,
  });
}

export interface CsharpTypeAnalysis extends CsharpTypeSystem {
  readonly nativeConstruction: CsharpNativeConstructionDemandQueries;
}

export function createCsharpTypeAnalysis(
  host: CsharpTypeSystemHost,
  catalog: CsharpProjectTypeCatalog,
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
  nativeConstruction = createCsharpNativeConstructionDemandQuery({
    ...host,
    types: system.analysisTypes,
    projectTypes: system.projectTypes,
    resolveEffectiveShape: node => system.objectShapes.resolveNode(node),
    scopedTargetType: representations.scopedTargetType,
    resolveLiteralShape: system.objectShapes.resolveObjectLiteralTargetShape,
    retainSourceShape: system.objectShapes.retainConstructionSource,
    publishedShapeTarget: system.objectShapes.publishedShapeTarget,
  });
  return Object.freeze({ ...system, nativeConstruction });
}
