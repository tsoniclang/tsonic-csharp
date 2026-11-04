import type { SourceFile, Type } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import { classifyFormedCsharpSourceCallee, formCsharpSourceCalleeSource,
  type CsharpSourceCalleeSource } from "../../../callables/calls/source-callees.js";
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
import { formCsharpTypeParameterSource, resolveFormedCsharpTypeParameterSource,
  type CsharpTypeParameterSource } from "./source-evidence.js";
import type { CsharpSourceCallableSource } from "../../../program/source-callable-source.js";
import { formCsharpSourceTypeArguments, type CsharpSourceTypeArgumentsSource } from "./generic-arguments.js";
import { formCsharpSourceCallReceiverSource, type CsharpSourceCallReceiverSource } from "./receiver-completions.js";

export type CsharpSourceCallContractSelection =
  | { readonly kind: "declaration"; readonly contract: SourceCallableContract | undefined; readonly closedInput?: true }
  | { readonly kind: "value"; readonly contract: SourceCallableContract }
  | { readonly kind: "rejected" };

export type CsharpSourceCallContractSource = {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly callableSource: CsharpSourceCallableSource;
  readonly checkedTypeParameters: readonly ReturnType<typeof csharpSourceTypeParameter>[] | undefined;
  readonly selectedTypeParameters: readonly CsharpTypeParameterSource[];
  readonly receiverTypeArguments: CsharpSourceTypeArgumentsSource | undefined;
  readonly receiverSource: CsharpSourceCallReceiverSource;
} & (
  | { readonly kind: "direct" }
  | { readonly kind: "callee"; readonly callee: CsharpSourceCalleeSource }
);

export function formCsharpSourceCallContractSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCallContractSource {
  const callableSource = host.representations.sourceCallableSource(source, sourceFile);
  const checked = callableSource.checked.declaration;
  const checkedTypeParameters = checked === undefined ? undefined : Object.freeze(host.ast.typeParameters(checked).map(declaration =>
    declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, host.ast)));
  const selectedTypeParameters = Object.freeze((source.sourceSelectedMethodTypeArguments ?? []).map(argument =>
    formCsharpTypeParameterSource(argument.typeParameter, callableSource.queries, host.ast)));
  const receiver = source.sourceReceiver ?? source.sourceCalleeAccess?.receiver;
  const receiverTypeArguments = receiver === undefined ? undefined : formCsharpSourceTypeArguments(receiver.type, callableSource.queries);
  const receiverSource = formCsharpSourceCallReceiverSource(host, source, callableSource.queries);
  return receiverSource.kind !== "selected"
    ? Object.freeze({ source, sourceFile, callableSource, checkedTypeParameters, selectedTypeParameters, receiverTypeArguments, receiverSource, kind: "direct" })
    : Object.freeze({ source, sourceFile, callableSource, checkedTypeParameters, selectedTypeParameters, receiverTypeArguments, receiverSource,
      kind: "callee", callee: formCsharpSourceCalleeSource(host, source, sourceFile) });
}

export function resolveSourceCallContract(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  selection: "checked" | "implementation",
): CsharpSourceCallContractSelection {
  return resolveFormedSourceCallContract(scope, formCsharpSourceCallContractSource(scope, source, sourceFile), state, selection);
}

export function resolveFormedSourceCallContract(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceCallContractSource,
  state: CsharpTypeResolutionState,
  selection: "checked" | "implementation",
): CsharpSourceCallContractSelection {
  const { host, resolveSelectedValueWithState, resolveReadStorage, sourceCallableTypeParametersMatch } = scope;
  const { source, sourceFile } = input;
  if (input.callableSource.source !== source || input.callableSource.sourceFile !== sourceFile ||
      input.receiverSource === undefined || input.receiverSource.source !== source ||
      input.receiverSource.queries !== input.callableSource.queries ||
      input.receiverSource.selected.receiver !== source.sourceReceiver ||
      input.receiverSource.selected.queries !== input.receiverSource.queries) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Source call contract completion requires its exact retained callable selection.", source.call);
  }
  const direct = (): CsharpSourceCallContractSelection => Object.freeze({ kind: "declaration",
    contract: host.representations.completeSourceCallable(input.callableSource, selection) });
  if (input.kind === "direct") return direct();
  if (input.callee.source !== source || input.callee.sourceFile !== sourceFile) failTargetAnalysisInvariant("tsonic-csharp",
    "Source call contract completion requires its exact retained callee observations.", source.call);
  const callee = classifyFormedCsharpSourceCallee({
    projectTypeCatalog: host.projectTypeCatalog,
    typeDefinitions: host.typeDefinitions,
    types: { resolveReadStorage, resolveSelectedValue: (expression, type, file) =>
      resolveSelectedValueWithState(expression, type, file, nextState(state)) },
  }, input.callee);
  if (callee.kind === "function" || callee.kind === "method" || callee.kind === "union-method") return direct();
  const reject = (): CsharpSourceCallContractSelection => Object.freeze({ kind: "rejected" });
  if (callee.kind === "rejected") return reject();
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const type = checkedValueInvocationCarrier(scope, input,
    getCsharpNullableElementTargetType(callee.type) ?? callee.type, selectedArguments);
  if (type === undefined) return reject();
  const closed = host.representations.closedInputContract(source.sourceCallee.expression);
  if (closed !== undefined) {
    const closedType = csharpCallableValueType(closed);
    return closedType !== undefined && targetTypeRefEquals(closedType, type) &&
      selectedArguments.length === 0 &&
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
  input: CsharpSourceCallContractSource,
  type: TargetTypeRef,
  selected: readonly { readonly typeParameter: Type }[],
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
  const declaration = input.callableSource.checked.declaration;
  if (declaration === undefined) return undefined;
  const parameters = input.checkedTypeParameters;
  if (parameters === undefined || parameters.length !== selected.length) return undefined;
  if (input.selectedTypeParameters.length !== selected.length || selected.some((argument, index) =>
    input.selectedTypeParameters[index]?.type !== argument.typeParameter)) return failTargetAnalysisInvariant("tsonic-csharp",
      "Invocation type parameters require their exact retained checked source arguments.", input.source.call);
  const authored = input.selectedTypeParameters.map((parameterSource, index): NativeQuantifier | undefined => {
    const sourceParameter = parameters[index];
    const parameter = resolveFormedCsharpTypeParameterSource(parameterSource, host.typeParameterConstraints);
    return parameter?.kind === "type-parameter" && parameter.identity === sourceParameter?.identity &&
      parameter.csharpConstraints?.kind === "resolved"
      ? Object.freeze({ ...parameter, csharpConstraints: parameter.csharpConstraints }) : undefined;
  });
  if (authored.some(parameter => parameter === undefined)) return undefined;
  const projections = host.projectTypeCatalog.genericProjections(declaration);
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
      : host.projectTypeCatalog.genericProjections(parameter.declaration).filter(projection => projection.identity === parameter.identity);
    const selected = authored?.identity === parameter.identity ? authored : projections.length === 1 ? projections[0] : undefined;
    return selected === undefined || !Array.isArray(parameter.constraints) ? undefined
      : Object.freeze({ ...selected, csharpConstraints: Object.freeze({ kind: "resolved", constraints: parameter.constraints }) });
  });
  return parameters.some(parameter => parameter === undefined) ? undefined : Object.freeze(parameters as readonly NativeQuantifier[]);
}
