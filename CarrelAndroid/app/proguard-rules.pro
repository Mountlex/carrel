# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.carrel.app.**$$serializer { *; }
-keepclassmembers class com.carrel.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.carrel.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor
-keep class io.ktor.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.atomicfu.**
-dontwarn io.netty.**
-dontwarn com.typesafe.**
-dontwarn org.slf4j.**

# Java management classes not available on Android (used by Ktor debug detection)
-dontwarn java.lang.management.ManagementFactory
-dontwarn java.lang.management.RuntimeMXBean

# JNA (used transitively by Convex SDK)
# Native init reflects on fields/methods (e.g. Pointer.peer); keep them intact.
-keep class com.sun.jna.** { *; }
-keepclassmembers class com.sun.jna.Pointer {
    long peer;
}
-dontwarn com.sun.jna.**
