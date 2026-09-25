import type { Node, ResolvedSourceCallInfo, SourceFile } from "@tsonic/tsts";
import { asSourceNode } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/nullable.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourceArgumentPassingMode } from "../../policy/operations/members/selection/argument-selection.js";
import { substituteTargetTypeParameters } from "../../policy/types/callables/substitution.js";

export type CsharpUnionCallClassification =
  | { readonly kind: "not-union" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly receiver: Node;
      readonly receiverType: TargetTypeRef;
      readonly resultType: TargetTypeRef;
      readonly parameterTypes: readonly TargetTypeRef[];
      readonly methods: readonly { readonly arm: TargetTypeRef; readonly declaration: Node; readonly targetName: string }[];
    };

export function classifyCsharpUnionCall(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo | undefined,
  sourceFile: SourceFile,
): CsharpUnionCallClassification {
  if (source === undefined || !policy.ast.is.IsPropertyAccessExpression(source.sourceCallee.expression)) return { kind: "not-union" };
  const semantics = policy.semantics(sourceFile);
  const property = semantics.operations.propertyAccess(source.sourceCallee.expression);
  if (property === undefined) return { kind: "not-union" };
  const receiverType = policy.types.resolveSelectedValue(property.receiver.expression, property.receiver.type, sourceFile);
  const arms = getCsharpRuntimeUnionArms(receiverType);
  if (arms === undefined || receiverType === undefined ||
    arms.some(arm => policy.projectTypes.catalog.definitionForTarget(arm)?.kind !== "class")) return { kind: "not-union" };
  const reject = (reason: string): CsharpUnionCallClassification => ({ kind: "rejected", reason });
  if (property.optionalChain ||
    source.sourceArguments.some(argument => csharpSourceArgumentPassingMode(policy.sourceFacts, argument.expression) !== "by-value")) {
    return reject("Closed class-union calls require a present receiver and exact value-argument passing contracts.");
  }
  const selectedProperty = semantics.types.propertyInfos(property.receiver.type).filter(info => info.symbol === property.selectedSymbol);
  const declarations = [...semantics.facts.selectedSubjects(property.selectedSymbol, property.selectedDeclaration),
    ...selectedProperty.flatMap(info => info.rootSymbols.flatMap(symbol => semantics.declarations.symbolDeclarations(symbol)))]
    .flatMap(subject => {
      const node = asSourceNode(subject, policy.ast);
      return node !== undefined && policy.navigation.isProjectDeclaration(node) ? [node] : [];
    });
  const parameterTypes = source.sourceSelectedSignatureParameters.map((_, index) => policy.types.resolveSourceCallParameter(source, index, sourceFile));
  const resultType = policy.types.resolveSourceCallResult(source, sourceFile);
  const typeArguments = policy.types.resolveSourceCallTypeArguments(source, sourceFile);
  if (resultType === undefined || typeArguments === undefined || parameterTypes.some(type => type === undefined)) return reject("Closed class-union call arguments and result require exact target carriers.");
  const methods = arms.map(arm => {
    const owners = new Set<Node>();
    const pending = [arm];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const type = pending.pop()!;
      const key = targetTypeRefKey(type);
      if (visited.has(key)) continue;
      visited.add(key);
      const definition = policy.projectTypes.catalog.definitionForTarget(type);
      if (definition !== undefined) owners.add(definition.declaration);
      pending.push(...(policy.projectTypes.directSupertypes(type) ?? []));
    }
    const candidates = [...new Set(declarations)].filter(declaration => {
      if (policy.ast.kindName(declaration) !== "KindMethodDeclaration" || policy.ast.hasModifierKind(declaration, "static")) return false;
      const owner = policy.projectTypes.catalog.definitionContainingDeclaration(declaration);
      return owner !== undefined && owners.has(owner.declaration);
    });
    if (candidates.length !== 1) return undefined;
    const declaration = candidates[0]!;
    const name = policy.ast.name(declaration);
    const parameters = policy.ast.parameters(declaration);
    if (!policy.ast.is.IsIdentifier(name) || parameters.length !== parameterTypes.length) return undefined;
    const typeParameters = policy.ast.typeParameters(declaration);
    if (typeParameters.length !== typeArguments.length || typeParameters.some(parameter =>
      parameter === undefined || !policy.ast.is.IsIdentifier(policy.ast.name(parameter)))) return undefined;
    const substitutions = new Map(typeParameters.map((parameter, index) =>
      [policy.ast.text(policy.ast.name(parameter)), typeArguments[index]!] as const));
    const instantiate = (member: Node, type: TargetTypeRef | undefined) => {
      if (type === undefined) return undefined;
      const value = policy.projectTypes.instantiateMemberType(member, arm,
        substituteTargetTypeParameters(type, substitutions));
      return value.kind === "resolved" ? value.type : undefined;
    };
    if (parameters.some((parameter, index) => {
      if (parameter === undefined) return true;
      const file = policy.ast.getSourceFile(parameter);
      const contract = source.sourceSelectedSignatureParameters[index];
      const parameterSyntax = policy.ast.as.AsParameterDeclaration(parameter);
      if (contract === undefined || parameterSyntax === undefined ||
        contract.rest !== (parameterSyntax.DotDotDotToken !== undefined) ||
        contract.acceptsOmission && parameterSyntax.Initializer === undefined &&
          policy.ast.questionToken(parameter) === undefined && !contract.rest) return true;
      const expected = parameterTypes[index];
      const actual = file === undefined ? undefined : instantiate(parameter, policy.types.resolveStorage(parameter, file));
      return expected === undefined || actual === undefined || !targetTypeRefEquals(expected, actual);
    })) return undefined;
    const file = policy.ast.getSourceFile(declaration);
    const resultNode = policy.ast.typeNode(declaration);
    const declaredResult = file === undefined ? undefined : resultNode === undefined
      ? policy.types.resolveSelectedResult(declaration, undefined, file)
      : policy.types.resolveNode(resultNode, file);
    const actualResult = instantiate(declaration, declaredResult);
    const resultElement = getCsharpNullableElementTargetType(resultType);
    if (actualResult === undefined || (!targetTypeRefEquals(resultType, actualResult) &&
      (resultElement === undefined || !targetTypeRefEquals(resultElement, actualResult)))) return undefined;
    return Object.freeze({ arm, declaration, targetName: policy.ast.text(name) });
  });
  return methods.some(method => method === undefined) ? reject("Each selected class-union arm must identify one method with the same exact native argument and result contract.") : {
    kind: "resolved", receiver: property.receiver.expression, receiverType, resultType,
    parameterTypes: Object.freeze(parameterTypes as TargetTypeRef[]),
    methods: Object.freeze(methods as NonNullable<typeof methods[number]>[]),
  };
}
