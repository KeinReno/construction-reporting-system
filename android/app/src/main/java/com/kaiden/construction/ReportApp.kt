package com.kaiden.construction

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.UUID

@Composable
fun ReportApp() {
    val context=LocalContext.current
    val session=remember { SecureSession(context) }
    var token by remember { mutableStateOf(session.get()) }
    val scope= rememberCoroutineScope()
    var error by remember { mutableStateOf("") }
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val dao=remember { AppDatabase.get(context).drafts() }
    val drafts by dao.observeAll().collectAsState(initial=emptyList())
    var sites by remember { mutableStateOf<List<Pair<String,String>>>(emptyList()) }
    LaunchedEffect(token) {
        if(token != null) {
            try {
                sites=withContext(Dispatchers.IO) { ApiClient.sites(token!!) }
                SyncWorker.schedule(context)
            } catch (e:Exception) {error=e.message?:"Ошибка подключения"}
        }
    }
    if(token==null) {
        Column(Modifier.fillMaxSize().padding(24.dp),verticalArrangement=Arrangement.Center) {
            Text("СтройКонтроль",style=MaterialTheme.typography.headlineMedium)
            Text("Служебное приложение бригадира",modifier=Modifier.padding(bottom=28.dp))
            OutlinedTextField(login,{login=it},label={Text("Логин")},modifier=Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(password,{password=it},label={Text("Пароль")},visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth())
            if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(16.dp))
            Button(enabled=!busy && login.isNotBlank() && password.isNotBlank(),onClick={
                busy=true;error=""
                scope.launch {
                    try {
                        val result=withContext(Dispatchers.IO){ApiClient.login(login,password)}
                        session.save(result);token=result;password=""
                    }catch(e:Exception){error=e.message?:"Неверные данные"}
                    finally{busy=false}
                }
            },modifier=Modifier.fillMaxWidth()){Text(if(busy) "Подключение…" else "Войти")}
        }
        return
    }
    var selectedSite by remember { mutableStateOf("") }
    var workDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var kind by remember { mutableStateOf("work") }
    var workType by remember { mutableStateOf("Сварка металлоконструкций") }
    var quantity by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf("шт") }
    var description by remember { mutableStateOf("") }
    val workEntries = remember { mutableStateListOf<JSONObject>() }
    var reason by remember { mutableStateOf("") }
    var comment by remember { mutableStateOf("") }
    val photos = remember { mutableStateListOf<JSONObject>() }
    var formError by remember { mutableStateOf("") }
    LaunchedEffect(sites) {if(selectedSite.isBlank() && sites.isNotEmpty()) selectedSite=sites.first().first}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        scope.launch(Dispatchers.IO) {
            uris.forEach { uri ->
                try {
                    val mime=context.contentResolver.getType(uri) ?: "image/jpeg"
                    if(mime !in listOf("image/jpeg","image/png","image/webp")) return@forEach
                    val id=UUID.randomUUID().toString()
                    val file=File(context.filesDir,"photo-$id")
                    context.contentResolver.openInputStream(uri)?.use { it.copyTo(file.outputStream()) }
                    if(file.exists() && file.length() in 1..(8L*1024*1024)) {
                        photos.add(JSONObject().put("id",id).put("path",file.absolutePath).put("mime",mime))
                    } else file.delete()
                }catch(_:Exception){ /* User can retry photo selection */ }
            }
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(horizontalArrangement=Arrangement.SpaceBetween,modifier=Modifier.fillMaxWidth()) {
            Text("Новый отчёт",style=MaterialTheme.typography.headlineSmall)
            TextButton(onClick={session.clear();token=null;sites=emptyList()}) {Text("Выход")}
        }
        if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
        Text("Объект *")
        sites.forEach { (id,name) ->
            Row { RadioButton(selectedSite==id,onClick={selectedSite=id});Text(name,modifier=Modifier.padding(top=12.dp)) }
        }
        if(sites.isEmpty())Text("Нет доступных объектов. Проверьте подключение.")
        OutlinedTextField(workDate,{workDate=it},label={Text("Дата работ YYYY-MM-DD *")},modifier=Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        Row { FilterChip(selected=kind=="work",onClick={kind="work"},label={Text("Работы выполнены")});Spacer(Modifier.width(8.dp));FilterChip(selected=kind=="no_work",onClick={kind="no_work"},label={Text("Работ не было")}) }
        if(kind=="work") {
            Text("Вид работы *",style=MaterialTheme.typography.titleSmall)
            // TEMPORARY proposal pending SPEC-00 B07; work type to come from server catalog.
            listOf("Сварка металлоконструкций","Монтаж","Покраска","Разгрузка","Другое").forEach { item ->
                Row {RadioButton(workType==item,onClick={workType=item});Text(item,modifier=Modifier.padding(top=12.dp))}
            }
            OutlinedTextField(quantity,{quantity=it},label={Text("Выполненный объём")},modifier=Modifier.fillMaxWidth())
            OutlinedTextField(unit,{unit=it},label={Text("Единица измерения")},modifier=Modifier.fillMaxWidth())
            OutlinedTextField(description,{description=it},label={Text("Описание (для работ без объёма / Другое)")},modifier=Modifier.fillMaxWidth())
            OutlinedButton(onClick={
                val n=quantity.replace(',','.').toBigDecimalOrNull()
                if((n==null && description.isBlank()) || (n!=null && n< java.math.BigDecimal.ZERO) || (n!=null && unit.isBlank()) || (workType=="Другое" && description.isBlank()))formError="Укажите корректный объём или описание"
                else {workEntries.add(JSONObject().apply {put("type",workType);if(n!=null){put("quantity",n.toPlainString());put("unit",unit)};if(description.isNotBlank())put("description",description)});quantity="";description="";formError=""}
            }) {Text("+ Добавить вид работ")}
            workEntries.forEachIndexed{ i,w -> Text("${i+1}. ${w.getString("type")} — ${w.optString("quantity",w.optString("description"))}") }
        } else OutlinedTextField(reason,{reason=it},label={Text("Причина отсутствия работ *")},modifier=Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick={picker.launch("image/*")}) {Text("Добавить фотографии (${photos.size})")}
        OutlinedTextField(comment,{comment=it},label={Text("Комментарий (необязательно)")},modifier=Modifier.fillMaxWidth(),minLines=2)
        if(formError.isNotBlank())Text(formError,color=MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(16.dp))
        Button(onClick={
            try {
                LocalDate.parse(workDate)
                if(selectedSite.isBlank() || (kind=="work" && workEntries.isEmpty()) || (kind=="no_work" && reason.isBlank())) throw IllegalArgumentException("Заполните обязательные поля")
                val saved=Draft(id=UUID.randomUUID().toString(),siteId=selectedSite,siteName=sites.first{it.first==selectedSite}.second,workDate=workDate,kind=kind,
                    workEntriesJson=JSONArray(workEntries.toList()).toString(),noWorkReason=reason,comment=comment,photosJson=JSONArray(photos.toList()).toString())
                scope.launch(Dispatchers.IO){dao.save(saved);SyncWorker.schedule(context)}
                workEntries.clear();photos.clear();reason="";comment="";formError="Отчёт сохранён локально. Отправка — автоматически."
            }catch(e:Exception){formError=e.message?:"Проверьте форму"}
        },modifier=Modifier.fillMaxWidth()){Text("Сохранить и отправить")}
        Spacer(Modifier.height(20.dp))
        Text("Мои отчёты",style=MaterialTheme.typography.titleMedium)
        drafts.forEach { draft ->
            Card(Modifier.fillMaxWidth().padding(vertical=5.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("${draft.siteName} · ${draft.workDate}")
                    val label=when(draft.status){"delivered"->"Доставлен ✓";"uploading"->"Загрузка…";else->"Ожидает отправки"}
                    Text(label,color=if(draft.status=="delivered") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary)
                    if(draft.lastError!=null)Text("Последняя ошибка: ${draft.lastError}",style=MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
