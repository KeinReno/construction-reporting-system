package com.kaiden.construction

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Decode a small thumbnail off the UI thread, retaining the original private file for upload. */
@Composable
fun PhotoPreview(path:String,index:Int,enabled:Boolean,onRemove:()->Unit) {
    var thumbnail by remember(path) {mutableStateOf<ImageBitmap?>(null)}
    var loaded by remember(path) {mutableStateOf(false)}
    LaunchedEffect(path) {
        thumbnail=withContext(Dispatchers.IO) {
            val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
            BitmapFactory.decodeFile(path,bounds)
            var sample=1
            while(bounds.outWidth/sample>256 || bounds.outHeight/sample>256)sample*=2
            BitmapFactory.decodeFile(path,BitmapFactory.Options().apply{inSampleSize=sample})?.asImageBitmap()
        }
        loaded=true
    }
    Row(Modifier.fillMaxWidth().padding(vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        if(thumbnail!=null)Image(thumbnail!!,contentDescription="Выбранное фото $index",modifier=Modifier.size(84.dp),contentScale=ContentScale.Crop)
        else Text(if(loaded)"Фото недоступно" else "Загрузка фото…",modifier=Modifier.weight(1f))
        TextButton(enabled=enabled,onClick=onRemove){Text("Удалить фото $index")}
    }
}
