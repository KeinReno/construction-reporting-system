package com.kaiden.construction

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        if(BuildConfig.DEMO_MODE)lifecycleScope.launch {
            withContext(Dispatchers.IO){DemoBackend.prepare(this@MainActivity)}
            setContent { MaterialTheme { ReportApp() } }
        } else setContent { MaterialTheme { ReportApp() } }
    }
}
