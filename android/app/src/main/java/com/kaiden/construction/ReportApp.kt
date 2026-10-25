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
    var token by remember { mutableStateOf(if(session.userId()!=null) session.get() else null) }
    val scope= rememberCoroutineScope()
    var error by remember { mutableStateOf("") }
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val dao=remember { AppDatabase.get(context).drafts() }
    val ownerId=session.userId() ?: ""
    val drafts by remember(ownerId) { dao.observeAll(ownerId) }.collectAsState(initial=emptyList())
    val siteCache=remember { context.getSharedPreferences("site-cache",Context.MODE_PRIVATE) }
    var sites by remember { mutableStateOf<List<Pair<String,String>>>(emptyList()) }
    LaunchedEffect(token) {
        if(token != null) {
            try {
                val cached=siteCache.getString(ownerId,null)
                if(cached!=null) {
                    val array=JSONArray(cached)
                    sites=(0 until array.length()).map { val s=array.getJSONObject(it); s.getString("id") to s.getString("name") }
                }
                sites=withContext(Dispatchers.IO) { ApiClient.sites(token!!) }
                siteCache.edit().putString(ownerId,JSONArray(sites.map { JSONObject().put("id",it.first).put("name",it.second) }).toString()).apply()
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
                        val userId=withContext(Dispatchers.IO){ApiClient.me(result)}
                        session.save(result,userId);token=result;password=""
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
    var editing by remember { mutableStateOf<Draft?>(null) }
    var editReason by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf("") }
    LaunchedEffect(sites) {if(selectedSite.isBlank() && sites.isNotEmpty()) selectedSite=sites.first().first}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        scope.launch {
            uris.forEach { uri ->
                try {
                    val mime=context.contentResolver.getType(uri) ?: "image/jpeg"
                    if(mime !in listOf("image/jpeg","image/png","image/webp")) return@forEach
                    val id=UUID.randomUUID().toString()
                    val file=File(context.filesDir,"photo-$id")
                    withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            file.outputStream().use { output ->
                                val buffer=ByteArray(8192);var total=0L
                                while(true) {
                                    val count=input.read(buffer);if(count<0) break
                                    total+=count;if(total>8L*1024*1024) {file.delete();throw IllegalArgumentException("Фото больше 8 МБ")}
                                    output.write(buffer,0,count)
                                }
                            }
                        }
                    }
                    if(file.exists() && file.length() in 1..(8L*1024*1024)) {
                        photos.add(JSONObject().put("id",id).put("path",file.absolutePath).put("mime",mime))
                    } else file.delete()
                }catch(e:Exception){formError=e.message?:"Не удалось добавить фото"}
            }
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(horizontalArrangement=Arrangement.SpaceBetween,modifier=Modifier.fillMaxWidth()) {
            Text("Новый отчёт",style=MaterialTheme.typography.headlineSmall)
            TextButton(onClick={val oldToken=token;session.clear();token=null;sites=emptyList();scope.launch(Dispatchers.IO){try{if(oldToken!=null)ApiClient.logout(oldToken)}catch(_:Exception){}}}) {Text("Выход")}
        }
        if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
        if(editing!=null) {
            Text("Исправление возвращённого отчёта · версия ${editing!!.serverRevision}")
            OutlinedTextField(editReason,{editReason=it},label={Text("Причина исправления *")},modifier=Modifier.fillMaxWidth())
        }
        Text("Объект *")
        sites.forEach { (id,name) ->
            Row { RadioButton(selectedSite==id,enabled=editing==null,onClick={selectedSite=id});Text(name,modifier=Modifier.padding(top=12.dp)) }
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
                if((quantity.isNotBlank() && n==null) || (n==null && description.isBlank()) || (n!=null && n< java.math.BigDecimal.ZERO) || (n!=null && unit.isBlank()) || (workType=="Другое" && description.isBlank()))formError="Укажите корректный объём или описание"
                else {workEntries.add(JSONObject().apply {put("type",workType);if(n!=null){put("quantity",n.toPlainString());put("unit",unit)};if(description.isNotBlank())put("description",description)});quantity="";description="";formError=""}
            }) {Text("+ Добавить вид работ")}
            workEntries.forEachIndexed{ i,w -> Row {
                Text("${i+1}. ${w.getString("type")} — ${w.optString("quantity",w.optString("description"))}",Modifier.weight(1f))
                TextButton(onClick={workEntries.removeAt(i)}){Text("Удалить")}
            }}
        } else OutlinedTextField(reason,{reason=it},label={Text("Причина отсутствия работ *")},modifier=Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick={picker.launch("image/*")}) {Text("Добавить фотографии (${photos.size})")}
        OutlinedTextField(comment,{comment=it},label={Text("Комментарий (необязательно)")},modifier=Modifier.fillMaxWidth(),minLines=2)
        if(formError.isNotBlank())Text(formError,color=MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(16.dp))
        Button(enabled=!busy,onClick={
            try {
                LocalDate.parse(workDate)
                if(selectedSite.isBlank() || (kind=="work" && workEntries.isEmpty()) || (kind=="no_work" && reason.isBlank())) throw IllegalArgumentException("Заполните обязательные поля")
                if(editing!=null && editReason.trim().length<2)throw IllegalArgumentException("Укажите причину исправления")
                val saved=Draft(ownerId=ownerId,id=editing?.id?:UUID.randomUUID().toString(),siteId=selectedSite,siteName=sites.first{it.first==selectedSite}.second,workDate=workDate,kind=kind,
                    workEntriesJson=JSONArray(if(kind=="work")workEntries.toList() else emptyList<JSONObject>()).toString(),noWorkReason=reason,comment=comment,photosJson=JSONArray(photos.toList()).toString(),serverId=editing?.serverId,
                    serverRevision=editing?.serverRevision?:1,editRequested=editing!=null,editReason=editReason)
                busy=true
                scope.launch {
                    try {
                        withContext(Dispatchers.IO){dao.save(saved)}
                        SyncWorker.schedule(context)
                        workEntries.clear();photos.clear();reason="";comment="";editing=null;editReason="";formError="Отчёт сохранён локально. Отправка — автоматически."
                    } catch(e:Exception){formError=e.message?:"Ошибка сохранения. Форма сохранена на экране."}
                    finally{busy=false}
                }
            }catch(e:Exception){formError=e.message?:"Проверьте форму"}
        },modifier=Modifier.fillMaxWidth()){Text("Сохранить и отправить")}
        Spacer(Modifier.height(20.dp))
        TextButton(onClick={scope.launch{dao.retryFailed(ownerId);SyncWorker.schedule(context)}}){Text("Повторить отправку")}
        Text("Мои отчёты",style=MaterialTheme.typography.titleMedium)
        drafts.forEach { draft ->
            Card(Modifier.fillMaxWidth().padding(vertical=5.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("${draft.siteName} · ${draft.workDate}")
                    val label=when(draft.status){"delivered"->"Доставлен ✓";"uploading"->"Загрузка…";"failed"->"Нужна проверка / повторный вход";else->"Ожидает отправки"}
                    Text(label,color=if(draft.status=="delivered") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary)
                    if(draft.businessStatus!=null)Text("На сервере: ${draft.businessStatus} · версия ${draft.serverRevision}")
                    if(draft.serverId!=null && editing==null)TextButton(enabled=!busy,onClick={
                        busy=true;scope.launch {
                            try {
                                val remote=withContext(Dispatchers.IO){ApiClient.existingByClient(token!!,draft.id)}
                                val updated=draft.copy(serverRevision=remote.getInt("revision"),businessStatus=remote.getString("status"))
                                withContext(Dispatchers.IO){dao.save(updated)}
                                if(remote.getString("status")!="needs_revision") {formError="Статус обновлён: ${remote.getString("status")}"}
                                else {
                                    val data=remote.getJSONObject("data")
                                    val ids=data.getJSONArray("required_photo_ids")
                                    val localPhotos=JSONArray(draft.photosJson)
                                    val localIds=(0 until localPhotos.length()).map{localPhotos.getJSONObject(it).getString("id")}.toSet()
                                    require((0 until ids.length()).map{ids.getString(it)}.toSet()==localIds){"Фото сервера отличаются от локальных"}
                                    editing=updated;selectedSite=draft.siteId;workDate=data.getString("work_date");kind=data.getString("kind")
                                    reason=if(data.isNull("no_work_reason"))"" else data.getString("no_work_reason")
                                    comment=if(data.isNull("comment"))"" else data.getString("comment")
                                    workEntries.clear();val entries=data.getJSONArray("work_entries")
                                    for(i in 0 until entries.length())workEntries.add(entries.getJSONObject(i))
                                    photos.clear();for(i in 0 until localPhotos.length())photos.add(localPhotos.getJSONObject(i))
                                    formError="Возвращённый отчёт загружен в форму выше"
                                }
                            }catch(e:Exception){formError=e.message?:"Не удалось обновить статус"}
                            finally{busy=false}
                        }
                    }){Text("Проверить статус / исправить")}
                    if(draft.lastError!=null)Text("Последняя ошибка: ${draft.lastError}",style=MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
