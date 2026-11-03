import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableSignatureSource, CsharpCallableTypeSource,
  CsharpTypeParameterConstraintSource } from "../../../../target-model/records/types/callable-source.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpDelegateTargetType } from "../../../../target-model/types/carriers/delegates.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/identity.js";
import { selectCsharpSourceParameterVector } from "../../../../policy/types/callables/parameter-vector.js";
import { completeCsharpCallableDeclaration,
  type CsharpCompletedCallableConstraint, type CsharpCompletedCallableDeclaration } from "./callable-type-parameters.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { formCsharpSourceTypeComponentCapture, bindCsharpSourceTypeComponentCapture,
  type CsharpSourceTypeComponentCapture, type CsharpSourceTypeComponentSource } from "./type-component-source.js";
import { formCsharpSignatureParameterCapture, bindCsharpSignatureParameterCapture,
  type CsharpSignatureParameterCapture, type CsharpSignatureParameterInput } from "./signature-parameter-source.js";

export interface CsharpCallableSignatureCapture {
  readonly source: CsharpCallableSignatureSource;
  readonly parameters: readonly CsharpSignatureParameterCapture[];
  readonly returnSubject: CsharpTypeResolutionState["sourceStorageSubject"];
  readonly result: CsharpSourceTypeComponentCapture;
}

export interface CsharpCallableSignatureInput {
  readonly capture: CsharpCallableSignatureCapture;
  readonly source: CsharpCallableSignatureSource;
  readonly state: CsharpTypeResolutionState;
  readonly parameters: readonly CsharpSignatureParameterInput[];
  readonly returnState: CsharpTypeResolutionState;
  readonly resultSource: CsharpSourceTypeComponentSource;
}

export type CsharpCallableTypeInput = {
  readonly source: CsharpCallableTypeSource;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-callable" }
  | { readonly kind: "callable"; readonly signature: CsharpCallableSignatureInput }
);

export type CsharpCallableSignatureRequest = {
  readonly input: CsharpCallableSignatureInput;
} & (
  | { readonly kind: "parameter"; readonly parameter: CsharpCallableSignatureSource["parameters"][number];
      readonly source: CsharpSignatureParameterInput }
  | { readonly kind: "result"; readonly source: CsharpSourceTypeComponentSource }
  | { readonly kind: "constraint"; readonly source: CsharpTypeParameterConstraintSource }
);

export type CsharpCompletedCallableSignatureRequest = {
  readonly request: CsharpCallableSignatureRequest;
} & (
  | { readonly kind: "parameter"; readonly type: TargetTypeRef | undefined }
  | { readonly kind: "result"; readonly type: TargetTypeRef | undefined }
  | { readonly kind: "constraint"; readonly resolution: CsharpTypeParameterConstraintResolution }
);

export interface CsharpCompletedCallableSignature {
  readonly input: CsharpCallableSignatureInput;
  readonly source: CsharpCallableSignatureSource;
  readonly state: CsharpTypeResolutionState;
  readonly signature: TargetTypeRef;
  readonly declaration: CsharpCompletedCallableDeclaration;
  readonly parameters: readonly Extract<CsharpCompletedCallableSignatureRequest, { readonly kind: "parameter" }>[];
  readonly result: Extract<CsharpCompletedCallableSignatureRequest, { readonly kind: "result" }>;
  readonly constraints: readonly Extract<CsharpCompletedCallableSignatureRequest, { readonly kind: "constraint" }>[];
}

export function formCsharpCallableSignatureInput(
  host: CsharpTypePolicyBaseHost,
  source: CsharpCallableSignatureSource,
  state: CsharpTypeResolutionState,
): CsharpCallableSignatureInput {
  return bindCsharpCallableSignatureCapture(formCsharpCallableSignatureCapture(host, source), state);
}

export function formCsharpCallableSignatureCapture(
  host: CsharpTypePolicyBaseHost,
  source: CsharpCallableSignatureSource,
): CsharpCallableSignatureCapture {
  const returned = source.callable.result.declaration === undefined ? undefined
    : host.sourceStorage.subject(source.callable.result.declaration, "return");
  const returnSubject = returned?.kind === "resolved" ? returned.subject : undefined;
  return Object.freeze({ source, returnSubject,
    parameters: Object.freeze(source.parameters.map(parameter =>
      formCsharpSignatureParameterCapture(host, parameter.parameter, source.queries, "callable", undefined))),
    result: formCsharpSourceTypeComponentCapture({ host }, source.callable.result, source.queries, returnSubject),
  });
}

export function bindCsharpCallableSignatureCapture(
  capture: CsharpCallableSignatureCapture,
  state: CsharpTypeResolutionState,
): CsharpCallableSignatureInput {
  const { source, returnSubject } = capture;
  if (capture.result.component !== source.callable.result || capture.result.queries !== source.queries ||
      capture.result.storage.inputSubject !== returnSubject) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Signature binding requires its exact captured return input.", source.callable.result.declaration);
  }
  if (capture.parameters === undefined || capture.parameters.length !== source.parameters.length ||
      source.parameters.some((parameter, index) => capture.parameters[index]?.parameter !== parameter.parameter ||
        capture.parameters[index]?.queries !== source.queries || capture.parameters[index]?.use !== "callable")) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Signature binding requires its exact ordered parameter captures.", source.callable.result.declaration);
  }
  const returnState = Object.freeze({ ...state,
    sourceStorageSubject: returnSubject });
  return Object.freeze({ capture, source, state, returnState,
    parameters: Object.freeze(capture.parameters.map(parameter => bindCsharpSignatureParameterCapture(parameter, state))),
    resultSource: bindCsharpSourceTypeComponentCapture(capture.result, returnState),
  });
}

