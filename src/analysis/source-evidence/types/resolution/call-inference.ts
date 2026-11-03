import type { Node, SourceFile, Type } from "@tsonic/tsts";
import { Node_Expression, ObjectLiteralProperty_Value, sourceCallableValueParameters } from "@tsonic/target-api/source";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceCallArgumentParameter } from "../../../../policy/types/callables/source-callable-contract.js";
import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";
import { inferCsharpTargetTypeParameterBindings } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { selectCsharpObjectLiteralUnionCarrier, csharpObjectLiteralDestinationDeclarations } from "../../../objects/shapes/union-construction.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export interface CsharpSourceCallInferencePair {
  readonly pattern: TargetTypeRef;
  readonly actual: TargetTypeRef;
  readonly source: {
    readonly kind: "value" | "return";
    readonly expression: Node;
    readonly type: Type | undefined;
    readonly sourceFile: SourceFile;
    readonly queries: SourceFileSemantics;
    readonly state: CsharpTypeResolutionState;
  };
}

export interface CsharpSourceCallInferenceBinding {
  readonly type: TargetTypeRef;
  readonly binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number];
  readonly argument: ResolvedSourceCallInfo["sourceArguments"][number];
  readonly checkedParameter: ResolvedSourceCallInfo["sourceSelectedSignatureParameters"][number] | undefined;
  readonly parameter: CsharpTargetParameter;
  readonly contractedParameter: ReturnType<typeof csharpSourceCallArgumentParameter>;
  readonly pair: CsharpSourceCallInferencePair;
}

export interface CsharpSourceCallInference {
  readonly source: ResolvedSourceCallInfo;
  readonly callable: SourceCallableContract | undefined;
  readonly sourceFile: SourceFile;
  readonly parameterIdentities: ReadonlySet<string>;
  readonly state: CsharpTypeResolutionState;
  readonly excludedSourceArgumentIndexes: ReadonlySet<number> | undefined;
  readonly bindings: ReadonlyMap<string, CsharpSourceCallInferenceBinding>;
}

export function completeCsharpSourceCallInference(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract | undefined,
  sourceFile: SourceFile,
  parameterIdentities: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): CsharpSourceCallInference | undefined {
  const inferred = new Map<string, CsharpSourceCallInferenceBinding>();
  const contextual = (binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number]): boolean => {
    const argument = source.sourceArguments[binding.sourceArgumentIndex]?.expression;
    const parameter = callable === undefined ? undefined
      : csharpSourceCallArgumentParameter(callable, binding.effectiveArgumentIndex)?.targetParameter;
    return parameter !== undefined && getCsharpCallableValueSignature(csharpTargetParameterValueType(parameter, binding.sourceForm)) !== undefined ||
      argument !== undefined && (scope.host.ast.is.IsArrowFunction(argument) || scope.host.ast.is.IsFunctionExpression(argument));
  };
  const bindings = source.sourceArgumentBindings.filter(binding =>
    excludedSourceArgumentIndexes?.has(binding.sourceArgumentIndex) !== true).sort((left, right) =>
    Number(contextual(left)) - Number(contextual(right)));
  for (const binding of bindings) {
    const checkedParameter = source.sourceSelectedSignatureParameters[binding.sourceParameterIndex];
    const contractedParameter = callable === undefined ? undefined
      : csharpSourceCallArgumentParameter(callable, binding.effectiveArgumentIndex);
    let parameter = contractedParameter?.targetParameter;
    if (callable === undefined) {
      const selected = checkedParameter;
      if (selected === undefined) return undefined;
      const authored = selected.authoredTypeNode;
      const file = authored === undefined ? undefined : scope.host.ast.getSourceFile(authored);
      const type = authored === undefined || file === undefined ? undefined
        : scope.resolveNodeWithState(authored, file, nextState(state));
      if (type === undefined) continue;
      parameter = { name: selected.parameterName, type, passingMode: "by-value", paramsArray: selected.rest };
    }
    const argument = source.sourceArguments[binding.sourceArgumentIndex];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const pattern = csharpTargetParameterValueType(
      parameter,
      binding.sourceForm,
    );
    const pairs = sourceArgumentInferencePairs(scope, argument.expression, pattern, sourceFile, state);
    if (pairs === undefined) continue;
    for (const pair of pairs) {
      const candidates = inferCsharpTargetTypeParameterBindings(pair.pattern, pair.actual, parameterIdentities);
      if (candidates === undefined) continue;
      for (const [name, candidate] of candidates) {
        const existing = inferred.get(name);
        if (existing !== undefined && !targetTypeRefEquals(existing.type, candidate)) return undefined;
        inferred.set(name, Object.freeze({ type: candidate, binding, argument, checkedParameter, parameter, contractedParameter, pair }));
      }
    }
  }
  return Object.freeze({ source, callable, sourceFile, parameterIdentities, state, excludedSourceArgumentIndexes, bindings: inferred });
}

