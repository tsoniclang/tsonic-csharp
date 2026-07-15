using System.Reflection;

sealed partial class ReflectionProvider
{
    sealed class GenericNullabilityContext
    {
        readonly IReadOnlyDictionary<Type, NullabilityInfo> typeArguments;

        GenericNullabilityContext(IReadOnlyDictionary<Type, NullabilityInfo> typeArguments)
        {
            this.typeArguments = typeArguments;
        }

        public static GenericNullabilityContext Empty { get; } = new(
            new Dictionary<Type, NullabilityInfo>());

        public GenericNullabilityContext WithConstructedTypeArguments(
            Type genericTypeDefinition,
            Type constructedType,
            NullabilityInfo? constructedNullability)
        {
            if (!genericTypeDefinition.IsGenericTypeDefinition || !constructedType.IsGenericType)
            {
                throw new InvalidOperationException("Delegate nullability substitution requires a generic type definition and a constructed generic type.");
            }
            if (constructedType.GetGenericTypeDefinition() != genericTypeDefinition)
            {
                throw new InvalidOperationException($"Delegate nullability type '{constructedType}' does not close '{genericTypeDefinition}'.");
            }
            var parameters = genericTypeDefinition.GetGenericArguments();
            var arguments = constructedType.GetGenericArguments();
            if (parameters.Length != arguments.Length)
            {
                throw new InvalidOperationException($"Delegate generic type '{constructedType}' has an inconsistent generic arity.");
            }
            if (constructedNullability is null)
            {
                return this;
            }
            if (constructedNullability.Type != constructedType)
            {
                throw new InvalidOperationException($"Delegate nullability type '{constructedNullability.Type}' does not match '{constructedType}'.");
            }
            if (constructedNullability.GenericTypeArguments.Length != parameters.Length)
            {
                throw new InvalidOperationException($"Delegate nullability for '{constructedType}' has an inconsistent generic arity.");
            }

            var next = new Dictionary<Type, NullabilityInfo>(typeArguments);
            for (var index = 0; index < parameters.Length; index++)
            {
                next[parameters[index]] = constructedNullability.GenericTypeArguments[index];
            }
            return new GenericNullabilityContext(next);
        }

        public NullabilityInfo? Resolve(Type type, NullabilityInfo? fallback)
        {
            return type.IsGenericParameter && typeArguments.TryGetValue(type, out var useSite)
                ? useSite
                : fallback;
        }
    }
}