export function formCsharpCallableTypeInput(
  host: CsharpTypePolicyBaseHost,
  source: CsharpCallableTypeSource,
  state: CsharpTypeResolutionState,
): CsharpCallableTypeInput {
  return source.kind === "not-callable" ? Object.freeze({ kind: "not-callable", source, state })
    : Object.freeze({ kind: "callable", source, state,
        signature: formCsharpCallableSignatureInput(host, source.signature, state) });
}

export function* completeCsharpCallableSignatureSource(
  input: CsharpCallableSignatureInput,
): Generator<CsharpCallableSignatureRequest, CsharpCompletedCallableSignature | undefined,
  CsharpCompletedCallableSignatureRequest> {
  const source = input.source;
  if (source === undefined || input.capture === undefined || input.capture.source !== source ||
      input.capture.returnSubject !== input.returnState.sourceStorageSubject || input.resultSource === undefined ||
      input.resultSource.capture !== input.capture.result || input.resultSource.component !== source.callable.result ||
      input.resultSource.queries !== source.queries || input.resultSource.inputState !== input.returnState) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable signature completion requires its exact retained return Source.", source?.callable.result.declaration);
  }
  if (input.capture.parameters === undefined || input.capture.parameters.length !== source.parameters.length ||
      input.parameters === undefined || input.parameters.length !== source.parameters.length ||
      source.parameters.some((parameter, index) => input.parameters[index]?.capture !== input.capture.parameters[index] ||
        input.parameters[index]?.capture.parameter !== parameter.parameter || input.parameters[index]?.state !== input.state)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable signature completion requires its exact ordered parameter Source.", source.callable.result.declaration);
  }
  const parameters: CsharpTargetParameter[] = [];
  const completedParameters: Extract<CsharpCompletedCallableSignatureRequest, { readonly kind: "parameter" }>[] = [];
  for (const [index, parameter] of source.parameters.entries()) {
    const request = Object.freeze({ kind: "parameter" as const, input, parameter, source: input.parameters[index]! });
    const completed = yield request;
    if (completed.request !== request || completed.kind !== "parameter") return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable signature completion requires its exact ordered parameter dependency.", source.callable.result.declaration);
    if (completed.type === undefined) return undefined;
    const selected = parameter.parameter;
    const rest = selected.parameterKind === "rest";
    const vector = selectCsharpSourceParameterVector({ name: `parameter${parameter.index}`, type: completed.type, passingMode: "by-value",
      ...(selected.acceptsOmission && !rest ? { optional: true } : {}),
      ...(rest ? { paramsArray: true } : {}),
    }, rest && completed.type.kind === "tuple" ? parameter.tupleElements : undefined);
    if (vector === undefined) return undefined;
    parameters.push(...vector);
    completedParameters.push(completed);
  }
  const resultRequest = Object.freeze({ kind: "result" as const, input, source: input.resultSource });
  const result = yield resultRequest;
  if (result.request !== resultRequest || result.kind !== "result") return failTargetAnalysisInvariant("tsonic-csharp",
    "Callable signature completion requires its exact return dependency.", source.callable.result.declaration);
  if (result.type === undefined) return undefined;
  const optionalParameterIndexes = parameters.flatMap((parameter, index) =>
    parameter.optional === true && parameter.paramsArray !== true ? [index] : []);
  const restParameterIndexes = parameters.flatMap((parameter, index) => parameter.paramsArray === true ? [index] : []);
  if (restParameterIndexes.length > 1 || restParameterIndexes[0] !== undefined &&
      restParameterIndexes[0] !== parameters.length - 1) return undefined;
  const delegateOptions = {
    ...(optionalParameterIndexes.length === 0 ? {} : { optionalParameterIndexes }),
    ...(restParameterIndexes[0] === undefined ? {} : { restParameterIndex: restParameterIndexes[0] }),
  };
  const parameterTypes = parameters.map(parameter => parameter.type);
  const signature = isCsharpVoidTargetType(result.type)
    ? csharpDelegateTargetType("System.Action", parameterTypes, undefined, delegateOptions)
    : csharpDelegateTargetType("System.Func", parameterTypes, result.type, delegateOptions);
  const declaration = source.declaration;
  if (declaration === undefined) return undefined;
  const constraints: CsharpCompletedCallableConstraint[] = [];
  const completedConstraints: Extract<CsharpCompletedCallableSignatureRequest, { readonly kind: "constraint" }>[] = [];
  for (const parameter of declaration.typeParameters) {
    const request = Object.freeze({ kind: "constraint" as const, input, source: parameter.constraint });
    const completed = yield request;
    if (completed.request !== request || completed.kind !== "constraint") return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable signature completion requires its exact authored constraint dependency.", declaration.declaration);
    constraints.push(Object.freeze({ source: parameter.constraint, resolution: completed.resolution }));
    completedConstraints.push(completed);
  }
  const completedDeclaration = completeCsharpCallableDeclaration(declaration, constraints);
  if (completedDeclaration === undefined) return undefined;
  return Object.freeze({ input, source, state: input.state, signature, declaration: completedDeclaration,
    parameters: Object.freeze(completedParameters), result, constraints: Object.freeze(completedConstraints) });
}
