import type { AstReader } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpCaptureMethodEmission } from "../../target-model/records/capture-methods.js";
import { getCsharpExpressionTreeDelegateType, isCsharpVoidTargetType } from "../../target-model/types/index.js";
import { objectShapeArtifactKey } from "../../target-model/records/object-shape-keys.js";
import { selectCsharpObjectLiteralCallable } from "../../policy/types/objects/object-literals.js";
import { createCsharpCaptureMethodRecords } from "../program/records/capture-methods.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import { csharpMethodValueContractsEqual, csharpMethodValueType, getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { objectShapeMethodInvocationName } from "../../target-model/names/object-members.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";

export function analyzeCsharpCaptureMethods(ast: AstReader, captures: CsharpCaptureStorage, shapes: CsharpObjectShapeClassifications,
  callables: Pick<CsharpCallableContractIndex, "get">) {
  const values = new Map<string, readonly CsharpCaptureMethodEmission[]>();
  const issues: TargetDiagnostic[] = [];
  for (const frame of captures.frames) {
    const methods: CsharpCaptureMethodEmission[] = [];
    for (const method of frame.methods) {
      const selected = selectCsharpObjectLiteralCallable({ carrier: method.type, storage: method.type, receiver: undefined });
      if (selected.kind === "rejected" || ast.getSourceFile(method.declaration) === undefined) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: method.declaration,
          message: "A native captured method requires its sealed callable signature." }); continue;
      }
      const body = callables.get({ kind: "declaration", declaration: method.declaration });
      if (body === undefined || body.kind !== "source" || body.sourceDeclaration !== method.declaration) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: method.declaration,
          message: "A native captured method requires its actual admitted source body contract." }); continue;
      }
      if (selected.signature.returnPassing !== undefined ||
        selected.signature.parameterPassingModes.some((mode, index) =>
          mode !== (body.nativeParameters[index]?.targetParameter.passingMode ?? "by-value")) ||
        body.nativeParameters.some((parameter, index) =>
          parameter.targetParameter.passingMode !== (selected.signature.parameterPassingModes[index] ?? "by-value"))) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: method.declaration,
          message: "A by-reference native delegate binding requires an exact native method group or delegate value; the source body has a different native passing contract." });
        continue;
      }
      const quotation = getCsharpExpressionTreeDelegateType(method.type) !== undefined;
      const value = getCsharpMethodValue(method.type);
      const protocolMethods: CsharpCaptureMethodEmission["protocolMethods"][number][] = [];
      if (value !== undefined) {
        const protocol = shapes.resolveTarget(value.owner);
        const candidates = protocol?.members.filter(member => member.memberKind === "method" &&
          objectShapeMethodInvocationName(member) === value.method);
        const candidate = candidates?.length === 1 ? candidates[0] : undefined;
        const canonical = candidate === undefined ? undefined : csharpMethodValueType(value.owner, value.method, value.identity,
          candidate.type, (candidate.typeParameters ?? []).map(parameter => parameter.identity));
        if (candidate === undefined || canonical === undefined || !csharpMethodValueContractsEqual(method.type, canonical)) {
          issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: method.declaration,
            message: "A captured generic method requires its complete native source and immutable-body invocation contract." });
          continue;
        }
        protocolMethods.push(Object.freeze({ interface: value.owner, name: candidate.targetName }));
      }
      methods.push(Object.freeze({ method, form: ast.is.IsFunctionDeclaration(method.declaration) ? "declaration"
        : ast.is.IsArrowFunction(method.declaration) ? "arrow" : "function", quotation,
        protocolMethods: Object.freeze(protocolMethods), returnsVoid: isCsharpVoidTargetType(selected.signature.returnType),
        returnType: quotation ? method.type : selected.signature.returnType,
        signature: Object.freeze({ ...selected.signature, returnPassing: undefined }) }));
    }
    values.set(objectShapeArtifactKey(frame.shape), Object.freeze(methods));
  }
  return Object.freeze({ records: createCsharpCaptureMethodRecords(values), issues: Object.freeze(issues) });
}
