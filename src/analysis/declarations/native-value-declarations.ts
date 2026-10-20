import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { HasSyntacticModifier, ModifierFlagsAbstract, ModifierFlagsAccessor, ModifierFlagsAmbient,
  ModifierFlagsConst, ModifierFlagsOverride, ModifierFlagsPrivate, ModifierFlagsProtected, ModifierFlagsPublic,
  ModifierFlagsReadonly, sourceClassFieldIsTypeOnly, sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpNativeParticipationInput, CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpProjectCallableAdapters } from "../../target-model/records/callable-adapters.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../program/records/object-shape-keys.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import { csharpSourceTypeParameters } from "../../source/extension/type-parameters.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { csharpBigIntegerTargetType, csharpCarrierAdmitsSourceAbsence, csharpNullableTargetType,
  csharpRuntimeLocationTargetType, getCsharpDelegateSignature, getCsharpGenericOptionalParts,
  targetTypeRefEquals } from "../../target-model/types/index.js";

export function admitCsharpNativeDeclarations(
  ast: AstReader,
  nodes: readonly Node[],
  nativeUse: CsharpNativeUseClassifications["nativeUse"],
  projectTypes: Pick<CsharpProjectTypeClassifications, "heritageForDeclaration">,
  authoredHeritage: Pick<SourceProgramNavigation, "declaredHeritage">,
  metadata: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata" | "sourceField">,
  storage: Pick<CsharpStorageClassifications, "storageType" | "nativeBacking" | "typedLocationIdentity">,
  participation: CsharpNativeParticipationInput["participation"],
  nativeUnreachable: CsharpTargetOperationClassifications["nativeUnreachable"],
  declarations: Pick<CsharpDeclarationClassifications, "methodWrite" | "returnContract">,
  methodDispatch: CsharpProjectCallableAdapters["callableDispatch"],
  factories: CsharpClassFactoryIndex["classFactory"],
  captures: Pick<CsharpCaptureStorage, "capturedBinding" | "physicalStorageType">,
): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      sourceNode: node, message }));
  };
  for (const node of nodes) {
    if (nativeUse.order(node) === undefined || metadata.compileTimeMetadata.get(node) ||
      nativeUnreachable.get(node) || participation.get(node) === "erased" || sourceClassFieldIsTypeOnly(ast, node)) continue;
    admitCsharpDeclarationModifiers(ast, node, refuse);
    if (ast.is.IsInterfaceDeclaration(node) || ast.is.IsEnumDeclaration(node)) {
      const owner = ast.parent(node);
      if (owner !== undefined && !ast.is.IsSourceFile(owner) && !ast.is.IsModuleDeclaration(owner) &&
        ast.kindName(owner) !== "KindModuleBlock") {
        refuse(node, "Statement is outside the current C# planning surface.");
        continue;
      }
    }
    if (ast.is.IsMethodDeclaration(node)) {
      const returned = declarations.returnContract.get(node);
      if (returned?.kind === "rejected") refuse(node, returned.reason);
      const dispatch = methodDispatch.get(node);
      if (dispatch?.kind !== "method") {
        refuse(node, "A method has no sealed native dispatch contract.");
      } else {
        if (csharpTargetTypeRenderingRejection(dispatch.implementation.returnType) !== undefined) {
          refuse(node, "A method's sealed native return contract is not renderable.");
        }
        for (const parameter of dispatch.implementation.parameters) {
          const type = parameter.targetParameter.type;
          if (csharpTargetTypeRenderingRejection(type) === undefined) continue;
          issues.push(Object.freeze({ category: "error", source: "tsonic-csharp", sourceNode: parameter.sourceParameter,
            code: type.kind === "opaque" ? "CSHARP_OPAQUE_TARGET_TYPE_UNSUPPORTED" : "CSHARP_UNSUPPORTED_AST",
            message: type.kind === "opaque" ? `Opaque target type '${type.id}' has no renderable C# source representation.`
              : `C# type policy resolved '${type.kind}', but that target type has no renderable C# syntax.` }));
        }
        for (const adapter of dispatch.adapters) {
          if (csharpTargetTypeRenderingRejection(adapter.contract.returnType) !== undefined ||
            adapter.contract.parameters.some(parameter => csharpTargetTypeRenderingRejection(parameter.targetParameter.type) !== undefined)) {
            refuse(node, "A sealed callable adapter has an unrenderable native signature.");
          }
        }
      }
      const write = declarations.methodWrite.get(node);
      if (write !== undefined) {
        const owner = ast.parent(node);
        const heritage = owner === undefined ? undefined : authoredHeritage.declaredHeritage(owner);
        if (csharpTargetTypeRenderingRejection(write.type) !== undefined ||
          csharpSourceTypeParameters(node, ast).some(parameter => parameter !== undefined) ||
          ast.hasModifierKind(node, "static") || ast.hasModifierKind(node, "abstract") ||
          dispatch?.overridesBase === true || dispatch?.hasDerivedOverride === true ||
          heritage?.kind === "resolved" && heritage.edges.length > 0) {
          refuse(node, "A writable source method requires a closed non-generic instance delegate without native inheritance or interface dispatch obligations.");
        }
      }
    }
    const classDeclaration = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node);
    if (classDeclaration || ast.is.IsInterfaceDeclaration(node)) {
      const heritage = projectTypes.heritageForDeclaration(node);
      if (heritage !== undefined) {
        const types = heritage.baseType === undefined ? heritage.interfaces : [heritage.baseType, ...heritage.interfaces];
        for (const type of types) {
          if (csharpTargetTypeRenderingRejection(type) !== undefined) {
            refuse(node, "Canonical project heritage contains a target type that cannot be rendered in C#.");
          }
        }
      }
    }
    if (classDeclaration) {
      const factory = factories.get(node);
      if (factory !== undefined) {
        if (csharpTargetTypeRenderingRejection(factory.factoryType) !== undefined ||
          csharpTargetTypeRenderingRejection(factory.contract.instance) !== undefined ||
          factory.identity !== undefined && csharpTargetTypeRenderingRejection(factory.identity.type) !== undefined) {
          refuse(node, "A class evaluation requires every sealed native capture owner.");
        }
        for (const capture of factory.captures) {
          const shared = captures.capturedBinding.get(capture.declaration);
          const carrier = shared === undefined ? captures.physicalStorageType.get(capture.declaration, capture.type)
            : shared.frame.shape.targetType;
          if (csharpTargetTypeRenderingRejection(carrier) !== undefined) {
            refuse(capture.declaration, "A class capture has no renderable native storage.");
          }
        }
      }
      for (const member of ast.members(node)) {
        if (member === undefined || nativeUse.order(member) === undefined || metadata.compileTimeMetadata.get(member) || nativeUnreachable.get(member) ||
          participation.get(member) === "erased" || sourceClassFieldIsTypeOnly(ast, member)) continue;
        const kind = ast.kindName(member);
        const property = kind === "KindPropertyDeclaration" ? ast.as.AsPropertyDeclaration(member) : undefined;
        if (property?.Initializer !== undefined &&
          metadata.sourceField.get([member, property.name, property.Type, property.Initializer]) === undefined) {
          const carrier = storage.storageType.get(member);
          if (carrier === undefined || csharpTargetTypeRenderingRejection(carrier) !== undefined) {
            refuse(member, "A class initializer requires its exact native value contract.");
          }
        }
        if (kind === "KindPropertyDeclaration" && ast.hasModifierKind(member, "static") &&
          ast.as.AsPropertyDeclaration(member)?.Initializer === undefined) {
          const type = storage.storageType.get(member);
          const absentDefault = csharpCarrierAdmitsSourceAbsence(type) &&
            type !== undefined && getCsharpGenericOptionalParts(type) === undefined;
          const numericDefault = type !== undefined && (type.kind === "source-primitive" && type.name !== "char" ||
            targetTypeRefEquals(type, csharpBigIntegerTargetType()));
          if (!absentDefault && !numericDefault) {
            issues.push(Object.freeze({ code: "CSHARP_STATIC_FIELD_INITIALIZER_REQUIRED", category: "error",
              source: "tsonic-csharp", sourceNode: member,
              message: "A static class field requires an explicit initializer when its native default is not a value of the declared storage type." }));
          }
        }
        if (kind !== "KindConstructor" && kind !== "KindClassStaticBlockDeclaration" && kind !== "KindMethodDeclaration" &&
          kind !== "KindPropertyDeclaration" && kind !== "KindParameter" && kind !== "KindGetAccessor" && kind !== "KindSetAccessor") {
          refuse(member, "Class member is outside the current C# planning surface.");
        }
      }
    } else if (ast.is.IsInterfaceDeclaration(node)) {
      for (const member of ast.members(node)) {
        if (member === undefined || metadata.compileTimeMetadata.get(member)) continue;
        const kind = ast.kindName(member);
        if (kind !== "KindMethodSignature" && kind !== "KindPropertySignature" && kind !== "KindIndexSignature") {
          refuse(member, "Interface member is outside the current C# planning surface.");
        }
        if (kind === "KindMethodSignature" && participation.get(member) === "signature" &&
          ast.parameters(member).some(parameter => {
            if (parameter === undefined) return false;
            return storage.nativeBacking.get(parameter) !== undefined || storage.typedLocationIdentity.get(parameter);
          })) refuse(member, "Interface methods cannot publish destructuring parameter preludes.");
      }
    }
  }
  return Object.freeze(issues);
}

