import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../../target-model/records/object-shape-keys.js";
import type { CsharpObjectCaptureField, CsharpAuthoredObjectMethod } from "../../target-model/records/object-methods.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/object-members.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import { objectShapeMethodInvocationName, objectShapeStorageMemberName } from "../../target-model/names/object-members.js";
import { createCsharpObjectMethodRecords } from "../program/records/object-methods.js";

export function analyzeCsharpAuthoredObjectMethods(input: {
  readonly ast: AstReader;
  readonly demand: CsharpObjectShapeDemand;
  readonly shapes: CsharpObjectShapeClassifications;
  readonly captures: CsharpCaptureStorage;
  readonly members: CsharpObjectMemberRecords;
}) {
  const captures = new Map<string, readonly CsharpObjectCaptureField[]>();
  const methods = new Map<string, readonly CsharpAuthoredObjectMethod[]>();
  const issues: TargetDiagnostic[] = [];
  const shapes = new Map([...input.shapes.knownShapes(), ...input.demand.artifacts.map(artifact => artifact.fact)]
    .map(shape => [objectShapeArtifactKey(shape), shape]));
  for (const [key, shape] of shapes) {
    const fields: CsharpObjectCaptureField[] = [];
    const frames = new Map<Node, number>();
    for (const capture of shape.methodImplementation?.captures ?? []) {
      const selected = input.captures.capturedBinding.get(capture.declaration);
      if (selected === undefined) {
        fields.push(Object.freeze({ name: capture.fieldName, type: input.captures.physicalStorageType.get(capture.declaration, capture.type),
          frameScope: undefined, declarations: Object.freeze([Object.freeze({ declaration: capture.declaration })]) }));
      } else {
        const index = frames.get(selected.frame.scope);
        const binding = Object.freeze({ declaration: capture.declaration, member: selected.fieldName });
        if (index !== undefined) {
          const field = fields[index]!;
          fields[index] = Object.freeze({ ...field, declarations: Object.freeze([...field.declarations, binding]) });
        } else {
          frames.set(selected.frame.scope, fields.length);
          fields.push(Object.freeze({ name: capture.fieldName, type: selected.frame.shape.targetType,
            frameScope: selected.frame.scope, declarations: Object.freeze([binding]) }));
        }
      }
    }
    captures.set(key, Object.freeze(fields));
    const declarations: CsharpAuthoredObjectMethod[] = [];
    const artifact = input.demand.get(key);
    if (shape.methodImplementation !== undefined && artifact?.materialization === "synthetic") {
      for (const member of shape.members) {
        if (member.memberKind !== "method") continue;
        const declaration = csharpObjectShapeMethodDeclaration(shape, member);
        if (declaration === undefined) {
          if (member.optional !== true && member.methodValueStorage === undefined) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
            sourceNode: shape.methodImplementation.declaration, message: "A native object method requires its exact authored implementation." });
          continue;
        }
        if (input.ast.getSourceFile(declaration) === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A native object method requires its exact checked source file.", declaration);
        const emission = input.members.objectMember.get(shape, member)?.declaration;
        if (emission?.kind !== "authored") failTargetAnalysisInvariant("tsonic-csharp", "A native object method requires its single admitted body and callable-value layout.", declaration);
        declarations.push(Object.freeze({ declaration, name: member.targetName,
          bodyInvocation: member.methodValueContract === undefined ? undefined
            : Object.freeze({ interface: member.methodValueContract, name: objectShapeMethodInvocationName(member) }),
          emission, handleName: emission.value.kind === "fixed" && artifact.capabilities.includes("method-values")
            ? objectShapeStorageMemberName(shape, member) : undefined }));
      }
    }
    methods.set(key, Object.freeze(declarations));
  }
  return Object.freeze({ records: createCsharpObjectMethodRecords(captures, methods), issues: Object.freeze(issues) });
}
