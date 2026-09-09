using System.Globalization;
using System.Reflection;

sealed partial class ReflectionProvider
{
    string? UnsupportedReturnTypeReason(MethodInfo method, string context)
    {
        var returnType = method.ReturnType;
        var returnNullability = nullability.Create(method.ReturnParameter);
        var returnNullabilityMetadata = NullableMetadata.ForParameter(method.ReturnParameter);
        var genericParameters = GenericParameterContext.ForMethod(method, method.DeclaringType!);
        var targetType = TypeRef(
            UnwrapByRef(returnType),
            genericParameters: genericParameters,
            typeNullability: returnNullability,
            typeNullabilityMetadata: returnNullabilityMetadata,
            signatureEvidence: SignatureEvidence(method.ReturnParameter));
        var sourceType = returnType.IsByRef
            ? ByRefReturnSourceType(
                returnType,
                genericParameters,
                returnNullability,
                returnNullabilityMetadata)
            : targetType;
        return targetType is null || sourceType is null
            ? $"{context} cannot be represented as closed .NET target type facts. {TypeRefFailureReason(returnType)}"
            : null;
    }

    string? UnsupportedParametersReason(ParameterInfo[] parameters, string context)
    {
        foreach (var parameter in parameters)
        {
            var parameterType = UnwrapByRef(parameter.ParameterType);
            if (TypeRef(
                parameterType,
                typeNullability: nullability.Create(parameter),
                typeNullabilityMetadata: NullableMetadata.ForParameter(parameter),
                signatureEvidence: SignatureEvidence(parameter)) is null)
            {
                return $"{context} contains parameter '{parameter.Name ?? ""}' with type '{TypeMetadataName(parameterType)}' that cannot be represented as closed .NET target type facts. {TypeRefFailureReason(parameterType)}";
            }
        }
        return null;
    }

    object? MethodSignature(
        MethodInfo method,
        GenericParameterContext? genericParameters = null,
        object? targetInvocation = null,
        StaticAdapterTypeParameterPlan? sourceTypeParameterPlan = null,
        string? targetName = null)
    {
        genericParameters ??= GenericParameterContext.ForMethod(method, method.DeclaringType!);
        var id = method.IsSpecialName && method.Name.StartsWith("op_", StringComparison.Ordinal) && !IsConversionOperator(method)
            ? OperatorId(method)
            : MethodId(method);
        var parameters = Parameters(method.GetParameters(), id, genericParameters);
        var returnNullability = nullability.Create(method.ReturnParameter);
        var returnNullabilityMetadata = NullableMetadata.ForParameter(method.ReturnParameter);
        var targetReturnType = TypeRef(
            UnwrapByRef(method.ReturnType),
            genericParameters: genericParameters,
            typeNullability: returnNullability,
            typeNullabilityMetadata: returnNullabilityMetadata,
            signatureEvidence: SignatureEvidence(method.ReturnParameter));
        var returnPassing = ReturnPassingMode(method.ReturnParameter);
        var returnType = returnPassing is null
            ? targetReturnType
            : ByRefReturnSourceType(
                method.ReturnType,
                genericParameters,
                returnNullability,
                returnNullabilityMetadata);
        if (parameters is null || returnType is null || targetReturnType is null)
        {
            return null;
        }
        var typeParameters = MethodTypeParameters(method, genericParameters);
        var attributes = AttributeFacts(method.GetCustomAttributesData(), "method", id);
        var returnAttributes = AttributeFacts(method.ReturnParameter.GetCustomAttributesData(), "return", $"{id}:return");
        var sourceId = SourceSignatureId(method, id);
        return new
        {
            id,
            sourceId,
            targetName = targetName ?? method.Name,
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            sourceTypeParameters = sourceTypeParameterPlan?.SourceTypeParameters,
            sourceTypeParameterRoles = sourceTypeParameterPlan?.SourceTypeParameterRoles,
            parameters,
            returnType,
            targetReturnType = returnPassing is null ? null : targetReturnType,
            returnPassing,
            returnAttributes = returnAttributes.Supported.Length == 0 ? null : returnAttributes.Supported,
            unsupportedReturnAttributes = returnAttributes.Unsupported.Length == 0 ? null : returnAttributes.Unsupported,
            targetInvocation,
        };
    }

