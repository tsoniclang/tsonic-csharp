import type { SourceFile } from "@tsonic/tsts";
import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import { classifyCsharpSourceCallee } from "../../../callables/calls/source-callees.js";
import { selectCsharpSourceCallableValueAbi } from "../../../callables/calls/source-callable-abi.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import { nextState } from "./state.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpMethodValueContractsEqual, csharpMethodValueType, csharpPresentObjectShapeMethod, getCsharpMethodValue } from "../../../../target-model/types/method-values.js";
import { objectShapeMethodInvocationName } from "../../../../target-model/names/object-members.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpCallableValueType } from "../../../../policy/types/callables/value-type.js";
import { rebindCsharpMethodValueTypeParameters, selectCsharpNativeQuantifierArguments } from "../../../../policy/types/callables/method-values.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { csharpTypeProjection } from "../../../../target-model/types/projections.js";
import { resolveTypeParameter } from "./source-evidence.js";

export type CsharpSourceCallContractSelection =
  | { readonly kind: "declaration"; readonly contract: SourceCallableContract | undefined; readonly closedInput?: true }
  | { readonly kind: "value"; readonly contract: SourceCallableContract }
  | { readonly kind: "rejected" };

export function resolveSourceCallContract(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  selection: "checked" | "implementation",
): CsharpSourceCallContractSelection {
  const { host, resolveSelectedValueWithState, sourceCallableTypeParametersMatch } = scope;
  const direct = (): CsharpSourceCallContractSelection => Object.freeze({ kind: "declaration",
    contract: host.representations.sourceCallable(source, sourceFile, selection) });
  if (host.ast.is.IsNewExpression(source.call) || host.ast.kindName(source.sourceCallee.expression) === "KindSuperKeyword") return direct();
  const callee = classifyCsharpSourceCallee({ ast: host.ast, navigation: host.navigation,
    projectTypes: host.projectTypes(),
    typeDefinitions: host.typeDefinitions,
    types: { resolveSelectedValue: (expression, type, file) =>
      resolveSelectedValueWithState(expression, type, file, nextState(state)) },
  }, source, sourceFile);
  if (callee.kind === "function" || callee.kind === "method" || callee.kind === "union-method") return direct();
  const reject = (): CsharpSourceCallContractSelection => Object.freeze({ kind: "rejected" });
  if (callee.kind === "rejected") return reject();
  const type = checkedValueInvocationCarrier(scope, source, sourceFile,
    getCsharpNullableElementTargetType(callee.type) ?? callee.type);
  if (type === undefined) return reject();
  const closed = host.representations.closedInputContract(source.sourceCallee.expression);
  if (closed !== undefined) {
    const closedType = csharpCallableValueType(closed);
    return closedType !== undefined && targetTypeRefEquals(closedType, type) &&
      (source.sourceSelectedMethodTypeArguments?.length ?? 0) === 0 &&
      sourceCallableTypeParametersMatch(source, closed, "declaration")
      ? Object.freeze({ kind: "declaration", contract: closed, closedInput: true }) : reject();
  }
  const contract = selectCsharpSourceCallableValueAbi({ ast: host.ast, navigation: host.navigation,
    semantics: host.semantics(sourceFile), source, carrier: type });
  if (contract === undefined) return reject();
  return sourceCallableTypeParametersMatch(source, contract, "value")
    ? Object.freeze({ kind: "value", contract }) : reject();
}

type NativeQuantifier = Parameters<typeof rebindCsharpMethodValueTypeParameters>[1][number];

function checkedValueInvocationCarrier(
  { host }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  type: TargetTypeRef,
): TargetTypeRef | undefined {
  const value = getCsharpMethodValue(type);
  if (value === undefined || value.typeParameters.length === 0) return type;
  if (value.typeParameters.length !== value.allowsRefLikeTypeArguments.length ||
    new Set(value.typeParameters).size !== value.typeParameters.length) return undefined;
  const protocol = host.structuralTypes.resolveTarget(value.owner);
  if (protocol === undefined || !targetTypeRefEquals(protocol.targetType, value.owner)) return undefined;
  const members = protocol.members.filter(member => member.memberKind === "method" &&
    (member.targetName === value.method || objectShapeMethodInvocationName(member) === value.method));
  const member = members.length === 1 ? csharpPresentObjectShapeMethod(members[0]!) : undefined;
  if (member === undefined) return undefined;
  const native = nativeInvocationQuantifiers(member, host);
  if (native === undefined || native.length !== value.typeParameters.length) return undefined;
  const canonical = csharpMethodValueType(value.owner, value.method, value.identity, member.type,
    native.map(parameter => parameter.identity));
  if (canonical === undefined || !csharpMethodValueContractsEqual(type, canonical)) return undefined;
  const queries = host.semantics(sourceFile);
  const declaration = queries.declarations.signatureDeclaration(source.selectedSignature);
  if (declaration === undefined) return undefined;
  const declarations = host.ast.typeParameters(declaration);
  const selected = source.sourceSelectedMethodTypeArguments ?? [];
  if (declarations.length !== selected.length) return undefined;
  const authored = selected.map((argument, index): NativeQuantifier | undefined => {
    const sourceParameter = declarations[index] === undefined ? undefined
      : csharpSourceTypeParameter(declarations[index]!, host.ast);
    const parameter = resolveTypeParameter(argument.typeParameter, queries, host.ast, host.typeParameterConstraints);
    return parameter?.kind === "type-parameter" && parameter.identity === sourceParameter?.identity &&
      parameter.csharpConstraints?.kind === "resolved"
      ? Object.freeze({ ...parameter, csharpConstraints: parameter.csharpConstraints }) : undefined;
  });
  if (authored.some(parameter => parameter === undefined)) return undefined;
  const projections = host.representations.genericProjections(declaration);
  if (projections.some(parameter => csharpTypeProjection(parameter) === undefined ||
    !Array.isArray(parameter.csharpProjectionConstraints))) return undefined;
  const checked: readonly NativeQuantifier[] = Object.freeze([
    ...authored as readonly NativeQuantifier[],
    ...projections.map(parameter => Object.freeze({ ...parameter, csharpConstraints: Object.freeze({ kind: "resolved" as const,
      constraints: parameter.csharpProjectionConstraints }) })),
  ]);
  const arguments_ = selectCsharpNativeQuantifierArguments(native, checked);
  return arguments_ === undefined ? undefined : rebindCsharpMethodValueTypeParameters(canonical, native, arguments_);
}

function nativeInvocationQuantifiers(
  member: CsharpObjectShapeMemberFact,
  host: CsharpTypeResolutionScope["host"],
): readonly NativeQuantifier[] | undefined {
  const parameters = (member.typeParameters ?? []).map((parameter): NativeQuantifier | undefined => {
    const authored = csharpSourceTypeParameter(parameter.declaration, host.ast);
    const projections = authored?.identity === parameter.identity ? []
      : host.representations.genericProjections(parameter.declaration).filter(projection => projection.identity === parameter.identity);
    const selected = authored?.identity === parameter.identity ? authored : projections.length === 1 ? projections[0] : undefined;
    return selected === undefined || !Array.isArray(parameter.constraints) ? undefined
      : Object.freeze({ ...selected, csharpConstraints: Object.freeze({ kind: "resolved", constraints: parameter.constraints }) });
  });
  return parameters.some(parameter => parameter === undefined) ? undefined : Object.freeze(parameters as readonly NativeQuantifier[]);
}
