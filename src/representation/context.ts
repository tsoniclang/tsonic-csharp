// Representation services and context (nextgen plan §2, C-2542). The services are the only inputs of the one
// descriptor -> TargetTypeRef mapping (I6): Host facts, the authored-syntax reader (declaration kinds and names only),
// extension markers, and the C# target catalogs. No checker Type / Signature / Symbol is reachable from here (I2).
import type { AstReader, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceTypeDescriptor, SourceTypeFlowRefusal } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../target-model/types/model.js";
import type { CsharpProjectTypeCatalog } from "../target-model/records/types/project-types.js";
import type { CsharpObjectMethodSources } from "../target-model/records/native/native-value-carriers.js";
import type { CsharpCaptureInitialization } from "../target-model/types/model.js";
import type { CsharpTypeParameterEnvironment } from "../target-model/records/types/type-parameter-constraints.js";
import type { CsharpProviderRelationResolver } from "../providers/model/relation-resolver.js";
import type { CsharpProjectedType } from "../target-model/types/projections.js";
import type { CsharpSourceUnionDefinition, CsharpTypeDefinitions } from "../target-model/types/source-union-definitions.js";
import type { SourcePublishedPlatformFacts } from "@tsonic/target-api/source";
import type { CsharpRefusal, CsharpRepresentation, CsharpRepresentationPosition } from "../target-model/types/representation.js";

export type { CsharpRefusal, CsharpRepresentation, CsharpRepresentationPosition } from "../target-model/types/representation.js";


/** Platform facts the mapping needs. The native integer premise is the Host-published fact (facts.analyses.platform, E24, N5). */
export interface CsharpPlatformBridge {
  readonly nativeInteger: SourcePublishedPlatformFacts;
  readonly targetFramework: string;
}

/** Which source profile the program uses: plain native, or the JS profile with its runtime library. */
export type CsharpRepresentationProfile = "native" | "js";

/** Node-keyed entries also forward the Host refusal unchanged. */
export type CsharpValueRepresentation = TargetTypeRef | CsharpRefusal | SourceTypeFlowRefusal;


/** The generated structural-shape registry (BF16 canonical shapes). */
export interface CsharpRepresentationShapeRegistry {
  retainShape(shape: CsharpObjectShapeFact, occurrence: Node | undefined): CsharpObjectShapeFact | undefined;
  resolveCallableValue(signature: TargetTypeRef,
    typeParameters: NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>): TargetTypeRef | undefined;
}

/** Inputs of createCsharpRepresentationServices; built once per program view by the C# program setup. */
export interface CsharpRepresentationInputs {
  readonly facts: SourceProgramFacts;
  readonly platform: CsharpPlatformBridge;
  readonly profile: CsharpRepresentationProfile;
  readonly syntax: AstReader;
  readonly sourceFacts: ReadonlySourceFactResolver | undefined;
  readonly providers: CsharpProviderRelationResolver;
  /** Project declarations (classes, interfaces, structs, enums) as generated .NET types. */
  readonly projectTypes: CsharpProjectTypeCatalog;
  /** Native memory bindings: a member bound to a native field (source-core memory binding facts). */
  readonly memoryBindings: { hasBoundField(declarations: readonly Node[]): boolean };
  /** Object-literal method sources and their captured bindings (generated method implementations). */
  readonly objectMethodSources: CsharpObjectMethodSources;
  /** Whether a captured binding is initialized when the capture is taken (navigation fact, read by D). */
  captureInitialization(declaration: Node): CsharpCaptureInitialization;
  readonly shapes: CsharpRepresentationShapeRegistry;
  /** The program's type definitions and the writer of recursive-alias source unions (analysis supplies its writer). */
  readonly typeDefinitions: CsharpTypeDefinitions & { registerSourceUnion(definition: CsharpSourceUnionDefinition): boolean };
  /** Extra generated binders of a generic declaration (optional / collection-key / source-union projections). */
  genericProjections(declaration: Node): readonly CsharpProjectedType[];
}

