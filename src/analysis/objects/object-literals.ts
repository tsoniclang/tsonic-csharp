import type { Node } from "@tsonic/tsts";
import { AsGetAccessorDeclaration, AsSetAccessorDeclaration, AsParameterDeclaration, AsMethodDeclaration, AsObjectLiteralExpression, AsPropertyAssignment, AsShorthandPropertyAssignment, AsSpreadAssignment, ObjectLiteralProperty_SourceName,
  HasSyntacticModifier, ModifierFlagsAsync,
  KindMethodDeclaration, KindGetAccessor, KindSetAccessor, KindSpreadAssignment, KindPropertyAssignment, KindShorthandPropertyAssignment } from "@tsonic/target-api/source";
import type { TargetSourceSyntaxProgram } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpNativeUse } from "../../target-model/records/native-demand.js";
import type { CsharpObjectLiteralEmission, CsharpObjectLiteralMemberEmission } from "../../target-model/records/object-literals.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "./model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpObjectMethodRecords } from "../../target-model/records/object-methods.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/object-members.js";
import { csharpPropertySourceMemberKey, csharpWellKnownSymbolSourceMemberKey, resolveCsharpObjectShapeMemberBySourceKey,
  csharpObjectShapeMemberLookupFailureMessage, isCsharpJsValueObjectShapeTargetType, validateCsharpJsValueObjectShapeCarrier,
  csharpDelegateTargetType, csharpStringTargetType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import { objectShapeStorageMemberName, objectShapeAccessorGetterStorageMemberName, objectShapeAccessorSetterStorageMemberName } from "../../target-model/names/object-members.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { createCsharpObjectLiteralRecords } from "../program/records/object-literals.js";
import type { CsharpSourceMemberKey } from "../../target-model/types/model.js";
import { selectCsharpObjectLiteralCallable } from "../../policy/objects/object-literals.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";

export function analyzeCsharpObjectLiterals(input: {
  readonly source: TargetSourceSyntaxProgram;
  readonly demand: CsharpNativeDemandAnalysis;
  readonly shapes: CsharpObjectShapeClassifications;
  readonly operations: Pick<CsharpTargetOperationClassifications, "jsObjectLiteral">;
  readonly methods: CsharpObjectMethodRecords;
  readonly members: CsharpObjectMemberRecords;
  readonly storage: Pick<CsharpStorageClassifications, "requiredStorageType">;
}) {
  const { ast } = input.source;
  const issues: TargetDiagnostic[] = [];
  const entries: { readonly shape: CsharpObjectShapeFact; readonly node: Node; readonly value: CsharpObjectLiteralEmission }[] = [];
  const seen = new WeakMap<CsharpObjectShapeFact, Set<Node>>();
  const reject = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  const memberFor = (shape: CsharpObjectShapeFact, property: Node): CsharpObjectShapeMemberFact | undefined => {
    const name = ast.name(property);
    let key: CsharpSourceMemberKey;
    if (name !== undefined && (ast.is.IsComputedPropertyName(name) || ast.is.IsNumericLiteral(name))) {
      const selected = input.source.propertyNames.get(name);
      if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted static property requires its checked source-key selection.", property);
      if (selected.kind === "rejected") { reject(property, selected.reason); return undefined; }
      if (selected.kind === "unique-symbol") { reject(property, "Object-shape object initializers require identifier, string-literal, or numeric-literal property names."); return undefined; }
      key = selected.kind === "resolved" ? csharpPropertySourceMemberKey(selected.name) : csharpWellKnownSymbolSourceMemberKey(selected.symbol);
    } else {
      const selected = ObjectLiteralProperty_SourceName(ast, property);
      if (selected.kind === "rejected") {
        reject(property, selected.reason === "missing-name" ? "Object-shape object initializers require an exact authored property name."
          : selected.reason === "non-finite-numeric-literal" ? "Object-shape numeric property names require exact finite source literal semantics."
            : "Object-shape object initializers require identifier, string-literal, or numeric-literal property names.");
        return undefined;
      }
      key = csharpPropertySourceMemberKey(selected.name);
    }
    const selected = resolveCsharpObjectShapeMemberBySourceKey(shape, key, "checked-object-literal-property");
    return selected.kind === "resolved" ? selected.member : undefined;
  };
  const childUse = (parent: Exclude<CsharpNativeUse, { readonly kind: "erased" }>, expression: Node): CsharpNativeUse | undefined => {
    const pending = [...parent.children];
    const visited = new Set(pending);
    for (let index = 0; index < pending.length; index++) {
      const selected = input.demand.nativeUse.get(pending[index]!);
      if (selected?.expression === expression) return selected;
      if (selected === undefined || selected.kind === "erased") continue;
      for (const child of selected.children) if (!visited.has(child)) { visited.add(child); pending.push(child); }
    }
    return undefined;
  };
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased" || use.objectShape === undefined) continue;
    const node = use.expression;
    const literal = AsObjectLiteralExpression(ast, node);
    if (literal === undefined) continue;
    const shape = use.objectShape;
    let requests = seen.get(shape);
    if (requests === undefined) { requests = new Set(); seen.set(shape, requests); }
    if (requests.has(node)) continue;
    requests.add(node);
    const js = isCsharpJsValueObjectShapeTargetType(shape.targetType);
    if (js) { const reason = validateCsharpJsValueObjectShapeCarrier(shape); if (reason !== undefined) reject(node, reason); }
    const members: CsharpObjectLiteralMemberEmission[] = [];
    for (const property of literal.Properties?.Nodes ?? []) {
      if (property === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked native object literal requires dense source properties.", node);
      const kind = ast.kindName(property);
      if (js && kind !== KindPropertyAssignment && kind !== KindShorthandPropertyAssignment) {
        reject(property, "Closed JS-value object literals require explicit property assignments; spread and method members need their own exact runtime operation contract.");
        continue;
      }
      if (kind === KindSpreadAssignment) {
        const expression = AsSpreadAssignment(ast, property)?.Expression;
        if (expression === undefined) { reject(property, "Object literal spread requires a source expression."); continue; }
        const sourceShape = input.shapes.resolveNode(expression, ast.getSourceFile(expression));
        if (sourceShape === undefined) { reject(property, "Object literal spread requires finalized provider object-shape facts for the spread expression before C# emission."); continue; }
        const shared = sourceShape.methodImplementation !== undefined && sourceShape.methodImplementation.identity === shape.methodImplementation?.identity && targetTypeRefEquals(sourceShape.targetType, shape.targetType);
        const fields: { readonly source: string; readonly target: string; readonly carrier: TargetTypeRef }[] = [];
        for (const sourceMember of sourceShape.members) {
          const selected = resolveCsharpObjectShapeMemberBySourceKey(shape, sourceMember.sourceKey, "finalized-object-spread-member");
          if (selected.kind !== "resolved") {
            reject(property, selected.reason === "not-in-finalized-shape" ? `Object literal spread source member '${sourceMember.sourceName}' requires a finalized target object-shape member carrier before C# emission.`
              : csharpObjectShapeMemberLookupFailureMessage(selected, "Object literal spread target shape"));
            continue;
          }
          const target = selected.member;
          if (shared && target.methodValueContract !== undefined && csharpObjectShapeMethodDeclaration(shape, target) === csharpObjectShapeMethodDeclaration(sourceShape, sourceMember)) continue;
          if (!targetTypeRefEquals(sourceMember.type, target.type)) { reject(property, `Object literal spread member '${sourceMember.sourceName}' requires matching finalized source and target member carriers.`); continue; }
          const carrier = target.memberKind === "method" ? input.members.objectMember.get(shape, target)?.methodStorage : target.type;
          if (carrier === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted spread method requires its selected native callable storage.", property);
          fields.push(Object.freeze({ source: objectShapeStorageMemberName(sourceShape, sourceMember), target: objectShapeStorageMemberName(shape, target), carrier }));
        }
        if (shared) {
          const captures = input.methods.objectCaptures.get(sourceShape);
          if (captures === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted object spread requires its sealed capture layout.", property);
          for (const field of captures) fields.push(Object.freeze({ source: field.name, target: field.name, carrier: field.type }));
        }
        const native = childUse(use, expression);
        if (native === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted object spread requires its exact native operand use.", expression);
        const carrier = native.kind !== "erased" && native.completion.kind === "value" ? native.completion.type : undefined;
        const present = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier);
        members.push(Object.freeze({ kind: "spread", property, expression, fields: Object.freeze(fields),
          presence: present === undefined ? Object.freeze({ kind: "required" }) : Object.freeze({ kind: "optional", carrier: present }) }));
        continue;
      }
      const member = memberFor(shape, property);
      if (member === undefined) {
        reject(property, kind === KindMethodDeclaration ? "Object literal method must match a finalized provider object-shape member."
          : "Object literal property must match one finalized object-shape source contract member.");
        continue;
      }
      if (kind === KindPropertyAssignment || kind === KindShorthandPropertyAssignment) {
        if (kind === KindShorthandPropertyAssignment && AsShorthandPropertyAssignment(ast, property)?.ObjectAssignmentInitializer !== undefined) {
          reject(property, "Object literal shorthand defaults require finalized default-value semantics before C# emission."); continue;
        }
        const initializer = kind === KindPropertyAssignment ? AsPropertyAssignment(ast, property)?.Initializer : ast.name(property);
        if (initializer === undefined) { reject(property, "Explicit object literal members require an exact initializer expression."); continue; }
        if (csharpTargetTypeRenderingRejection(member.type) !== undefined) {
          reject(property, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`); continue;
        }
        members.push(Object.freeze({ kind: "value", property, member, initializer }));
      } else if (kind === KindMethodDeclaration) {
        const authored = shape.methodImplementation?.declaration === ast.parent(property) &&
          shape.members.some(candidate => candidate.methodValueContract !== undefined && candidate.sourceDeclarations?.includes(property));
        if (authored) { members.push(Object.freeze({ kind: "authored", property, member })); continue; }
        const declaration = AsMethodDeclaration(ast, property);
        if (declaration === undefined) { reject(property, "Object literal method emission requires a method-declaration AST node."); continue; }
        if (declaration.TypeParameters?.Nodes.some(parameter => parameter !== undefined)) {
          reject(property, "Object literal generic methods require finalized target delegate facts before C# emission."); continue;
        }
        if (declaration.Body === undefined) { reject(property, "Object literal method emission requires a method body."); continue; }
        const layout = input.members.objectMember.get(shape, member);
        if (layout === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted object method requires its selected native member layout.", property);
        const storage = member.memberKind === "method" ? layout.methodStorage : member.type;
        if (storage === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted object method requires its native callable storage.", property);
        const receiver = layout.receiverBound ? shape.targetType : undefined;
        const selected = selectCsharpObjectLiteralCallable({ carrier: member.type, storage, receiver });
        if (selected.kind === "rejected") {
          reject(property, selected.reason === "carrier"
            ? `Object-shape method '${member.sourceName}' must carry a renderable delegate target type before C# emission.`
            : `Object-shape method '${member.sourceName}' must carry a finalized delegate target type with explicit return facts before C# emission.`);
          continue;
        }
        const parameters = (declaration.Parameters?.Nodes ?? []).filter((parameter): parameter is Node => parameter !== undefined);
        members.push(Object.freeze({ kind: "method", property, member, callable: Object.freeze({ body: declaration.Body,
          parameters: Object.freeze(parameters), carrier: member.type, storage, signature: selected.signature, receiver,
          async: HasSyntacticModifier(ast, property, ModifierFlagsAsync), storageName: objectShapeStorageMemberName(shape, member) }) }));
      } else if (kind === KindGetAccessor || kind === KindSetAccessor) {
        const getter = kind === KindGetAccessor;
        if (member.accessor === undefined || !getter && member.accessor.setter !== true) {
          reject(property, "Object-literal accessor must match one exact finalized accessor-shape member."); continue;
        }
        if (csharpTargetTypeRenderingRejection(shape.targetType) !== undefined) {
          reject(property, `Object-shape accessor '${member.sourceName}' has no renderable receiver carrier.`); continue;
        }
        const declaration = getter ? AsGetAccessorDeclaration(ast, property) : AsSetAccessorDeclaration(ast, property);
        const parameters = (declaration?.Parameters?.Nodes ?? []).filter((parameter): parameter is Node => parameter !== undefined);
        if (declaration?.Body === undefined || !getter && (parameters.length !== 1 || AsParameterDeclaration(ast, parameters[0]!) === undefined)) {
          reject(property, getter ? "Object-literal getter requires one exact body and result-carrier contract."
            : "Object-literal setter requires one exact parameter and body."); continue;
        }
        const carrier = getter ? csharpDelegateTargetType("System.Func", [], member.type) : csharpDelegateTargetType("System.Action", [member.type]);
        const storage = getter ? csharpDelegateTargetType("System.Func", [shape.targetType], member.type)
          : csharpDelegateTargetType("System.Action", [shape.targetType, member.type]);
        const selected = selectCsharpObjectLiteralCallable({ carrier, storage, receiver: shape.targetType });
        const parameterType = getter ? undefined : input.storage.requiredStorageType.get(parameters[0]!);
        if (selected.kind === "rejected" || !getter && (parameterType === undefined || !targetTypeRefEquals(parameterType, member.type))) {
          reject(property, getter ? "Object-literal getter requires one exact body and result-carrier contract."
            : "Object-literal setter has no exact sealed parameter-carrier contract."); continue;
        }
        members.push(Object.freeze({ kind: "accessor", property, member, callable: Object.freeze({ body: declaration.Body,
          parameters: Object.freeze(parameters), carrier, storage, signature: selected.signature, receiver: shape.targetType, async: false,
          storageName: getter ? objectShapeAccessorGetterStorageMemberName(shape, member) : objectShapeAccessorSetterStorageMemberName(shape, member) }) }));
      }
      else reject(property, "Object literal member is outside the current C# planning surface.");
    }
    if (js) {
      const operation = input.operations.jsObjectLiteral.get(node);
      if (operation?.kind !== "resolved") {
        reject(node, operation?.kind === "rejected" ? operation.reason : "C# object-literal planning requires a sealed JS-value operation classification produced during analysis.");
        continue;
      }
      entries.push({ shape, node, value: Object.freeze({ kind: "js", members: Object.freeze(members), keyCarrier: csharpStringTargetType(), operation }) });
    } else entries.push({ shape, node, value: Object.freeze({ kind: "native", members: Object.freeze(members) }) });
  }
  return Object.freeze({ records: createCsharpObjectLiteralRecords(entries), issues: Object.freeze(issues) });
}
