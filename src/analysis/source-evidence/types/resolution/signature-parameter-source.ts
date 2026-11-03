import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { formCsharpSourceTypeComponentCapture, bindCsharpSourceTypeComponentCapture,
  type CsharpSourceTypeComponentCapture, type CsharpSourceTypeComponentSource } from "./type-component-source.js";
import { formCsharpContextualParameterSource, type CsharpContextualParameterSource } from "./contextual-parameter-source.js";
import { formCsharpNativeParameterSource, type CsharpNativeParameterSource } from "./native-parameter-source.js";
import { sourceValueDeclarationSyntax } from "./calls.js";

export interface CsharpSignatureParameterCapture {
  readonly parameter: SourceCallableTypeEvidence["parameters"][number];
  readonly queries: SourceFileSemantics;
  readonly use: "callable" | "parameter-list";
  readonly subject: CsharpTypeResolutionState["sourceStorageSubject"];
  readonly contextual: CsharpContextualParameterSource | undefined;
  readonly component: CsharpSourceTypeComponentCapture;
  readonly nativeParameter: CsharpNativeParameterSource | undefined;
}

export interface CsharpSignatureParameterInput {
  readonly capture: CsharpSignatureParameterCapture;
  readonly state: CsharpTypeResolutionState;
  readonly componentState: CsharpTypeResolutionState;
  readonly component: CsharpSourceTypeComponentSource;
}

export function formCsharpSignatureParameterCapture(
  host: CsharpTypePolicyBaseHost,
  parameter: SourceCallableTypeEvidence["parameters"][number],
  queries: SourceFileSemantics,
  use: "callable" | "parameter-list",
  incomingSubject: CsharpTypeResolutionState["sourceStorageSubject"],
): CsharpSignatureParameterCapture {
  const declaration = parameter.declaration;
  const entry = declaration === undefined ? undefined : host.sourceStorage.subject(declaration, "input");
  const subject = entry?.kind === "resolved" ? entry.subject : undefined;
  const authoredTypeNode = declaration === undefined ? undefined : host.ast.typeNode(declaration);
  const contextual = declaration === undefined || use !== "callable" || authoredTypeNode !== undefined
    ? undefined : formCsharpContextualParameterSource({ host,
        sourceValueDeclarationSyntax: node => sourceValueDeclarationSyntax({ host }, node) }, declaration, queries);
  const component = formCsharpSourceTypeComponentCapture({ host }, {
    selectedType: parameter.type,
    ...(declaration === undefined ? {} : { declaration,
      ...(authoredTypeNode === undefined ? {} : { authoredTypeNode }) }),
  }, queries, use === "callable" ? subject : incomingSubject);
  const owner = use !== "callable" || declaration === undefined ? undefined : host.ast.parent(declaration);
  const nativeParameter = owner === undefined || host.ast.body(owner) === undefined ? undefined
    : formCsharpNativeParameterSource(host.ast, declaration!);
  return Object.freeze({ parameter, queries, use, subject, contextual, component, nativeParameter });
}

export function bindCsharpSignatureParameterCapture(
  capture: CsharpSignatureParameterCapture,
  state: CsharpTypeResolutionState,
): CsharpSignatureParameterInput {
  const componentState = capture.use === "callable" ? Object.freeze({ ...state, sourceStorageSubject: capture.subject }) : state;
  return Object.freeze({ capture, state, componentState,
    component: bindCsharpSourceTypeComponentCapture(capture.component, componentState) });
}
