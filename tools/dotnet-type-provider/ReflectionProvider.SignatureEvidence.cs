using System.Collections.Immutable;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;

sealed partial class ReflectionProvider
{
    readonly Dictionary<string, SignatureMemberEvidence> signatureEvidenceByMember = new(StringComparer.Ordinal);

    SignatureTypeEvidence? SignatureEvidence(FieldInfo field)
    {
        return ContainsFunctionPointer(field.FieldType)
            ? SignatureEvidence((MemberInfo)field).Type
            : null;
    }

    SignatureTypeEvidence? SignatureEvidence(PropertyInfo property)
    {
        return ContainsFunctionPointer(property.PropertyType)
            ? SignatureEvidence((MemberInfo)property).ReturnType
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
            return evidence.ReturnType;
        }
        if (parameter.Position >= evidence.ParameterTypes.Length)
        {
            throw new InvalidOperationException(
                $"Metadata parameter position {parameter.Position} is outside the signature for '{parameter.Member}'.");
        }
        return evidence.ParameterTypes[parameter.Position];
    }

    SignatureMemberEvidence SignatureEvidence(MemberInfo member)
    {
        var path = member.Module.Assembly.Location;
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException($"Assembly containing '{member}' has no deterministic metadata path.");
        }
        var key = $"{Path.GetFullPath(path)}\0{member.MetadataToken}\0{member.MemberType}";
        if (signatureEvidenceByMember.TryGetValue(key, out var cached))
        {
            return cached;
        }
        using var stream = File.OpenRead(path);
        using var peReader = new PEReader(stream, PEStreamOptions.PrefetchMetadata);
        var metadata = peReader.GetMetadataReader();
        var provider = new SignatureEvidenceProvider();
        var handle = MetadataTokens.Handle(member.MetadataToken);
        var decoded = member switch
        {
            FieldInfo when handle.Kind == HandleKind.FieldDefinition =>
                new SignatureMemberEvidence(
                    metadata.GetFieldDefinition((FieldDefinitionHandle)handle).DecodeSignature(provider, 0),
                    null,
                    []),
            PropertyInfo when handle.Kind == HandleKind.PropertyDefinition =>
                CallableSignatureEvidence(
                    metadata.GetPropertyDefinition((PropertyDefinitionHandle)handle).DecodeSignature(provider, 0)),
            MethodBase when handle.Kind == HandleKind.MethodDefinition =>
                CallableSignatureEvidence(
                    metadata.GetMethodDefinition((MethodDefinitionHandle)handle).DecodeSignature(provider, 0)),
            _ => throw new InvalidOperationException(
                $"Metadata token for '{member}' has unexpected handle kind '{handle.Kind}'."),
        };
        signatureEvidenceByMember.Add(key, decoded);
        return decoded;
    }

    static SignatureMemberEvidence CallableSignatureEvidence(
        MethodSignature<SignatureTypeEvidence> signature)
    {
        return new SignatureMemberEvidence(
            null,
            signature.ReturnType,
            signature.ParameterTypes.ToArray());
    }

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
        string? MetadataName = null,
        SignatureTypeEvidence? ElementType = null,
        SignatureTypeEvidence[]? TypeArguments = null,
        FunctionPointerSignatureEvidence? FunctionPointer = null,
        string[]? CustomModifiers = null);

    sealed class SignatureEvidenceProvider : ISignatureTypeProvider<SignatureTypeEvidence, int>
    {
        static readonly IReadOnlyDictionary<string, string> CallingConventionModifiers =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["System.Runtime.CompilerServices.CallConvCdecl"] = "Cdecl",
                ["System.Runtime.CompilerServices.CallConvFastcall"] = "Fastcall",
                ["System.Runtime.CompilerServices.CallConvMemberFunction"] = "MemberFunction",
                ["System.Runtime.CompilerServices.CallConvStdcall"] = "Stdcall",
                ["System.Runtime.CompilerServices.CallConvSuppressGCTransition"] = "SuppressGCTransition",
                ["System.Runtime.CompilerServices.CallConvSwift"] = "Swift",
                ["System.Runtime.CompilerServices.CallConvThiscall"] = "Thiscall",
            };

        public SignatureTypeEvidence GetArrayType(SignatureTypeEvidence elementType, ArrayShape shape) =>
            new(ElementType: elementType);

        public SignatureTypeEvidence GetByReferenceType(SignatureTypeEvidence elementType) => elementType;

        public SignatureTypeEvidence GetFunctionPointerType(
            MethodSignature<SignatureTypeEvidence> signature)
        {
            var abi = FunctionPointerAbi(signature);
            return new SignatureTypeEvidence(
                FunctionPointer: new FunctionPointerSignatureEvidence(
                    abi,
                    signature.ParameterTypes.ToArray(),
                    signature.ReturnType));
        }

        public SignatureTypeEvidence GetGenericInstantiation(
            SignatureTypeEvidence genericType,
            ImmutableArray<SignatureTypeEvidence> typeArguments) =>
            new(TypeArguments: typeArguments.ToArray());

        public SignatureTypeEvidence GetGenericMethodParameter(int genericContext, int index) => new();

        public SignatureTypeEvidence GetGenericTypeParameter(int genericContext, int index) => new();

        public SignatureTypeEvidence GetModifiedType(
            SignatureTypeEvidence modifier,
            SignatureTypeEvidence unmodifiedType,
            bool isRequired)
        {
            if (modifier.MetadataName is null)
            {
                throw new InvalidOperationException("A signature custom modifier has no exact metadata identity.");
            }
            return unmodifiedType with
            {
                CustomModifiers = (unmodifiedType.CustomModifiers ?? []).Append(modifier.MetadataName).ToArray(),
            };
        }

        public SignatureTypeEvidence GetPinnedType(SignatureTypeEvidence elementType) => elementType;

        public SignatureTypeEvidence GetPointerType(SignatureTypeEvidence elementType) =>
            new(ElementType: elementType);

        public SignatureTypeEvidence GetPrimitiveType(PrimitiveTypeCode typeCode) => new();

        public SignatureTypeEvidence GetSZArrayType(SignatureTypeEvidence elementType) =>
            new(ElementType: elementType);

        public SignatureTypeEvidence GetTypeFromDefinition(
            MetadataReader reader,
            TypeDefinitionHandle handle,
            byte rawTypeKind)
        {
            var definition = reader.GetTypeDefinition(handle);
            return new SignatureTypeEvidence(MetadataName(reader, definition.Namespace, definition.Name));
        }

        public SignatureTypeEvidence GetTypeFromReference(
            MetadataReader reader,
            TypeReferenceHandle handle,
            byte rawTypeKind)
        {
            var reference = reader.GetTypeReference(handle);
            return new SignatureTypeEvidence(MetadataName(reader, reference.Namespace, reference.Name));
        }

        public SignatureTypeEvidence GetTypeFromSpecification(
            MetadataReader reader,
            int genericContext,
            TypeSpecificationHandle handle,
            byte rawTypeKind) =>
            reader.GetTypeSpecification(handle).DecodeSignature(this, genericContext);

        static string[] FunctionPointerAbi(MethodSignature<SignatureTypeEvidence> signature)
        {
            var baseAbi = signature.Header.CallingConvention switch
            {
                SignatureCallingConvention.Default => new[] { "managed" },
                SignatureCallingConvention.CDecl => new[] { "unmanaged", "Cdecl" },
                SignatureCallingConvention.FastCall => new[] { "unmanaged", "Fastcall" },
                SignatureCallingConvention.StdCall => new[] { "unmanaged", "Stdcall" },
                SignatureCallingConvention.ThisCall => new[] { "unmanaged", "Thiscall" },
                SignatureCallingConvention.Unmanaged => new[] { "unmanaged" },
                _ => throw new InvalidOperationException(
                    $"Function-pointer calling convention '{signature.Header.CallingConvention}' is not representable by the provider ABI contract."),
            };
            var modifiers = (signature.ReturnType.CustomModifiers ?? [])
                .Where(CallingConventionModifiers.ContainsKey)
                .Select(modifier => CallingConventionModifiers[modifier])
                .OrderBy(modifier => modifier, StringComparer.Ordinal)
                .ToArray();
            return baseAbi.Concat(modifiers).Distinct(StringComparer.Ordinal).ToArray();
        }

        static string MetadataName(
            MetadataReader reader,
            StringHandle namespaceHandle,
            StringHandle nameHandle)
        {
            var namespaceName = reader.GetString(namespaceHandle);
            var name = reader.GetString(nameHandle);
            return namespaceName.Length == 0 ? name : $"{namespaceName}.{name}";
        }
    }
}