    string SourceSignatureId(MethodInfo method, string id)
    {
        if (method.IsStatic || !method.IsVirtual)
        {
            return id;
        }
        var baseDefinition = MetadataBaseDefinition(method);
        if (baseDefinition == method ||
            baseDefinition.DeclaringType == method.DeclaringType ||
            !baseDefinition.IsPublic)
        {
            return id;
        }
        return MethodId(baseDefinition);
    }

    static MethodInfo MetadataBaseDefinition(MethodInfo method)
    {
        if ((method.Attributes & MethodAttributes.NewSlot) != 0)
        {
            return method;
        }
        var definition = method;
        for (var baseType = method.DeclaringType?.BaseType; baseType is not null; baseType = baseType.BaseType)
        {
            var matches = baseType
                .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(candidate => candidate.IsVirtual && MethodSlotKey(candidate) == MethodSlotKey(method))
                .ToArray();
            if (matches.Length > 1)
            {
                throw new InvalidOperationException($"Virtual method '{MethodId(method)}' has more than one metadata base-slot candidate on '{TypeMetadataName(baseType)}'.");
            }
            if (matches.Length == 1)
            {
                definition = matches[0];
            }
        }
        return definition;
    }

    static string MethodSlotKey(MethodInfo method)
    {
        return $"{method.Name}`{method.GetGenericArguments().Length}({string.Join(",", method.GetParameters().Select(parameter => $"{PassingMode(parameter)}:{TypeSlotKey(UnwrapByRef(parameter.ParameterType))}"))})";
    }

    static string TypeSlotKey(Type type)
    {
        if (type.IsGenericParameter)
        {
            return type.DeclaringMethod is null
                ? $"!{type.GenericParameterPosition}"
                : $"!!{type.GenericParameterPosition}";
        }
        if (type.IsArray)
        {
            return $"{TypeSlotKey(type.GetElementType()!)}{ArrayRankSuffix(type)}";
        }
        if (type.IsPointer)
        {
            return $"{TypeSlotKey(type.GetElementType()!)}*";
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            return $"{TargetId(type.GetGenericTypeDefinition())}<{string.Join(",", type.GetGenericArguments().Select(TypeSlotKey))}>";
        }
        return TargetId(type);
    }

    object? ConstructorSignature(Type type, ConstructorInfo constructor)
    {
        var id = ConstructorId(constructor);
        var parameters = Parameters(constructor.GetParameters(), id);
        if (parameters is null)
        {
            return null;
        }
        var attributes = AttributeFacts(constructor.GetCustomAttributesData(), "constructor", id);
        return new
        {
            id,
            sourceId = id,
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            parameters,
        };
    }

    object[]? Parameters(
        ParameterInfo[] parameters,
        string? ownerId = null,
        GenericParameterContext? genericParameters = null,
        GenericNullabilityContext? genericNullability = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        genericNullability ??= GenericNullabilityContext.Empty;
        var result = new List<object>();
        for (var index = 0; index < parameters.Length; index++)
        {
            var parameter = parameters[index];
            var parameterType = UnwrapByRef(parameter.ParameterType);
            var parameterNullability = genericNullability.Resolve(parameterType, nullability.Create(parameter))
                ?? throw new InvalidOperationException($"Parameter '{parameter.Name ?? index.ToString()}' has no nullability information.");
            var parameterNullabilityMetadata = genericNullability.ResolveMetadata(
                parameterType,
                NullableMetadata.ForParameter(parameter))
                ?? throw new InvalidOperationException($"Parameter '{parameter.Name ?? index.ToString()}' has no nullable metadata information.");
            var type = TypeRef(
                parameterType,
                genericParameters: genericParameters,
                typeNullability: parameterNullability,
                typeNullabilityMetadata: parameterNullabilityMetadata,
                genericNullability: genericNullability,
                signatureEvidence: SignatureEvidence(parameter));
            if (type is null)
            {
                return null;
            }
            var isParamsArray = HasRuntimeAttribute(parameter, typeof(ParamArrayAttribute)) && parameterType.IsArray;
            var sourceType = NullableParameterSourceTypeRef(
                parameterType,
                isParamsArray,
                parameterNullability,
                parameterNullabilityMetadata,
                genericParameters,
                genericNullability,
                SignatureEvidence(parameter));
            var defaultValue = ParameterDefaultValue(parameter, parameterType, ownerId, index, out var unsupportedDefaultValue);
            var attributes = ownerId is null
                ? null
                : AttributeFacts(parameter.GetCustomAttributesData(), "parameter", $"{ownerId}:parameter:{ParameterIdentifier(parameter, index)}");
            result.Add(new
            {
                name = ParameterIdentifier(parameter, index),
                type,
                sourceType,
                passingMode = PassingMode(parameter),
                optional = parameter.IsOptional ? true : (bool?)null,
                rest = isParamsArray ? true : (bool?)null,
                defaultValue,
                unsupportedDefaultValue,
                attributes = attributes is null || attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes is null || attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            });
        }
        return result.ToArray();
    }

