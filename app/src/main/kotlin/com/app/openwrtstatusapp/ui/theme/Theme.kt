package com.app.openwrtstatusapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 主色延续旧应用的蓝色与米白/深蓝背景基调。
private val BrandBlue = Color(0xFF0B6BCB)
private val LightBackground = Color(0xFFF6F5F1)
private val DarkBackground = Color(0xFF0A0F14)

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6E6FB),
    onPrimaryContainer = Color(0xFF04213F),
    background = LightBackground,
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFEDEAE3),
    onBackground = Color(0xFF1A1C1E),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF9CC4F4),
    onPrimary = Color(0xFF003260),
    primaryContainer = Color(0xFF00488C),
    onPrimaryContainer = Color(0xFFD6E6FB),
    background = DarkBackground,
    surface = Color(0xFF121A22),
    surfaceVariant = Color(0xFF1E2A35),
    onBackground = Color(0xFFE2E2E5),
)

@Composable
fun AppTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
