import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { targetDiagnosticFromExtension, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAdmittedConstruction } from "../../target-model/records/construction.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpSourceModuleConstructionIndex } from "../../target-model/records/source-modules.js";
import type { CsharpSourceFileRecords } from "../../target-model/records/source-files.js";
import type { CsharpTargetArgumentRecords } from "../../target-model/records/target-arguments.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpClassFactory } from "../../target-model/types/carriers/class-factories.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { selectCsharpTypeEmission } from "../../policy/types/type-emission.js";
import { createCsharpConstructionRecords } from "../program/records/construction.js";

export function analyzeCsharpConstructionEmission(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean; readonly operations: CsharpTargetOperationClassifications; readonly values: CsharpValueReadClassifications;
  readonly demand: CsharpNativeDemandAnalysis; readonly evidence: CsharpSourceEvidenceIndex; readonly modules: CsharpSourceModuleConstructionIndex["sourceModuleConstruction"];
  readonly files: CsharpSourceFileRecords; readonly arguments: CsharpTargetArgumentRecords }) {
  const values = new Map<Node, CsharpAdmittedConstruction>();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input.source;
  const refuse = (node: Node, message: string, code = "CSHARP_UNSUPPORTED_AST", evidence: readonly string[] = []): void => {
    issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message, ...(evidence.length === 0 ? {} : { evidence }) });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node) || !ast.is.IsNewExpression(node)) continue;
    const classification = input.operations.selectedConstruction.get(node);
    if (classification === undefined) { refuse(node, "C# planning received a construction without a sealed target classification.", "CSHARP_TARGET_CONSTRUCTION_CLASSIFICATION_MISSING"); continue; }
    const js = classification.jsValue;
    if (js.kind === "rejected") { refuse(node, js.reason); continue; }
    if (js.kind === "resolved") {
      const callee = ast.as.AsNewExpression(node)?.Expression;
      const arguments_ = ast.arguments(node).filter((node): node is Node => node !== undefined);
      if (callee === undefined || arguments_.length !== ast.arguments(node).length || arguments_.some(node => ast.is.IsSpreadElement(node))) {
        refuse(node, "JS-value construction requires exact non-spread source arguments."); continue;
      }
      values.set(node, { kind: "js-value", callee, arguments: Object.freeze(arguments_), result: js.resultType, operation: js }); continue;
    }
    const selection = classification.target;
    if (selection === undefined) { refuse(node, "The sealed C# construction classification selected neither a JS-value operation nor a target constructor.", "CSHARP_TARGET_CONSTRUCTION_CLASSIFICATION_INCOMPLETE"); continue; }
    if (selection.kind === "rejected") { issues.push(targetDiagnosticFromExtension(node, selection.diagnostic)); continue; }
    if (selection.kind === "missing" || selection.kind === "conflict" || selection.kind === "ambiguous") {
      refuse(node, selection.reason, selection.kind === "missing" ? "CSHARP_TARGET_CONSTRUCTION_NOT_CLOSED" : selection.kind === "conflict" ?
        "CSHARP_TARGET_CONSTRUCTION_IDENTITY_CONFLICT" : "CSHARP_TARGET_CONSTRUCTION_AMBIGUOUS", selection.kind === "ambiguous" ? selection.candidates.map(candidate => `candidate=${candidate}`) : []);
      continue;
    }
    const use = input.demand.nativeUse.expression(node)?.use;
    if (use === undefined || use.kind === "erased") { refuse(node, "Source-owned construction has no closed C# result type."); continue; }
    const result = use.carrier;
    if (selection.kind === "resolved") {
      const member = selection.call.targetMember;
      const invocation = member.csharpInvocation;
      if (member.kind !== "constructor" || selection.call.receiver.kind !== "none") { refuse(node, `Checked construction selected non-constructor target member '${member.id}'.`); continue; }
      if (invocation?.kind === "static-factory-construction") {
        if (!selectCsharpTypeEmission({ carrier: invocation.factoryType })) { refuse(node, `Selected static factory constructor '${member.id}' has no renderable factory type.`); continue; }
        values.set(node, { kind: "native", selection: selection.call, result, owner: invocation.factoryType, invocation: { kind: "factory" } }); continue;
      }
      if (invocation?.kind === "source-module-construction") {
        const construction = input.modules.get(node);
        if (construction === undefined || construction.sourceArgumentIndex !== invocation.sourceArgumentIndex || construction.targetParameterIndex !== invocation.targetParameterIndex ||
          construction.bootstrap.id !== invocation.bootstrap.id || construction.bootstrap.methodName !== invocation.bootstrap.methodName ||
          !targetTypeRefEquals(construction.bootstrap.declaringType, invocation.bootstrap.declaringType)) {
          refuse(node, `Selected source-module constructor '${member.id}' has no matching sealed source-module construction.`); continue;
        }
        const arguments_ = input.arguments.targetArgumentsEmission.get(node);
        if (arguments_ === undefined || construction.targetParameterIndex >= arguments_.groups.length) { refuse(node, `Selected source-module constructor '${member.id}' has no target argument at index ${construction.targetParameterIndex}.`); continue; }
        const identity = input.files.sourceFile.get(ast.getFileName(construction.targetSourceFile));
        if (identity === undefined) { refuse(node, "An admitted source construction requires its exact source module identity."); continue; }
        if (member.declaringType === undefined || !selectCsharpTypeEmission({ carrier: member.declaringType })) { refuse(node, `Selected source-module constructor '${member.id}' has no renderable declaring type.`); continue; }
        values.set(node, { kind: "native", selection: selection.call, result, owner: member.declaringType,
          invocation: { kind: "module", index: construction.targetParameterIndex, entry: identity.className } }); continue;
      }
      if (invocation !== undefined) { refuse(node, `Selected constructor '${member.id}' carries non-construction invocation metadata.`); continue; }
      if (member.declaringType === undefined || !selectCsharpTypeEmission({ carrier: member.declaringType })) { refuse(node, `Selected constructor '${member.id}' has no renderable declaring type.`); continue; }
      values.set(node, { kind: "native", selection: selection.call, result, owner: member.declaringType, invocation: { kind: "constructor" } });
      continue;
    }
    const declaration = input.evidence.signatureDeclaration.get(selection.source.selectedSignature);
    const callee = selection.source.sourceCallee.expression;
    if ((declaration === undefined || !input.source.navigation.isProjectDeclaration(declaration)) && !input.source.navigation.isProjectConstructibleObject(callee)) {
      refuse(node, "The exact selected constructor is external to the project and has no C# target relation."); continue;
    }
    const target = input.values.valueRead.get(node)?.value;
    if (target === undefined || !selectCsharpTypeEmission({ carrier: target })) { refuse(node, "Source-owned construction has no closed C# result type."); continue; }
    const calleeCarrier = input.values.valueRead.get(callee)?.value;
    const factory = getCsharpClassFactory(calleeCarrier);
    if (factory !== undefined) {
      const arguments_ = target.kind === "target-named" ? (target.typeArguments ?? []).slice(factory.outerTypeParameterCount) : [];
      if (arguments_.some(carrier => !selectCsharpTypeEmission({ carrier }))) { refuse(node, "A generic class construction requires its exact native type arguments."); continue; }
      values.set(node, { kind: "source", result, invocation: { kind: "factory", callee, method: factory.createMethodName, arguments: Object.freeze(arguments_) } }); continue;
    }
    const reference = input.source.navigation.sourceReferenceFor(callee);
    values.set(node, { kind: "source", result, invocation: getCsharpDelegateSignature(calleeCarrier) !== undefined &&
      (reference === undefined || !ast.is.IsClassDeclaration(reference.declaration)) ? { kind: "delegate", callee } : { kind: "constructor", owner: target } });
  }
  return Object.freeze({ records: createCsharpConstructionRecords(values), issues: Object.freeze(issues) });
}
