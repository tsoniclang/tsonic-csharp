import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpElementAdmissionRecords } from "../../target-model/records/element-admission.js";
import type { CsharpArgumentPassingRecords } from "../../target-model/records/argument-passing.js";
import { isCsharpValueTypeTargetType } from "../../policy/types/index.js";

export function admitCsharpLocationRetention(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly storage: CsharpStorageClassifications;
  readonly elements: CsharpElementAdmissionRecords; readonly arguments: CsharpArgumentPassingRecords;
  readonly admitted: (node: Node) => boolean }): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error",
    source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const element = input.elements.selectedElement.get(node)?.emission;
    if (element?.kind === "source-member" && element.writable && !element.static && isCsharpValueTypeTargetType(element.present)) {
      const location = input.storage.nativeLocation.get(element.receiver.expression);
      if (location?.kind !== "resolved" || location.address === undefined) refuse(node,
        "A computed value-member write requires its exact native receiver address.");
    }
    const arguments_ = input.operations.selectedCall.get(node)?.source?.sourceArguments;
    if (arguments_ === undefined) continue;
    let suspends = false;
    for (let index = arguments_.length - 1; index >= 0; index--) {
      const expression = arguments_[index]!.expression;
      const passing = input.arguments.argumentPassing.get(expression);
      if (suspends && passing?.passing !== undefined && passing.location?.opaque === true) refuse(node,
        "An opaque native ref-return address cannot be held across asynchronous suspension.");
      suspends ||= input.source.navigation.expressionEffects(expression).suspends;
    }
  }
  return Object.freeze(issues);
}
