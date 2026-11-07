// `declared` descriptors -> .NET types. A declaration names exactly one of: a generic binder, a source marker
// (pointer, raw pointer, JS string, fixed array, function pointer, native primitive), a profile type, an alias,
// a project type or an external CLR binding. Each is decided from the declaration and its extension facts only.
import { createHash } from "node:crypto";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorStructure, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { providerVirtualDeclarationFactKey, sourceMarkerFactKey, sourcePrimitiveFactKey, type Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../target-model/types/model.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType, getCsharpRuntimeUnionArms } from "../target-model/types/carriers/runtime-carriers.js";
import { csharpJsStringTargetType, csharpSourcePrimitiveTargetType } from "../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../target-model/types/equality.js";
import { csharpSourceUnionTargetType } from "../target-model/types/source-union-definitions.js";
import { csharpSourceTypeParameter } from "../source/extension/type-parameters.js";
import { readCsharpSourceFunctionPointerType, readCsharpSourcePointerType,
  readCsharpSourceStruct, isCsharpSourceRawPointer, readCsharpSourceJsStringMarker } from "../source/extension/markers.js";
import { csharpFixedArrayReference, csharpFixedArrayRefusalCode, csharpFixedArrayRepresentationRejection,
  isCsharpFixedArrayDeclaration } from "../policy/types/collections/fixed-arrays.js";
import { classifyCsharpSourceProfileDeclaration } from "../policy/identities/source-types.js";
import { selectCsharpSourceProfileCarrier } from "../policy/operations/source-profiles/type-carriers.js";
import { csharpTargetTypeFromBinding } from "../policy/types/storage/bindings.js";
import { substituteTargetTypeParameters } from "../policy/types/resolution/substitution.js";
import { csharpProviderBindingFromResolution } from "../providers/model/relation-resolver.js";
import { csharpRefusal, isCsharpRefusal, representAll, type CsharpRecursiveAliasRecord, type CsharpRefusal,
  type CsharpRepresentation, type CsharpRepresentationContext, type DeclaredDescriptor } from "./context.js";
import type { RepresentDescriptor } from "./sums.js";

export function representDeclared(descriptor: DeclaredDescriptor, context: CsharpRepresentationContext,
  represent: RepresentDescriptor): CsharpRepresentation {
  const { declaration } = descriptor;
  const { syntax } = context;
  if (syntax.is.IsTypeParameterDeclaration(declaration)) {
    if (descriptor.typeArguments.length !== 0) failTargetAnalysisInvariant("tsonic-csharp",
      "A generic binder reference carries no type arguments.", declaration);
    const parameter = csharpSourceTypeParameter(declaration, syntax);
    if (parameter === undefined) return csharpRefusal("CSHARP_GENERIC_BINDER", "A generic binder has no C# identifier.", declaration);
    return context.typeParameters.resolve(parameter);
  }
  const marker = representMarker(descriptor, context, represent);
  if (marker !== undefined) return marker;
  const arguments_ = representAll(descriptor.typeArguments, argument => represent(argument));
  if (isCsharpRefusal(arguments_)) return arguments_;
  const profile = classifyCsharpSourceProfileDeclaration(declaration, syntax);
  if (profile !== undefined) return representProfileType(profile, arguments_, context);
  if (syntax.is.IsTypeAliasDeclaration(declaration)) return representAlias(descriptor, arguments_, context, represent);
  const project = context.projectTypes.definitionForDeclaration(declaration);
  if (project !== undefined) {
    const structure = descriptor.definition === undefined ? undefined : sourceTypeDescriptorStructure(descriptor.definition);
    // A project interface that only declares a call signature, an array or a tuple is that structure in .NET.
    if (syntax.is.IsInterfaceDeclaration(declaration) &&
      (structure?.kind === "callable" || structure?.kind === "array" || structure?.kind === "tuple")) return represent(structure);
    return representProjectType(descriptor, arguments_, context);
  }
  return representProviderType(declaration, arguments_, context) ??
    csharpRefusal("CSHARP_DECLARATION_BINDING", `Type '${declarationName(declaration, context)}' has no .NET binding.`, context.occurrence);
}

