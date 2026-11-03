import type { Node, Type } from "@tsonic/tsts";
import { sourceCallableValueParameters, type SourceCallableTypeEvidence,
  type SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { formCsharpSourceTypeArguments, bindCsharpSourceTypeArgumentsSource,
  resolveFormedCsharpSourceTypeArguments, type CsharpSourceTypeArgumentsSource } from "./generic-arguments.js";
import { formCsharpCallableDeclaration } from "./callable-type-parameters.js";
import { formCsharpCallableSignatureSource } from "./callable-signature-source.js";
import { formCsharpCallableSignatureCapture, bindCsharpCallableSignatureCapture,
  type CsharpCallableSignatureCapture } from "./callable-signature-completion.js";
import { csharpSourceBindings } from "./type-bindings.js";
import { nextState } from "./state.js";

type ContextualSelection = Extract<ReturnType<SourceFileSemantics["types"]["contextualValueSelection"]>,
  { readonly kind: "selected" }>;

export type CsharpContextualParameterSource = {
  readonly declaration: Node;
  readonly queries: SourceFileSemantics;
} & (
  | { readonly kind: "not-applicable" | "unresolved" }
  | { readonly kind: "contextual"; readonly owner: Node; readonly index: number;
      readonly contextual: ContextualSelection; readonly callable: SourceCallableTypeEvidence;
      readonly restBinding: boolean; readonly arguments: CsharpSourceTypeArgumentsSource;
      readonly signature: CsharpCallableSignatureCapture;
      readonly authored: {
        readonly parameters: readonly (Node | undefined)[];
        readonly contextualParameters: readonly (Node | undefined)[];
        readonly sources: readonly (Type | undefined)[];
        readonly targets: readonly ReturnType<typeof csharpSourceTypeParameter>[];
      } | undefined }
);

export type CsharpContextualParameterSelection = { readonly kind: "not-applicable" } |
  { readonly kind: "unresolved" } | { readonly kind: "resolved"; readonly type: TargetTypeRef };

export function formCsharpContextualParameterSource(
  scope: { readonly host: CsharpTypePolicyBaseHost } & Pick<CsharpTypeResolutionScope, "sourceValueDeclarationSyntax">,
  declaration: Node,
  queries: SourceFileSemantics,
): CsharpContextualParameterSource {
  if (!scope.host.ast.is.IsParameterDeclaration(declaration)) return Object.freeze({ kind: "not-applicable", declaration, queries });
  return formCsharpContextualParameterSourceFromSyntax(scope, declaration, queries, scope.sourceValueDeclarationSyntax(declaration));
}

export function formCsharpContextualParameterSourceFromSyntax(
  { host }: { readonly host: CsharpTypePolicyBaseHost },
  declaration: Node,
  queries: SourceFileSemantics,
  syntax: ReturnType<CsharpTypeResolutionScope["sourceValueDeclarationSyntax"]>,
): CsharpContextualParameterSource {
  if (!host.ast.is.IsParameterDeclaration(declaration)) return Object.freeze({ kind: "not-applicable", declaration, queries });
  if (syntax.type !== undefined || syntax.initializer !== undefined) return Object.freeze({ kind: "not-applicable", declaration, queries });
  const owner = host.ast.parent(declaration);
  if (owner === undefined || !host.ast.is.IsArrowFunction(owner) && !host.ast.is.IsFunctionExpression(owner)) {
    return Object.freeze({ kind: "not-applicable", declaration, queries });
  }
  const parameters = sourceCallableValueParameters(host.ast, owner, queries);
  const index = parameters?.indexOf(declaration) ?? -1;
  const contextual = queries.types.contextualValueSelection(owner);
  if (contextual.kind === "ambiguous") return Object.freeze({ kind: "unresolved", declaration, queries });
  if (contextual.kind !== "selected") return Object.freeze({ kind: "not-applicable", declaration, queries });
  const callable = queries.types.callable(contextual.component.selectedType);
  const restBinding = host.ast.as.AsParameterDeclaration(declaration)?.DotDotDotToken !== undefined;
  if (index < 0 || callable === undefined) return Object.freeze({ kind: "not-applicable", declaration, queries });
  const argumentsSource = formCsharpSourceTypeArguments(contextual.component.selectedType, queries);
  const ownParameters = host.ast.typeParameters(owner);
  const authored = ownParameters.length === 0 ? undefined : Object.freeze({
    parameters: ownParameters,
    contextualParameters: callable.result.declaration === undefined ? [] : host.ast.typeParameters(callable.result.declaration),
    sources: Object.freeze(ownParameters.map(parameter => parameter === undefined ? undefined
      : queries.declarations.declaredType(parameter))),
    targets: Object.freeze(ownParameters.map(parameter => parameter === undefined ? undefined
      : csharpSourceTypeParameter(parameter, host.ast))),
  });
  const signature = formCsharpCallableSignatureCapture(host,
    formCsharpCallableSignatureSource(host.ast, callable, queries,
      formCsharpCallableDeclaration(callable.result.declaration, queries.sourceFile, host.ast)));
  return Object.freeze({ kind: "contextual", declaration, queries, owner, index, contextual, callable, restBinding,
    arguments: argumentsSource, authored, signature });
}

export function resolveFormedCsharpContextualParameterCarrier(
  scope: Pick<CsharpTypeResolutionScope, "resolveTypeWithState" | "resolveFormedCallableEvidence">,
  source: CsharpContextualParameterSource,
  state: CsharpTypeResolutionState,
): CsharpContextualParameterSelection {
  if (source.declaration === undefined || source.queries === undefined ||
      source.kind !== "not-applicable" && source.kind !== "unresolved" && source.kind !== "contextual") {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Contextual parameter completion requires its retained Source input.", source.declaration);
  }
  if (source.kind !== "contextual") return { kind: source.kind };
  if (source.arguments === undefined || source.signature === undefined ||
      source.arguments.type !== source.contextual.component.selectedType || source.arguments.queries !== source.queries ||
      source.signature.source.callable !== source.callable || source.signature.source.queries !== source.queries) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Contextual parameter completion requires its exact retained Source selection and signature.", source.declaration);
  }
  let parameterState = resolveFormedCsharpSourceTypeArguments(scope,
    bindCsharpSourceTypeArgumentsSource(source.arguments, nextState(state)));
  const authored = source.authored;
  if (authored !== undefined) {
    if (parameterState === undefined || authored.contextualParameters.length !== authored.parameters.length ||
      authored.contextualParameters.some(parameter => parameter === undefined) ||
      authored.sources.some(type => type === undefined) || authored.targets.some(type => type === undefined)) return { kind: "unresolved" };
    parameterState = csharpSourceBindings(authored.contextualParameters as readonly Node[], authored.sources as readonly Type[],
      authored.targets as readonly TargetTypeRef[], parameterState);
  }
  const { index, restBinding } = source;
  const nativeContract = parameterState === undefined ? undefined : scope.resolveFormedCallableEvidence(
    bindCsharpCallableSignatureCapture(source.signature, parameterState));
  const signature = getCsharpCallableValueSignature(nativeContract);
  const restIndex = signature?.restParameterIndex;
  const nativeParameter = signature?.parameters[restIndex !== undefined && index >= restIndex ? restIndex : index];
  const native = signature === undefined ? undefined : restBinding
    ? restIndex === undefined ? Object.freeze({ kind: "tuple" as const, elements: Object.freeze(signature.parameters.slice(index)) })
      : index === restIndex ? nativeParameter : undefined
    : restIndex !== undefined && index >= restIndex && nativeParameter !== undefined
      ? csharpTargetParameterValueType({ name: "", type: nativeParameter, passingMode: "by-value", paramsArray: true }, "value")
      : nativeParameter;
  return native === undefined ? { kind: "unresolved" } : { kind: "resolved", type: native };
}