function sourceArgumentInferencePairs(
  scope: CsharpTypeResolutionScope,
  literal: Node,
  pattern: TargetTypeRef,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): readonly CsharpSourceCallInferencePair[] | undefined {
  const { host, resolveSelectedValueWithState } = scope;
  const literalValue = host.literalValues.literalValue.get(literal);
  if (literalValue?.number !== undefined || literalValue?.integer !== undefined) return [];
  if (host.ast.is.IsParenthesizedExpression(literal) || host.ast.is.IsSatisfiesExpression(literal)) {
    const inner = Node_Expression(host.ast, literal);
    return inner === undefined ? undefined : sourceArgumentInferencePairs(scope, inner, pattern, sourceFile, nextState(state));
  }
  const expected = getCsharpCallableValueSignature(pattern);
  const inline = host.ast.is.IsArrowFunction(literal) || host.ast.is.IsFunctionExpression(literal);
  if (inline || expected !== undefined) {
    const queries = host.semantics(sourceFile);
    const type = queries.types.expressionType(literal);
    const actual = type === undefined ? undefined : resolveSelectedValueWithState(literal, type, sourceFile, nextState(state));
    const selected = getCsharpCallableValueSignature(actual);
    const parameters = inline ? sourceCallableValueParameters(host.ast, literal, host.semantics(sourceFile)) : undefined;
    if (expected === undefined || selected === undefined || expected.parameters.length !== selected.parameters.length ||
      inline && (parameters === undefined || parameters.some(parameter => parameter === undefined))) return undefined;
    return [{ pattern: expected.returnType, actual: selected.returnType,
      source: Object.freeze({ kind: "return", expression: literal, type, sourceFile, queries, state }) }];
  }
  if (host.ast.is.IsArrayLiteralExpression(literal)) {
    const element = getCsharpArrayLiteralElementTargetType(pattern);
    const pairs: CsharpSourceCallInferencePair[] = [];
    for (const [index, expression] of host.ast.elements(literal).entries()) {
      const selected = pattern.kind === "tuple" ? pattern.elements[index] : element;
      if (expression === undefined || selected === undefined) return undefined;
      const spread = host.ast.is.IsSpreadElement(expression);
      const value = spread ? Node_Expression(host.ast, expression) : expression;
      if (value === undefined || spread && element === undefined) return undefined;
      const children = sourceArgumentInferencePairs(scope, value, spread ? pattern : selected, sourceFile, nextState(state));
      if (children === undefined) return undefined;
      pairs.push(...children);
    }
    return pairs;
  }
  if (!host.ast.is.IsObjectLiteralExpression(literal)) {
    const queries = host.semantics(sourceFile);
    const type = queries.types.expressionType(literal);
    const actual = type === undefined ? undefined : resolveSelectedValueWithState(literal, type, sourceFile, nextState(state));
    return actual === undefined ? undefined : [{ pattern, actual,
      source: Object.freeze({ kind: "value", expression: literal, type, sourceFile, queries, state }) }];
  }
  const elements = host.ast.properties(literal).map(element => {
    if (element === undefined) return undefined;
    const initializer = ObjectLiteralProperty_Value(host.ast, element);
    const evidence = host.semantics(sourceFile).operations.objectLiteralElement(element);
    return initializer === undefined || evidence === undefined ? undefined : { initializer, evidence };
  });
  if (elements.some(element => element === undefined)) return undefined;
  const carrier = selectCsharpObjectLiteralUnionCarrier(pattern, elements.map(element => element!.evidence), host.structuralTypes.resolveTarget,
    (element, candidate) => csharpObjectLiteralDestinationDeclarations(element, candidate, host.semantics(sourceFile)), host.typeDefinitions);
  const shape = host.structuralTypes.resolveTarget(carrier ?? pattern);
  if (shape === undefined) return undefined;
  const pairs: CsharpSourceCallInferencePair[] = [];
  for (const element of elements) {
    const declarations = csharpObjectLiteralDestinationDeclarations(element!.evidence, shape, host.semantics(sourceFile));
    const fields = declarations === undefined ? [] : shape.members.filter(member => member.sourceDeclarations?.some(declaration =>
      declarations.includes(declaration)) === true);
    if (fields.length !== 1) return undefined;
    const children = sourceArgumentInferencePairs(scope, element!.initializer, fields[0]!.type, sourceFile, nextState(state));
    if (children === undefined) return undefined;
    pairs.push(...children);
  }
  return pairs;
}
