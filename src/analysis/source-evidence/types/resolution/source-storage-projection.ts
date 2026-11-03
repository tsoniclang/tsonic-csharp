import type { SourceStorageProjection } from "@tsonic/target-api/analysis";
import type { Node } from "@tsonic/tsts";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export interface CsharpSourceStorageContextSource {
  readonly inputSubject: CsharpTypeResolutionState["sourceStorageSubject"];
  readonly subject: CsharpTypeResolutionState["sourceStorageSubject"];
}

export function formCsharpSourceStorageContext(
  host: CsharpTypePolicyBaseHost,
  inputSubject: CsharpTypeResolutionState["sourceStorageSubject"],
  node: Node | undefined,
): CsharpSourceStorageContextSource {
  const selection = inputSubject !== undefined || node === undefined ? undefined
    : host.sourceStorage.storageSubjectFor(node);
  const subject = inputSubject ?? (selection?.kind === "resolved" ? selection.subject : undefined);
  const declaration = subject?.node;
  const typeOnly = declaration !== undefined && (host.ast.is.IsTypeAliasDeclaration(declaration) ||
    host.ast.is.IsInterfaceDeclaration(declaration) || host.ast.is.IsTypeParameterDeclaration(declaration));
  return Object.freeze({ inputSubject, subject: typeOnly ? undefined : subject });
}

export function bindCsharpSourceStorageContext(
  source: CsharpSourceStorageContextSource,
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  if (source.inputSubject !== state.sourceStorageSubject) return failTargetAnalysisInvariant("tsonic-csharp",
    "Storage context binding requires its exact captured source subject.", source.inputSubject?.node);
  return { ...state, sourceStorageSubject: source.subject };
}

export function csharpSourceStorageContext(
  host: CsharpTypePolicyBaseHost,
  state: CsharpTypeResolutionState,
  node?: Node,
): CsharpTypeResolutionState {
  return bindCsharpSourceStorageContext(formCsharpSourceStorageContext(host, state.sourceStorageSubject, node), state);
}

export function csharpSourceStorageComponentContext(
  host: CsharpTypePolicyBaseHost,
  state: CsharpTypeResolutionState,
  component: SourceStorageProjection,
): CsharpTypeResolutionState {
  const subject = state.sourceStorageSubject;
  const selection = subject === undefined ? undefined : host.sourceStorage.subject(
    subject.node, subject.kind, [...subject.projection, component]);
  return { ...state, sourceStorageSubject: selection?.kind === "resolved" ? selection.subject : undefined };
}
