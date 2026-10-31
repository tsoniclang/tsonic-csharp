import type { Node, ResolvedSourcePropertyAccessInfo, SourceFile } from "@tsonic/tsts";
import { asSourceNode, sourceCallableValueParameters } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../../policy/model/context.js";
import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { completeCsharpSourceDeclarationCallAdoption } from "./call-results.js";

interface CsharpUnionCallMethod {
  readonly arm: TargetTypeRef;
  readonly declaration: Node;
  readonly signature: CsharpDelegateSignatureShape;
  readonly parameters: readonly Node[] | undefined;
  readonly nativeParameters: readonly (TargetTypeRef | undefined)[] | undefined;
  readonly result: CsharpSourceCallResult;
}

export function selectCsharpUnionCallMethods(
  input: Pick<CsharpPolicyContext, "ast" | "navigation" | "semanticsFor" | "projectTypes" | "typeDefinitions">,
  property: ResolvedSourcePropertyAccessInfo,
  arms: readonly TargetTypeRef[],
  typeArguments: readonly TargetTypeRef[],
  resolveMemberType: (declaration: Node, sourceFile: SourceFile) => TargetTypeRef | undefined,
): { readonly kind: "resolved"; readonly methods: readonly CsharpUnionCallMethod[] }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "incomplete-result"; readonly nativeType: TargetTypeRef; readonly result: CsharpSourceCallResult | undefined } {
  const semantics = input.semanticsFor(property.expression);
  const selectedProperties = semantics.types.propertyInfos(property.receiver.type)
    .filter(info => info.symbol === property.selectedSymbol);
  const declarations = [...new Set([
    ...semantics.facts.selectedSubjects(property.selectedSymbol, property.selectedDeclaration),
    ...selectedProperties.flatMap(info => info.rootSymbols.flatMap(symbol => semantics.declarations.symbolDeclarations(symbol))),
  ].flatMap(subject => {
    const node = asSourceNode(subject, input.ast);
    return node !== undefined && input.navigation.isProjectDeclaration(node) ? [node] : [];
  }))];
  const methods: CsharpUnionCallMethod[] = [];
  for (const arm of arms) {
    const owners = new Set<Node>();
    const pending = [arm];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const type = pending.pop()!;
      const key = targetTypeRefKey(type);
      if (visited.has(key)) continue;
      visited.add(key);
      const definition = input.projectTypes.catalog.definitionForTarget(type);
      if (definition !== undefined) owners.add(definition.declaration);
      pending.push(...(input.projectTypes.directSupertypes(type) ?? []));
    }
    const candidates = declarations.filter(declaration => {
      if (input.ast.kindName(declaration) !== "KindMethodDeclaration" || input.ast.hasModifierKind(declaration, "static")) return false;
      const owner = input.projectTypes.catalog.definitionContainingDeclaration(declaration);
      return owner !== undefined && owners.has(owner.declaration);
    });
    if (candidates.length !== 1) return { kind: "rejected",
      reason: `Class-union candidate cardinality is ${candidates.length}; exactly one method is required.` };
    const declaration = candidates[0]!;
    const file = input.ast.getSourceFile(declaration);
    const signature = file === undefined ? undefined : getCsharpCallableValueSignature(resolveMemberType(declaration, file));
    if (signature === undefined || signature.returnPassing !== undefined) return { kind: "rejected",
      reason: "Class-union incoming native signature, ref mode or parameter arity is not exact." };
    const typeParameters = input.ast.typeParameters(declaration).map(parameter =>
      parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, input.ast));
    if (typeParameters.length !== typeArguments.length || typeParameters.some(parameter => parameter === undefined))
      return { kind: "rejected",
        reason: `Class-union formal type-argument count is ${typeParameters.length}, selected count is ${typeArguments.length}, and every formal must be exact.` };
    const substitutions = new Map(typeParameters.map((parameter, index) =>
      [parameter!.identity, typeArguments[index]!] as const));
    const instantiate = (member: Node, type: TargetTypeRef | undefined): TargetTypeRef | undefined => {
      if (type === undefined) return undefined;
      const selected = input.projectTypes.instantiateMemberType(member, arm,
        substituteTargetTypeParameters(type, substitutions));
      return selected.kind === "resolved" ? selected.type : undefined;
    };
    const actualResult = instantiate(declaration, signature.returnType);
    if (actualResult === undefined) return { kind: "rejected",
      reason: "Class-union result join is missing its exact instantiated native result carrier." };
    const nativeResult: CsharpSourceCallResult = Object.freeze({ nativeType: actualResult, selectedType: actualResult });
    const result = completeCsharpSourceDeclarationCallAdoption(input, declaration, nativeResult);
    if (result === undefined || !targetTypeRefEquals(result.nativeType, actualResult))
      return { kind: "incomplete-result", nativeType: actualResult, result };
    const parameters = sourceCallableValueParameters(input.ast, declaration, input.semanticsFor(declaration));
    const nativeParameters = parameters?.map((parameter, index) => instantiate(parameter, signature.parameters[index]));
    methods.push(Object.freeze({ arm, declaration, signature, parameters,
      nativeParameters: nativeParameters === undefined ? undefined : Object.freeze(nativeParameters), result }));
  }
  return Object.freeze({ kind: "resolved", methods: Object.freeze(methods) });
}
