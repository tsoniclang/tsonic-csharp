import type { SourceStorageProjection } from "@tsonic/target-api/analysis";
import type { Node } from "@tsonic/tsts";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { nextState } from "./state.js";

export function resolveCsharpClosedSourceStorageCarrier(
  scope: CsharpTypeResolutionScope,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const subject = state.sourceStorageSubject;
  if (subject === undefined) return undefined;
  const origins = scope.host.sourceStorage.closedOriginsFor(subject);
  if (origins.kind !== "complete" || origins.origins.length === 0) return undefined;
  let carrier: TargetTypeRef | undefined;
  for (const origin of origins.origins) {
    const queries = scope.host.semantics(origin.sourceFile);
    if (origin.subject.kind !== "value" || queries.types.isAny(origin.type) || queries.types.isUnknown(origin.type)) return undefined;
    const selected = scope.resolveTypeWithState(origin.type, origin.sourceFile,
      nextState({ ...state, sourceStorageSubject: origin.subject }));
    if (selected === undefined || carrier !== undefined && !targetTypeRefEquals(carrier, selected)) return undefined;
    carrier = selected;
  }
  return carrier;
}

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
