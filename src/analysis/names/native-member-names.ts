import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { AsVariableDeclaration, sourceClassFieldIsTypeOnly, sourceObjectMemberDeclarations,
  sourceDeclarationIsModuleScoped, sourceParameterIsProperty } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, targetDiagnosticFromExtension } from "@tsonic/target-api/artifacts";
import type { CsharpNativeMemberIdentity, CsharpNativeMemberNames } from "../../target-model/names/model.js";
import type { CsharpProjectCallableAdapters } from "../../target-model/records/callables/callable-adapters.js";
import type { CsharpCaptureStorage } from "../../target-model/records/callables/capture-storage.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/program/declarations.js";
import type { CsharpNativeParticipationInput, CsharpNativeUseClassifications } from "../../target-model/records/native/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpProjectTypeClassifications, CsharpProjectTypeDefinition } from "../../target-model/records/types/project-types.js";
import type { SourceCallableSourceContract } from "../../target-model/records/callables/source-callable-contract.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpNativeInheritedMember, CsharpNativeTargetBindingFact } from "../../target-model/types/native-inheritance.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import { csharpWellKnownSymbolTargetMemberName, getCsharpDelegateSignature, getCsharpLambdaSignature,
  getCsharpExpressionTreeDelegateType, csharpStringTargetType } from "../../target-model/types/index.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../target-model/types/method-values.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpTargetStorageIdentityEquals } from "../../policy/types/storage/storage-identity.js";
import type { CsharpSourceNameResolver } from "./plan.js";
import type { CsharpObjectShapeDemandClosure } from "../../target-model/records/objects/object-shape-demand.js";
import type { CsharpNativeValueCarriers } from "../../target-model/records/native/native-value-carriers.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpModuleInitializationIndex } from "../../target-model/records/program/module-initialization.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callables/callable-values.js";
import type { CsharpCallableCreationIndex } from "../../target-model/records/callables/callable-values.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import { objectShapeArtifactKey } from "../../target-model/records/objects/object-shape-keys.js";
import { objectShapeStorageMemberName, objectShapeBoundStorageMemberName,
  objectShapeAccessorGetterStorageMemberName, objectShapeAccessorSetterStorageMemberName,
  objectShapeMethodBodyName, objectShapeMethodInvocationName, objectShapeMethodValueStorageNames,
  csharpDeferredCaptureStorageNames, csharpFrozenStorageName, csharpJsonValueProjectionMethodName,
  csharpJsonValueWriterMethodName, csharpEnumerableKeysMethodName, csharpEnumerableKeysStorageName } from "../../target-model/names/object-members.js";

export interface CsharpNativeMemberNameInput {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly nativeUse: CsharpNativeUseClassifications["nativeUse"];
  readonly metadata: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata" | "wellKnownSymbol" | "sourceField" | "sourceStruct">;
  readonly participation: CsharpNativeParticipationInput["participation"];
  readonly unreachable: CsharpTargetOperationClassifications["nativeUnreachable"];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly names: Pick<CsharpSourceNameResolver, "resolve">;
  readonly dispatch: CsharpProjectCallableAdapters["callableDispatch"];
  readonly writes: CsharpDeclarationClassifications["methodWrite"];
  readonly factories: CsharpClassFactoryIndex["classFactory"];
  readonly helperAccess: CsharpCaptureStorage["helperAccess"];
  readonly requiredBindingRoots: readonly Node[];
  readonly artifactClosure: Pick<CsharpObjectShapeDemandClosure, "artifacts" | "targetShapes">;
  readonly nativeValueCarriers: Pick<CsharpNativeValueCarriers, "nativeValueDeclaration">;
  readonly storage: Pick<CsharpStorageClassifications, "nativeField" | "nativeModuleField">;
  readonly moduleInitialization: Pick<CsharpModuleInitializationIndex, "callableVisibility">;
  readonly callables: Pick<CsharpCallableContractIndex, "get">;
  readonly callableCreations: Pick<CsharpCallableCreationIndex, "callableTarget">;
  readonly classPropertyStorage: CsharpTargetOperationClassifications["classPropertyStorage"];
  readonly captureFrameShape: CsharpCaptureStorage["captureFrameShape"];
  readonly capturedBinding: CsharpCaptureStorage["capturedBinding"];
  readonly providers: Pick<CsharpProviderRelationResolver, "findTargetBindingByTargetId" | "findTargetBindingByMetadataName">;
}

interface NativeMemberSignature {
  readonly name: string;
  readonly kind: CsharpNativeInheritedMember["kind"];
  readonly genericParameterIds: readonly string[];
  readonly parameters: CsharpNativeInheritedMember["parameters"];
}