    object? ParameterDefaultValue(ParameterInfo parameter, Type parameterType, string? ownerId, int parameterIndex, out object? unsupportedDefaultValue)
    {
        unsupportedDefaultValue = null;
        if (!TryGetRawDefaultValue(parameter, out var value, out var unsupportedReason))
        {
            if (unsupportedReason is not null)
            {
                unsupportedDefaultValue = UnsupportedParameterDefaultValue(parameter, parameterType, ownerId, parameterIndex, unsupportedReason);
            }
            return null;
        }
        if (value is null)
        {
            return new { kind = "null" };
        }

        parameterType = IsNullableShape(parameterType, out var nullableElement) ? nullableElement : parameterType;
        if (parameterType.IsEnum)
        {
            var enumDefaultValue = EnumParameterDefaultValue(parameterType, value);
            if (enumDefaultValue is null)
            {
                unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                    parameter,
                    parameterType,
                    ownerId,
                    parameterIndex,
                    $"Enum default value for '{parameterType.FullName ?? parameterType.Name}' has no deterministic underlying value.");
            }
            return enumDefaultValue;
        }
        if (IsRuntimeType(parameterType, typeof(string)) && value is string stringValue)
        {
            return new { kind = "string", value = stringValue };
        }
        if (IsRuntimeType(parameterType, typeof(string)))
        {
            unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                parameter,
                parameterType,
                ownerId,
                parameterIndex,
                "String default value metadata was not exposed as a deterministic string value.");
            return null;
        }

        var sourcePrimitiveName = SourcePrimitiveName(parameterType);
        if (sourcePrimitiveName is null)
        {
            unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                parameter,
                parameterType,
                ownerId,
                parameterIndex,
                $"Default value type '{parameterType.FullName ?? parameterType.Name}' is outside the supported .NET parameter default value set.");
            return null;
        }
        var sourcePrimitiveValue = SourcePrimitiveDefaultValue(parameterType, value);
        if (sourcePrimitiveValue is null)
        {
            unsupportedDefaultValue = UnsupportedParameterDefaultValue(
                parameter,
                parameterType,
                ownerId,
                parameterIndex,
                $"Source primitive default value '{parameterType.FullName ?? parameterType.Name}' cannot be serialized deterministically.");
            return null;
        }
        return new { kind = "source-primitive", name = sourcePrimitiveName, value = sourcePrimitiveValue };
    }

    object UnsupportedParameterDefaultValue(ParameterInfo parameter, Type parameterType, string? ownerId, int parameterIndex, string reason)
    {
        var owner = parameter.Member.DeclaringType is null
            ? parameter.Member.Name
            : $"{MetadataName(parameter.Member.DeclaringType)}.{parameter.Member.Name}";
        var parameterName = ParameterIdentifier(parameter, parameterIndex);
        var idOwner = ownerId ?? owner;
        return new
        {
            kind = "unsupported-default-value",
            id = $"{idOwner}:parameter:{parameterName}:default",
            parameterName,
            reason,
            evidence = new[]
            {
                new { message = $"Reflected from .NET parameter '{parameter.Name ?? ""}' on '{owner}' with default value type '{parameterType.FullName ?? parameterType.Name}'." },
            },
        };
    }

    static bool TryGetRawDefaultValue(ParameterInfo parameter, out object? value, out string? unsupportedReason)
    {
        value = null;
        unsupportedReason = null;
        try
        {
            if (!parameter.HasDefaultValue)
            {
                return false;
            }
            value = parameter.RawDefaultValue;
        }
        catch (Exception exception) when (
            exception is FormatException ||
            exception is InvalidOperationException ||
            exception is NotSupportedException ||
            exception is ArgumentException)
        {
            value = null;
            unsupportedReason = $"Raw default value metadata could not be read deterministically: {exception.GetType().Name}: {exception.Message}";
            return false;
        }
        return value is not DBNull && value is not Missing;
    }

    static object? EnumParameterDefaultValue(Type enumType, object value)
    {
        var underlyingType = EnumUnderlyingType(enumType);
        var underlyingValue = SourcePrimitiveDefaultValue(underlyingType, value);
        if (underlyingValue is null)
        {
            return null;
        }
        return new
        {
            kind = "enum",
            value = Convert.ToString(underlyingValue, CultureInfo.InvariantCulture),
            fieldName = EnumFieldName(enumType, underlyingType, value),
        };
    }

    static object? SourcePrimitiveDefaultValue(Type primitiveType, object value)
    {
        if (IsRuntimeType(primitiveType, typeof(bool)) && value is bool boolValue)
        {
            return boolValue;
        }
        if (IsRuntimeType(primitiveType, typeof(char)) && value is char charValue)
        {
            return charValue.ToString();
        }
        if (IsRuntimeType(primitiveType, typeof(float)))
        {
            return Convert.ToSingle(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(double)))
        {
            return Convert.ToDouble(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(decimal)))
        {
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(Half)))
        {
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(nint)))
        {
            return Convert.ToInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        if (IsRuntimeType(primitiveType, typeof(nuint)))
        {
            return Convert.ToUInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        return IsIntegerPrimitive(primitiveType)
            ? InvariantString(value)
            : null;
    }

    static string InvariantString(object value)
    {
        return value is IFormattable formattable
            ? formattable.ToString(null, CultureInfo.InvariantCulture)
            : value.ToString() ?? "";
    }

    static bool IsIntegerPrimitive(Type type)
    {
        return IsRuntimeType(type, typeof(sbyte)) ||
            IsRuntimeType(type, typeof(byte)) ||
            IsRuntimeType(type, typeof(short)) ||
            IsRuntimeType(type, typeof(ushort)) ||
            IsRuntimeType(type, typeof(int)) ||
            IsRuntimeType(type, typeof(uint)) ||
            IsRuntimeType(type, typeof(long)) ||
            IsRuntimeType(type, typeof(ulong)) ||
            IsRuntimeType(type, typeof(Int128)) ||
            IsRuntimeType(type, typeof(UInt128));
    }

    static string PassingMode(ParameterInfo parameter)
    {
        if (!parameter.ParameterType.IsByRef)
        {
            return "by-value";
        }
        if (parameter.IsOut)
        {
            return "byref-writeonly-must-init";
        }
        return HasRuntimeAttribute(parameter, typeof(System.Runtime.InteropServices.InAttribute))
            ? "byref-readonly"
            : "byref-readwrite";
    }

    static string? ReturnPassingMode(ParameterInfo? parameter)
    {
        if (parameter is null || !parameter.ParameterType.IsByRef)
        {
            return null;
        }
        var readonlyReturn = parameter.IsIn ||
            HasRuntimeAttribute(parameter, typeof(System.Runtime.CompilerServices.IsReadOnlyAttribute)) ||
            parameter.GetRequiredCustomModifiers().Contains(typeof(System.Runtime.CompilerServices.IsReadOnlyAttribute)) ||
            parameter.GetRequiredCustomModifiers().Contains(typeof(System.Runtime.InteropServices.InAttribute));
        return readonlyReturn ? "byref-readonly" : "byref-readwrite";
    }

    object? ByRefReturnSourceType(
        Type returnType,
        GenericParameterContext genericParameters,
        NullabilityInfo? returnNullability,
        NullableMetadata? returnNullabilityMetadata)
    {
        var pointee = SourceShape(
            UnwrapByRef(returnType),
            genericParameters,
            returnNullability,
            returnNullabilityMetadata);
        return pointee is null
            ? null
            : new
            {
                kind = "provider-ref",
                moduleSpecifier = "@tsonic/core/types.js",
                exportName = "Pointer",
                typeArguments = new[] { pointee },
            };
    }

}
