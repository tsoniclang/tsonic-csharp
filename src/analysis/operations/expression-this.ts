import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { HasSyntacticModifier, ModifierFlagsStatic } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpCaptureStorage } from "../../target-model/records/callables/capture-storage.js";
import type { CsharpClassInitializationIndex } from "../../target-model/records/objects/class-initialization.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpObjectMethodRecords } from "../../target-model/records/objects/object-methods.js";
import type { CsharpObjectLiteralRecords } from "../../target-model/records/objects/object-literals.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import { createCsharpThisEmissionProducer } from "../program/records/operations/expression-this.js";

export function analyzeCsharpThisEmission(input: {
  readonly ast: AstReader; readonly nodes: readonly Node[]; readonly admitted: (node: Node) => boolean;
  readonly captures: CsharpCaptureStorage; readonly initialization: CsharpClassInitializationIndex;
  readonly factories: CsharpClassFactoryIndex; readonly values: CsharpValueReadClassifications;
  readonly shapes: CsharpObjectShapeClassifications; readonly methods: CsharpObjectMethodRecords; readonly literals: CsharpObjectLiteralRecords;
}) {
  const producer = createCsharpThisEmissionProducer();
  const issues: TargetDiagnostic[] = [];
  const bound = new Map<Node, TargetTypeRef>();
  const captured = new Map<Node, TargetTypeRef>();
  for (const frame of input.captures.frames) for (const receiver of frame.receivers)
    for (const reference of receiver.references) captured.set(reference, receiver.type);
  for (const node of input.nodes) for (const receiver of input.captures.captureClosure.get(node)?.method.receivers ?? [])
    for (const reference of receiver.references) captured.set(reference, receiver.type);
  for (const shape of input.shapes.knownShapes())
    for (const method of input.methods.objectMethods.get(shape) ?? []) bound.set(method.declaration, shape.targetType);
  // Every object literal's receiver-bound method or accessor, including literals whose shape has no authored method
  // implementation (an accessor-only literal lowers through receiver-taking getter and setter delegates).
  for (const callable of input.literals.receiverBoundCallables) bound.set(callable.property, callable.receiver);
  const refuse = (node: Node, message: string): void => {
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  const { ast } = input;
  const classMember = (node: Node): boolean => { const owner = ast.parent(node); return ast.is.IsClassDeclaration(owner) || ast.is.IsClassExpression(owner); };
  for (const node of input.nodes) {
    const kind = ast.kindName(node);
    if (!input.admitted(node) || kind !== "KindThisKeyword" && kind !== "KindThisExpression") continue;
    const retained = captured.get(node);
    if (retained !== undefined) { producer.publish(node, { kind: "captured", carrier: retained }); continue; }
    let reason: string | undefined = "unknown receiver context";
    let explicit: TargetTypeRef | undefined;
    for (let current = ast.parent(node); current !== undefined; current = ast.parent(current)) {
      if (ast.is.IsArrowFunction(current)) continue;
      explicit = bound.get(current);
      if (explicit !== undefined) { reason = undefined; break; }
      if (ast.is.IsConstructorDeclaration(current)) { reason = classMember(current) ? undefined : "constructor outside a class declaration"; break; }
      if (ast.is.IsMethodDeclaration(current) || ast.is.IsGetAccessorDeclaration(current) || ast.is.IsSetAccessorDeclaration(current)) {
        const owner = ast.parent(current);
        const factory = owner === undefined ? undefined : input.factories.classFactory.get(owner);
        if (factory !== undefined) { explicit = HasSyntacticModifier(ast, current, ModifierFlagsStatic) ? factory.factoryType : factory.contract.instance; reason = undefined; break; }
        reason = !classMember(current) ? "object-literal or non-class method receiver"
          : HasSyntacticModifier(ast, current, ModifierFlagsStatic) ? "static class member receiver" : undefined;
        break;
      }
      if (ast.is.IsPropertyDeclaration(current)) {
        reason = classMember(current) && !HasSyntacticModifier(ast, current, ModifierFlagsStatic) && input.initialization.relocatedClassField.get(current)
          ? undefined : "class field initializer receiver";
        break;
      }
      if (ast.kindName(current) === "KindClassStaticBlockDeclaration") { reason = "class static block receiver"; break; }
      if (ast.is.IsFunctionDeclaration(current) || ast.is.IsFunctionExpression(current)) { reason = "runtime-bound function receiver"; break; }
      if (ast.is.IsSourceFile(current)) { reason = "top-level module receiver"; break; }
    }
    if (reason !== undefined) {
      refuse(node, `C# this emission requires a TSTS-selected instance class receiver; ${reason} uses JavaScript this-binding semantics that need explicit target facts before emission.`);
      continue;
    }
    const carrier = explicit ?? input.values.valueRead.get(node)?.value;
    if (carrier === undefined) {
      refuse(node, "C# this emission requires a finalized runtime carrier fact for the TSTS-selected instance receiver. Runtime carrier fact is missing for the TSTS-selected this receiver.");
      continue;
    }
    producer.publish(node, { kind: explicit === undefined ? "instance" : "bound", carrier });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