interface ProjectMember extends NativeMemberSignature {
  readonly subject: CsharpNativeMemberIdentity;
  readonly declaration: Node;
  readonly emittedName: string;
  readonly static: boolean;
  readonly accessor: boolean;
  readonly accessible: boolean;
  readonly overrides: boolean;
}

export function analyzeCsharpNativeMemberNames(input: CsharpNativeMemberNameInput): CsharpNativeMemberNames {
  const issues: TargetDiagnostic[] = [];
  const hiding: CsharpNativeMemberNames["memberHiding"][number][] = [];
  const nativeBindings = new Map<string, CsharpNativeTargetBindingFact | undefined>();
  const nativeSignatures = new Map<string, readonly NativeMemberSignature[] | undefined>();
  const artifacts = new Map(input.artifactClosure.artifacts.map(artifact => [artifact.key, artifact]));
  const classes = input.nodes.filter(node => (input.ast.is.IsClassDeclaration(node) || input.ast.is.IsClassExpression(node)) &&
    input.nativeUse.order(node) !== undefined && !input.metadata.compileTimeMetadata.get(node) &&
    !input.unreachable.get(node) && input.participation.get(node) !== "erased");
  const membersByClass = new Map<Node, readonly ProjectMember[]>();
  for (const declaration of classes) membersByClass.set(declaration, projectMembers(declaration));
  for (const declaration of classes) {
    const members = membersByClass.get(declaration)!;
    const definition = input.projectTypes.definitionContainingDeclaration(declaration);
    const separated = definition?.staticCompanion === true || input.factories.get(declaration) !== undefined;
    const groups = new Map<string, ProjectMember[]>();
    for (const member of members) {
      const group = groups.get(member.name) ?? [];
      const duplicateAccessor = member.accessor && group.some(previous => previous.accessor && previous.static === member.static);
      if (!duplicateAccessor && !separated) {
        const conflict = group.find(previous => previous.static !== member.static &&
          (previous.kind !== "method" || member.kind !== "method" || sameNativeParameters(previous, member)));
        if (conflict !== undefined) {
          const code = conflict.kind === "method" && member.kind === "method" ? "CS0111" : "CS0102";
          issues.push(Object.freeze({ code: "CSHARP_INVALID_IDENTIFIER", category: "error", source: "tsonic-csharp",
            sourceNode: input.ast.name(member.declaration),
            message: `Static member '${member.emittedName}' and instance member '${member.emittedName}' cannot share the emitted C# name '${member.emittedName}' (${code}).` }));
        }
      }
      if (!duplicateAccessor) group.push(member);
      groups.set(member.name, group);
    }
  }
  if (issues.length > 0) return Object.freeze({ issues: Object.freeze(issues), memberHiding: Object.freeze(hiding), declarationNames: Object.freeze([]) });
  for (const declaration of classes) {
    const members = membersByClass.get(declaration)!;
    const definition = input.projectTypes.definitionContainingDeclaration(declaration);
    const separated = definition?.staticCompanion === true || input.factories.get(declaration) !== undefined;
    const inherited = projectAncestors(declaration);
    let nativeBaseMembers: readonly NativeMemberSignature[] | undefined;
    let nativeRootMembers: readonly NativeMemberSignature[] | undefined;
    for (const member of members) {
      let hides = false;
      if (!member.overrides) {
        const separateStatic = separated && member.static;
        hides = !separateStatic && inherited.members.some(base => hidesMember(member, base));
        if (!hides) {
          if (separateStatic) nativeRootMembers ??= nativeMembers(undefined, "class", member.declaration);
          else nativeBaseMembers ??= nativeMembers(inherited.nativeBase, "class", member.declaration);
          const selected = separateStatic ? nativeRootMembers : nativeBaseMembers;
          if (selected === undefined) continue;
          hides = selected.some(base => hidesMember(member, base));
        }
      }
      hiding.push(Object.freeze({ subject: member.subject, hides }));
    }
    const factory = input.factories.get(declaration);
    if (factory !== undefined) {
      const root = nativeMembers(undefined, "class", declaration);
      if (root !== undefined) {
        const frames = new Set<Node>();
        for (const capture of factory.captures) {
          const shared = input.capturedBinding.get(capture.declaration);
          if (shared !== undefined) {
            if (frames.has(shared.frame.scope)) continue;
            frames.add(shared.frame.scope);
          }
          recordMember({ kind: "value", container: declaration, member: capture.fieldName, role: "member" }, {
            name: capture.fieldName, kind: "field", genericParameterIds: [], parameters: [],
          }, root);
        }
      }
      if (factory.retainsEnvironment) {
        nativeBaseMembers ??= nativeMembers(inherited.nativeBase, "class", declaration);
        if (nativeBaseMembers !== undefined) recordMember({ kind: "source", declaration, role: "storage" }, {
          name: factory.environmentName, kind: "field", genericParameterIds: [], parameters: [],
        }, [...inherited.members, ...nativeBaseMembers]);
      }
    }
  }
  moduleMembers();
  interfaceMembers();
  artifactMembers();
  valueMembers();
  const declarations = new Map<Node, string>();
  for (const members of membersByClass.values()) for (const member of members) {
    if (member.subject.kind !== "source" || member.subject.role !== "member") continue;
    declarations.set(member.subject.declaration, member.emittedName);
  }
  return Object.freeze({ issues: Object.freeze(issues), memberHiding: Object.freeze(hiding),
    declarationNames: Object.freeze([...declarations].map(([declaration, name]) => Object.freeze({ declaration, name }))) });

  function projectMembers(declaration: Node): readonly ProjectMember[] {
    return Object.freeze(sourceObjectMemberDeclarations(input.ast, declaration).flatMap(member => {
      if (member === undefined || input.metadata.compileTimeMetadata.get(member) || sourceClassFieldIsTypeOnly(input.ast, member)) return [];
      const method = input.ast.is.IsMethodDeclaration(member);
      if (method && input.participation.get(member) !== "body" && input.participation.get(member) !== "signature") return [];
      const kind = input.ast.kindName(member);
      const accessor = kind === "KindGetAccessor" || kind === "KindSetAccessor";
      if (!method && !accessor && kind !== "KindPropertyDeclaration" && kind !== "KindParameter") return [];
      const nameNode = input.ast.name(member);
      const selected = input.names.resolve(nameNode);
      const symbol = nameNode === undefined ? undefined : input.metadata.wellKnownSymbol.get(nameNode);
      const name = selected.kind === "resolved" ? selected.name : symbol === undefined ? undefined
        : csharpWellKnownSymbolTargetMemberName(symbol.kind);
      if (name === undefined) {
        if (sourceParameterIsProperty(input.ast, member)) return [];
        const description = method ? "Method name" : accessor ? "Accessor name" : "Class field";
        const message = nameNode === undefined
          ? `${description} must be present for direct C# source emission; backend name synthesis is not allowed without finalized TSTS/provider facts.`
          : selected.kind === "rejected" ? `${description} cannot be represented as an exact C# target name. ${selected.reason}` : undefined;
        if (message !== undefined) issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_NAME", category: "error",
          source: "tsonic-csharp", message, ...(!method && !accessor ? { sourceNode: member } : {}) }));
        return [];
      }
      const written = method && input.writes.get(member) !== undefined;
      const dispatch = method ? input.dispatch.get(member) : undefined;
      const contract: SourceCallableSourceContract | undefined = dispatch?.kind === "method" ? dispatch.implementation : undefined;
      if (method && !written && contract === undefined) return [];
      const sourceDispatch = input.dispatch.get(member);
      const selectedStorage = method || accessor ? undefined : input.classPropertyStorage.get(member);
      const primary: ProjectMember = Object.freeze({ declaration: member,
        subject: Object.freeze({ kind: "source" as const, declaration: member, role: "member" as const }),
        name: nativeName(name), emittedName: name,
        kind: method && !written ? "method" as const : selectedStorage?.kind === "field" ? "field" as const : "property" as const,
        static: input.ast.hasModifierKind(member, "static"), accessor,
        accessible: !input.ast.is.IsPrivateIdentifier(nameNode) && !input.ast.hasModifierKind(member, "private") ||
          input.helperAccess.get(member),
        overrides: !written && sourceDispatch?.overridesBase === true,
        genericParameterIds: written ? Object.freeze([]) : contract?.nativeSignature.methodTypeParameterIdentities ?? Object.freeze([]),
        parameters: contract === undefined || written ? Object.freeze([])
          : Object.freeze(contract.nativeParameters.map(parameter => parameter.targetParameter)) });
      const write = input.writes.get(member);
      if (write === undefined || contract === undefined) return [primary];
      return [primary, Object.freeze({ ...primary, name: nativeName(write.implementationName), emittedName: write.implementationName,
        subject: Object.freeze({ kind: "source" as const, declaration: member, role: "implementation" as const }),
        kind: "method" as const, accessible: false, overrides: false,
        genericParameterIds: contract.nativeSignature.methodTypeParameterIdentities, parameters: contract.nativeParameters.map(parameter => parameter.targetParameter) }),
      Object.freeze({ ...primary, name: nativeName(write.storageName), emittedName: write.storageName,
        subject: Object.freeze({ kind: "source" as const, declaration: member, role: "storage" as const }),
        kind: "field" as const, accessible: false, overrides: false, parameters: Object.freeze([]), genericParameterIds: Object.freeze([]) })];
    }));
  }

  function projectAncestors(declaration: Node): { readonly members: readonly NativeMemberSignature[]; readonly nativeBase: TargetTypeRef | undefined } {
    const members: NativeMemberSignature[] = [];
    let base = input.projectTypes.heritageForDeclaration(declaration)?.baseType;
    const visited = new Set<Node>();
    while (base !== undefined) {
      const heritage = input.projectTypes.heritageForTarget(base);
      if (heritage?.definition.kind !== "class" || visited.has(heritage.definition.declaration)) break;
      const definition = heritage.definition;
      visited.add(definition.declaration);
      const substitutions = projectSubstitutions(definition, base);
      const separated = definition.staticCompanion || input.factories.get(definition.declaration) !== undefined;
      for (const member of membersByClass.get(definition.declaration) ?? projectMembers(definition.declaration)) {
        if (!member.accessible || separated && member.static) continue;
        members.push(substituteMember(member, substitutions));
      }
      base = heritage.baseType;
    }
    return { members, nativeBase: base };
  }

  function recordMember(subject: CsharpNativeMemberIdentity, member: NativeMemberSignature,
    ancestors: readonly NativeMemberSignature[], overrides = false): void {
    hiding.push(Object.freeze({ subject: Object.freeze(subject), hides: !overrides && ancestors.some(base => hidesMember(member, base)) }));
  }

  function moduleMembers(): void {
    const roots = new Set(input.requiredBindingRoots);
    const seen = new Set<Node>();
    const moduleBindings: { readonly node: Node; readonly name: Node }[] = [];
    const binding = (node: Node, name: Node | undefined): void => {
      if (name === undefined) return;
      if (input.ast.is.IsIdentifier(name)) {
        if (!seen.has(node)) {
          seen.add(node);
          moduleBindings.push({ node, name });
        }
        return;
      }
      if (!input.ast.is.IsObjectBindingPattern(name) && !input.ast.is.IsArrayBindingPattern(name)) return;
      for (const element of input.ast.children(name)) {
        if (element !== undefined && input.ast.is.IsBindingElement(element)) binding(element, input.ast.name(element));
      }
    };
    for (const root of roots) {
      if (!sourceDeclarationIsModuleScoped(root, input.ast) || input.metadata.compileTimeMetadata.get(root) ||
        input.metadata.sourceStruct.get(root) !== undefined) continue;
      const declaration = AsVariableDeclaration(input.ast, root);
      if (declaration !== undefined) binding(root, declaration.name);
    }
    for (const node of input.nodes) {
      if (!sourceDeclarationIsModuleScoped(node, input.ast) || input.metadata.compileTimeMetadata.get(node) ||
        input.unreachable.get(node)) continue;
      if (input.ast.is.IsFunctionDeclaration(node) && input.participation.get(node) === "body") {
        const contract = input.callables.get({ kind: "declaration", declaration: node });
        const name = input.names.resolve(input.ast.name(node));
        if (contract === undefined || name.kind !== "resolved") continue;
        const ancestors = nativeMembers(undefined, "class", node);
        if (ancestors !== undefined) recordMember({ kind: "source", declaration: node, role: "member" }, {
          name: nativeName(name.name), kind: "method", genericParameterIds: contract.nativeSignature.methodTypeParameterIdentities,
          parameters: contract.nativeParameters.map(parameter => parameter.targetParameter),
        }, ancestors);
      } else if (input.ast.is.IsExportAssignment(node) && !input.ast.as.AsExportAssignment(node)?.IsExportEquals) {
        const ancestors = nativeMembers(undefined, "class", node);
        if (ancestors !== undefined) recordMember({ kind: "source", declaration: node, role: "member" }, {
          name: "default", kind: "property", genericParameterIds: [], parameters: [],
        }, ancestors);
      }
    }
    for (const { node, name } of moduleBindings) {
      const selected = input.names.resolve(name);
      if (selected.kind !== "resolved") continue;
      const declaration = AsVariableDeclaration(input.ast, node);
      const direct = input.moduleInitialization.callableVisibility.get(node) !== undefined;
      const carrier = declaration?.Initializer === undefined ? undefined : input.callableCreations.callableTarget.get(declaration.Initializer);
      const signature = carrier === undefined ? undefined : getCsharpDelegateSignature(carrier);
      if (direct && signature === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "An admitted module method requires its selected physical callable signature before name sealing.", node);
      const ancestors = nativeMembers(undefined, "class", node);
      if (ancestors === undefined) continue;
      recordMember({ kind: "source", declaration: node, role: "member" }, {
        name: nativeName(selected.name), kind: direct ? "method" : input.storage.nativeModuleField.get(node) ? "field" : "property",
        genericParameterIds: [], parameters: signature?.parameters.map((type, index) =>
          ({ type, passingMode: signature.parameterPassingModes[index]! })) ?? [],
      }, ancestors);
    }
  }

  function shapeSignature(member: CsharpObjectShapeMemberFact, name: string, kind: NativeMemberSignature["kind"]): NativeMemberSignature {
    const signature = kind === "method" ? getCsharpDelegateSignature(csharpPresentObjectShapeMethod(member)?.type) : undefined;
    if (kind === "method" && signature === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "An admitted native object method requires its closed physical signature before name sealing.");
    return { name: nativeName(name), kind,
      genericParameterIds: (member.typeParameters ?? []).map(parameter => parameter.identity),
      parameters: kind === "method" ? signature!.parameters.map((type, index) =>
        ({ type, passingMode: signature!.parameterPassingModes[index]! })) : [] };
  }

  function interfaceHeaders(shape: CsharpObjectShapeFact): readonly string[] {
    const names: string[] = [];
    const values = artifacts.get(objectShapeArtifactKey(shape))?.capabilities.includes("method-values") === true;
    for (const member of shape.members) {
      if (member.memberKind === "method") {
        if (values || member.optional === true) names.push(nativeName(objectShapeStorageMemberName(shape, member)));
        if (member.optional !== true) names.push(nativeName(member.targetName));
        if (member.methodValueContract !== undefined && targetTypeRefEquals(member.methodValueContract, shape.targetType))
          names.push(nativeName(objectShapeMethodInvocationName(member)));
      } else {
        names.push(nativeName(member.targetName));
        const backing = input.storage.nativeField.get(shape.targetType, member.targetName);
        if (backing !== undefined) names.push(nativeName(backing.storageName));
      }
    }
    if (artifacts.get(objectShapeArtifactKey(shape))?.capabilities.includes("enumerable-keys")) names.push(csharpEnumerableKeysMethodName);
    return names;
  }

  function interfaceAncestors(types: readonly TargetTypeRef[]): ReadonlySet<string> {
    const visited = new Set<string>();
    const names = new Set<string>();
    const visit = (type: TargetTypeRef): void => {
      const key = targetTypeRefKey(type);
      if (visited.has(key)) return;
      visited.add(key);
      const parent = input.artifactClosure.targetShapes[key];
      if (parent !== undefined) {
        for (const name of interfaceHeaders(parent)) names.add(name);
        for (const base of parent.implements ?? []) visit(base);
      }
      const project = input.projectTypes.heritageForTarget(type);
      if (project?.definition.kind !== "interface") return;
      for (const member of sourceObjectMemberDeclarations(input.ast, project.definition.declaration)) {
        if (member === undefined || input.metadata.compileTimeMetadata.get(member) ||
          !input.ast.is.IsMethodSignatureDeclaration(member) && !input.ast.is.IsPropertySignatureDeclaration(member)) continue;
        const selected = input.names.resolve(input.ast.name(member));
        if (selected.kind === "resolved") names.add(nativeName(selected.name));
      }
      for (const base of project.interfaces) visit(base);
    };
    for (const type of types) visit(type);
    return names;
  }

  function interfaceMembers(): void {
    for (const declaration of input.nodes) {
      if (!input.ast.is.IsInterfaceDeclaration(declaration) || input.metadata.compileTimeMetadata.get(declaration) ||
        input.unreachable.get(declaration) || input.participation.get(declaration) === "erased") continue;
      const inherited = interfaceAncestors(input.projectTypes.heritageForDeclaration(declaration)?.interfaces ?? []);
      for (const member of sourceObjectMemberDeclarations(input.ast, declaration)) {
        if (member === undefined || input.metadata.compileTimeMetadata.get(member)) continue;
        const method = input.ast.is.IsMethodSignatureDeclaration(member);
        if (method ? input.participation.get(member) !== "signature" : !input.ast.is.IsPropertySignatureDeclaration(member)) continue;
        const nameNode = input.ast.name(member);
        const selected = input.names.resolve(nameNode);
        if (selected.kind !== "resolved") {
          const description = method ? "Interface method name" : "Interface property name";
          issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_NAME", category: "error", source: "tsonic-csharp",
            message: nameNode === undefined
              ? `${description} must be present for direct C# source emission; backend name synthesis is not allowed without finalized TSTS/provider facts.`
              : `${description} cannot be represented as an exact C# target name. ${selected.reason}` }));
          continue;
        }
        hiding.push(Object.freeze({ subject: Object.freeze({ kind: "source" as const, declaration: member, role: "member" as const }),
          hides: inherited.has(nativeName(selected.name)) }));
      }
    }
  }

  function artifactMembers(): void {
    const declarations = new Set<string>();
    for (const requested of input.artifactClosure.artifacts) {
      const shape = requested.fact.declarationTemplate ?? requested.fact;
      const artifact = artifacts.get(objectShapeArtifactKey(shape))!;
      const source = artifact.materialization === "source"
        ? input.projectTypes.heritageForTarget(shape.targetType)?.definition : undefined;
      if (artifact.materialization === "source" && source?.kind !== "class" && source?.kind !== "interface") continue;
      const container = objectShapeArtifactKey(shape);
      if (declarations.has(container)) continue;
      declarations.add(container);
      const structural = source?.kind === "interface" || shape.targetType.kind === "target-named" &&
        "csharpStructuralContract" in shape.targetType && shape.targetType.csharpStructuralContract === true;
      const inheritedNames = structural ? interfaceAncestors(shape.implements ?? []) : undefined;
      const project = source?.kind === "class" ? projectAncestors(source.declaration) : undefined;
      const inherited = structural ? [] : nativeMembers(project?.nativeBase,
        shape.targetType.kind === "target-named" && "csharpValueType" in shape.targetType &&
          shape.targetType.csharpValueType === true ? "struct" : "class", source?.declaration);
      const ancestors = inherited === undefined ? undefined : [...project?.members ?? [], ...inherited];
      if (ancestors === undefined) continue;
      const frame = input.captureFrameShape.get(shape.targetType);
      const headers = new Set<string>();
      const recordHeader = (name: string, signature: NativeMemberSignature, overrides = false): void => {
        if (headers.has(name)) return;
        headers.add(name);
        const subject = Object.freeze({ kind: "artifact" as const, container, member: name, role: "member" as const });
        if (inheritedNames !== undefined) hiding.push(Object.freeze({ subject, hides: inheritedNames.has(nativeName(name)) }));
        else recordMember(subject, signature, ancestors, overrides);
      };
      const field = (name: string, kind: "field" | "property" = "field"): void => {
        recordHeader(name, { name: nativeName(name), kind, genericParameterIds: [], parameters: [] });
      };
      for (const member of shape.members) {
        if (artifact.capabilities.includes("js-freeze") && member.accessor === undefined && !structural) {
          field(csharpFrozenStorageName(shape, objectShapeStorageMemberName(shape, member)));
        }
        if (artifact.materialization === "source") {
          if (source?.kind === "interface" && member.memberKind === "method" &&
            (artifact.capabilities.includes("method-values") || member.optional === true)) {
            field(objectShapeStorageMemberName(shape, member), "property");
          }
          continue;
        }
        const method = csharpObjectShapeMethodDeclaration(shape, member);
        const kind = member.memberKind === "method" ? "method"
          : member.accessor !== undefined || structural || member.bound || (shape.implements?.length ?? 0) > 0 ? "property" : "field";
        const dispatch = method === undefined ? undefined : input.dispatch.get(method);
        // An optional method without an authored implementation emits no method header; an implemented one does.
        if (member.memberKind !== "method" || member.optional !== true || member.methodValueContract === undefined || method !== undefined) {
          recordHeader(member.targetName, shapeSignature(member, member.targetName, kind), dispatch?.overridesBase === true);
        }
        const storageName = objectShapeStorageMemberName(shape, member);
        if (storageName !== member.targetName) field(storageName,
          method !== undefined || structural ? "property" : "field");
        if (method !== undefined && member.methodValueStorage !== undefined) {
          recordHeader(objectShapeMethodBodyName(shape, member), shapeSignature(member, objectShapeMethodBodyName(shape, member), "method"));
          const names = objectShapeMethodValueStorageNames(shape, member);
          field(names.valueName);
          if (member.optional === true && member.methodValueContract !== undefined) field(names.initializedName);
        }
        if (structural && member.memberKind === "method" && member.methodValueContract !== undefined &&
          targetTypeRefEquals(member.methodValueContract, shape.targetType))
          recordHeader(objectShapeMethodInvocationName(member), shapeSignature(member, objectShapeMethodInvocationName(member), "method"));
        if (member.accessor !== undefined && !structural) {
          field(objectShapeAccessorGetterStorageMemberName(shape, member));
          if (member.accessor.setter) field(objectShapeAccessorSetterStorageMemberName(shape, member));
        }
        if (member.bound === true) field(objectShapeBoundStorageMemberName(shape, member));
        const backing = input.storage.nativeField.get(shape.targetType, member.targetName);
        if (backing !== undefined) field(backing.storageName, "property");
      }
      for (const binding of artifact.materialization === "synthetic" ? frame?.bindings ?? [] : []) {
        if (binding.initialization !== "deferred") continue;
        const names = csharpDeferredCaptureStorageNames(binding.fieldName);
        field(names.valueName);
        field(names.initializedName);
      }
      const capturedFrames = new Set<Node>();
      for (const capture of artifact.materialization === "synthetic" ? shape.methodImplementation?.captures ?? [] : []) {
        const shared = input.capturedBinding.get(capture.declaration);
        if (shared !== undefined) {
          if (capturedFrames.has(shared.frame.scope)) continue;
          capturedFrames.add(shared.frame.scope);
        }
        field(capture.fieldName);
      }
      for (const method of artifact.materialization === "synthetic" ? frame?.methods ?? [] : []) {
        const signature = getCsharpLambdaSignature(method.type);
        if (signature === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
          "An admitted capture method requires its final native callable signature before name sealing.", method.declaration);
        const contract = input.callables.get({ kind: "declaration", declaration: method.declaration });
        recordHeader(method.methodName, { name: nativeName(method.methodName), kind: "method",
          genericParameterIds: contract?.nativeSignature.methodTypeParameterIdentities ?? [],
          parameters: getCsharpExpressionTreeDelegateType(method.type) === undefined
            ? signature.parameters.map((type, index) => ({ type, passingMode: signature.parameterPassingModes[index]! })) : [] });
      }
      for (const projection of artifact.projections) {
        recordHeader(projection.methodName, { name: nativeName(projection.methodName), kind: "method",
          genericParameterIds: projection.typeParameters.map(parameter => parameter.identity),
          parameters: [{ type: projection.receiver.targetType, passingMode: "by-value" },
            ...(projection.selection.kind === "has-own" ? [{ type: csharpStringTargetType(), passingMode: "by-value" as const }]
              : projection.selection.kind === "assign" ? [{ type: projection.selection.sourceShape.targetType, passingMode: "by-value" as const }] : [])] });
      }
      if (artifact.capabilities.includes("enumerable-keys") && artifact.materialization === "synthetic") {
        recordHeader(csharpEnumerableKeysMethodName, { name: csharpEnumerableKeysMethodName,
          kind: "method", genericParameterIds: [], parameters: [] });
        if (!structural) field(csharpEnumerableKeysStorageName);
      }
      if (artifact.capabilities.includes("json-serialization") && !structural) {
        const projectionName = csharpJsonValueProjectionMethodName;
        const writerName = csharpJsonValueWriterMethodName;
        recordHeader(projectionName, { name: projectionName, kind: "method", genericParameterIds: [],
          parameters: [{ type: csharpStringTargetType(), passingMode: "by-value" }] });
        const candidates = ancestors.filter(member => member.name === writerName && member.kind === "method");
        if (candidates.length > 0) {
          const writer = nativeBinding("System.Text.Json.Utf8JsonWriter", true, source?.declaration);
          const context = nativeBinding("Tsonic.CSharp.Js.JsonWriteContext", true, source?.declaration);
          if (writer === undefined || context === undefined) continue;
          const writerType = writer.csharpInheritance.find(entry => entry.targetId === writer.id)!.type;
          const contextType = context.csharpInheritance.find(entry => entry.targetId === context.id)!.type;
          recordHeader(writerName, { name: writerName, kind: "method", genericParameterIds: [],
            parameters: [{ type: writerType, passingMode: "by-value" }, { type: contextType, passingMode: "by-value" },
              { type: csharpStringTargetType(), passingMode: "by-value" }] });
        } else {
          const subject = Object.freeze({ kind: "artifact" as const, container, member: writerName, role: "member" as const });
          hiding.push(Object.freeze({ subject, hides: ancestors.some(member => member.name === writerName) }));
        }
      }
    }
  }

  function valueMembers(): void {
    for (const node of input.nodes) {
      const selected = input.nativeValueCarriers.nativeValueDeclaration.get(node);
      if (selected === undefined) continue;
      const ancestors = nativeMembers(undefined, "struct", node);
      if (ancestors === undefined) continue;
      for (const field of selected.fields) {
        const name = field.bound?.member.targetName ?? field.source.sourceName;
        recordMember({ kind: "value", container: node, member: name, role: "member" }, {
          name: nativeName(name), kind: field.bound === undefined ? "field" : "property",
          genericParameterIds: [], parameters: [],
        }, ancestors);
        if (field.bound !== undefined) recordMember({ kind: "value", container: node,
          member: objectShapeBoundStorageMemberName(field.bound.owner, field.bound.member), role: "member" }, {
          name: nativeName(objectShapeBoundStorageMemberName(field.bound.owner, field.bound.member)), kind: "field",
          genericParameterIds: [], parameters: [],
        }, ancestors);
      }
    }
  }

  function nativeBinding(key: string, metadataName: boolean, subject: Node | undefined): CsharpNativeTargetBindingFact | undefined {
    const cacheKey = `${metadataName ? "metadata" : "target"}:${key}`;
    if (nativeBindings.has(cacheKey)) return nativeBindings.get(cacheKey);
    const selected = metadataName ? input.providers.findTargetBindingByMetadataName(key, "inheritance")
      : input.providers.findTargetBindingByTargetId(key, "inheritance");
    if (selected.kind === "rejected") {
      issues.push(targetDiagnosticFromExtension(subject, selected.diagnostic));
      nativeBindings.set(cacheKey, undefined);
      return undefined;
    }
    nativeBindings.set(cacheKey, selected.binding);
    nativeBindings.set(`target:${selected.binding.id}`, selected.binding);
    return selected.binding;
  }

  function nativeMembers(base: TargetTypeRef | undefined, root: "class" | "struct", subject: Node | undefined): readonly NativeMemberSignature[] | undefined {
    const key = base === undefined ? `root:${root}` : targetTypeRefKey(base);
    if (nativeSignatures.has(key)) return nativeSignatures.get(key);
    if (base !== undefined && base.kind !== "target-named") return failTargetAnalysisInvariant("tsonic-csharp",
      "An admitted native container requires its selected named class base before name sealing.", subject);
    const lookup = base === undefined ? undefined : csharpNativeInheritanceLookup(base);
    const binding = lookup === undefined ? nativeBinding(root === "struct" ? "System.ValueType" : "System.Object", true, subject)
      : lookup.kind === "metadata-name" ? nativeBinding(lookup.metadataName, true, subject)
      : nativeBinding(lookup.targetId, false, subject);
    if (binding === undefined) return undefined;
    const substitutions = base?.kind === "target-named"
      ? new Map((binding.typeParameters ?? []).map((parameter, index) => [parameter.identity, base.typeArguments![index]!]))
      : new Map<string, TargetTypeRef>();
    const members: NativeMemberSignature[] = [];
    for (const entry of binding.csharpInheritance) {
      const selected = entry.targetId === binding.id ? binding : nativeBinding(entry.targetId, false, subject);
      if (selected === undefined) return undefined;
      const type = substituteTargetTypeParameters(entry.type, substitutions);
      const arguments_ = type.kind === "target-named" ? type.typeArguments : undefined;
      const parameters = new Map((selected.typeParameters ?? []).map((parameter, index) => [parameter.identity,
        arguments_![index]!]));
      members.push(...selected.csharpInheritableMembers.map(member => substituteMember({ name: nativeName(member.targetName), kind: member.kind,
        genericParameterIds: member.genericParameterIds, parameters: member.parameters }, parameters)));
    }
    const result = Object.freeze(members);
    nativeSignatures.set(key, result);
    return result;
  }
}

