import type { Node } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeRegistry, CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/native-definitions.js";
import type { CsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpCaptureInitialization, CsharpObjectShapeFact, CsharpTargetMember } from "../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../target-model/types/representation.js";
import type { CsharpObjectMethodSources } from "../../target-model/records/native/native-value-carriers.js";
import type { CsharpProjectTypeCatalogBuilder } from "../project-types/catalog.js";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import type { CsharpNativeConstructionDemandQueries } from "../../target-model/records/native/native-construction.js";
import type { CsharpNativeDelegateRegistry } from "../callables/native/native-delegates.js";
import type { CsharpSourceRoleRegistry } from "../project-types/source-roles.js";
import { createCsharpRepresentationView } from "../../policy/types/source-type-flow/representation.js";
import { createCsharpNativeRepresentationHost } from "./representation-host.js";
import { createCsharpTypeQueries } from "../source-evidence/types/queries.js";
import { createCsharpObjectShapePolicy } from "../objects/shapes/api.js";
import { createCsharpNativeDelegateRegistry } from "../callables/native/native-delegates.js";
import { createCsharpSourceRoleRegistry } from "../project-types/source-roles.js";
import { analyzeCsharpProjectTypePolicy } from "../project-types/catalog/resolution.js";
import { createCsharpNativeConstructionDemandQuery } from "../objects/native-construction-demand.js";
import { createCsharpIntegerRangeIndex } from "./records/operations/integer-ranges.js";
import { csharpUnsignedIntegerCounterpart } from "../../target-model/conversions/integer-refinement.js";
import type { CsharpIntegerRangeIndex } from "../../target-model/records/operations/integer-ranges.js";

export interface CsharpNativeTypeServices {
  readonly source: TargetSourceProgram;
  readonly types: CsharpTypeQueries;
  readonly representation: CsharpRepresentationView;
  readonly objectShapes: CsharpObjectShapeRegistry;
  readonly catalog: CsharpProjectTypeCatalog;
  readonly nativeDelegates: CsharpNativeDelegateRegistry;
  projectTypes(): CsharpProjectTypePolicy;
}

export interface CsharpTypeSystemHost {
  readonly source: TargetSourceProgram;
  readonly target: TargetSelection;
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceStorage: SourceStorageQueries;
  readonly objectMethodSources: CsharpObjectMethodSources;
  readonly typeDefinitions: CsharpTypeDefinitionRegistry;
  nativeValue(occurrence: Node, services: CsharpNativeTypeServices): CsharpRepresentationOutcome<TargetTypeRef>;
  nativeShape(carrier: TargetTypeRef, services: CsharpNativeTypeServices): CsharpObjectShapeFact | undefined;
  profileConstructors(declaration: Node): readonly CsharpTargetMember[];
  captureInitialization(declaration: Node): CsharpCaptureInitialization;
}

export interface CsharpTypeSystem {
  readonly integerRanges: CsharpIntegerRangeIndex;
  readonly typeDefinitions: CsharpTypeDefinitions;
  readonly representation: CsharpRepresentationView;
  readonly analysisTypes: CsharpTypeQueries;
  readonly objectShapes: CsharpObjectShapeRegistry;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly sourceRoles: CsharpSourceRoleRegistry;
  readonly nativeDelegates: CsharpNativeDelegateRegistry;
  nativeValue(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef>;
}

export interface CsharpTypeAnalysis extends CsharpTypeSystem {
  readonly nativeConstruction: CsharpNativeConstructionDemandQueries;
}

export function createCsharpTypeAnalysis(host: CsharpTypeSystemHost, catalog: CsharpProjectTypeCatalogBuilder): CsharpTypeAnalysis {
  const integerRanges = createCsharpIntegerRangeIndex();
  let objectShapes: CsharpObjectShapeRegistry | undefined;
  let representation: CsharpRepresentationView | undefined;
  let services: CsharpNativeTypeServices | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const initialized = <Value>(value: Value | undefined, name: string): Value =>
    value ?? failTargetAnalysisInvariant("tsonic-csharp", `${name} was requested before Native type-service assembly completed.`);
  const sourceRoles = createCsharpSourceRoleRegistry(host.providers, host.typeDefinitions);
  const nativeDelegates = createCsharpNativeDelegateRegistry(host.typeDefinitions);
  representation = createCsharpRepresentationView(createCsharpNativeRepresentationHost({
    source: host.source, target: host.target, providers: host.providers, catalog, nativeDelegates,
    representation: () => initialized(representation, "The one representation view"),
    retainShape(shape, site) {
      const retained = initialized(objectShapes, "The Native physical-shape registry").retainShape(shape, site);
      if (retained.kind === "represented") nativeDelegates.inherit(retained.value.targetType, retained.value.implements ?? []);
      return retained;
    },
    retainRoleWitness: sourceRoles.retain,
  }));
  const selected = representation;
  const types = createCsharpTypeQueries(host.source.facts, selected);
  const nativeValue = (occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef> => {
    const value = host.nativeValue(occurrence, initialized(services, "The Native producer queries"));
    if (value.kind !== "represented" || value.value.kind !== "source-primitive" ||
      csharpUnsignedIntegerCounterpart(value.value.name) === undefined) return value;
    const proof = host.source.facts.integers.nonnegative(occurrence);
    if (proof.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: proof });
    integerRanges.retain(occurrence, proof.value);
    return value;
  };
  objectShapes = createCsharpObjectShapePolicy({
    ast: host.source.ast, source: host.source.facts.descriptors, values: host.source.facts.values,
    objects: host.source.facts.objects, sourceStorage: host.sourceStorage, objectMethodSources: host.objectMethodSources,
    representation: () => selected, nativeShape: carrier => host.nativeShape(carrier, initialized(services, "The Native producer queries")),
    nativeValue, captureInitialization: host.captureInitialization,
  });
  services = Object.freeze({ source: host.source, types, representation: selected, objectShapes, catalog, nativeDelegates,
    projectTypes: () => initialized(projectTypes, "The Native project heritage catalog") });
  catalog.complete(selected);
  projectTypes = analyzeCsharpProjectTypePolicy({
    ast: host.source.ast, facts: host.source.facts, types, providers: host.providers, profileConstructors: host.profileConstructors,
  }, catalog);
  const nativeConstruction = createCsharpNativeConstructionDemandQuery({
    source: host.source, representation: selected, objectShapes, physicalValue: nativeValue,
  });
  return Object.freeze({
    typeDefinitions: host.typeDefinitions, representation: selected, analysisTypes: types, objectShapes, projectTypes,
    sourceRoles, nativeDelegates, nativeValue, nativeConstruction, integerRanges: integerRanges.records,
  });
}
