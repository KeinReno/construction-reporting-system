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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.UUID

fun businessStatusLabel(status:String?):String = when(status) {
    "draft" -> "Черновик"
    "submitted" -> "Доставлен"
    "reviewed" -> "Проверен"
    "needs_revision" -> "На уточнении"
    null -> "Черновик"
    else -> status
}

@Composable
private fun CompactSelection(label:String,value:String,options:List<Pair<String,String>>,enabled:Boolean=true,onSelect:(String)->Unit) {
    var expanded by remember { mutableStateOf(false) }
    Text(label,style=MaterialTheme.typography.titleSmall)
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(enabled=enabled && options.isNotEmpty(),onClick={expanded=true},modifier=Modifier.fillMaxWidth()) {
            Text(options.firstOrNull{it.first==value}?.second ?: "Выберите",modifier=Modifier.weight(1f))
            Text("▾")
        }
        DropdownMenu(expanded=expanded,onDismissRequest={expanded=false}) {
            options.forEach { (key,name) -> DropdownMenuItem(text={Text(name)},onClick={expanded=false;onSelect(key)}) }
        }
    }
}

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
    val database=remember { AppDatabase.get(context) }
    val dao=remember { database.drafts() }
    val formRepository=remember { FormRepository(database) }
    val endpointSettings=remember {EndpointSettings(context,database)}
    var serverUrl by remember {mutableStateOf(session.snapshot()?.endpoint?:endpointSettings.current())}
    var serverInput by remember {mutableStateOf(serverUrl)}
    var serverReady by remember {mutableStateOf(session.snapshot()!=null || endpointSettings.isBound())}
    val api=remember(serverUrl){ApiClient.forSession(context,serverUrl)}
    LaunchedEffect(Unit) {
        if(!serverReady && !serverUrl.contains("example.invalid")) {
            try {serverUrl=withContext(Dispatchers.IO){endpointSettings.configure(serverUrl)};serverReady=true}
            catch(e:Exception){error=e.message?:"Укажите адрес сервера"}
        }
    }
    val ownerId=session.userId() ?: ""
    val drafts by remember(ownerId) { dao.observeAll(ownerId) }.collectAsState(initial=emptyList())
    val siteCache=remember { context.getSharedPreferences("site-cache",Context.MODE_PRIVATE) }
    var sites by remember(ownerId) { mutableStateOf<List<Pair<String,String>>>(emptyList()) }
    LaunchedEffect(token) {
        if(token != null) {
            error=""
            try {
                val cached=siteCache.getString(ownerId,null)
                if(cached!=null) {
                    val array=JSONArray(cached)
                    sites=(0 until array.length()).map { val s=array.getJSONObject(it); s.getString("id") to s.getString("name") }
                }
                sites=withContext(Dispatchers.IO) { api.sites(token!!) }
                siteCache.edit().putString(ownerId,JSONArray(sites.map { JSONObject().put("id",it.first).put("name",it.second) }).toString()).apply()
                SyncWorker.schedule(context)
            } catch(e:CancellationException){throw e}
            catch (e:Exception) {error=e.message?:"Ошибка подключения";if(e is ApiException && e.status==401){session.clear();token=null}}
        }
    }
    if(token==null && BuildConfig.DEMO_MODE) {
        Column(Modifier.fillMaxSize().padding(24.dp),verticalArrangement=Arrangement.Center) {
            Text("СтройКонтроль · ДЕМО",style=MaterialTheme.typography.headlineMedium)
            Text("Локальные примеры. Сервер и пароль не нужны.")
            Button(enabled=!busy,onClick={busy=true;scope.launch{try{withContext(Dispatchers.IO){DemoBackend.prepare(context)};serverUrl=DemoBackend.ENDPOINT;serverReady=true;token=session.get()}finally{busy=false}}}){Text("Открыть демо")}
        }
        return
    }
    if(token==null) {
        Column(Modifier.fillMaxSize().padding(24.dp),verticalArrangement=Arrangement.Center) {
            Text("СтройКонтроль",style=MaterialTheme.typography.headlineMedium)
            Text("Служебное приложение бригадира",modifier=Modifier.padding(bottom=28.dp))
            OutlinedTextField(serverInput,{serverInput=it},label={Text("HTTPS-адрес сервера")},modifier=Modifier.fillMaxWidth(),singleLine=true)
            OutlinedButton(enabled=!busy,onClick={busy=true;scope.launch {
                try {serverUrl=withContext(Dispatchers.IO){endpointSettings.configure(serverInput)};serverInput=serverUrl;serverReady=true;error=""}
                catch(e:Exception){error=e.message?:"Не удалось сохранить адрес"}finally{busy=false}
            }}){Text("Сохранить адрес сервера")}
            OutlinedTextField(login,{login=it},label={Text("Логин")},modifier=Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(password,{password=it},label={Text("Пароль")},visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth())
            if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(16.dp))
            Button(enabled=!busy && serverReady && login.isNotBlank() && password.isNotBlank(),onClick={
                busy=true;error=""
                scope.launch {
                    try {
                        val result=withContext(Dispatchers.IO){api.login(login,password)}
                        val userId=withContext(Dispatchers.IO){api.me(result)}
                        endpointSettings.bindAfterLogin(serverUrl);session.save(result,userId,serverUrl);token=result;password=""
                    }catch(e:Exception){error=e.message?:"Неверные данные"}
                    finally{busy=false}
                }
            },modifier=Modifier.fillMaxWidth()){Text(if(busy) "Подключение…" else "Войти")}
        }
        return
    }
    var selectedSite by remember(ownerId) { mutableStateOf("") }
    var workDate by remember(ownerId) { mutableStateOf(LocalDate.now().toString()) }
    var kind by remember(ownerId) { mutableStateOf("work") }
    var workType by remember(ownerId) { mutableStateOf("Сварка металлоконструкций") }
    var quantity by remember(ownerId) { mutableStateOf("") }
    var unit by remember(ownerId) { mutableStateOf("шт") }
    var description by remember(ownerId) { mutableStateOf("") }
    val workEntries = remember(ownerId) { mutableStateListOf<JSONObject>() }
    var reason by remember(ownerId) { mutableStateOf("") }
    var comment by remember(ownerId) { mutableStateOf("") }
    var crew by remember(ownerId) {mutableStateOf("")}
    var materialName by remember(ownerId) {mutableStateOf("")}
    var materialQuantity by remember(ownerId) {mutableStateOf("")}
    var materialUnit by remember(ownerId) {mutableStateOf("")}
    var materialDirection by remember(ownerId) {mutableStateOf("mentioned")}
    val materials=remember(ownerId) {mutableStateListOf<JSONObject>()}
    var incidentText by remember(ownerId) {mutableStateOf("")}
    val incidents=remember(ownerId) {mutableStateListOf<JSONObject>()}
    var financeKind by remember(ownerId) {mutableStateOf("expense")}
    var financeAmount by remember(ownerId) {mutableStateOf("")}
    var financeCategory by remember(ownerId) {mutableStateOf("")}
    var financeDate by remember(ownerId) {mutableStateOf("")}
    var financeDescription by remember(ownerId) {mutableStateOf("")}
    val financialEntries=remember(ownerId) {mutableStateListOf<JSONObject>()}
    var equipmentType by remember(ownerId) {mutableStateOf("")}
    var equipmentHours by remember(ownerId) {mutableStateOf("")}
    var equipmentHired by remember(ownerId) {mutableStateOf(false)}
    val equipment=remember(ownerId) {mutableStateListOf<JSONObject>()}
    var planText by remember(ownerId) {mutableStateOf("")}
    val nextShiftPlans=remember(ownerId) {mutableStateListOf<String>()}
    var showFinance by remember(ownerId) {mutableStateOf(false)}
    var showEquipment by remember(ownerId) {mutableStateOf(false)}
    var showPlans by remember(ownerId) {mutableStateOf(false)}
    val photos = remember(ownerId) { mutableStateListOf<JSONObject>() }
    var editing by remember(ownerId) { mutableStateOf<Draft?>(null) }
    var editReason by remember(ownerId) { mutableStateOf("") }
    var formError by remember(ownerId) { mutableStateOf("") }
    var formSession by remember(ownerId) {mutableStateOf<FormRecord?>(null)}
    var formReload by remember(ownerId) {mutableStateOf(0)}
    var restoreError by remember(ownerId) {mutableStateOf("")}
    var autosaveStatus by remember(ownerId) {mutableStateOf("Восстановление формы…")}
    var pendingReplacement by remember(ownerId) {mutableStateOf<(() -> Unit)?>(null)}
    fun currentForm()=FormSnapshot(siteId=selectedSite,workDate=workDate,kind=kind,workType=workType,quantity=quantity,unit=unit,description=description,
        workEntriesJson=JSONArray(workEntries.toList()).toString(),noWorkReason=reason,comment=comment,photosJson=JSONArray(photos.toList()).toString(),editing=editing,editReason=editReason,
        crew=crew,materialName=materialName,materialQuantity=materialQuantity,materialUnit=materialUnit,materialDirection=materialDirection,materialsJson=JSONArray(materials.toList()).toString(),incidentText=incidentText,incidentsJson=JSONArray(incidents.toList()).toString(),
        financeKind=financeKind,financeAmount=financeAmount,financeCategory=financeCategory,financeDate=financeDate,financeDescription=financeDescription,financialJson=JSONArray(financialEntries.toList()).toString(),
        equipmentType=equipmentType,equipmentHours=equipmentHours,equipmentHired=equipmentHired,equipmentJson=JSONArray(equipment.toList()).toString(),planText=planText,plansJson=JSONArray(nextShiftPlans.toList()).toString())
    fun loadExtras(extras:JSONObject) {
        crew=if(extras.isNull("crew"))"" else extras.optString("crew","")
        materials.clear();val m=extras.optJSONArray("materials")?:JSONArray();for(i in 0 until m.length())materials.add(m.getJSONObject(i))
        incidents.clear();val events=extras.optJSONArray("incidents")?:JSONArray();for(i in 0 until events.length())incidents.add(events.getJSONObject(i))
        financialEntries.clear();val finances=extras.optJSONArray("financial_entries")?:JSONArray();for(i in 0 until finances.length())financialEntries.add(finances.getJSONObject(i))
        equipment.clear();val machines=extras.optJSONArray("equipment")?:JSONArray();for(i in 0 until machines.length())equipment.add(machines.getJSONObject(i))
        nextShiftPlans.clear();val plans=extras.optJSONArray("next_shift_plans")?:JSONArray();for(i in 0 until plans.length())nextShiftPlans.add(plans.getString(i))
        materialName="";materialQuantity="";materialUnit="";materialDirection="mentioned";incidentText=""
        financeKind="expense";financeAmount="";financeCategory="";financeDate="";financeDescription="";equipmentType="";equipmentHours="";equipmentHired=false;planText=""
    }
    fun replaceForm(action:()->Unit) {
        val hasInput=workEntries.isNotEmpty() || photos.isNotEmpty() || quantity.isNotBlank() || description.isNotBlank() || reason.isNotBlank() || comment.isNotBlank() || crew.isNotBlank() || materialName.isNotBlank() || materialQuantity.isNotBlank() || materialUnit.isNotBlank() || materialDirection!="mentioned" || materials.isNotEmpty() || incidentText.isNotBlank() || incidents.isNotEmpty() || financialEntries.isNotEmpty() || financeAmount.isNotBlank() || financeCategory.isNotBlank() || financeDate.isNotBlank() || financeDescription.isNotBlank() || equipment.isNotEmpty() || equipmentType.isNotBlank() || equipmentHours.isNotBlank() || equipmentHired || nextShiftPlans.isNotEmpty() || planText.isNotBlank() || editing!=null || editReason.isNotBlank() || kind!="work" || workDate!=LocalDate.now().toString() || workType!="Сварка металлоконструкций" || unit!="шт"
        val replacement={quantity="";description="";workType="Сварка металлоконструкций";unit="шт";editReason="";action()}
        if(hasInput)pendingReplacement=replacement else replacement()
    }
    LaunchedEffect(ownerId,formReload) {
        try {
            val record=withContext(Dispatchers.IO){formRepository.open(ownerId)}
            val saved=FormSnapshot.decode(record.payload,ownerId)
            selectedSite=saved.siteId;workDate=saved.workDate;kind=saved.kind;workType=saved.workType
            quantity=saved.quantity;unit=saved.unit;description=saved.description;reason=saved.noWorkReason;comment=saved.comment
            crew=saved.crew;materialName=saved.materialName;materialQuantity=saved.materialQuantity;materialUnit=saved.materialUnit;materialDirection=saved.materialDirection;incidentText=saved.incidentText
            materials.clear();val savedMaterials=JSONArray(saved.materialsJson);for(i in 0 until savedMaterials.length())materials.add(savedMaterials.getJSONObject(i))
            incidents.clear();val savedIncidents=JSONArray(saved.incidentsJson);for(i in 0 until savedIncidents.length())incidents.add(savedIncidents.getJSONObject(i))
            financeKind=saved.financeKind;financeAmount=saved.financeAmount;financeCategory=saved.financeCategory;financeDate=saved.financeDate;financeDescription=saved.financeDescription
            financialEntries.clear();val savedFinances=JSONArray(saved.financialJson);for(i in 0 until savedFinances.length())financialEntries.add(savedFinances.getJSONObject(i))
            equipmentType=saved.equipmentType;equipmentHours=saved.equipmentHours;equipmentHired=saved.equipmentHired
            equipment.clear();val savedEquipment=JSONArray(saved.equipmentJson);for(i in 0 until savedEquipment.length())equipment.add(savedEquipment.getJSONObject(i))
            planText=saved.planText;nextShiftPlans.clear();val savedPlans=JSONArray(saved.plansJson);for(i in 0 until savedPlans.length())nextShiftPlans.add(savedPlans.getString(i))
            showFinance=financeAmount.isNotBlank() || financeCategory.isNotBlank() || financeDate.isNotBlank() || financeDescription.isNotBlank()
            showEquipment=equipmentType.isNotBlank() || equipmentHours.isNotBlank()
            showPlans=planText.isNotBlank()
            workEntries.clear();val entries=JSONArray(saved.workEntriesJson)
            for(i in 0 until entries.length())workEntries.add(entries.getJSONObject(i))
            photos.clear();val images=JSONArray(saved.photosJson)
            for(i in 0 until images.length())photos.add(images.getJSONObject(i))
            editing=saved.editing;editReason=saved.editReason;restoreError="";formSession=record
        }catch(e:CancellationException){throw e}
        catch(e:Exception){restoreError=e.message?:"Не удалось восстановить форму"}
    }
    LaunchedEffect(formSession?.sessionId) {
        val record=formSession?:return@LaunchedEffect
        snapshotFlow {currentForm()}
            .collect { snapshot ->
                autosaveStatus="Сохранение формы…"
                try {
                    val saved=withContext(Dispatchers.IO){formRepository.save(record.copy(payload=snapshot.encode()))}
                    if(saved && formSession?.sessionId==record.sessionId && currentForm()==snapshot)autosaveStatus="Форма сохранена на устройстве"
                }catch(e:CancellationException){throw e}
                catch(e:Exception){autosaveStatus="Автосохранение не выполнено: ${e.message?:"ошибка хранилища"}"}
            }
    }
    LaunchedEffect(sites,formSession?.sessionId) {if(formSession!=null && selectedSite.isBlank() && sites.isNotEmpty()) selectedSite=sites.first().first}
    if(formSession==null) {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            Text("Восстановление формы…")
            if(restoreError.isNotBlank()) {
                Text(restoreError,color=MaterialTheme.colorScheme.error)
                TextButton(onClick={formReload++}){Text("Повторить загрузку формы")}
            }
        }
        return
    }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        busy=true
        scope.launch {
            try { uris.forEach { uri ->
                try {
                    if(photos.size>=30)throw IllegalArgumentException("Не больше 30 фото на отчёт")
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
                        if(session.userId()!=ownerId) {file.delete();return@forEach}
                        photos.add(JSONObject().put("id",id).put("path",file.absolutePath).put("mime",mime))
                    } else file.delete()
                }catch(e:CancellationException){throw e}
                catch(e:Exception){formError=e.message?:"Не удалось добавить фото"}
            }} finally {busy=false}
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        if(BuildConfig.DEMO_MODE) {
            Text("ДЕМО · всё хранится только на этом телефоне",style=MaterialTheme.typography.titleMedium)
            Text("6 примеров на основе обезличенных сообщений. Схемы вместо фото. Синхронизации с Windows в этом режиме нет.")
            DemoExamples(drafts)
        }
        Row(horizontalArrangement=Arrangement.SpaceBetween,modifier=Modifier.fillMaxWidth()) {
            Text("Новый отчёт",style=MaterialTheme.typography.headlineSmall)
            TextButton(enabled=!busy,onClick={val oldToken=token;session.clear();token=null;sites=emptyList();scope.launch(Dispatchers.IO){try{if(oldToken!=null)api.logout(oldToken)}catch(_:Exception){}}}) {Text("Выход")}
        }
        if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
        Text(autosaveStatus,style=MaterialTheme.typography.bodySmall)
        if(editing!=null) {
            Text("Исправление возвращённого отчёта · версия ${editing!!.serverRevision}")
            OutlinedTextField(editReason,{editReason=it},label={Text("Причина исправления *")},modifier=Modifier.fillMaxWidth())
        }
        CompactSelection("Объект *",selectedSite,sites,enabled=editing==null,onSelect={selectedSite=it})
        if(sites.isEmpty())Text("Нет доступных объектов. Проверьте подключение.")
        WorkDateField(workDate){workDate=it}
        Spacer(Modifier.height(12.dp))
        Row { FilterChip(selected=kind=="work",onClick={kind="work"},label={Text("Работы выполнены")});Spacer(Modifier.width(8.dp));FilterChip(selected=kind=="no_work",onClick={kind="no_work"},label={Text("Работ не было")}) }
        if(kind=="work") {
            // TEMPORARY proposal pending SPEC-00 B07; work type to come from server catalog.
            val types=listOf("Сварка металлоконструкций","Монтаж","Покраска","Разгрузка","Другое")
            CompactSelection("Вид работы *",workType,types.map { it to it },onSelect={workType=it})
            OutlinedTextField(quantity,{quantity=it},label={Text("Выполненный объём")},modifier=Modifier.fillMaxWidth(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal))
            OutlinedTextField(unit,{unit=it},label={Text("Единица измерения")},modifier=Modifier.fillMaxWidth())
            OutlinedTextField(description,{description=it},label={Text("Описание (для работ без объёма / Другое)")},modifier=Modifier.fillMaxWidth())
            OutlinedButton(onClick={
                val n=quantity.replace(',','.').toBigDecimalOrNull()
                if(workEntries.size>=100 || description.length>2000 || unit.length>50 || (n!=null && (n.stripTrailingZeros().scale()>6 || n.precision()-n.scale()>14)) || (quantity.isNotBlank() && n==null) || (n==null && description.isBlank()) || (n!=null && n< java.math.BigDecimal.ZERO) || (n!=null && unit.isBlank()) || (workType=="Другое" && description.isBlank()))formError="Укажите корректный объём или описание"
                else {workEntries.add(JSONObject().apply {put("type",workType);if(n!=null){put("quantity",n.toPlainString());put("unit",unit)};if(description.isNotBlank())put("description",description)});quantity="";description="";formError=""}
            }) {Text("+ Добавить вид работ")}
            workEntries.forEachIndexed{ i,w -> Row {
                Text("${i+1}. ${w.getString("type")} — ${w.optString("quantity",w.optString("description"))}",Modifier.weight(1f))
                TextButton(onClick={workEntries.removeAt(i)}){Text("Удалить")}
            }}
        } else OutlinedTextField(reason,{reason=it},label={Text("Причина отсутствия работ *")},modifier=Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(crew,{crew=it},label={Text("Бригада (необязательно)")},modifier=Modifier.fillMaxWidth())
        Text("Материалы",style=MaterialTheme.typography.titleSmall)
        OutlinedTextField(materialName,{materialName=it},label={Text("Название материала")},modifier=Modifier.fillMaxWidth())
        OutlinedTextField(materialQuantity,{materialQuantity=it},label={Text("Количество материала (необязательно)")},modifier=Modifier.fillMaxWidth(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal))
        OutlinedTextField(materialUnit,{materialUnit=it},label={Text("Единица материала")},modifier=Modifier.fillMaxWidth())
        CompactSelection("Движение материала",materialDirection,listOf("mentioned" to "Упоминание","received" to "Поступило","consumed" to "Израсходовано"),onSelect={materialDirection=it})
        OutlinedButton(onClick={
            val n=materialQuantity.replace(',','.').toBigDecimalOrNull()
            if(materialName.isBlank() || materialName.length>200 || materialUnit.length>50 || materials.size>=100 || (materialDirection!="mentioned" && (n==null || n<=java.math.BigDecimal.ZERO)) || (materialQuantity.isNotBlank() && (n==null || n<java.math.BigDecimal.ZERO || n.stripTrailingZeros().scale()>6 || n.precision()-n.scale()>14 || materialUnit.isBlank())))formError="Проверьте название, направление, количество и единицу материала"
            else {materials.add(JSONObject().put("name",materialName.trim()).put("quantity",n?.toPlainString()?:JSONObject.NULL).put("unit",materialUnit.ifBlank { null }?:JSONObject.NULL).put("direction",materialDirection));materialName="";materialQuantity="";materialUnit="";materialDirection="mentioned";formError=""}
        }){Text("+ Добавить материал")}
        materials.forEachIndexed { i,m -> Row {Text("${m.getString("name")} · ${when(m.optString("direction","mentioned")){"received"->"поступило";"consumed"->"израсходовано";else->"упомянуто"}}",Modifier.weight(1f));TextButton(onClick={materials.removeAt(i)}){Text("Удалить")}} }
        Text("События и проблемы",style=MaterialTheme.typography.titleSmall)
        OutlinedTextField(incidentText,{incidentText=it},label={Text("Что произошло (необязательно)")},modifier=Modifier.fillMaxWidth())
        OutlinedButton(onClick={if(incidentText.isBlank() || incidentText.length>2000 || incidents.size>=100)formError="Укажите событие" else {incidents.add(JSONObject().put("description",incidentText));incidentText="";formError=""}}){Text("+ Добавить событие")}
        incidents.forEachIndexed { i,event -> Row {Text(event.getString("description"),Modifier.weight(1f));TextButton(onClick={incidents.removeAt(i)}){Text("Удалить")}} }
        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        TextButton(onClick={showFinance=!showFinance},modifier=Modifier.padding(top=8.dp)) {Text("Деньги (${financialEntries.size}) ${if(showFinance)"▴" else "▾"}")}
        if(showFinance) {
        Text("Каждая трата, поступление и аванс — отдельная запись. Дата операции может отличаться от даты отчёта.",style=MaterialTheme.typography.bodySmall)
        CompactSelection("Вид операции",financeKind,listOf("expense" to "Расход","funding_received" to "Поступление","advance_issued" to "Выдача аванса"),onSelect={financeKind=it})
        OutlinedTextField(financeAmount,{financeAmount=it},label={Text("Сумма, ₽")},modifier=Modifier.fillMaxWidth(),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal))
        OutlinedTextField(financeCategory,{financeCategory=it},label={Text("Категория (например, топливо)")},modifier=Modifier.fillMaxWidth())
        OutlinedTextField(financeDate,{financeDate=it},label={Text("Дата операции YYYY-MM-DD")},placeholder={Text(workDate)},modifier=Modifier.fillMaxWidth(),singleLine=true)
        OutlinedTextField(financeDescription,{financeDescription=it},label={Text("Пояснение к операции")},modifier=Modifier.fillMaxWidth())
        OutlinedButton(onClick={
            val kopecks=parseMoneyKopecks(financeAmount)
            val date=financeDate.ifBlank { workDate }
            if(kopecks==null || financeCategory.isBlank() || financeCategory.length>100 || financeDescription.length>1000 || financialEntries.size>=100 || runCatching{LocalDate.parse(date)}.isFailure)
                formError="Проверьте сумму, категорию и дату денежной операции"
            else {
                financialEntries.add(JSONObject().put("id",UUID.randomUUID().toString()).put("kind",financeKind).put("operation_date",date).put("amount_kopecks",kopecks).put("category",financeCategory.trim()).put("description",financeDescription.trim().ifBlank { null }?:JSONObject.NULL))
                financeAmount="";financeCategory="";financeDate="";financeDescription="";formError=""
            }
        }){Text("+ Добавить денежную операцию")}
        financialEntries.forEachIndexed { i,entry -> Row(Modifier.fillMaxWidth()) {
            Text("${entry.getString("operation_date")} · ${entry.getString("category")} · ${java.math.BigDecimal.valueOf(entry.getLong("amount_kopecks"),2).toPlainString()} ₽",Modifier.weight(1f))
            TextButton(onClick={financialEntries.removeAt(i)}){Text("Удалить")}
        } }
        }
        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        TextButton(onClick={showEquipment=!showEquipment},modifier=Modifier.padding(top=8.dp)) {Text("Спецтехника (${equipment.size}) ${if(showEquipment)"▴" else "▾"}")}
        if(showEquipment) {
        OutlinedTextField(equipmentType,{equipmentType=it},label={Text("Вид техники")},modifier=Modifier.fillMaxWidth())
        OutlinedTextField(equipmentHours,{equipmentHours=it},label={Text("Отработано часов")},modifier=Modifier.fillMaxWidth(),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal))
        Row(verticalAlignment=androidx.compose.ui.Alignment.CenterVertically) {Checkbox(checked=equipmentHired,onCheckedChange={equipmentHired=it});Text("Наёмная техника")}
        OutlinedButton(onClick={
            val hours=equipmentHours.replace(',','.').toBigDecimalOrNull()
            if(equipmentType.isBlank() || equipmentType.length>100 || hours==null || hours<=java.math.BigDecimal.ZERO || hours.stripTrailingZeros().scale()>2 || hours.precision()-hours.scale()>6 || equipment.size>=50)
                formError="Укажите вид техники и часы больше нуля"
            else {equipment.add(JSONObject().put("type",equipmentType.trim()).put("hours",hours.toPlainString()).put("hired",equipmentHired));equipmentType="";equipmentHours="";equipmentHired=false;formError=""}
        }){Text("+ Добавить технику")}
        equipment.forEachIndexed { i,entry -> Row(Modifier.fillMaxWidth()) {
            Text("${entry.getString("type")} · ${entry.getString("hours")} ч${if(entry.optBoolean("hired"))" · наёмная" else ""}",Modifier.weight(1f))
            TextButton(onClick={equipment.removeAt(i)}){Text("Удалить")}
        } }
        }
        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        TextButton(onClick={showPlans=!showPlans},modifier=Modifier.padding(top=8.dp)) {Text("План следующей смены (${nextShiftPlans.size}) ${if(showPlans)"▴" else "▾"}")}
        if(showPlans) {
        OutlinedTextField(planText,{planText=it},label={Text("Что планируется")},modifier=Modifier.fillMaxWidth())
        OutlinedButton(onClick={
            if(planText.isBlank() || planText.length>500 || nextShiftPlans.size>=30)formError="Укажите пункт плана до 500 знаков"
            else {nextShiftPlans.add(planText.trim());planText="";formError=""}
        }){Text("+ Добавить пункт плана")}
        nextShiftPlans.forEachIndexed { i,item -> Row(Modifier.fillMaxWidth()) {Text(item,Modifier.weight(1f));TextButton(onClick={nextShiftPlans.removeAt(i)}){Text("Удалить")}} }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(enabled=!busy,onClick={picker.launch("image/*")}) {Text("Добавить фотографии (${photos.size})")}
        photos.forEachIndexed { i,photo -> key(photo.getString("id")) {PhotoPreview(photo.getString("path"),i+1,!busy){photos.remove(photo)}} }
        OutlinedTextField(comment,{comment=it},label={Text("Комментарий (необязательно)")},modifier=Modifier.fillMaxWidth(),minLines=2)
        if(formError.isNotBlank())Text(formError,color=MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(16.dp))
        Button(enabled=!busy,onClick={
            try {
                LocalDate.parse(workDate)
                if(comment.length>5000 || reason.length>2000)throw IllegalArgumentException("Комментарий — до 5000 знаков, причина — до 2000")
                if(crew.length>1000)throw IllegalArgumentException("Бригада — до 1000 знаков")
                if(quantity.isNotBlank() || description.isNotBlank())throw IllegalArgumentException("Добавьте заполненный вид работы либо очистите поля")
                if(kind=="no_work" && workEntries.isNotEmpty())throw IllegalArgumentException("Удалите добавленные работы перед выбором отчёта без работ")
                if(materialName.isNotBlank() || materialQuantity.isNotBlank() || materialUnit.isNotBlank() || materialDirection!="mentioned" || incidentText.isNotBlank())throw IllegalArgumentException("Добавьте или очистите незавершённый материал или событие")
                if(financeAmount.isNotBlank() || financeCategory.isNotBlank() || financeDate.isNotBlank() || financeDescription.isNotBlank()){showFinance=true;throw IllegalArgumentException("Добавьте или очистите незавершённую денежную операцию")}
                if(equipmentType.isNotBlank() || equipmentHours.isNotBlank()){showEquipment=true;throw IllegalArgumentException("Добавьте или очистите незавершённую запись техники")}
                if(planText.isNotBlank()){showPlans=true;throw IllegalArgumentException("Добавьте или очистите незавершённый план")}
                if(selectedSite.isBlank() || (kind=="work" && workEntries.isEmpty()) || (kind=="no_work" && reason.isBlank())) throw IllegalArgumentException("Заполните обязательные поля")
                if(editing!=null && editReason.trim().length<2)throw IllegalArgumentException("Укажите причину исправления")
                val saved=Draft(ownerId=ownerId,id=editing?.id?:UUID.randomUUID().toString(),siteId=selectedSite,siteName=sites.first{it.first==selectedSite}.second,workDate=workDate,kind=kind,
                    workEntriesJson=JSONArray(if(kind=="work")workEntries.toList() else emptyList<JSONObject>()).toString(),noWorkReason=reason,comment=comment,photosJson=JSONArray(photos.toList()).toString(),serverId=editing?.serverId,
                    serverRevision=editing?.serverRevision?:1,editRequested=editing!=null,editReason=editReason,createdAt=editing?.createdAt?:System.currentTimeMillis(),
                    extrasJson=JSONObject().put("crew",crew.ifBlank { null }?:JSONObject.NULL).put("materials",if(materials.isEmpty())JSONObject.NULL else JSONArray(materials.toList())).put("incidents",if(incidents.isEmpty())JSONObject.NULL else JSONArray(incidents.toList()))
                        .put("financial_entries",if(financialEntries.isEmpty())JSONObject.NULL else JSONArray(financialEntries.toList()))
                        .put("equipment",if(equipment.isEmpty())JSONObject.NULL else JSONArray(equipment.toList()))
                        .put("next_shift_plans",if(nextShiftPlans.isEmpty())JSONObject.NULL else JSONArray(nextShiftPlans.toList())).toString())
                val consumed=formSession?:throw IllegalStateException("Форма ещё не загружена")
                busy=true
                scope.launch {
                    try {
                        withContext(Dispatchers.IO){formRepository.enqueue(consumed,saved)}
                        workEntries.clear();photos.clear();reason="";comment="";quantity="";description="";loadExtras(JSONObject());editing=null;editReason="";formSession=null;formReload++;formError=if(BuildConfig.DEMO_MODE)"Демо: сохранено на телефоне. Внешней отправки нет." else "Отчёт сохранён локально. Отправка — автоматически."
                        try {SyncWorker.schedule(context)}catch(e:Exception){formError="Отчёт сохранён в очереди. Не удалось запланировать отправку: ${e.message}"}
                    } catch(e:Exception){formError=e.message?:"Ошибка сохранения. Форма сохранена на экране."}
                    finally{busy=false}
                }
            }catch(e:Exception){formError=e.message?:"Проверьте форму"}
        },modifier=Modifier.fillMaxWidth()){Text("Сохранить и отправить")}
        Spacer(Modifier.height(20.dp))
        TextButton(enabled=!busy && editing==null,onClick={scope.launch{dao.retryFailed(ownerId);SyncWorker.schedule(context)}}){Text("Повторить отправку")}
        Text("Мои отчёты",style=MaterialTheme.typography.titleMedium)
        drafts.forEach { draft ->
            Card(Modifier.fillMaxWidth().padding(vertical=5.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("${draft.siteName} · ${draft.workDate}")
                    val label=when(draft.status){"delivered"->if(BuildConfig.DEMO_MODE)"Демо: сохранён локально ✓" else "Доставлен ✓";"uploading"->"Загрузка…";"failed"->"Нужна проверка / повторный вход";else->"Ожидает отправки"}
                    Text(label,color=if(draft.status=="delivered") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary)
                    if(draft.status=="failed" && editing==null)TextButton(enabled=!busy,onClick={replaceForm {
                        editing=draft;editReason="Исправление отклонённого отчёта";selectedSite=draft.siteId;workDate=draft.workDate
                        kind=draft.kind;reason=draft.noWorkReason;comment=draft.comment
                        loadExtras(JSONObject(draft.extrasJson))
                        workEntries.clear();val entries=JSONArray(draft.workEntriesJson)
                        for(i in 0 until entries.length())workEntries.add(entries.getJSONObject(i))
                        photos.clear();val localPhotos=JSONArray(draft.photosJson)
                        for(i in 0 until localPhotos.length())photos.add(localPhotos.getJSONObject(i))
                        formError="Отчёт загружен в форму. Исправьте ошибку и сохраните."
                    }}){Text("Исправить локальный отчёт")}
                    if(draft.businessStatus!=null)Text("${if(BuildConfig.DEMO_MODE)"Демо-статус" else "На сервере"}: ${businessStatusLabel(draft.businessStatus)} · версия ${draft.serverRevision}")
                    if(draft.serverId!=null && editing==null)TextButton(enabled=!busy,onClick={
                        busy=true;scope.launch {
                            try {
                                val remote=withContext(Dispatchers.IO){api.existingByClient(token!!,draft.id)}
                                val updated=draft.copy(serverRevision=remote.getInt("revision"),businessStatus=remote.getString("status"))
                                withContext(Dispatchers.IO){dao.save(updated)}
                                if(remote.getString("status")!="needs_revision") {formError="Статус обновлён: ${businessStatusLabel(remote.getString("status"))}"}
                                else {
                                    val data=remote.getJSONObject("data")
                                    val ids=data.getJSONArray("required_photo_ids")
                                    val localPhotos=JSONArray(draft.photosJson)
                                    val localIds=(0 until localPhotos.length()).map{localPhotos.getJSONObject(it).getString("id")}.toSet()
                                    require((0 until ids.length()).map{ids.getString(it)}.toSet()==localIds){"Фото сервера отличаются от локальных"}
                                    replaceForm {
                                    editing=updated;selectedSite=draft.siteId;workDate=data.getString("work_date");kind=data.getString("kind")
                                    reason=if(data.isNull("no_work_reason"))"" else data.getString("no_work_reason")
                                    comment=if(data.isNull("comment"))"" else data.getString("comment")
                                    loadExtras(data)
                                    workEntries.clear();val entries=data.getJSONArray("work_entries")
                                    for(i in 0 until entries.length())workEntries.add(entries.getJSONObject(i))
                                    photos.clear();for(i in 0 until localPhotos.length())photos.add(localPhotos.getJSONObject(i))
                                    formError="Возвращённый отчёт загружен в форму выше"
                                    }
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
    pendingReplacement?.let { action ->
        AlertDialog(onDismissRequest={pendingReplacement=null},title={Text("Открыть другой отчёт?")},
            text={Text("Текущая незавершённая форма будет заменена. Продолжите её заполнение или откройте выбранный отчёт для исправления.")},
            confirmButton={TextButton(onClick={pendingReplacement=null;action()}){Text("Открыть отчёт")}},
            dismissButton={TextButton(onClick={pendingReplacement=null}){Text("Продолжить текущую форму")}})
    }
}
