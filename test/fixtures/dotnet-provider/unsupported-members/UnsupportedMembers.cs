namespace ProviderUnsupportedMemberFixtures;

public interface IStaticInterfaceMember
{
    static abstract int StaticCount { get; }

    static abstract int Create();
}

public sealed class GenericHolder<T>
{
    public static T StaticValue => default!;

    public static T Echo(T value)
    {
        return value;
    }
}

public sealed class MultiIndexer
{
    public int this[int row, int column] => row + column;
}

public unsafe sealed class PointerSignatures
{
    public int* PointerField;

    public PointerSignatures(int* pointer)
    {
        PointerField = pointer;
    }

    public int* PointerReturn()
    {
        return PointerField;
    }

    public int ReadPointer(int* pointer)
    {
        return *pointer;
    }
}

public readonly struct GenericNumber<T>
{
    public static GenericNumber<T> operator +(GenericNumber<T> left, GenericNumber<T> right)
    {
        return left;
    }
}