function projectSubstitutions(definition: CsharpProjectTypeDefinition, selected: TargetTypeRef): ReadonlyMap<string, TargetTypeRef> {
  return new Map(definition.typeParameterBindings.map((parameter, index) => [parameter.identity,
    selected.kind === "target-named" ? selected.typeArguments![index]! : parameter]));
}

function substituteMember(member: NativeMemberSignature, substitutions: ReadonlyMap<string, TargetTypeRef>): NativeMemberSignature {
  const classBindings = new Map([...substitutions].filter(([identity]) => !member.genericParameterIds.includes(identity)));
  return Object.freeze({ ...member, parameters: Object.freeze(member.parameters.map(parameter => Object.freeze({ ...parameter,
    type: substituteTargetTypeParameters(parameter.type, classBindings) }))) });
}

function hidesMember(member: NativeMemberSignature, inherited: NativeMemberSignature): boolean {
  if (member.name !== inherited.name) return false;
  if (member.kind !== "method") return true;
  return inherited.kind !== "method" || sameNativeParameters(member, inherited);
}

function sameNativeParameters(left: NativeMemberSignature, right: NativeMemberSignature): boolean {
  if (left.genericParameterIds.length !== right.genericParameterIds.length || left.parameters.length !== right.parameters.length) return false;
  const substitutions = new Map(right.genericParameterIds.map((identity, index) => [identity,
    { kind: "type-parameter" as const, identity: left.genericParameterIds[index]!, name: "T" }]));
  return left.parameters.every((selected, index) => {
    const other = right.parameters[index]!;
    return selected.passingMode === other.passingMode && csharpTargetStorageIdentityEquals(selected.type,
      substituteTargetTypeParameters(other.type, substitutions));
  });
}

function nativeName(name: string): string {
  return name.startsWith("@") ? name.slice(1) : name;
}