export function admitCsharpRawInterfaceDeclarations(
  ast: AstReader,
  nodes: readonly Node[],
  nativeUse: CsharpNativeUseClassifications["nativeUse"],
  shapes: Pick<CsharpObjectShapeClassifications, "resolveNode" | "resolveTarget">,
  artifacts: Pick<CsharpObjectShapeDemand, "get">,
  storage: Pick<CsharpStorageClassifications, "nativeField">,
  metadata: CsharpSourceEvidenceIndex["compileTimeMetadata"],
  participation: CsharpNativeParticipationInput["participation"],
  unreachable: CsharpTargetOperationClassifications["nativeUnreachable"],
): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const rendered = (shape: CsharpObjectShapeFact, methodValues: boolean): boolean => shape.members.every(member => {
    if (member.memberKind !== "method") {
      if (csharpTargetTypeRenderingRejection(member.type) !== undefined) return false;
      return storage.nativeField.get(shape.targetType, member.targetName) === undefined ||
        csharpTargetTypeRenderingRejection(csharpRuntimeLocationTargetType(member.type)) === undefined;
    }
    if (methodValues || member.optional === true) {
      const valueType = member.methodValueContract ?? member.type;
      if (csharpTargetTypeRenderingRejection(member.optional === true ? csharpNullableTargetType(valueType) : valueType) !== undefined) {
        return false;
      }
      if (member.optional === true) return true;
    }
    const signature = getCsharpDelegateSignature(member.type);
    return signature !== undefined && csharpTargetTypeRenderingRejection(signature.returnType) === undefined &&
      signature.parameters.every(type => csharpTargetTypeRenderingRejection(type) === undefined) &&
      (member.typeParameters ?? []).every(parameter => parameter.constraints.every(constraint =>
        constraint.kind !== "type" || csharpTargetTypeRenderingRejection(constraint.type) === undefined));
  });
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      sourceNode: node, message }));
  };
  for (const node of nodes) {
    if (!ast.is.IsInterfaceDeclaration(node) || nativeUse.order(node) === undefined || metadata.get(node) ||
      participation.get(node) === "erased" || unreachable.get(node)) continue;
    const shape = shapes.resolveNode(node, ast.getSourceFile(node));
    if (shape === undefined) continue;
    if (artifacts.get(objectShapeArtifactKey(shape))?.capabilities.includes("method-values") && !rendered(shape, true)) {
      refuse(node, "An interface method value requires its exact native callable storage contract.");
    }
    for (const type of shape.implements ?? []) {
      const inherited = shapes.resolveTarget(type);
      if (inherited !== undefined && !rendered(inherited,
        artifacts.get(objectShapeArtifactKey(inherited))?.capabilities.includes("method-values") === true)) {
        refuse(node, "An inherited interface requires exact native member signatures.");
      }
    }
  }
  return Object.freeze(issues);
}

