import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import type { Node } from "@tsonic/tsts";
import { admitCsharpConversionSelection } from "../conversions/validation.js";

export function csharpOperationConversionIssue(
  node: Node, conversion: CsharpConversionSelection | undefined, code: string,
): CsharpOperationIssue | undefined {
  return conversion?.kind === "rejected" || conversion?.kind === "ambiguous"
    ? Object.freeze({ node, code: conversion.kind === "rejected" ? conversion.code ?? code : code, message: conversion.reason }) : undefined;
}

export function csharpSelectedCallConversionIssue(
  policy: CsharpPolicyContext,
  selection: CsharpTargetCallSelection | undefined,
): CsharpOperationIssue | undefined {
  if (selection?.kind !== "resolved") return undefined;
  const issue = (conversion: CsharpConversionSelection): CsharpOperationIssue | undefined =>
    csharpOperationConversionIssue(selection.source.call, conversion, "CSHARP_CALL_ARGUMENT_CONVERSION_NOT_PROVEN");
  if (selection.call.origin === "provider") for (const mapping of selection.call.argumentMappings) {
    if (mapping.kind !== "by-value") continue;
    const rejected = issue(admitCsharpConversionSelection(policy, mapping.sourceType, mapping.targetType, mapping.conversion));
    if (rejected !== undefined) return rejected;
  }
  for (const sequence of selection.call.sequenceArguments ?? []) for (const element of sequence.elements) {
    const rejected = issue(admitCsharpConversionSelection(policy, element.type, sequence.targetElementType, element.conversion));
    if (rejected !== undefined) return rejected;
  }
  return undefined;
}