function declarationName(declaration: Node, context: CsharpRepresentationContext): string {
  const name = context.syntax.name(declaration);
  return name === undefined ? "<anonymous>" : context.syntax.text(name);
}

/** Extension markers on the declaration (pointer, raw pointer, JS string, native primitive, fixed array, ...). */
function representMarker(descriptor: DeclaredDescriptor, context: CsharpRepresentationContext,
  represent: RepresentDescriptor): CsharpRepresentation | undefined {
  const { declaration } = descriptor;
  const facts = context.sourceFacts;
  if (facts === undefined) return undefined;
  const marker = facts.getFact(declaration, sourceMarkerFactKey);
  if (marker?.kind === "type-marker" && marker.marker === "pointer" || readCsharpSourcePointerType(facts, declaration) !== undefined) {
    const pointee = descriptor.typeArguments[0];
    if (descriptor.typeArguments.length !== 1 || pointee === undefined) return csharpRefusal("CSHARP_TYPE_ARGUMENT_ARITY",
      "A typed location takes exactly one pointee type.", context.occurrence);
    const represented = represent(pointee);
    return isCsharpRefusal(represented) ? represented : csharpRuntimeLocationTargetType(represented);
  }
  if (isCsharpSourceRawPointer(facts, declaration)) return descriptor.typeArguments.length === 0
    ? csharpRuntimeRawPointerTargetType()
    : csharpRefusal("CSHARP_TYPE_ARGUMENT_ARITY", "A raw pointer takes no type arguments.", context.occurrence);
  if (readCsharpSourceJsStringMarker(facts, declaration)) return csharpJsStringTargetType();
  const primitive = facts.getFact(declaration, sourcePrimitiveFactKey);
  if (primitive !== undefined) return csharpSourcePrimitiveTargetType(primitive.kind);
  if (isCsharpFixedArrayDeclaration(facts, declaration)) {
    // FixedArray<T, N> is T[]; N is the Host-published extent of this reference (R-C4-1), checked against T[].Length.
    const fixedArray = csharpFixedArrayReference(descriptor, context.occurrence);
    const rejection = csharpFixedArrayRepresentationRejection(fixedArray);
    if (rejection !== undefined) return csharpRefusal(csharpFixedArrayRefusalCode, rejection, context.occurrence);
    const element = represent(fixedArray.element);
    return isCsharpRefusal(element) ? element : Object.freeze({ kind: "array", element });
  }
  const functionPointer = readCsharpSourceFunctionPointerType(facts, declaration);
  if (functionPointer !== undefined) {
    const parameters = representAll(functionPointer.sourceParameters, parameter => represent(authoredTypeDescriptor(parameter, context)));
    if (isCsharpRefusal(parameters)) return parameters;
    const result = represent(authoredTypeDescriptor(functionPointer.sourceResult, context));
    if (isCsharpRefusal(result)) return result;
    return Object.freeze({ kind: "function-pointer", args: parameters, result,
      ...(functionPointer.abi.length === 0 ? {} : { abi: functionPointer.abi }) });
  }
  const struct = readCsharpSourceStruct(facts, declaration);
  if (struct !== undefined) {
    const definition = context.projectTypes.definitionForDeclaration(declaration);
    if (struct.valueType !== true || definition?.kind !== "struct" || definition.declaration !== declaration) return csharpRefusal(
      "CSHARP_STRUCT_DECLARATION", "A struct marker must name its own project struct declaration.", declaration);
    const arguments_ = representAll(descriptor.typeArguments, argument => represent(argument));
    if (isCsharpRefusal(arguments_)) return arguments_;
    // The catalog's .NET type must be the marked declaration's own struct definition (same id), never another type.
    const target = context.projectTypes.targetTypeForDeclaration(declaration, arguments_);
    if (target === undefined) return csharpRefusal("CSHARP_STRUCT_DECLARATION", "The project struct has no .NET type.", declaration);
    return target.kind === "target-named" && target.id === definition.id ? target
      : csharpRefusal("CSHARP_STRUCT_DECLARATION", "A struct marker's .NET type must be its own project struct definition.", declaration);
  }
  return undefined;
}