function admitCsharpDeclarationModifiers(ast: AstReader, node: Node,
  refuse: (node: Node, message: string) => void): void {
  const modifiers = [
    { flag: ModifierFlagsPublic, name: "public" },
    { flag: ModifierFlagsPrivate, name: "private" },
    { flag: ModifierFlagsProtected, name: "protected" },
    { flag: ModifierFlagsReadonly, name: "readonly" },
    { flag: ModifierFlagsAbstract, name: "abstract" },
    { flag: ModifierFlagsOverride, name: "override" },
    { flag: ModifierFlagsAmbient, name: "declare" },
    { flag: ModifierFlagsAccessor, name: "accessor" },
    { flag: ModifierFlagsConst, name: "const" },
  ];
  const visibility = ["public", "private", "protected"];
  const check = (context: string, allowed: readonly string[] = []): void => {
    for (const modifier of modifiers) {
      if (!allowed.includes(modifier.name) && HasSyntacticModifier(ast, node, modifier.flag)) refuse(node,
        `TypeScript-only modifier '${modifier.name}' on ${context} is outside the native runtime-shape source subset. Use standard ECMAScript runtime shape or target/provider facts instead.`);
    }
  };
  if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) check("class declaration", ["abstract"]);
  else if (ast.is.IsInterfaceDeclaration(node)) check("interface declaration");
  else if (ast.is.IsConstructorDeclaration(node)) check("constructor declaration", visibility);
  else if (ast.is.IsMethodDeclaration(node)) check("method declaration", [...visibility, "abstract", "override"]);
  else if (ast.is.IsPropertyDeclaration(node)) check("property declaration", [...visibility, "readonly", "abstract", "override"]);
  else if (ast.is.IsGetAccessorDeclaration(node) || ast.is.IsSetAccessorDeclaration(node)) {
    check("accessor declaration", [...visibility, "abstract", "override"]);
  } else if (ast.is.IsMethodSignatureDeclaration(node)) check("interface method declaration");
  else if (ast.is.IsPropertySignatureDeclaration(node)) check("interface property declaration", ["readonly"]);
  else if (ast.is.IsIndexSignatureDeclaration(node)) check("interface index signature", ["readonly"]);
  else if (ast.is.IsEnumDeclaration(node)) check("enum declaration");
  else if (ast.is.IsFunctionDeclaration(node)) check("function declaration");
  else if (ast.is.IsParameterDeclaration(node)) {
    const owner = ast.parent(node);
    if (sourceParameterIsProperty(ast, node)) check("property declaration", [...visibility, "readonly", "abstract", "override"]);
    if (owner !== undefined && (ast.is.IsArrowFunction(owner) || ast.is.IsFunctionExpression(owner))) {
      check("lambda parameter declaration");
    } else check("parameter declaration", sourceParameterIsProperty(ast, node) ? [...visibility, "readonly"] : []);
  }
}
