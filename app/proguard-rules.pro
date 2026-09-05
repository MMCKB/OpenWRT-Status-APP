# sshj 与 BouncyCastle 以反射方式使用部分类
-keep class com.hierynomus.sshj.** { *; }
-keep class net.schmizz.sshj.** { *; }
-dontwarn org.bouncycastle.**
-dontwarn org.slf4j.**
# tink(security-crypto 依赖)引用的注解与 sshj 的 GSS-API 认证在 Android 上不可用,仅编译期缺失
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.CheckReturnValue
-dontwarn com.google.errorprone.annotations.Immutable
-dontwarn com.google.errorprone.annotations.RestrictedApi
-dontwarn javax.security.auth.login.LoginContext
-dontwarn org.ietf.jgss.**
-dontwarn sun.security.x509.X509Key
# kotlinx-serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
