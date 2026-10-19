using System.Reflection;

sealed partial class ReflectionProvider
{
    readonly Dictionary<MemberInfo, SignatureMemberEvidence> signatureEvidenceByMember =
        new(ReferenceEqualityComparer.Instance);

    SignatureTypeEvidence? SignatureEvidence(FieldInfo field)
    {
        return ContainsFunctionPointer(field.FieldType)
            ? UnwrappedSignatureEvidence(field.FieldType, SignatureEvidence((MemberInfo)field).Type)
            : null;
    }

    SignatureTypeEvidence? SignatureEvidence(PropertyInfo property)
    {
        return ContainsFunctionPointer(property.PropertyType)
            ? UnwrappedSignatureEvidence(property.PropertyType, SignatureEvidence((MemberInfo)property).ReturnType)
            : null;
    }

    SignatureTypeEvidence? SignatureEvidence(ParameterInfo parameter)
    {
        if (!ContainsFunctionPointer(parameter.ParameterType))
        {
            return null;
        }
        var evidence = SignatureEvidence(parameter.Member);
        if (parameter.Position < 0)
        {
            return UnwrappedSignatureEvidence(parameter.ParameterType, evidence.ReturnType);
        }
        if (parameter.Position >= evidence.ParameterTypes.Length)
        {
            throw new InvalidOperationException(
                $"Metadata parameter position {parameter.Position} is outside the signature for '{parameter.Member}'.");
        }
        return UnwrappedSignatureEvidence(parameter.ParameterType, evidence.ParameterTypes[parameter.Position]);
    }

    static SignatureTypeEvidence? UnwrappedSignatureEvidence(Type type, SignatureTypeEvidence? evidence) =>
        type.IsByRef ? evidence?.ElementType : evidence;

    SignatureMemberEvidence SignatureEvidence(MemberInfo member)
    {
        if (signatureEvidenceByMember.TryGetValue(member, out var cached))
        {
            return cached;
        }
        var evidence = member switch
        {
            FieldInfo field => new SignatureMemberEvidence(
                ModifiedSignatureEvidence(field.GetModifiedFieldType()), null, []),
            PropertyInfo property => new SignatureMemberEvidence(
                null, ModifiedSignatureEvidence(property.GetModifiedPropertyType()),
                property.GetIndexParameters().Select(parameter =>
                    ModifiedSignatureEvidence(parameter.GetModifiedParameterType())).ToArray()),
            MethodInfo method => new SignatureMemberEvidence(
                null, ModifiedSignatureEvidence(method.ReturnParameter.GetModifiedParameterType()),
                method.GetParameters().Select(parameter =>
                    ModifiedSignatureEvidence(parameter.GetModifiedParameterType())).ToArray()),
            ConstructorInfo constructor => new SignatureMemberEvidence(
                null, null, constructor.GetParameters().Select(parameter =>
                    ModifiedSignatureEvidence(parameter.GetModifiedParameterType())).ToArray()),
            _ => throw new InvalidOperationException(
                $"Member '{member}' has no supported native modified-signature representation."),
        };
        signatureEvidenceByMember.Add(member, evidence);
        return evidence;
    }

    static SignatureTypeEvidence ModifiedSignatureEvidence(Type modified)
    {
        var type = modified.UnderlyingSystemType;
        var functionPointer = type.IsFunctionPointer
            ? new FunctionPointerSignatureEvidence(
                (type.IsUnmanagedFunctionPointer ? new[] { "unmanaged" } : ["managed"])
                    .Concat(modified.GetFunctionPointerCallingConventions()
                        .Select(CallingConventionName).OrderBy(name => name, StringComparer.Ordinal))
                    .Distinct(StringComparer.Ordinal).ToArray(),
                modified.GetFunctionPointerParameterTypes().Select(ModifiedSignatureEvidence).ToArray(),
                ModifiedSignatureEvidence(modified.GetFunctionPointerReturnType()))
            : null;
        return new SignatureTypeEvidence(
            type.HasElementType ? ModifiedSignatureEvidence(modified.GetElementType()!) : null,
            type.IsConstructedGenericType ? modified.GetGenericArguments().Select(ModifiedSignatureEvidence).ToArray() : null,
            functionPointer,
            modified.GetRequiredCustomModifiers().Select(modifier => TargetId(modifier.UnderlyingSystemType)).ToArray(),
            modified.GetOptionalCustomModifiers().Select(modifier => TargetId(modifier.UnderlyingSystemType)).ToArray());
    }

    static string CallingConventionName(Type convention) => convention.UnderlyingSystemType.FullName switch
    {
        "System.Runtime.CompilerServices.CallConvCdecl" => "Cdecl",
        "System.Runtime.CompilerServices.CallConvFastcall" => "Fastcall",
        "System.Runtime.CompilerServices.CallConvMemberFunction" => "MemberFunction",
        "System.Runtime.CompilerServices.CallConvStdcall" => "Stdcall",
        "System.Runtime.CompilerServices.CallConvSuppressGCTransition" => "SuppressGCTransition",
        "System.Runtime.CompilerServices.CallConvSwift" => "Swift",
        "System.Runtime.CompilerServices.CallConvThiscall" => "Thiscall",
        _ => throw new InvalidOperationException(
            $"Function-pointer calling convention '{convention.UnderlyingSystemType.FullName}' is not representable by the provider ABI contract."),
    };

    static bool ContainsFunctionPointer(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsFunctionPointer)
        {
            return true;
        }
        if (type.IsArray || type.IsPointer)
        {
            return ContainsFunctionPointer(type.GetElementType()!);
        }
        return type.IsConstructedGenericType && type.GetGenericArguments().Any(ContainsFunctionPointer);
    }

    sealed record SignatureMemberEvidence(
        SignatureTypeEvidence? Type,
        SignatureTypeEvidence? ReturnType,
        SignatureTypeEvidence[] ParameterTypes);

    sealed record FunctionPointerSignatureEvidence(
        string[] Abi,
        SignatureTypeEvidence[] Parameters,
        SignatureTypeEvidence Result);

    sealed record SignatureTypeEvidence(
        SignatureTypeEvidence? ElementType,
        SignatureTypeEvidence[]? TypeArguments,
        FunctionPointerSignatureEvidence? FunctionPointer,
        string[] RequiredCustomModifiers,
        string[] OptionalCustomModifiers);
}
