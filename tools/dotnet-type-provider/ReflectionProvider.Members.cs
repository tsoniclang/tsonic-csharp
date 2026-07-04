using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    IEnumerable<object> Members(Type type)
    {
        foreach (var member in Constructors(type))
        {
            yield return member;
        }

        foreach (var member in Properties(type))
        {
            yield return member;
        }

        foreach (var member in Fields(type))
        {
            yield return member;
        }

        foreach (var member in Events(type))
        {
            yield return member;
        }

        foreach (var group in Methods(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = SourceMemberName(first.Name),
                targetName = first.Name,
                targetId = $"{TargetId(type)}.{first.Name}",
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                receiverPassing = IsExtensionMethod(first) ? "first-argument" : null,
                signatures,
            };
        }

        foreach (var group in Operators(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "operator",
                sourceName = SourceMemberName(first.Name),
                targetName = first.Name,
                targetId = $"{TargetId(type)}.{first.Name}",
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }
    }

    IEnumerable<object> ConversionOperators(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(IsConversionOperator)
            .Where(method => UnsupportedOperatorReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var parameters = method.GetParameters();
            if (parameters.Length != 1)
            {
                continue;
            }
            var sourceType = TypeRef(UnwrapByRef(parameters[0].ParameterType));
            var targetType = TypeRef(method.ReturnType);
            if (sourceType is null || targetType is null)
            {
                continue;
            }
            yield return new
            {
                id = MethodId(method),
                targetName = method.Name,
                metadataName = MethodMetadataId(method),
                conversionKind = method.Name == "op_Implicit" ? "implicit" : "explicit",
                sourceType,
                targetType,
            };
        }
    }

    object[] UnsupportedMembers(Type type)
    {
        return UnsupportedConstructors(type)
            .Concat(UnsupportedProperties(type))
            .Concat(UnsupportedFields(type))
            .Concat(UnsupportedMethods(type))
            .Concat(UnsupportedOperators(type))
            .Concat(UnsupportedSourceEvents(type))
            .ToArray();
    }

    IEnumerable<object> Constructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var signature = ConstructorSignature(type, constructor);
            if (signature is null)
            {
                continue;
            }
            yield return new
            {
                kind = "constructor",
                sourceName = "constructor",
                targetName = ".ctor",
                targetId = ConstructorId(constructor),
                metadataName = ConstructorMetadataName(constructor),
                signatures = new[] { signature },
            };
        }
    }

    IEnumerable<object> UnsupportedConstructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var reason = UnsupportedConstructorReason(constructor);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "constructor",
                "constructor",
                ".ctor",
                ConstructorId(constructor),
                ConstructorMetadataName(constructor),
                false,
                reason);
        }
    }

    string? UnsupportedConstructorReason(ConstructorInfo constructor)
    {
        return UnsupportedParametersReason(constructor.GetParameters(), "Constructor signature");
    }

    IEnumerable<object> Properties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            if (UnsupportedPropertyReason(type, property) is not null)
            {
                continue;
            }
            var accessors = property.GetAccessors(false);
            if (accessors.Length == 0)
            {
                continue;
            }
            var attributes = AttributeFacts(property.GetCustomAttributesData(), "property", $"{TargetId(type)}.{property.Name}");
            var indexParameters = property.GetIndexParameters();
            if (indexParameters.Length > 0)
            {
                if (indexParameters.Length != 1)
                {
                    continue;
                }
                var targetId = $"{TargetId(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeTargetId(UnwrapByRef(parameter.ParameterType))))})";
                var metadataName = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})";
                var parameters = Parameters(indexParameters, targetId);
                var returnType = TypeRef(property.PropertyType);
                if (parameters is null || returnType is null)
                {
                    continue;
                }
                yield return new
                {
                    kind = "indexer",
                    sourceName = SourceMemberName(property.Name),
                    targetName = property.Name,
                    targetId,
                    metadataName,
                    @static = accessors[0].IsStatic ? true : (bool?)null,
                    readable = HasPublicGetter(property) ? true : (bool?)null,
                    writable = HasPublicSetter(property) ? true : (bool?)null,
                    attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                    unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
                    signatures = new[]
                    {
                        new
                        {
                            id = targetId,
                            targetName = property.Name,
                            parameters,
                            returnType,
                        },
                    },
                };
                continue;
            }

            var typeRef = TypeRef(property.PropertyType);
            if (typeRef is null)
            {
                continue;
            }
            var isStatic = accessors[0].IsStatic;
            if ((type.IsInterface && isStatic) || (isStatic && UsesDeclaringTypeParameter(property.PropertyType, type)))
            {
                continue;
            }
            yield return new
            {
                kind = "property",
                sourceName = SourceMemberName(property.Name),
                targetName = property.Name,
                targetId = $"{TargetId(type)}.{property.Name}",
                metadataName = $"{MetadataName(type)}.{property.Name}",
                @static = isStatic ? true : (bool?)null,
                readable = HasPublicGetter(property) ? true : (bool?)null,
                writable = HasPublicSetter(property) ? true : (bool?)null,
                type = typeRef,
                attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            };
        }
    }

    IEnumerable<object> UnsupportedProperties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var reason = UnsupportedPropertyReason(type, property);
            if (reason is null)
            {
                continue;
            }
            var accessors = property.GetAccessors(false);
            var isStatic = accessors.Length > 0 && accessors[0].IsStatic;
            var indexParameters = property.GetIndexParameters();
            var memberKind = indexParameters.Length > 0 ? "indexer" : "property";
            var targetId = indexParameters.Length > 0
                ? $"{TargetId(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeTargetId(UnwrapByRef(parameter.ParameterType))))})"
                : $"{TargetId(type)}.{property.Name}";
            var metadataName = indexParameters.Length > 0
                ? $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})"
                : $"{MetadataName(type)}.{property.Name}";
            yield return UnsupportedMember(
                memberKind,
                SourceMemberName(property.Name),
                property.Name,
                targetId,
                metadataName,
                isStatic,
                reason);
        }
    }

    string? UnsupportedPropertyReason(Type type, PropertyInfo property)
    {
        var accessors = property.GetAccessors(false);
        if (accessors.Length == 0)
        {
            return "Property has no public accessor visible to the provider.";
        }
        if (property.PropertyType.IsByRef)
        {
            return "By-reference property or indexer returns require an explicit provider ref-return declaration model before they can be exposed safely.";
        }
        var indexParameters = property.GetIndexParameters();
        if (indexParameters.Length > 0)
        {
            if (indexParameters.Length != 1)
            {
                return "Indexers with multiple parameters require a provider multi-indexer declaration model before they can be exposed safely.";
            }
            if (Parameters(indexParameters) is null)
            {
                return UnsupportedParametersReason(indexParameters, "Indexer signature")!;
            }
            if (TypeRef(property.PropertyType) is null)
            {
                return $"Indexer return type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(property.PropertyType)}";
            }
        }
        if (TypeRef(property.PropertyType) is null)
        {
            return $"Property type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(property.PropertyType)}";
        }
        var isStatic = accessors[0].IsStatic;
        if (type.IsInterface && isStatic)
        {
            return "Static interface properties require a provider static-interface-member declaration model before they can be exposed safely.";
        }
        if (isStatic && UsesDeclaringTypeParameter(property.PropertyType, type))
        {
            return "Static properties that use a declaring generic type parameter require a provider generic-static-member declaration model before they can be exposed safely.";
        }
        if (!HasPublicGetter(property))
        {
            return "Write-only properties require a provider write-only member declaration model before they can be exposed safely.";
        }
        return null;
    }

    IEnumerable<object> Fields(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            if (field.IsSpecialName)
            {
                continue;
            }
            var typeRef = TypeRef(field.FieldType);
            if (typeRef is null)
            {
                continue;
            }
            if ((type.IsInterface && field.IsStatic) || (field.IsStatic && UsesDeclaringTypeParameter(field.FieldType, type)))
            {
                continue;
            }
            var attributes = AttributeFacts(field.GetCustomAttributesData(), "field", $"{TargetId(type)}.{field.Name}");
            yield return new
            {
                kind = "field",
                sourceName = SourceMemberName(field.Name),
                targetName = field.Name,
                targetId = $"{TargetId(type)}.{field.Name}",
                metadataName = $"{MetadataName(type)}.{field.Name}",
                @static = field.IsStatic ? true : (bool?)null,
                readable = true,
                writable = !field.IsLiteral && !field.IsInitOnly ? true : (bool?)null,
                type = typeRef,
                attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            };
        }
    }

    IEnumerable<object> UnsupportedFields(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            var reason = UnsupportedFieldReason(type, field);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "field",
                SourceMemberName(field.Name),
                field.Name,
                $"{TargetId(type)}.{field.Name}",
                $"{MetadataName(type)}.{field.Name}",
                field.IsStatic,
                reason);
        }
    }

    string? UnsupportedFieldReason(Type type, FieldInfo field)
    {
        if (field.IsSpecialName)
        {
            return "Special-name fields are target-only CLR implementation details and are not exposed as source declarations.";
        }
        if (TypeRef(field.FieldType) is null)
        {
            return $"Field type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(field.FieldType)}";
        }
        if (type.IsInterface && field.IsStatic)
        {
            return "Static interface fields require a provider static-interface-member declaration model before they can be exposed safely.";
        }
        if (field.IsStatic && UsesDeclaringTypeParameter(field.FieldType, type))
        {
            return "Static fields that use a declaring generic type parameter require a provider generic-static-member declaration model before they can be exposed safely.";
        }
        return null;
    }

    IEnumerable<object> Events(Type type)
    {
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(eventInfo => eventInfo.Name, StringComparer.Ordinal))
        {
            var eventHandlerType = eventInfo.EventHandlerType;
            if (eventHandlerType is null)
            {
                continue;
            }
            var typeRef = TypeRef(eventHandlerType);
            if (typeRef is null)
            {
                continue;
            }
            var accessor = EventAccessor(eventInfo);
            if (accessor is null)
            {
                continue;
            }
            var attributes = AttributeFacts(eventInfo.GetCustomAttributesData(), "event", EventTargetId(type, eventInfo));
            yield return new
            {
                kind = "event",
                sourceName = SourceMemberName(eventInfo.Name),
                targetName = eventInfo.Name,
                targetId = EventTargetId(type, eventInfo),
                metadataName = EventMetadataName(type, eventInfo),
                @static = accessor.IsStatic ? true : (bool?)null,
                readable = false,
                writable = false,
                type = typeRef,
                attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
                unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            };
        }
    }

    IEnumerable<object> UnsupportedSourceEvents(Type type)
    {
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(eventInfo => eventInfo.Name, StringComparer.Ordinal))
        {
            var reason = UnsupportedSourceEventReason(eventInfo);
            if (reason is null)
            {
                continue;
            }
            var accessor = EventAccessor(eventInfo);
            yield return new
            {
                kind = "unsupported-member",
                memberKind = "event",
                sourceName = SourceMemberName(eventInfo.Name),
                targetName = eventInfo.Name,
                targetId = EventTargetId(type, eventInfo),
                metadataName = EventMetadataName(type, eventInfo),
                @static = accessor?.IsStatic == true ? true : (bool?)null,
                reason,
            };
        }
    }

    string? UnsupportedSourceEventReason(EventInfo eventInfo)
    {
        var eventHandlerType = eventInfo.EventHandlerType;
        if (eventHandlerType is null)
        {
            return "Event has no provider-visible event-handler type, so no source event declaration can be generated.";
        }
        if (TypeRef(eventHandlerType) is null)
        {
            return $"Event handler type cannot be represented as closed .NET target type facts. {TypeRefFailureReason(eventHandlerType)}";
        }
        if (EventAccessor(eventInfo) is null)
        {
            return "Event has no public add/remove accessor visible to the provider.";
        }
        return "C# events require explicit add/remove subscription semantics; the provider records this event as unsupported until source event facts exist.";
    }

    static bool HasPublicGetter(PropertyInfo property)
    {
        return property.GetMethod is not null && property.GetMethod.IsPublic;
    }

    static bool HasPublicSetter(PropertyInfo property)
    {
        return property.SetMethod is not null && property.SetMethod.IsPublic;
    }

    IEnumerable<MethodInfo> Methods(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => UnsupportedMethodReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    IEnumerable<MethodInfo> Operators(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .Where(method => !IsConversionOperator(method))
            .Where(method => UnsupportedOperatorReason(type, method) is null)
            .OrderBy(OperatorId, StringComparer.Ordinal);
    }

    IEnumerable<object> UnsupportedMethods(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var reason = UnsupportedMethodReason(type, method);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "method",
                SourceMemberName(method.Name),
                method.Name,
                MethodId(method),
                MethodMetadataId(method),
                method.IsStatic,
                reason);
        }
    }

    string? UnsupportedMethodReason(Type type, MethodInfo method)
    {
        if (type.IsInterface && method.IsStatic)
        {
            return "Static interface methods require a provider static-interface-member declaration model before they can be exposed safely.";
        }
        if (method.IsStatic && UsesDeclaringTypeParameter(method, type))
        {
            return "Static methods that use a declaring generic type parameter require a provider generic-static-member declaration model before they can be exposed safely.";
        }
        if (Parameters(method.GetParameters()) is null)
        {
            return UnsupportedParametersReason(method.GetParameters(), "Method signature")!;
        }
        return UnsupportedReturnTypeReason(method.ReturnType, "Method return type");
    }

    IEnumerable<object> UnsupportedOperators(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var reason = UnsupportedOperatorReason(type, method);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "operator",
                SourceMemberName(method.Name),
                method.Name,
                OperatorId(method),
                MethodMetadataId(method),
                true,
                reason);
        }
    }

    string? UnsupportedOperatorReason(Type type, MethodInfo method)
    {
        if (IsConversionOperator(method) && method.GetParameters().Length != 1)
        {
            return "Conversion operators require exactly one source parameter before provider conversion facts can be exposed safely.";
        }
        if (UsesDeclaringTypeParameter(method, type))
        {
            return "Operators that use declaring generic type parameters require a provider generic-operator declaration model before they can be exposed safely.";
        }
        if (Parameters(method.GetParameters()) is null)
        {
            return UnsupportedParametersReason(method.GetParameters(), "Operator signature")!;
        }
        return UnsupportedReturnTypeReason(method.ReturnType, "Operator return type");
    }

    string? UnsupportedReturnTypeReason(Type returnType, string context)
    {
        if (returnType.IsByRef)
        {
            return $"{context} returns '{TypeMetadataName(returnType)}' by reference; by-reference returns require an explicit provider ref-return declaration model before they can be exposed safely.";
        }
        return TypeRef(returnType) is null
            ? $"{context} cannot be represented as closed .NET target type facts. {TypeRefFailureReason(returnType)}"
            : null;
    }

    static bool IsConversionOperator(MethodInfo method)
    {
        return method.IsSpecialName &&
            (method.Name == "op_Implicit" || method.Name == "op_Explicit");
    }

    static object UnsupportedMember(
        string memberKind,
        string sourceName,
        string targetName,
        string targetId,
        string metadataName,
        bool isStatic,
        string reason)
    {
        return new
        {
            kind = "unsupported-member",
            memberKind,
            sourceName,
            targetName,
            targetId,
            metadataName,
            @static = isStatic ? true : (bool?)null,
            reason,
        };
    }

    string? UnsupportedParametersReason(ParameterInfo[] parameters, string context)
    {
        foreach (var parameter in parameters)
        {
            var parameterType = UnwrapByRef(parameter.ParameterType);
            if (TypeRef(parameterType) is null)
            {
                return $"{context} contains parameter '{parameter.Name ?? ""}' with type '{TypeMetadataName(parameterType)}' that cannot be represented as closed .NET target type facts. {TypeRefFailureReason(parameterType)}";
            }
        }
        return null;
    }

    static bool IsExtensionMethod(MethodInfo method)
    {
        return method.IsStatic &&
            method.IsDefined(typeof(System.Runtime.CompilerServices.ExtensionAttribute), inherit: false);
    }

    object? MethodSignature(MethodInfo method)
    {
        var id = method.IsSpecialName && method.Name.StartsWith("op_", StringComparison.Ordinal) && !IsConversionOperator(method)
            ? OperatorId(method)
            : MethodId(method);
        var parameters = Parameters(method.GetParameters(), id);
        var returnType = TypeRef(method.ReturnType);
        if (parameters is null || returnType is null)
        {
            return null;
        }
        var typeParameters = MethodTypeParameters(method);
        var attributes = AttributeFacts(method.GetCustomAttributesData(), "method", id);
        var returnAttributes = AttributeFacts(method.ReturnParameter.GetCustomAttributesData(), "return", $"{id}:return");
        return new
        {
            id,
            targetName = method.Name,
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            parameters,
            returnType,
            returnAttributes = returnAttributes.Supported.Length == 0 ? null : returnAttributes.Supported,
            unsupportedReturnAttributes = returnAttributes.Unsupported.Length == 0 ? null : returnAttributes.Unsupported,
        };
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
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            parameters,
        };
    }

    object[]? Parameters(ParameterInfo[] parameters, string? ownerId = null)
    {
        var result = new List<object>();
        for (var index = 0; index < parameters.Length; index++)
        {
            var parameter = parameters[index];
            var parameterType = UnwrapByRef(parameter.ParameterType);
            var type = TypeRef(parameterType);
            if (type is null)
            {
                return null;
            }
            var isParamsArray = parameter.GetCustomAttribute<ParamArrayAttribute>() is not null && parameterType.IsArray;
            var defaultValue = ParameterDefaultValue(parameter, parameterType, ownerId, index, out var unsupportedDefaultValue);
            var attributes = ownerId is null
                ? null
                : AttributeFacts(parameter.GetCustomAttributesData(), "parameter", $"{ownerId}:parameter:{ParameterIdentifier(parameter, index)}");
            result.Add(new
            {
                name = ParameterIdentifier(parameter, index),
                type,
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

        parameterType = Nullable.GetUnderlyingType(parameterType) ?? parameterType;
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
        if (parameterType == typeof(string) && value is string stringValue)
        {
            return new { kind = "string", value = stringValue };
        }
        if (parameterType == typeof(string))
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
        var underlyingType = Enum.GetUnderlyingType(enumType);
        var underlyingValue = Convert.ChangeType(value, underlyingType, CultureInfo.InvariantCulture);
        if (underlyingValue is null)
        {
            return null;
        }
        var enumValue = Enum.ToObject(enumType, underlyingValue);
        var fieldName = Enum.GetName(enumType, enumValue);
        return new
        {
            kind = "enum",
            value = Convert.ToString(underlyingValue, CultureInfo.InvariantCulture),
            fieldName,
        };
    }

    static object? SourcePrimitiveDefaultValue(Type primitiveType, object value)
    {
        if (primitiveType == typeof(bool) && value is bool boolValue)
        {
            return boolValue;
        }
        if (primitiveType == typeof(char) && value is char charValue)
        {
            return charValue.ToString();
        }
        if (primitiveType == typeof(float))
        {
            return Convert.ToSingle(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
        }
        if (primitiveType == typeof(double))
        {
            return Convert.ToDouble(value, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
        }
        if (primitiveType == typeof(decimal))
        {
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        if (primitiveType == typeof(Half))
        {
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
        if (primitiveType == typeof(nint))
        {
            return Convert.ToInt64(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        if (primitiveType == typeof(nuint))
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
        return type == typeof(sbyte) ||
            type == typeof(byte) ||
            type == typeof(short) ||
            type == typeof(ushort) ||
            type == typeof(int) ||
            type == typeof(uint) ||
            type == typeof(long) ||
            type == typeof(ulong) ||
            type.FullName == "System.Int128" ||
            type.FullName == "System.UInt128";
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
        return parameter.GetCustomAttribute<System.Runtime.InteropServices.InAttribute>() is not null
            ? "byref-readonly"
            : "byref-readwrite";
    }

    static MethodInfo? EventAccessor(EventInfo eventInfo)
    {
        return eventInfo.GetAddMethod(false) ?? eventInfo.GetRemoveMethod(false);
    }

    static string EventMetadataName(Type declaringType, EventInfo eventInfo)
    {
        return $"{MetadataName(declaringType)}.{eventInfo.Name}";
    }

    static string EventTargetId(Type declaringType, EventInfo eventInfo)
    {
        return $"{TargetId(declaringType)}.{eventInfo.Name}";
    }
}
