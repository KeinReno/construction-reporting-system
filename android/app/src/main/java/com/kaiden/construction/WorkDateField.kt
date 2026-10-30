package com.kaiden.construction

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

internal fun calendarDate(millis:Long):String=Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
internal fun calendarInitial(value:String,yearRange:IntRange):Long? = runCatching {
    val date=LocalDate.parse(value)
    if(date.year in yearRange)date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else null
}.getOrNull()

internal fun displayDate(value:String):String = if(Regex("\\d{4}-\\d{2}-\\d{2}").matches(value))
    "${value.substring(8,10)}/${value.substring(5,7)}/${value.substring(0,4)}" else value
internal fun storedDate(value:String):String {
    val parts=Regex("(\\d{2})/(\\d{2})/(\\d{4})").matchEntire(value) ?: return value
    val iso="${parts.groupValues[3]}-${parts.groupValues[2]}-${parts.groupValues[1]}"
    return if(runCatching { LocalDate.parse(iso) }.isSuccess) iso else value
}

/** Calendar is optional; raw input still persists even while it is incomplete. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkDateField(value:String,onChange:(String)->Unit) {
    var open by remember {mutableStateOf(false)}
    OutlinedTextField(displayDate(value),{onChange(storedDate(it))},label={Text("Дата работ дд/мм/гггг *")},modifier=Modifier.fillMaxWidth(),singleLine=true)
    TextButton(onClick={open=true}){Text("Выбрать дату в календаре")}
    if(open) {
        val initial=remember(value) {calendarInitial(value,DatePickerDefaults.YearRange)}
        val context=LocalContext.current
        val russianConfiguration=remember(context) { android.content.res.Configuration(context.resources.configuration).apply { setLocale(Locale.forLanguageTag("ru-RU")) } }
        val russianContext=remember(context,russianConfiguration) { context.createConfigurationContext(russianConfiguration) }
        val state=remember(initial) { DatePickerState(locale=Locale.forLanguageTag("ru-RU"),initialSelectedDateMillis=initial) }
        CompositionLocalProvider(LocalContext provides russianContext,LocalConfiguration provides russianConfiguration) {
        DatePickerDialog(onDismissRequest={open=false},
            confirmButton={TextButton(enabled=state.selectedDateMillis!=null,onClick={
                state.selectedDateMillis?.let {onChange(calendarDate(it))};open=false
            }){Text("Выбрать")}},
            dismissButton={TextButton(onClick={open=false}){Text("Отмена")}}) {
            DatePicker(state=state,modifier=Modifier.padding(4.dp),showModeToggle=false,
                title={Text("Выберите дату",modifier=Modifier.padding(start=24.dp,top=16.dp))},
                headline={Text(state.selectedDateMillis?.let { displayDate(calendarDate(it)) } ?: "Дата не выбрана",modifier=Modifier.padding(start=24.dp,top=16.dp,bottom=16.dp),style=MaterialTheme.typography.headlineMedium)})
        }
        }
    }
}
