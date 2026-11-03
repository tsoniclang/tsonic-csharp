import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpSourceBindings, formCsharpSourceTypeBindingEvidence, completeCsharpBoundSourceType,
  type CsharpSourceTypeBindingEvidence } from "./type-bindings.js";
import { nextState } from "./state.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

type SourceArgumentBindings = ReturnType<SourceFileSemantics["types"]["typeArgumentBindings"]>;

export type CsharpSourceTypeArgumentsSource = {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly bindings: SourceArgumentBindings;
} & (
  | { readonly kind: "unchanged" | "invalid" }
  | { readonly kind: "arguments"; readonly bindings: NonNullable<SourceArgumentBindings> }
);

export type CsharpSourceTypeArguments = {
  readonly source: CsharpSourceTypeArgumentsSource;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "unchanged" | "invalid" }
  | { readonly kind: "arguments"; readonly arguments: readonly {
        readonly binding: NonNullable<SourceArgumentBindings>[number];
        readonly state: CsharpTypeResolutionState;
      }[] }
);

interface CsharpSourceArgumentType {
  readonly type: Type;
  readonly binding: CsharpSourceTypeBindingEvidence | undefined;
}

export type CsharpSourceDeclarationArguments = {
  readonly declaration: Node;
  readonly sources: readonly (Type | undefined)[] | undefined;
} & (
  | { readonly kind: "invalid" }
  | { readonly kind: "declaration"; readonly queries: SourceFileSemantics;
      readonly parameters: readonly {
        readonly parameter: Node;
        readonly defaultType: Node | undefined;
        readonly defaultSource: CsharpSourceArgumentType | undefined;
        readonly suppliedSource: CsharpSourceArgumentType | undefined;
      }[] }
);

export interface CsharpSourceDeclarationDefaultDependency {
  readonly parameter: Node;
  readonly node: Node;
  readonly sourceFile: SourceFileSemantics["sourceFile"];
  readonly state: CsharpTypeResolutionState;
}

export function bindCsharpSourceTypeArguments(
  scope: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  return resolveFormedCsharpSourceTypeArguments(scope,
    bindCsharpSourceTypeArgumentsSource(formCsharpSourceTypeArguments(type, queries), state));
}

export function formCsharpSourceTypeArguments(
  type: Type,
  queries: SourceFileSemantics,
): CsharpSourceTypeArgumentsSource {
  const bindings = queries.types.typeArgumentBindings(type);
  if (bindings === undefined || bindings.length === 0) return Object.freeze({ kind: "unchanged", type, queries, bindings });
  if (new Set(bindings.map(binding => binding.declaration)).size !== bindings.length) {
    return Object.freeze({ kind: "invalid", type, queries, bindings });
  }
  return Object.freeze({ kind: "arguments", type, queries, bindings });
}

export function bindCsharpSourceTypeArgumentsSource(
  source: CsharpSourceTypeArgumentsSource,
  state: CsharpTypeResolutionState,
): CsharpSourceTypeArguments {
  if (source.kind !== "arguments") return Object.freeze({ kind: source.kind, source, state });
  return Object.freeze({ kind: "arguments", source, state,
    arguments: Object.freeze(source.bindings.map(binding => Object.freeze({ binding, state: Object.freeze(nextState(state)) }))),
  });
}

export function resolveFormedCsharpSourceTypeArguments(
  scope: Pick<CsharpTypeResolutionScope, "resolveTypeWithState">,
  input: CsharpSourceTypeArguments,
): CsharpTypeResolutionState | undefined {
  if (input.source === undefined || input.source.kind !== input.kind) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Type argument binding requires its exact retained source input.");
  }
  if (input.kind !== "arguments") return input.kind === "unchanged" ? input.state : undefined;
  const { source, state } = input;
  if (source.kind !== "arguments") {
    return failTargetAnalysisInvariant("tsonic-csharp", "Type argument binding requires its checked argument source.");
  }
  const { bindings, queries } = source;
  if (input.arguments.length !== bindings.length || bindings.some((binding, index) => input.arguments[index]?.binding !== binding)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Type argument binding requires every exact checked argument in order.");
  }
  const targets = input.arguments.map(argument => scope.resolveTypeWithState(argument.binding.argumentType, queries.sourceFile, argument.state));
  if (targets.some(target => target === undefined)) return undefined;
  return csharpSourceBindings(bindings.map(binding => binding.declaration),
    bindings.map(binding => binding.argumentType), targets as readonly TargetTypeRef[], state);
}

