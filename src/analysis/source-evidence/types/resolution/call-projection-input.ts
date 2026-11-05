import type { Node } from "@tsonic/tsts";
import type { SourceEffectiveTypeArgument, SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import type { CsharpPublishedProjectionInput } from "./projection-arguments.js";
import type { CsharpTypeResolutionScope } from "./scope.js";

export function sourceCallProjectionInput(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  owner: Node,
  parameterIdentities: readonly string[],
): CsharpPublishedProjectionInput | undefined {
  const { host } = scope;
  const publication = host.effectiveTypes.callInstantiation(source.call);
  if (publication === undefined) return undefined;
  if (publication.call !== source) failTargetAnalysisInvariant("tsonic-csharp",
    "A projected invocation requires its identical Host call instantiation.", source.call);
  const queries = host.semanticsFor(source.call);
  const selectedOwner = queries.declarations.signatureDeclaration(source.selectedSignature);
  const selectedParameters = selectedOwner === undefined ? [] : host.ast.typeParameters(selectedOwner);
  const parameters = host.ast.typeParameters(owner);
  if (parameters.length !== parameterIdentities.length || selectedParameters.length !== parameters.length ||
    publication.method.length !== parameters.length) return undefined;
  const published = new Map<Node, SourceTypeDescriptor>();
  for (const binding of publication.method) {
    if (published.has(binding.declaration)) return undefined;
    published.set(binding.declaration, binding.type);
  }
  const bindings: SourceEffectiveTypeArgument[] = [];
  for (const [index, parameter] of parameters.entries()) {
    const selected = selectedParameters[index];
    const type = selected === undefined ? undefined : published.get(selected);
    if (parameter === undefined || type === undefined ||
      csharpSourceTypeParameter(parameter, host.ast)?.identity !== parameterIdentities[index]) return undefined;
    bindings.push(Object.freeze({ declaration: parameter, type }));
  }
  const definitions: SourceTypeDescriptor[] = publication.result === undefined ? [] : [publication.result];
  const expressions = new Set([source.call, source.sourceCallee.expression,
    ...source.sourceArguments.map(argument => argument.expression),
    ...(source.sourceReceiver === undefined ? [] : [source.sourceReceiver.expression])]);
  for (const expression of expressions) {
    const outcome = host.effectiveTypes.get(expression);
    if (outcome === undefined) continue;
    if (outcome.kind === "refused") return undefined;
    if (outcome.provenance.occurrence !== expression) failTargetAnalysisInvariant("tsonic-csharp",
      "A projected invocation requires its exact published value occurrences.", expression);
    definitions.push(outcome.type);
    if (outcome.construction !== undefined) definitions.push(outcome.construction);
  }
  return Object.freeze({ bindings: Object.freeze(bindings), definitions: Object.freeze(definitions) });
}
