import type { SourceStorageProjection } from "@tsonic/target-api/analysis";
import type { Node } from "@tsonic/tsts";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";

export function csharpSourceStorageContext(
  host: CsharpTypePolicyBaseHost,
  state: CsharpTypeResolutionState,
  node?: Node,
): CsharpTypeResolutionState {
  const selection = state.sourceStorageSubject !== undefined || node === undefined ? undefined
    : host.sourceStorage.storageSubjectFor(node);
  const subject = state.sourceStorageSubject ?? (selection?.kind === "resolved" ? selection.subject : undefined);
  const declaration = subject?.node;
  const typeOnly = declaration !== undefined && (host.ast.is.IsTypeAliasDeclaration(declaration) ||
    host.ast.is.IsInterfaceDeclaration(declaration) || host.ast.is.IsTypeParameterDeclaration(declaration));
  return { ...state, sourceStorageSubject: typeOnly ? undefined : subject };
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
