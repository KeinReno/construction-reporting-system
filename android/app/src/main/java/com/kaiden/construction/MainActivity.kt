package com.kaiden.construction

import android.os.Bundle
import android.content.Context
import android.content.res.Configuration
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

class MainActivity:ComponentActivity() {
    override fun attachBaseContext(base:Context) {
        val locale=Locale.forLanguageTag("ru-RU")
        Locale.setDefault(locale)
        val config=Configuration(base.resources.configuration).apply { setLocale(locale) }
        super.attachBaseContext(base.createConfigurationContext(config))
    }
    private val colors=darkColorScheme(
        primary=Color(0xFFFFBD45),onPrimary=Color(0xFF2D1B00),primaryContainer=Color(0xFF664400),onPrimaryContainer=Color(0xFFFFDEA1),
        secondary=Color(0xFFB7C4CB),onSecondary=Color(0xFF243238),secondaryContainer=Color(0xFF4A3A22),onSecondaryContainer=Color(0xFFFFD38A),background=Color(0xFF10171B),surface=Color(0xFF192329),
        surfaceVariant=Color(0xFF26343A),onSurfaceVariant=Color(0xFFCDD6D9),
        onBackground=Color(0xFFE8EDEF),onSurface=Color(0xFFE8EDEF),outline=Color(0xFF89999F),error=Color(0xFFFFB4AB))
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        if(BuildConfig.DEMO_MODE)lifecycleScope.launch {
            withContext(Dispatchers.IO){DemoBackend.prepare(this@MainActivity)}
            setContent { MaterialTheme(colorScheme=colors) { Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){ReportApp()} } }
        } else setContent { MaterialTheme(colorScheme=colors) { Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){ReportApp()} } }
    }
}