/** One recursive project union alias application being represented (named `__TsonicUnion_<hash>` carrier). */
export interface CsharpRecursiveAliasRecord {
  /** The alias declaration identity (one template per identity, over the alias's own binders). */
  readonly identity: string;
  readonly carrier: CsharpTargetNamedTypeRef;
  readonly reference: TargetTypeRef;
  building: boolean;
  recursive: boolean;
  /** The Source type arguments of this application (undefined for the template over the alias's own binders). */
  readonly sourceArguments: readonly SourceTypeDescriptor[] | undefined;
  result?: CsharpRepresentation;
}

export interface CsharpRepresentationServices extends CsharpRepresentationInputs {
  /** Type parameter constraints, from the Host descriptors of authored constraints. */
  readonly typeParameters: CsharpTypeParameterEnvironment;
  /** Per-program-view state of recursive alias applications, keyed by alias identity and argument keys. */
  readonly recursiveAliases: Map<string, CsharpRecursiveAliasRecord>;
}

/** The context of one representation call. Extends the services (CHANGED from the Step-0 entry; see AGENT-C1-NOTES §1). */
export interface CsharpRepresentationContext extends CsharpRepresentationServices {
  /** The occurrence being represented; refusal site and key for per-use facts. */
  readonly occurrence: Node;
  /** Storage (fields, locals, parameters), a value-only use, a generic argument or a return. */
  readonly position: CsharpRepresentationPosition;
}

/**
 * The one context-extension path (R-F1-3). A context always extends the services object itself: a caller that passes a
 * context (`representSlot` at values.ts, `withRepresentationPosition`) extends that context's services, never the
 * frozen context, so no inherited read-only `occurrence`/`position` is assigned and prototype chains do not grow.
 */
export function csharpRepresentationContext(
  services: CsharpRepresentationServices,
  occurrence: Node,
  position: CsharpRepresentationContext["position"] = "value",
): CsharpRepresentationContext {
  return Object.freeze(Object.assign(Object.create(representationServicesOf(services)) as CsharpRepresentationServices,
    { occurrence, position })) as CsharpRepresentationContext;
}

function representationServicesOf(services: CsharpRepresentationServices): CsharpRepresentationServices {
  let current = services;
  while (Object.prototype.hasOwnProperty.call(current, "occurrence")) current = Object.getPrototypeOf(current) as CsharpRepresentationServices;
  return current;
}

export function withRepresentationPosition(context: CsharpRepresentationContext,
  position: CsharpRepresentationContext["position"]): CsharpRepresentationContext {
  return context.position === position ? context : csharpRepresentationContext(context, context.occurrence, position);
}

export function csharpRefusal(code: `CSHARP_${string}`, message: string, site: Node): CsharpRefusal {
  return Object.freeze({ kind: "csharp-refused", code, message, site });
}

export function isCsharpRefusal(value: unknown): value is CsharpRefusal {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "csharp-refused";
}

export function isSourceRefusal(value: unknown): value is SourceTypeFlowRefusal {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "refused";
}

/** True for a represented .NET type: neither a CSHARP_ refusal nor a forwarded Host refusal. */
export function isCsharpRepresented(value: CsharpValueRepresentation | undefined): value is TargetTypeRef {
  return value !== undefined && !isCsharpRefusal(value) && !isSourceRefusal(value);
}

/** Represents every item or returns the first refusal (order preserved). */
export function representAll<T>(items: readonly T[], represent: (item: T, index: number) => CsharpRepresentation):
  readonly TargetTypeRef[] | CsharpRefusal {
  const represented: TargetTypeRef[] = [];
  for (const [index, item] of items.entries()) {
    const selected = represent(item, index);
    if (isCsharpRefusal(selected)) return selected;
    represented.push(selected);
  }
  return Object.freeze(represented);
}

export type DeclaredDescriptor = Extract<SourceTypeDescriptor, { readonly kind: "declared" }>;
export type ShapeDescriptor = Extract<SourceTypeDescriptor, { readonly kind: "shape" }>;
export type CallableDescriptor = Extract<SourceTypeDescriptor, { readonly kind: "callable" }>;
