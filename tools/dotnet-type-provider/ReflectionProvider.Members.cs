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
        foreach (var group in Constructors(type).GroupBy(member => (string)member.GetType().GetProperty("metadataName")!.GetValue(member)!))
        {
            foreach (var member in group)
            {
                yield return member;
            }
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
                sourceName = LowerCamel(first.Name),
                targetName = first.Name,
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
                sourceName = OperatorSourceName(first.Name),
                targetName = first.Name,
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }
    }

    object[] UnsupportedMembers(Type type)
    {
        return UnsupportedSourceEvents(type).ToArray();
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
                metadataName = ConstructorId(constructor),
                signatures = new[] { signature },
            };
        }
    }

    IEnumerable<object> Properties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var accessors = property.GetAccessors(false);
            if (accessors.Length == 0)
            {
                continue;
            }
            var indexParameters = property.GetIndexParameters();
            if (indexParameters.Length > 0)
            {
                if (indexParameters.Length != 1)
                {
                    continue;
                }
                var parameters = Parameters(indexParameters);
                var returnType = TypeRef(property.PropertyType);
                if (parameters is null || returnType is null)
                {
                    continue;
                }
                yield return new
                {
                    kind = "indexer",
                    sourceName = "item",
                    targetName = property.Name,
                    metadataName = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})",
                    @static = accessors[0].IsStatic ? true : (bool?)null,
                    signatures = new[]
                    {
                        new
                        {
                            id = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})",
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
                sourceName = LowerCamel(property.Name),
                targetName = property.Name,
                metadataName = $"{MetadataName(type)}.{property.Name}",
                @static = isStatic ? true : (bool?)null,
                type = typeRef,
            };
        }
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
            yield return new
            {
                kind = "field",
                sourceName = LowerCamel(field.Name),
                targetName = field.Name,
                metadataName = $"{MetadataName(type)}.{field.Name}",
                @static = field.IsStatic ? true : (bool?)null,
                type = typeRef,
            };
        }
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
            yield return new
            {
                kind = "event",
                sourceName = LowerCamel(eventInfo.Name),
                targetName = eventInfo.Name,
                metadataName = EventMetadataName(type, eventInfo),
                @static = accessor.IsStatic ? true : (bool?)null,
                type = typeRef,
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
                sourceName = LowerCamel(eventInfo.Name),
                targetName = eventInfo.Name,
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
            return "Event handler type cannot be represented as closed .NET target type facts.";
        }
        return "C# events require explicit add/remove subscription semantics; the provider records this event as a target-only member until source event facts exist.";
    }

    IEnumerable<MethodInfo> Methods(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => !(type.IsInterface && method.IsStatic))
            .Where(method => !(method.IsStatic && UsesDeclaringTypeParameter(method, type)))
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    IEnumerable<MethodInfo> Operators(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .Where(method => !UsesDeclaringTypeParameter(method, type))
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    static bool IsExtensionMethod(MethodInfo method)
    {
        return method.IsStatic &&
            method.IsDefined(typeof(System.Runtime.CompilerServices.ExtensionAttribute), inherit: false);
    }

    object? MethodSignature(MethodInfo method)
    {
        var parameters = Parameters(method.GetParameters());
        var returnType = TypeRef(method.ReturnType);
        if (parameters is null || returnType is null)
        {
            return null;
        }
        var typeParameters = MethodTypeParameters(method);
        return new
        {
            id = MethodId(method),
            targetName = method.Name,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            parameters,
            returnType,
        };
    }

    object? ConstructorSignature(Type type, ConstructorInfo constructor)
    {
        var parameters = Parameters(constructor.GetParameters());
        if (parameters is null)
        {
            return null;
        }
        return new
        {
            id = ConstructorId(constructor),
            parameters,
        };
    }

    object[]? Parameters(ParameterInfo[] parameters)
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
            var defaultValue = ParameterDefaultValue(parameter, parameterType);
            result.Add(new
            {
                name = Identifier(parameter.Name ?? $"arg{index}"),
                type,
                passingMode = PassingMode(parameter),
                optional = parameter.IsOptional ? true : (bool?)null,
                rest = isParamsArray ? true : (bool?)null,
                defaultValue,
            });
        }
        return result.ToArray();
    }

    object? ParameterDefaultValue(ParameterInfo parameter, Type parameterType)
    {
        if (!TryGetRawDefaultValue(parameter, out var value))
        {
            return null;
        }
        if (value is null)
        {
            return new { kind = "null" };
        }

        parameterType = Nullable.GetUnderlyingType(parameterType) ?? parameterType;
        if (parameterType.IsEnum)
        {
            return EnumParameterDefaultValue(parameterType, value);
        }
        if (parameterType == typeof(string) && value is string stringValue)
        {
            return new { kind = "string", value = stringValue };
        }

        var sourcePrimitiveName = SourcePrimitiveName(parameterType);
        if (sourcePrimitiveName is null)
        {
            return null;
        }
        var sourcePrimitiveValue = SourcePrimitiveDefaultValue(parameterType, value);
        return sourcePrimitiveValue is null
            ? null
            : new { kind = "source-primitive", name = sourcePrimitiveName, value = sourcePrimitiveValue };
    }

    static bool TryGetRawDefaultValue(ParameterInfo parameter, out object? value)
    {
        value = null;
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
}
