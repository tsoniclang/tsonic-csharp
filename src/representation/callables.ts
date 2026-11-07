// Callable values -> .NET delegates; construct-only values -> the constructed class (or its local factory).
// One call signature only: a delegate has exactly one signature (CSHARP_CALLABLE_OVERLOADS otherwise).
import type { Node } from "@tsonic/tsts";
import type { SourceTypeDescriptorSignature } from "@tsonic/target-api/source";
import type { CsharpObjectShapeMemberFact, CsharpTargetParameter } from "../target-model/types/model.js";
import { csharpDelegateTargetType } from "../target-model/types/carriers/delegates.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../target-model/types/projections.js";
import { isCsharpVoidTargetType } from "../target-model/types/identity.js";
import { targetTypeRefEquals } from "../target-model/types/equality.js";
import { selectCsharpSourceParameterVector } from "../policy/types/callables/parameter-vector.js";
import { selectCsharpClassFactoryType } from "../analysis/project-types/class-factory-types.js";
import { csharpSourceTypeParameter } from "../source/extension/type-parameters.js";
import { csharpRefusal, isCsharpRefusal, representAll, type CsharpRefusal, type CsharpRepresentation,
  type CsharpRepresentationContext, type ShapeDescriptor } from "./context.js";
import type { RepresentDescriptor } from "./sums.js";

export type CsharpMemberTypeParameters = NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>;

/** The C# binders of a generic signature: its own type parameters, then the declaration's generated projections. */
export function representSignatureTypeParameters(signature: SourceTypeDescriptorSignature,
  context: CsharpRepresentationContext): CsharpMemberTypeParameters | CsharpRefusal {
  if (signature.typeParameters.length === 0) return Object.freeze([]);
  const parameters: CsharpMemberTypeParameters[number][] = [];
  for (const declaration of signature.typeParameters) {
    const parameter = csharpSourceTypeParameter(declaration, context.syntax);
    if (parameter === undefined) return csharpRefusal("CSHARP_GENERIC_BINDER",
      "A generic binder has no C# identifier.", declaration);
    const snapshot = context.typeParameters.resolve(parameter);
    if (snapshot.csharpConstraints.kind !== "resolved") return csharpRefusal("CSHARP_GENERIC_CONSTRAINT",
      snapshot.csharpConstraints.reason, declaration);
    parameters.push(Object.freeze({ declaration, identity: parameter.identity, name: parameter.name,
      constraints: Object.freeze([...snapshot.csharpConstraints.constraints]) }));
  }
  const owner = signature.declaration;
  if (owner !== undefined) {
    for (const projection of context.genericProjections(owner)) {
      parameters.push(Object.freeze({ declaration: owner, identity: projection.identity, name: projection.name,
        constraints: projection.csharpProjectionConstraints }));
    }
  }
  if (new Set(parameters.map(parameter => parameter.identity)).size !== parameters.length) return csharpRefusal(
    "CSHARP_GENERIC_BINDER", "Two generic binders of one signature have the same C# identity.", owner ?? context.occurrence);
  return Object.freeze(parameters);
}

