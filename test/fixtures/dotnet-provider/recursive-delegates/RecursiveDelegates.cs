namespace RecursiveDelegateFixtures;

public delegate void SelfRecursive(SelfRecursive next);

public delegate void MutuallyRecursiveA(MutuallyRecursiveB next);

public delegate void MutuallyRecursiveB(MutuallyRecursiveA next);

public sealed class RecursiveDelegateConsumer
{
    public void Use(SelfRecursive callback)
    {
    }
}
