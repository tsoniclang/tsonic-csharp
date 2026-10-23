import type { SourceFile } from "@tsonic/tsts";
import type { CsharpSourceCallableContract } from "../../../../target-model/records/source-callable-contract.js";
import { classifyCsharpSourceCallee } from "../../../callables/source-callees.js";
import { selectCsharpSourceCallableValueAbi } from "../../../callables/source-callable-abi.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/source-calls.js";
import { nextState } from "./state.js";

export type CsharpSourceCallContractSelection =
  | { readonly kind: "declaration"; readonly contract: CsharpSourceCallableContract | undefined }
  | { readonly kind: "value"; readonly contract: CsharpSourceCallableContract }
  | { readonly kind: "rejected" };

export function resolveSourceCallContract(
  { host, resolveSelectedValueWithState, sourceCallableTypeParametersMatch }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  selection: "checked" | "implementation",
): CsharpSourceCallContractSelection {
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
  const type = getCsharpNullableElementTargetType(callee.type) ?? callee.type;
  const contract = selectCsharpSourceCallableValueAbi({ ast: host.ast, navigation: host.navigation,
    semantics: host.semantics(sourceFile), source, carrier: type });
  if (contract === undefined) return reject();
  return sourceCallableTypeParametersMatch(source, contract, "value")
    ? Object.freeze({ kind: "value", contract }) : reject();
}