/** One call signature as a delegate (Action / Func), with optional and rest parameter metadata. */
export function representSignatureDelegate(signature: SourceTypeDescriptorSignature, context: CsharpRepresentationContext,
  represent: RepresentDescriptor): CsharpRepresentation {
  const parameterTypes = representAll(signature.parameters, parameter => represent(parameter.type));
  if (isCsharpRefusal(parameterTypes)) return parameterTypes;
  const result = represent(signature.result);
  if (isCsharpRefusal(result)) return result;
  const nativeParameters: CsharpTargetParameter[] = [];
  for (const [index, parameter] of signature.parameters.entries()) {
    const selected = parameterTypes[index]!;
    // An optional parameter accepts absence: its C# type is nullable, as in the declared method ABI.
    const type = parameter.kind === "optional" && getCsharpNullableElementTargetType(selected) === undefined &&
      getCsharpGenericOptionalParts(selected) === undefined ? csharpNullableTargetType(selected) : selected;
    const restTuple = parameter.kind === "rest" && parameter.type.kind === "tuple" ? parameter.type : undefined;
    const vector = selectCsharpSourceParameterVector({ name: `argument${index}`, type, passingMode: "by-value",
      ...(parameter.kind === "optional" ? { optional: true } : {}),
      ...(parameter.kind === "rest" ? { paramsArray: true } : {}),
    }, type.kind === "tuple" ? (restTuple?.elements.map(element => ({ elementKind: element.kind })) ??
      type.elements.map(() => ({ elementKind: "required" as const }))) : undefined);
    if (vector === undefined) return csharpRefusal("CSHARP_REST_PARAMETER",
      "A rest tuple parameter has a rest element before its last position.", parameter.declaration ?? context.occurrence);
    nativeParameters.push(...vector);
  }
  const rests = nativeParameters.flatMap((parameter, index) => parameter.paramsArray === true ? [index] : []);
  if (rests.length > 1 || rests[0] !== undefined && rests[0] !== nativeParameters.length - 1) return csharpRefusal(
    "CSHARP_REST_PARAMETER", "A delegate accepts one rest parameter, in the last position.", signature.declaration ?? context.occurrence);
  const returnsVoid = isCsharpVoidTargetType(result);
  const delegate = csharpDelegateTargetType(returnsVoid ? "System.Action" : "System.Func",
    nativeParameters.map(parameter => parameter.type), returnsVoid ? undefined : result, {
      optionalParameterIndexes: nativeParameters.flatMap((parameter, index) => parameter.optional === true ? [index] : []),
      ...(rests[0] === undefined ? {} : { restParameterIndex: rests[0] }),
    });
  if (signature.typeParameters.length === 0) return delegate;
  const typeParameters = representSignatureTypeParameters(signature, context);
  if (isCsharpRefusal(typeParameters)) return typeParameters;
  return context.shapes.resolveCallableValue(delegate, typeParameters) ?? csharpRefusal("CSHARP_GENERIC_CALLABLE_VALUE",
    "A generic function value has no C# carrier for its generic binders.", signature.declaration ?? context.occurrence);
}

/** A construct-only value: the constructed class, a local class factory, or a one-signature factory delegate. */
export function representConstructorValue(constructs: readonly SourceTypeDescriptorSignature[],
  context: CsharpRepresentationContext, represent: RepresentDescriptor): CsharpRepresentation {
  const results = representAll(constructs, signature => represent(signature.result));
  if (isCsharpRefusal(results)) return results;
  const instance = results[0];
  if (instance === undefined || results.some(result => !targetTypeRefEquals(result, instance))) return csharpRefusal(
    "CSHARP_CONSTRUCTOR_VALUE", "A constructor value constructs different .NET types across its signatures.", context.occurrence);
  const owner = context.projectTypes.definitionForTarget(instance);
  if (owner?.abstract === true) return csharpRefusal("CSHARP_CONSTRUCTOR_VALUE",
    "An abstract class has no .NET constructor value.", context.occurrence);
  if (owner?.kind === "class" && owner.local !== true) return instance;
  if (owner?.local === true) return selectCsharpClassFactoryType(context.syntax, context.projectTypes, instance) ??
    csharpRefusal("CSHARP_CONSTRUCTOR_VALUE", "A local class has no .NET factory carrier.", context.occurrence);
  if (constructs.length !== 1) return csharpRefusal("CSHARP_CALLABLE_OVERLOADS",
    "A constructor value with several signatures has no single .NET delegate.", context.occurrence);
  return representSignatureDelegate({ ...constructs[0]!, result: constructs[0]!.result }, context, represent);
}

/**
 * True when every member of a construct-carrying shape is the static side of the one class its construct signatures
 * belong to: a static member of that class or its class prototype (K-2448 #3). Syntax reads only (declaration kinds).
 */
export function isClassStaticSide(descriptor: ShapeDescriptor, context: CsharpRepresentationContext): boolean {
  const { syntax } = context;
  const owners = new Set<Node | undefined>(descriptor.constructs.map(signature => {
    const declaration = signature.declaration;
    if (declaration !== undefined && syntax.is.IsConstructorDeclaration(declaration)) return syntax.parent(declaration);
    if (declaration !== undefined && (syntax.is.IsClassDeclaration(declaration) || syntax.is.IsClassExpression(declaration))) return declaration;
    return declaration === undefined && signature.result.kind === "declared" ? signature.result.declaration : undefined;
  }));
  const owner = owners.size === 1 ? [...owners][0] : undefined;
  if (owner === undefined || !(syntax.is.IsClassDeclaration(owner) || syntax.is.IsClassExpression(owner))) return false;
  return descriptor.members.every(member => member.origin.kind === "class-prototype" ? member.origin.owner === owner
    : member.origin.kind === "declared" && syntax.parent(member.origin.declaration) === owner &&
      syntax.hasModifierKind(member.origin.declaration, "static"));
}