/** The Host descriptor of an authored type node (marker arguments, constraints). Missing = invariant failure (I4). */
export function authoredTypeDescriptor(typeNode: Node, context: CsharpRepresentationContext): SourceTypeDescriptor {
  const outcome = context.facts.values.type(typeNode);
  if (outcome.kind === "refused") failTargetAnalysisInvariant("tsonic-csharp",
    `An authored type node used by a C# marker was refused by the Host (${outcome.code}).`, typeNode);
  return outcome.type;
}

function representProfileType(profile: NonNullable<ReturnType<typeof classifyCsharpSourceProfileDeclaration>>,
  arguments_: readonly TargetTypeRef[], context: CsharpRepresentationContext): CsharpRepresentation {
  const dictionary = profile.kind === "record" && arguments_.length === 2
    ? csharpProviderBindingFromResolution(context.providers.findTargetBindingByMetadataName("System.Collections.Generic.Dictionary`2", "ordinary"))
    : undefined;
  const dictionaryCarrier = dictionary === undefined ? undefined : csharpTargetTypeFromBinding(dictionary, arguments_);
  const selected = selectCsharpSourceProfileCarrier({ dictionaryCarrier }, profile, arguments_);
  if (selected === undefined) return csharpRefusal("CSHARP_DECLARATION_BINDING",
    `Profile type '${profile.sourceName}' has no .NET carrier for these type arguments.`, context.occurrence);
  if (profile.kind !== "error") return selected;
  const published = context.providers.publishNativeIdentities(selected);
  return published.kind === "resolved" ? published.value
    : csharpRefusal("CSHARP_DECLARATION_BINDING", `Error type '${profile.sourceName}' has no published .NET identity.`, context.occurrence);
}

function representProviderType(declaration: Node, arguments_: readonly TargetTypeRef[],
  context: CsharpRepresentationContext): TargetTypeRef | undefined {
  const fact = context.sourceFacts?.getFact(declaration, providerVirtualDeclarationFactKey);
  if (fact === undefined) return undefined;
  const resolution = context.providers.resolveType(fact);
  if (resolution.kind !== "resolved") return undefined;
  const relations = resolution.relations.filter(relation => relation.kind === "type");
  if (relations.length !== 1) return undefined;
  const relation = relations[0]!;
  const targetArity = relation.targetBinding.typeParameters?.length ?? 0;
  if (relation.bindingTypeParameters.length !== arguments_.length) return undefined;
  const targetArguments: (TargetTypeRef | undefined)[] = Array.from({ length: targetArity });
  for (const binding of relation.bindingTypeParameters) {
    const source = arguments_[binding.sourceTypeParameterIndex];
    if (source === undefined || binding.targetTypeParameterIndex < 0 || binding.targetTypeParameterIndex >= targetArity ||
      targetArguments[binding.targetTypeParameterIndex] !== undefined) return undefined;
    targetArguments[binding.targetTypeParameterIndex] = source;
  }
  if (targetArguments.some(argument => argument === undefined)) return undefined;
  return csharpTargetTypeFromBinding(relation.targetBinding, targetArguments as readonly TargetTypeRef[]);
}

