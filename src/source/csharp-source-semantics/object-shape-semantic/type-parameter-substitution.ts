import type {
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeMemberFact,
} from "../../csharp-facts.js";
import {
  getNodeField,
  getNodeList,
  getNodeNameText,
} from "../ast-utils.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import {
  substituteTargetTypeParameters,
} from "../target-types.js";

export function substituteCsharpObjectShapeMemberTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  ownerType: Type,
  ownerTargetType: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
): readonly CsharpObjectShapeMemberFact[] {
  const substitutions = getSemanticTypeParameterSubstitutions(ownerType, ownerTargetType, context);
  if (substitutions.size === 0) {
    return members;
  }
  return members.map((member) => ({
    ...member,
    type: substituteTargetTypeParameters(member.type, substitutions),
  }));
}

function getSemanticTypeParameterSubstitutions(
  ownerType: Type,
  ownerTargetType: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
): ReadonlyMap<string, TargetTypeRef> {
  if (ownerTargetType?.kind !== "target-named" || ownerTargetType.typeArguments === undefined) {
    return new Map();
  }
  const compiler = context.compiler;
  const ast = compiler?.ast;
  if (compiler === undefined || ast === undefined) {
    return new Map();
  }
  const names = getSymbolDeclarations(compiler.checker.getTypeSymbol(ownerType), compiler.checker)
    .flatMap((declaration) => getNodeList(getNodeField(declaration, "TypeParameters")))
    .map(getNodeNameText)
    .filter((name) => name.length > 0);
  if (names.length !== ownerTargetType.typeArguments.length) {
    return new Map();
  }
  return new Map(names.map((name, index) => [name, ownerTargetType.typeArguments![index]!] as const));
}
