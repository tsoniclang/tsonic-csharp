import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { CsharpValueReadClassifications, CsharpConversionClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage/storage.js";
import type { CsharpExactLiteralSelectionIndex } from "../../../target-model/conversions/exact-literals.js";
import type { CsharpCallableParameterEmission, CsharpParameterDefaultEmission, CsharpLambdaParameterEntry } from "../../../target-model/records/calls/parameter-emission.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpParameterDefaultIsLiteral } from "../../../policy/types/callables/parameter-default-literals.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import { createCsharpCallableParameterRecords } from "../../program/records/calls/parameter-emission.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../../program/records/objects/required-records.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpTypeEmission } from "../../../policy/types/resolution/type-emission.js";
import type { CsharpCallableContractIndex } from "../../../target-model/records/callables/callable-values.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../../policy/types/callables/source-callable-contract.js";

export function analyzeCsharpCallableParameterEmission(input: {
  readonly ast: AstReader;
  readonly callables: CsharpCallableContractIndex;
  readonly nodes: readonly Node[];
  readonly declarations: CsharpDeclarationClassifications;
  readonly values: CsharpValueReadClassifications;
  readonly storage: CsharpStorageClassifications;
  readonly conversions: CsharpConversionClassifications;
  readonly literals: SourceLiteralIndex;
  readonly exact: CsharpExactLiteralSelectionIndex;
  readonly admitted: (owner: Node) => boolean;
  readonly required: CsharpRequiredRecord[];
}) {
  const values = new Map<Node, CsharpCallableParameterEmission>();
  const lambdaEntries = new Map<Node, CsharpLambdaParameterEntry>();
  const issues: TargetDiagnostic[] = [];
  const owners = new Set(input.nodes.filter(node => input.ast.is.IsParameterDeclaration(node)).map(node => input.ast.parent(node)));
  const refuse = (node: Node, message: string): void => {
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  for (const owner of owners) {
    if (owner === undefined || !input.admitted(owner)) continue;
    if (!isCsharpSourceCallableArtifactDeclaration(input.ast, owner) &&
      !input.ast.is.IsGetAccessorDeclaration(owner) && !input.ast.is.IsSetAccessorDeclaration(owner)) continue;
    const contract = input.callables.get({ kind: "declaration", declaration: owner });
    if (contract === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted callable requires its checked source value parameters.", owner);
    let hasDefault = false;
    for (const node of contract.parameters) {
      const parameter = input.ast.as.AsParameterDeclaration(node);
      if (parameter?.name === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted callable parameter requires its exact checked binding.", node);
      // Captured local functions are also planned as lambdas without a native incoming delegate parameter type, so they
      // select identity or default entries; arrow and function expressions and object-literal methods (against their
      // member delegate) carry one.
      const native = input.storage.lambdaParameterType.get(node);
      const runtime = input.declarations.runtimeDefault.get(node);
      const target = native === undefined ? undefined : input.storage.requiredStorageType.get(node);
      const passthrough = runtime?.passthrough === true &&
        (native === undefined || targetTypeRefEquals(native, runtime.native.source));
      if (runtime !== undefined && runtime.kind !== "present" && !passthrough) {
        if (native !== undefined && !targetTypeRefEquals(native, runtime.native.source))
          failTargetAnalysisInvariant("tsonic-csharp", "A lambda default requires its exact native incoming parameter contract.", node);
        lambdaEntries.set(node, Object.freeze({ kind: "default", declareIncoming: native === undefined }));
      } else if (native === undefined) lambdaEntries.set(node, Object.freeze({ kind: "identity" }));
      else {
        if (target === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# lambda parameter storage requires its sealed native and source representations.", node);
        if (targetTypeRefEquals(native, target)) lambdaEntries.set(node, Object.freeze({ kind: "identity" }));
        else {
          if (!selectCsharpTypeEmission({ carrier: target })) { refuse(node, "The sealed lambda parameter storage type has no C# syntax representation."); continue; }
          const conversion = input.conversions.conversion.get(native, target, "implicit");
          if (conversion === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted native lambda parameter requires its exact source storage conversion.", node);
          lambdaEntries.set(node, Object.freeze({ kind: "conversion", source: native, target, conversion }));
        }
      }
      const carrier = input.storage.requiredStorageType.get(node) ?? input.values.valueRead.get(node)?.value;
      if (carrier === undefined) continue;
      const binding = input.ast.is.IsIdentifier(parameter.name) ? "identifier"
        : input.ast.is.IsObjectBindingPattern(parameter.name) || input.ast.is.IsArrayBindingPattern(parameter.name) ? "pattern" : undefined;
      if (binding === undefined) {
        refuse(parameter.name, "Parameter name is outside the current C# planning surface.");
        continue;
      }
      const rest = parameter.DotDotDotToken !== undefined;
      const nativeParameters = contract.nativeParameters.filter(parameter => parameter.sourceParameter === node)
        .map(parameter => parameter.targetParameter);
      const incoming: CsharpCallableParameterEmission["incoming"] = rest && carrier.kind === "tuple"
        ? Object.freeze({ kind: "tuple", parameters: Object.freeze(nativeParameters) })
        : Object.freeze({ kind: "single", rest });
      if (incoming.kind === "tuple" && (carrier.kind !== "tuple" || incoming.parameters.length !== carrier.elements.length ||
          incoming.parameters.some(parameter => parameter.paramsArray === true))) {
        refuse(node, "C# tuple-rest parameters require one finite native argument vector.");
        continue;
      }
      const requiredIncoming = incoming.kind === "tuple"
        ? incoming.parameters.some(parameter => parameter.optional !== true)
        : !rest;
      let defaultValue: CsharpParameterDefaultEmission = Object.freeze({ kind: "none" });
      if (runtime !== undefined) hasDefault ||= runtime.acceptsOmission;
      else {
        const initializer = parameter.Initializer;
        if (initializer === undefined && input.ast.questionToken(node) !== undefined) defaultValue = Object.freeze({
          kind: getCsharpNullableElementTargetType(carrier) === undefined ? "default" : "null",
        });
        else if (initializer !== undefined) {
          if (csharpParameterDefaultIsLiteral({ source: input.literals.literalValue.get(initializer), exact: input.exact.exactLiteral.get(initializer, carrier),
            carrier, nullLiteral: input.ast.kindName(initializer) === "KindNullKeyword" })) defaultValue = Object.freeze({ kind: "literal", expression: initializer });
          else refuse(initializer, "C# parameter defaults require compile-time literal values.");
        }
        if (defaultValue.kind !== "none") {
          hasDefault = true;
          if (binding === "pattern") refuse(parameter.name, "Destructured parameter defaults require target object-shape lowering before C# emission.");
        } else if (hasDefault && requiredIncoming) refuse(node, "Required parameters cannot follow C# optional parameters.");
      }
      values.set(node, Object.freeze({ kind: "parameter", carrier, binding, incoming, default: defaultValue }));
      requireCsharpRecord(input.required, { family: "callableParameter", subject: node, construct: "native callable parameter", producer: "analyzeCsharpCallableParameterEmission" });
    }
  }
  return Object.freeze({ records: createCsharpCallableParameterRecords(values, lambdaEntries), issues: Object.freeze(issues) });
}
