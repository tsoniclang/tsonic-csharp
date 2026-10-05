import type { SourceFile } from "@tsonic/tsts";
import type { CsharpSourceCallContract, CsharpSourceCallParameterContract } from "../callables/source-callable-contract.js";
import { classifyCsharpSourceCallee } from "../callables/source-callees.js";
import { getCsharpCallableValueSignature } from "../../../target-model/types/delegates.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { ResolvedSourceCallInfo, CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export type CsharpSourceCallContractSelection =
  | { readonly kind: "declaration"; readonly contract: CsharpSourceCallContract | undefined }
  | { readonly kind: "value"; readonly contract: CsharpSourceCallContract }
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
    types: { resolveSelectedValue: (expression, type, file) =>
      resolveSelectedValueWithState(expression, type, file, nextState(state)) },
  }, source, sourceFile);
  if (callee.kind === "function" || callee.kind === "method") return direct();
  const reject = (): CsharpSourceCallContractSelection => Object.freeze({ kind: "rejected" });
  if (callee.kind === "rejected") return reject();
  const type = getCsharpNullableElementTargetType(callee.type) ?? callee.type;
  const signature = getCsharpCallableValueSignature(type);
  const declaration = host.semantics(sourceFile).declarations.signatureDeclaration(source.selectedSignature);
  if (signature === undefined ||
      signature.parameters.length !== source.sourceSelectedSignatureParameters.length) return reject();
  const parameters: CsharpSourceCallParameterContract[] = [];
  const optionalParameters = new Set(signature.optionalParameterIndexes ?? []);
  for (const [index, type] of signature.parameters.entries()) {
    const parameter = source.sourceSelectedSignatureParameters[index];
    if (parameter === undefined) return reject();
    parameters.push(Object.freeze({ ...(parameter.parameterDeclaration === undefined ? {} : { sourceParameter: parameter.parameterDeclaration }),
      targetParameter: Object.freeze({ name: parameter.parameterName, type, passingMode: "by-value" as const,
        optional: optionalParameters.has(index),
        paramsArray: signature.restParameterIndex === index }),
    }));
  }
  const contract: CsharpSourceCallContract = Object.freeze({ ...(declaration === undefined ? {} : { sourceDeclaration: declaration }),
    methodTypeParameterIdentities: getCsharpMethodValue(type)?.typeParameters ?? Object.freeze([]),
    parameters: Object.freeze(parameters), returnType: signature.returnType });
  return sourceCallableTypeParametersMatch(source, contract, "value")
    ? Object.freeze({ kind: "value", contract }) : reject();
}
