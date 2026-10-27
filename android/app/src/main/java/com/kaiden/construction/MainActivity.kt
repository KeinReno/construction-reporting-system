package com.kaiden.construction

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity:ComponentActivity() {
    private val colors=lightColorScheme(
        primary=Color(0xFF236ADB),onPrimary=Color.White,primaryContainer=Color(0xFFE3EEFF),onPrimaryContainer=Color(0xFF123764),
        secondary=Color(0xFF42627E),onSecondary=Color.White,background=Color(0xFFF6F8FC),surface=Color.White,
        onBackground=Color(0xFF15233B),onSurface=Color(0xFF15233B),outline=Color(0xFF64748B),error=Color(0xFFB3261E))
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        if(BuildConfig.DEMO_MODE)lifecycleScope.launch {
            withContext(Dispatchers.IO){DemoBackend.prepare(this@MainActivity)}
            setContent { MaterialTheme(colorScheme=colors) { Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){ReportApp()} } }
        } else setContent { MaterialTheme(colorScheme=colors) { Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){ReportApp()} } }
    }
}
