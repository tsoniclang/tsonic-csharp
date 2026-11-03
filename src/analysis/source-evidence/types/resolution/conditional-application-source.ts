import type { Node, SourceFile, Type, TypeAliasApplicationInfo } from "@tsonic/tsts";
import { sourceNodeIdentity, sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpProjectedType, type CsharpConditionalTypeProjection } from "../../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpSourceBindings } from "./type-bindings.js";
import { nextState } from "./state.js";
import { formCsharpDirectSourceCapture, bindCsharpDirectSourceCapture, resolveFormedCsharpDirectSourceFacts,
  type CsharpDirectSourceCapture, type CsharpDirectSourceEvidence } from "./direct-source-evidence.js";
import { formCsharpEvidenceNodesCapture, bindCsharpEvidenceNodesCapture, resolveFormedCsharpEvidenceNodesToCommonTarget,
  type CsharpEvidenceNodesCapture, type CsharpEvidenceNodesSource } from "./evidence-node-source.js";

type ConditionalStep = TypeAliasApplicationInfo["conditionalSteps"][number];

type CsharpConditionalBindingSource = { readonly binding: ConditionalStep["bindings"][number]; readonly sourceType: Type } & (
  | { readonly kind: "argument"; readonly index: number; readonly argument: TypeAliasApplicationInfo["bindings"][number] }
  | { readonly kind: "inferred"; readonly direct: CsharpDirectSourceCapture;
      readonly evidence: CsharpEvidenceNodesCapture; readonly numeric: boolean }
);

type CsharpConditionalStepSource = { readonly step: ConditionalStep } & (
  | { readonly kind: "unavailable" }
  | { readonly kind: "deferred"; readonly projection: Omit<CsharpConditionalTypeProjection, "arguments"> }
  | { readonly kind: "selected"; readonly node: Node; readonly type: Type; readonly sourceFile: SourceFile;
      readonly conditional: boolean; readonly bindings: readonly CsharpConditionalBindingSource[] }
);

export interface CsharpConditionalApplicationSource {
  readonly application: TypeAliasApplicationInfo;
  readonly bindings: readonly TypeAliasApplicationInfo["bindings"][number][];
  readonly queries: SourceFileSemantics;
  readonly storageSubject: CsharpTypeResolutionState["sourceStorageSubject"];
  readonly authoredRoot: Node;
  readonly steps: readonly CsharpConditionalStepSource[];
}

export type CsharpConditionalApplicationDependency =
  | { readonly kind: "direct"; readonly source: CsharpDirectSourceEvidence }
  | { readonly kind: "evidence"; readonly source: CsharpEvidenceNodesSource }
  | { readonly kind: "type"; readonly type: Type; readonly sourceFile: SourceFile; readonly state: CsharpTypeResolutionState }
  | { readonly kind: "node"; readonly node: Node; readonly sourceFile: SourceFile; readonly state: CsharpTypeResolutionState }
  | { readonly kind: "projection"; readonly projection: CsharpConditionalTypeProjection };

export interface CsharpCompletedConditionalApplicationDependency {
  readonly kind: CsharpConditionalApplicationDependency["kind"];
  readonly request: CsharpConditionalApplicationDependency;
  readonly type: TargetTypeRef | undefined;
}

type ConditionalCompletion = Generator<CsharpConditionalApplicationDependency,
  TargetTypeRef | undefined, CsharpCompletedConditionalApplicationDependency>;

export function formCsharpConditionalApplicationSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  application: TypeAliasApplicationInfo,
  queries: SourceFileSemantics,
  storageSubject: CsharpTypeResolutionState["sourceStorageSubject"],
  authoredRoot: Node,
): CsharpConditionalApplicationSource {
  const steps: CsharpConditionalStepSource[] = [];
  if (application.kind === "conditional") for (const step of application.conditionalSteps) {
    if (step.branch === "deferred") {
      const declaration = csharpConditionalDeclaration(scope, application);
      if (declaration === undefined || scope.host.ast.typeParameters(declaration).length !== application.bindings.length ||
          application.conditionalSteps.length !== 1) {
        steps.push(Object.freeze({ kind: "unavailable", step }));
      } else {
        const identity = sourceNodeIdentity(scope.host.ast, declaration);
        const sourceName = scope.host.ast.text(scope.host.ast.name(declaration));
        steps.push(identity === undefined || sourceName.length === 0 ? Object.freeze({ kind: "unavailable", step })
          : Object.freeze({ kind: "deferred", step, projection: Object.freeze({ kind: "conditional", declaration, identity, sourceName,
              sourceArguments: Object.freeze(application.bindings.map(binding => binding.argument)) }) }));
      }
      break;
    }
    if (step.selectedNode === undefined || step.selectedType === undefined) {
      steps.push(Object.freeze({ kind: "unavailable", step }));
      break;
    }
    const bindings = step.bindings.map((binding): CsharpConditionalBindingSource => {
      const index = application.bindings.findIndex(candidate => candidate.parameter === binding.applicationParameter);
      if (index >= 0) return Object.freeze({ kind: "argument", binding, index, argument: application.bindings[index]!,
        sourceType: application.bindings[index]!.argument });
      const sourceType = binding.argument;
      return Object.freeze({ kind: "inferred", binding, sourceType,
        direct: formCsharpDirectSourceCapture(scope, queries.facts.typeSubjects(sourceType), queries.sourceFile),
        evidence: formCsharpEvidenceNodesCapture(scope,
          sourceTransformedTypeFactEvidenceNodes(scope.host.ast, queries, authoredRoot, sourceType), sourceType, queries, storageSubject),
        numeric: queries.types.isNumberLike(sourceType) || queries.types.isBigIntLike(sourceType) });
    });
    steps.push(Object.freeze({ kind: "selected", step, node: step.selectedNode, type: step.selectedType,
      sourceFile: scope.host.ast.getSourceFile(step.selectedNode) ?? queries.sourceFile,
      conditional: scope.host.ast.is.IsConditionalTypeNode(step.selectedNode), bindings: Object.freeze(bindings) }));
  }
  return Object.freeze({ application, queries, storageSubject, authoredRoot,
    bindings: Object.freeze([...application.bindings]), steps: Object.freeze(steps) });
}

function* completedChild(request: CsharpConditionalApplicationDependency): ConditionalCompletion {
  const reply = yield request;
  if (reply?.kind !== request.kind || reply.request !== request) return failTargetAnalysisInvariant("tsonic-csharp",
    "Conditional completion requires its exact chosen native dependency.");
  return reply.type;
}

