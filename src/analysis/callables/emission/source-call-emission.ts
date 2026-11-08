import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpSourceCallEmission } from "../../../target-model/records/calls/source-call-emission.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpConstructorBaseCall } from "./constructor-entry.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { selectCsharpTypeEmission } from "../../../policy/types/resolution/type-emission.js";
import { createCsharpSourceCallEmissionRecords } from "../../program/records/calls/source-call-emission.js";
import { csharpCallIsPlannedAsSourceCall } from "../../operations/emitted-expressions.js";
import { forwardSourceRefusal } from "../../source-evidence/representations.js";

export function analyzeCsharpSourceCallEmission(input: {
  readonly source: TargetSourceProgram;
  readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "sourceArgument" | "sourceDefaultValue">;
  readonly admitted: (node: Node) => boolean;
}) {
  const calls = new Map<Node, CsharpSourceCallEmission>();
  const optional = new Map<Node, { readonly optional: boolean; readonly receiver: Node | undefined }>();
  const arrays = new Map<Node, TargetTypeRef>();
  const issues: TargetDiagnostic[] = [];
  const { ast, facts } = input.source;
  const refuse = (node: Node, message: string): void => {
    issues.push({ code: "CSHARP_SOURCE_CALLABLE_ABI_NOT_PROVEN", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const construction = input.operations.selectedConstruction.get(node);
    const classification = input.operations.selectedCall.get(node);
    if (classification?.skippedInvocation === true) {
      if (classification.source === undefined || classification.selectedResultType === undefined) {
        refuse(node, "A skipped invocation requires its original callee and completed Native absence carrier."); continue;
      }
      calls.set(node, Object.freeze({ kind: "skipped", callee: classification.source.callee.occurrence,
        result: classification.selectedResultType }));
      continue;
    }
    const target = classification?.target ?? construction?.target;
    if (target?.kind === "resolved" || target?.kind === "source-owned") {
      const source = target.source;
      let guarded = false;
      if (source.receiver.kind === "value" && source.argumentDisposition === "dynamic") {
        const member = facts.objects.use(source.callee.occurrence);
        if (member.kind === "refused") { issues.push(forwardSourceRefusal(member)); continue; }
        if (!member.value.callCallee || member.value.receiver.occurrence !== source.receiver.occurrence) {
          refuse(node, "An optional Native member call requires the identical published Source receiver use."); continue;
        }
        guarded = member.value.optionalChain;
      }
      optional.set(node, Object.freeze({ receiver: source.receiver.kind === "value" ? source.receiver.occurrence : undefined,
        optional: guarded }));
      if (target.kind === "resolved" && target.call.targetMember.csharpInvocation?.kind === "array-creation") {
        const member = target.call.targetMember;
        const invocation = member.csharpInvocation;
        if (invocation?.kind !== "array-creation" || member.returnType?.kind !== "array" ||
          invocation.lengthParameterIndex !== 0 || target.call.arguments.length !== 1 ||
          target.call.arguments[0]?.targetParameterIndex !== 0 || !selectCsharpTypeEmission({ carrier: member.returnType.element })) {
          refuse(node, "A selected Native array creation requires its exact element carrier and one physical length parameter."); continue;
        }
        arrays.set(node, member.returnType.element);
      }
    }
    if (classification?.target?.kind !== "source-owned" || !csharpCallIsPlannedAsSourceCall(node, input) ||
      csharpCallIsConstructorBaseCall(ast, node)) continue;
    if (classification.unionCall.kind === "rejected") { refuse(node, classification.unionCall.reason); continue; }
    if (classification.unionCall.kind === "resolved") {
      const union = classification.unionCall;
      const grouping = classification.sourceArgumentGrouping;
      const typeArguments = classification.sourceTypeArguments;
      if (grouping?.kind !== "grouped" || typeArguments === undefined || union.methods.length === 0 ||
        !selectCsharpTypeEmission({ carrier: union.receiverType }) || !selectCsharpTypeEmission({ carrier: union.resultType }) ||
        grouping.groups.some(group => !selectCsharpTypeEmission({ carrier: group.type }))) {
        refuse(node, "A Native union dispatcher requires its complete physical receiver, parameter, member and result contracts."); continue;
      }
      calls.set(node, Object.freeze({ kind: "union", union, typeArguments,
        parameters: Object.freeze(grouping.groups.map(group => group.type)), void: isCsharpVoidTargetType(union.resultType) }));
      continue;
    }
    const selected = classification.sourceCall;
    const application = classification.callableApplication;
    const result = classification.sourceResult;
    if (selected === undefined || selected.kind === "rejected" || selected.kind === "union-method" ||
      application === undefined || result === undefined || application.identity !== classification.target.source.identity ||
      application.typeArguments.some(carrier => !selectCsharpTypeEmission({ carrier }))) {
      refuse(node, "A Source-owned call requires its exact associated Native member, complete application and actual completion."); continue;
    }
    calls.set(node, Object.freeze({ kind: "source", callee: selected, result,
      typeArguments: application.typeArguments, member: application.applied, optionalCallee: classification.optionalCallee }));
  }
  return Object.freeze({ records: createCsharpSourceCallEmissionRecords({ calls, optional, arrays }), issues: Object.freeze(issues) });
}

function csharpCallIsConstructorBaseCall(ast: AstReader, call: Node): boolean {
  const statement = ast.parent(call);
  const block = statement === undefined ? undefined : ast.parent(statement);
  const constructor = block === undefined ? undefined : ast.parent(block);
  return constructor !== undefined && ast.is.IsConstructorDeclaration(constructor) &&
    csharpConstructorBaseCall(ast, constructor)?.call === call;
}