function representProjectType(descriptor: DeclaredDescriptor, arguments_: readonly TargetTypeRef[],
  context: CsharpRepresentationContext): CsharpRepresentation {
  const definition = context.projectTypes.definitionForDeclaration(descriptor.declaration)!;
  const parameters = [...definition.outerTypeParameters, ...definition.typeParameters];
  if (parameters.length !== arguments_.length) return csharpRefusal("CSHARP_TYPE_ARGUMENT_ARITY",
    `Type '${definition.sourceName}' takes ${parameters.length} type arguments; ${arguments_.length} were supplied.`, context.occurrence);
  // Generated binders (optional / collection-key / source-union projections) follow from the arguments by substitution.
  const bindings = new Map<string, TargetTypeRef>();
  for (const [index, parameter] of parameters.entries()) {
    const native = csharpSourceTypeParameter(parameter, context.syntax);
    if (native === undefined) return csharpRefusal("CSHARP_GENERIC_BINDER", "A generic binder has no C# identifier.", parameter);
    bindings.set(native.identity, arguments_[index]!);
  }
  const outer = definition.outerTypeProjections.map(projection => substituteTargetTypeParameters(projection, bindings));
  const own = definition.typeProjections.map(projection => substituteTargetTypeParameters(projection, bindings));
  const outerCount = definition.outerTypeParameters.length;
  return context.projectTypes.targetTypeForDeclaration(descriptor.declaration, [
    ...arguments_.slice(0, outerCount), ...outer, ...arguments_.slice(outerCount), ...own,
  ]) ?? csharpRefusal("CSHARP_DECLARATION_BINDING", `Project type '${definition.sourceName}' has no .NET type.`, context.occurrence);
}

/**
 * A type alias is transparent in .NET: its definition is represented. A project alias that refers to itself
 * through a union becomes one named runtime union (`__TsonicUnion_<hash>`). The union is registered ONCE per alias,
 * over the alias's own binders (its template); every application is that template instantiated with the
 * application's type arguments, and its own represented arms must equal the instantiated template arms. The result
 * therefore does not depend on which application is represented first.
 */
