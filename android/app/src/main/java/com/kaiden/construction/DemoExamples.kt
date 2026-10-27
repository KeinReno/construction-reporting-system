package com.kaiden.construction
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import org.json.JSONArray

@Composable fun DemoExamples(drafts:List<Draft>) {
    var opened by remember {mutableStateOf<Draft?>(null)}
    var expanded by remember {mutableStateOf(false)}
    TextButton(onClick={expanded=!expanded}){Text(if(expanded)"Скрыть примеры" else "Посмотреть примеры (${drafts.size})")}
    if(expanded)drafts.forEach{r->OutlinedButton(onClick={opened=r},modifier=Modifier.fillMaxWidth()){Text("${r.workDate} · ${if(r.kind=="no_work")"Без работ" else "Работы"} · ${businessStatusLabel(r.businessStatus)}")}}
    opened?.let{r->AlertDialog(onDismissRequest={opened=null},title={Text("Демо-отчёт ${r.workDate}")},text={Column(Modifier.verticalScroll(rememberScrollState())){
        Text(r.siteName);Text("Учебный статус: ${businessStatusLabel(r.businessStatus)}")
        if(r.kind=="no_work")Text("Причина: ${r.noWorkReason}")
        val rows=JSONArray(r.workEntriesJson)
        for(i in 0 until rows.length()){val w=rows.getJSONObject(i);Text(w.getString("type"));Text(w.optString("description",""));if(!w.isNull("quantity"))Text("${w.getString("quantity")} ${w.optString("unit")}")}
        Text(r.comment)
        val photos=JSONArray(r.photosJson)
        for(i in 0 until photos.length()) {
            val path=photos.getJSONObject(i).getString("path");val bitmap=remember(path){BitmapFactory.decodeFile(path)}
            if(bitmap!=null)Image(bitmap.asImageBitmap(),contentDescription="Демо-схема, не фото объекта",modifier=Modifier.fillMaxWidth().height(180.dp))
        }
    }},confirmButton={TextButton(onClick={opened=null}){Text("Закрыть пример")}})}
}
