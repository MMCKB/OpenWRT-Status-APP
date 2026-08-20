package com.app.openwrtstatusapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.app.openwrtstatusapp.ui.OpenWrtApp
import com.app.openwrtstatusapp.ui.OpenWrtTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { OpenWrtTheme { OpenWrtApp() } } }
}