export function* completeCsharpConditionalApplicationSource(
  source: CsharpConditionalApplicationSource,
  arguments_: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): ConditionalCompletion {
  const { application, queries } = source;
  if (application === undefined || source.bindings === undefined || source.steps === undefined ||
      source.storageSubject !== state.sourceStorageSubject || source.bindings.length !== application.bindings.length ||
      application.bindings.some((binding, index) => source.bindings[index] !== binding)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Conditional completion requires its exact retained Source application.", source.authoredRoot);
  }
  if (application.kind !== "conditional" || source.bindings.length !== arguments_.length) return undefined;
  const terminal = source.steps[source.steps.length - 1];
  if (source.steps.length > application.conditionalSteps.length || source.steps.length < application.conditionalSteps.length &&
      terminal?.kind !== "unavailable" && terminal?.kind !== "deferred") {
    return failTargetAnalysisInvariant("tsonic-csharp", "Conditional completion requires every exact retained Source step.", source.authoredRoot);
  }
  for (const [index, selected] of source.steps.entries()) {
    if (selected === undefined || selected.step !== application.conditionalSteps[index] || selected.kind === "selected" &&
        (selected.node !== selected.step.selectedNode || selected.type !== selected.step.selectedType ||
          selected.bindings.length !== selected.step.bindings.length || selected.step.bindings.some((binding, bindingIndex) => {
            const input = selected.bindings[bindingIndex];
            return input?.binding !== binding || (input.kind === "argument"
              ? input.argument !== source.bindings[input.index] || input.argument.parameter !== binding.applicationParameter ||
                input.sourceType !== input.argument.argument
              : input.sourceType !== binding.argument || input.direct.sourceFile !== queries.sourceFile ||
                input.evidence.selectedType !== input.sourceType || input.evidence.queries !== queries ||
                input.evidence.storageSubject !== source.storageSubject);
          }))) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Conditional completion requires every exact retained Source step.", source.authoredRoot);
    }
  }
  const bound = csharpSourceBindings(source.bindings.map(binding => binding.declaration),
    source.bindings.map(binding => binding.argument), arguments_, state);
  if (bound === undefined) return undefined;
  let result: TargetTypeRef | undefined;
  for (const step of source.steps) {
    if (step.kind === "unavailable") return undefined;
    if (step.kind === "deferred") return yield* completedChild(Object.freeze({ kind: "projection",
      projection: Object.freeze({ ...step.projection, arguments: arguments_ }) }));
    const bindings = new Map(bound.sourceBindings);
    for (const input of step.bindings) {
      let targetType = input.kind === "argument" ? arguments_[input.index] : undefined;
      if (input.kind === "inferred") {
        targetType = yield* completedChild(Object.freeze({ kind: "direct",
          source: bindCsharpDirectSourceCapture(input.direct, nextState(bound)) }));
        if (targetType === undefined) targetType = yield* completedChild(Object.freeze({ kind: "evidence",
          source: bindCsharpEvidenceNodesCapture(input.evidence, nextState(bound)) }));
        if (targetType === undefined && !input.numeric) targetType = yield* completedChild(Object.freeze({ kind: "type",
          type: input.sourceType, sourceFile: queries.sourceFile, state: Object.freeze(nextState(bound)) }));
      }
      if (targetType === undefined) return undefined;
      for (const declaration of input.binding.declarations) bindings.set(declaration, { sourceType: input.sourceType, targetType });
    }
    if (step.conditional) continue;
    const selected = yield* completedChild(Object.freeze({ kind: "node", node: step.node, sourceFile: step.sourceFile,
      state: Object.freeze({ ...nextState(bound), sourceBindings: bindings }) }));
    if (selected === undefined || result !== undefined && !targetTypeRefEquals(result, selected)) return undefined;
    result = selected;
  }
  return result;
}

export function resolveFormedCsharpConditionalApplication(
  scope: CsharpTypeResolutionScope,
  source: CsharpConditionalApplicationSource,
  arguments_: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const completion = completeCsharpConditionalApplicationSource(source, arguments_, state);
  let step = completion.next();
  while (!step.done) {
    const request = step.value;
    const type = request.kind === "direct" ? resolveFormedCsharpDirectSourceFacts(scope, request.source)
      : request.kind === "evidence" ? resolveFormedCsharpEvidenceNodesToCommonTarget(scope, request.source)
      : request.kind === "type" ? scope.resolveTypeWithState(request.type, request.sourceFile, request.state)
      : request.kind === "node" ? scope.resolveNodeWithState(request.node, request.sourceFile, request.state)
      : csharpProjectedType(request.projection);
    step = completion.next(Object.freeze({ kind: request.kind, request, type }));
  }
  return step.value;
}

export function csharpConditionalDeclaration(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  application: TypeAliasApplicationInfo,
): Node | undefined {
  const { ast, navigation } = scope.host;
  let body = application.conditionalSteps[0]?.conditional;
  let declaration = body === undefined ? undefined : ast.parent(body);
  while (declaration !== undefined && ast.is.IsParenthesizedTypeNode(declaration)) {
    body = declaration;
    declaration = ast.parent(body);
  }
  return declaration !== undefined && ast.is.IsTypeAliasDeclaration(declaration) &&
    ast.typeNode(declaration) === body && navigation.isProjectDeclaration(declaration)
    ? declaration : undefined;
}
