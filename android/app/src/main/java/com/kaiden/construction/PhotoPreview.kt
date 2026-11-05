package com.kaiden.construction

import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.ExifInterface
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

internal fun loadThumbnail(path:String):Bitmap? {
    val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
    BitmapFactory.decodeFile(path,bounds)
    var sample=1
    while(bounds.outWidth/sample>256 || bounds.outHeight/sample>256)sample*=2
    val decoded=BitmapFactory.decodeFile(path,BitmapFactory.Options().apply{inSampleSize=sample})?:return null
    val orientation=runCatching {ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val transform=Matrix()
    when(orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> transform.setScale(-1f,1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> transform.setRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> transform.setScale(1f,-1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> {transform.setRotate(90f);transform.postScale(-1f,1f)}
        ExifInterface.ORIENTATION_ROTATE_90 -> transform.setRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> {transform.setRotate(-90f);transform.postScale(-1f,1f)}
        ExifInterface.ORIENTATION_ROTATE_270 -> transform.setRotate(-90f)
    }
    if(transform.isIdentity)return decoded
    val result=Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,transform,true)
    if(result!==decoded)decoded.recycle()
    return result
}

/** Decode a small thumbnail off the UI thread, retaining the original private file for upload. */
@Composable
fun PhotoPreview(path:String,index:Int,enabled:Boolean,onRemove:()->Unit) {
    var thumbnail by remember(path) {mutableStateOf<ImageBitmap?>(null)}
    var loaded by remember(path) {mutableStateOf(false)}
    LaunchedEffect(path) {
        thumbnail=withContext(Dispatchers.IO) {loadThumbnail(path)?.asImageBitmap()}
        loaded=true
    }
    Row(Modifier.fillMaxWidth().padding(vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        if(thumbnail!=null)Image(thumbnail!!,contentDescription="Выбранное фото $index",modifier=Modifier.size(84.dp),contentScale=ContentScale.Crop)
        else Text(if(loaded)"Фото недоступно" else "Загрузка фото…",modifier=Modifier.weight(1f))
        TextButton(enabled=enabled,onClick=onRemove){Text("Удалить фото $index")}
    }
}
