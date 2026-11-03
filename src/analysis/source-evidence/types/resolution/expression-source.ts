import type { Node } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { formCsharpTargetCallSource } from "../../../operations/members/selected-members.js";
import type { CsharpProviderCallSourceEvidence } from "../../../operations/members/calls/selection.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formCsharpSourceCallResultSource, type CsharpSourceCallResultSource } from "./call-result-source.js";
import { formCsharpSourceCallContractSource, type CsharpSourceCallContractSource } from "./call-contracts.js";

export interface CsharpSourceOwnedConstructionSource {
  readonly contract: CsharpSourceCallContractSource;
  readonly queries: SourceFileSemantics;
  readonly projectDeclaration: boolean;
  readonly resultSource: CsharpSourceCallResultSource | undefined;
}

export type CsharpSelectedExpressionSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "transparent"; readonly expression: Node | undefined }
  | { readonly kind: "call"; readonly isNew: boolean; readonly selection: CsharpProviderCallSourceEvidence;
      readonly contract: CsharpSourceCallContractSource | undefined;
      readonly construction: CsharpSourceOwnedConstructionSource | undefined;
      readonly resultSource: CsharpSourceCallResultSource | undefined }
  | { readonly kind: "other" }
);

export function formCsharpSelectedExpressionSource(
  scope: Pick<CsharpTypeResolutionScope, "host" | "sourceCallSelectedDeclaration">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpSelectedExpressionSource {
  const { host } = scope;
  if (host.ast.is.IsParenthesizedExpression(node) || host.ast.is.IsSatisfiesExpression(node)) {
    const expression = host.ast.is.IsParenthesizedExpression(node)
      ? host.ast.as.AsParenthesizedExpression(node)?.Expression : host.ast.as.AsSatisfiesExpression(node)?.Expression;
    return Object.freeze({ kind: "transparent", node, queries, state, expression });
  }
  if (host.ast.is.IsCallExpression(node) || host.ast.is.IsNewExpression(node)) {
    const isNew = host.ast.is.IsNewExpression(node);
    const selection = formCsharpTargetCallSource(host, {
      call: node, sourceFile: queries.sourceFile, source: queries.operations.call(node),
    });
    const contract = selection.kind === "missing" ? undefined
      : formCsharpSourceCallContractSource(scope, selection.source, queries.sourceFile);
    const resultSource = isNew || contract === undefined ? undefined : formCsharpSourceCallResultSource(scope, contract);
    const construction = !isNew || contract === undefined || selection.kind === "missing" ? undefined
      : formCsharpSourceOwnedConstructionSource(scope, contract, queries, selection.projectDeclaration);
    return Object.freeze({ kind: "call", node, queries, state, isNew, selection, contract, construction, resultSource });
  }
  return Object.freeze({ kind: "other", node, queries, state });
}

export function formCsharpSourceOwnedConstructionSource(
  scope: Pick<CsharpTypeResolutionScope, "sourceCallSelectedDeclaration">,
  contract: CsharpSourceCallContractSource,
  queries: SourceFileSemantics,
  projectDeclaration: boolean,
): CsharpSourceOwnedConstructionSource {
  return Object.freeze({ contract, queries, projectDeclaration,
    resultSource: contract.callableSource.constructorDeclaration !== undefined && projectDeclaration
      ? undefined : formCsharpSourceCallResultSource(scope, contract),
  });
}

export function formCsharpSourceCallConstructionSource(
  scope: Pick<CsharpTypeResolutionScope, "host" | "sourceCallSelectedDeclaration">,
  contract: CsharpSourceCallContractSource,
): CsharpSourceOwnedConstructionSource | undefined {
  if (!scope.host.ast.is.IsNewExpression(contract.source.call)) return undefined;
  const declaration = contract.callableSource.constructorDeclaration;
  const projectDeclaration = declaration !== undefined && scope.host.navigation.isProjectDeclaration(declaration);
  return formCsharpSourceOwnedConstructionSource(scope, contract, contract.callableSource.queries, projectDeclaration);
}