export function bindCsharpSourceDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
  sources: readonly (Type | undefined)[] | undefined,
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  return resolveFormedCsharpSourceDeclarationArguments(scope,
    formCsharpSourceDeclarationArguments(scope, declaration, sources), typeArguments, state);
}

export function formCsharpSourceDeclarationArguments(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  declaration: Node,
  sources: readonly (Type | undefined)[] | undefined,
): CsharpSourceDeclarationArguments {
  const parameters = scope.host.ast.typeParameters(declaration);
  if (parameters.some(parameter => parameter === undefined) || new Set(parameters).size !== parameters.length) {
    return Object.freeze({ kind: "invalid", declaration, sources });
  }
  const queries = scope.host.semanticsFor(declaration);
  const sourceType = (type: Type | undefined): CsharpSourceArgumentType | undefined => type === undefined ? undefined
    : Object.freeze({ type, binding: formCsharpSourceTypeBindingEvidence(type, queries) });
  return Object.freeze({ kind: "declaration", declaration, sources, queries,
    parameters: Object.freeze((parameters as readonly Node[]).map((parameter, index) => {
      const defaultType = scope.host.ast.as.AsTypeParameterDeclaration(parameter)?.DefaultType;
      const defaultSource = defaultType === undefined ? undefined : queries.types.authoredType(defaultType);
      return Object.freeze({ parameter, defaultType, defaultSource: sourceType(defaultSource),
        suppliedSource: sourceType(sources?.[index]) });
    })),
  });
}

export function* completeCsharpSourceDeclarationArguments(
  input: CsharpSourceDeclarationArguments,
  typeArguments: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): Generator<CsharpSourceDeclarationDefaultDependency, CsharpTypeResolutionState | undefined, TargetTypeRef | undefined> {
  if (input.kind === "invalid" || typeArguments.length > input.parameters.length ||
      input.sources !== undefined && input.sources.length !== typeArguments.length) return undefined;
  for (const [index, parameter] of input.parameters.entries()) {
    const target = typeArguments[index] ?? (parameter.defaultType === undefined ? undefined
      : yield Object.freeze({ parameter: parameter.parameter, node: parameter.defaultType,
        sourceFile: input.queries.sourceFile, state: Object.freeze(nextState(state)) }));
    const suppliedSource = parameter.suppliedSource;
    const defaultSource = parameter.defaultSource;
    const source = (suppliedSource === undefined ? undefined
      : completeCsharpBoundSourceType(suppliedSource.binding, state)?.sourceType ?? suppliedSource.type) ?? (typeArguments[index] === undefined && defaultSource !== undefined
      ? completeCsharpBoundSourceType(defaultSource.binding, state)?.sourceType ?? defaultSource.type : undefined);
    if (target === undefined || source === undefined) return undefined;
    const bound = csharpSourceBindings([parameter.parameter], [source], [target], state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  return state;
}

export function resolveFormedCsharpSourceDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceDeclarationArguments,
  typeArguments: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  const completion = completeCsharpSourceDeclarationArguments(input, typeArguments, state);
  let step = completion.next();
  while (!step.done) {
    const dependency = step.value;
    step = completion.next(scope.resolveNodeWithState(dependency.node, dependency.sourceFile, dependency.state));
  }
  return step.value;
}

export function relateTypeArguments(
  sourceArguments: readonly TargetTypeRef[],
  relations: readonly {
    readonly sourceTypeParameterIndex: number;
    readonly targetTypeParameterIndex: number;
  }[],
  targetArity: number,
): readonly TargetTypeRef[] | undefined {
  if (relations.length !== sourceArguments.length) {
    return undefined;
  }
  const targetArguments: (TargetTypeRef | undefined)[] =
    Array.from({ length: targetArity });
  for (const relation of relations) {
    const source = sourceArguments[relation.sourceTypeParameterIndex];
    if (
      source === undefined ||
      relation.targetTypeParameterIndex < 0 ||
      relation.targetTypeParameterIndex >= targetArity ||
      targetArguments[relation.targetTypeParameterIndex] !== undefined
    ) {
      return undefined;
    }
    targetArguments[relation.targetTypeParameterIndex] = source;
  }
  return targetArguments.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? targetArguments
    : undefined;
}