function representAlias(descriptor: DeclaredDescriptor, arguments_: readonly TargetTypeRef[],
  context: CsharpRepresentationContext, represent: RepresentDescriptor): CsharpRepresentation {
  const { declaration } = descriptor;
  if (descriptor.cut === "unexpressible") return csharpRefusal("CSHARP_DECLARATION_UNEXPRESSIBLE",
    `Type alias '${declarationName(declaration, context)}' comes from a declaration file whose structure .NET needs and the Source model cannot express.`,
    context.occurrence);
  const identity = context.facts.navigation.identity.identity(declaration);
  if (descriptor.cut === "recursion") {
    const active = context.recursiveAliases.get(aliasApplicationKey(identity, arguments_));
    if (active === undefined || !active.building) failTargetAnalysisInvariant("tsonic-csharp",
      "A recursion cut must occur inside the definition of the same alias application.", context.occurrence);
    active.recursive = true;
    return active.reference;
  }
  if (descriptor.definition === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A type alias reference without a cut must carry its definition.", context.occurrence);
  return representAliasApplication(declaration, identity, arguments_, descriptor.definition, context, represent);
}

/** Nested applications of one alias being built at once; a deeper nesting is polymorphic recursion (`T<V> = … T<V[]>`). */
const aliasApplicationNestingBound = 16;

function aliasApplicationKey(identity: string, arguments_: readonly TargetTypeRef[]): string {
  return JSON.stringify([identity, arguments_.map(targetTypeRefKey)]);
}

function aliasUnionName(identity: string): string {
  return `__TsonicUnion_${createHash("sha256").update(identity).digest("hex")}`;
}

function representAliasApplication(declaration: Node, identity: string, arguments_: readonly TargetTypeRef[],
  definition: SourceTypeDescriptor, context: CsharpRepresentationContext, represent: RepresentDescriptor): CsharpRepresentation {
  const key = aliasApplicationKey(identity, arguments_);
  const active = context.recursiveAliases.get(key);
  if (active !== undefined) {
    if (active.building) {
      active.recursive = true;
      return active.reference;
    }
    if (active.result !== undefined) return active.result;
  }
  let nesting = 0;
  for (const record of context.recursiveAliases.values()) if (record.identity === identity && record.building) nesting += 1;
  if (nesting >= aliasApplicationNestingBound) return csharpRefusal("CSHARP_RECURSIVE_STRUCTURE",
    `Type alias '${declarationName(declaration, context)}' applies itself to new type arguments inside its own definition; one .NET union per alias needs a fixed argument list.`,
    context.occurrence);
  const carrier = csharpSourceUnionTargetType(identity, aliasUnionName(identity), arguments_);
  const absent = sourceTypeDescriptorStructure(definition).kind === "optional";
  const record: CsharpRecursiveAliasRecord = { identity, carrier, reference: absent ? csharpNullableTargetType(carrier) : carrier,
    building: true, recursive: false };
  context.recursiveAliases.set(key, record);
  try {
    const result = represent(definition);
    record.result = isCsharpRefusal(result) || !record.recursive ? result
      : registerRecursiveAlias(declaration, identity, record, result, context, represent);
    return record.result;
  } finally {
    record.building = false;
  }
}

/** Registers the alias template over its own binders (once), then proves this application is an instance of it. */
function registerRecursiveAlias(declaration: Node, identity: string, record: CsharpRecursiveAliasRecord,
  result: TargetTypeRef, context: CsharpRepresentationContext, represent: RepresentDescriptor): CsharpRepresentation {
  const arms = getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(result) ?? result, context.typeDefinitions);
  if (arms === undefined) return csharpRefusal("CSHARP_RECURSIVE_STRUCTURE",
    `Type alias '${declarationName(declaration, context)}' refers to itself outside a union; .NET needs a named type for the cycle.`,
    context.occurrence);
  const binders = aliasBinders(declaration, context);
  if (isCsharpRefusal(binders)) return binders;
  const application = record.carrier.typeArguments ?? [];
  const ownBinders = application.length === binders.length &&
    application.every((argument, index) => targetTypeRefKey(argument) === targetTypeRefKey(binders[index]!));
  if (!ownBinders) {
    const template = csharpSourceUnionTargetType(identity, aliasUnionName(identity), binders);
    if (context.typeDefinitions.sourceUnionArms(template) === undefined) {
      const body = context.syntax.as.AsTypeAliasDeclaration(declaration)?.Type;
      if (body === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A type alias declaration has no authored body.", declaration);
      const templateResult = representAliasApplication(declaration, identity, binders, authoredTypeDescriptor(body, context), context, represent);
      if (isCsharpRefusal(templateResult)) return templateResult;
    }
  }
  // An existing template (this view's or a sealed registry's) is compared, never rewritten.
  const registered = context.typeDefinitions.sourceUnionArms(record.carrier);
  const consistent = registered !== undefined
    ? registered.length === arms.length && registered.every((arm, index) => targetTypeRefEquals(arm, arms[index]!))
    : context.typeDefinitions.registerSourceUnion({ carrier: record.carrier, arms });
  return consistent ? record.reference : csharpRefusal("CSHARP_RECURSIVE_STRUCTURE",
    `Type alias '${declarationName(declaration, context)}' does not instantiate its own recursive union (${arms.length} arms over its type parameters); .NET registers one generic union per alias.`,
    context.occurrence);
}

/** The alias's own binders as C# generic parameters, in authored order. */
function aliasBinders(declaration: Node, context: CsharpRepresentationContext): readonly TargetTypeRef[] | CsharpRefusal {
  const binders: TargetTypeRef[] = [];
  for (const binder of context.syntax.typeParameters(declaration)) {
    const parameter = binder === undefined ? undefined : csharpSourceTypeParameter(binder, context.syntax);
    if (parameter === undefined) return csharpRefusal("CSHARP_GENERIC_BINDER", "A generic binder has no C# identifier.", binder ?? declaration);
    binders.push(context.typeParameters.resolve(parameter));
  }
  return Object.freeze(binders);
}
