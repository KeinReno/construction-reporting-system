package com.kaiden.construction

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

internal fun calendarDate(millis:Long):String=Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
internal fun calendarInitial(value:String,yearRange:IntRange):Long? = runCatching {
    val date=LocalDate.parse(value)
    if(date.year in yearRange)date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else null
}.getOrNull()

/** Calendar is optional; raw input still persists even while it is incomplete. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkDateField(value:String,onChange:(String)->Unit) {
    var open by remember {mutableStateOf(false)}
    OutlinedTextField(value,onChange,label={Text("Дата работ YYYY-MM-DD *")},modifier=Modifier.fillMaxWidth(),singleLine=true)
    TextButton(onClick={open=true}){Text("Выбрать дату в календаре")}
    if(open) {
        val initial=remember(value) {calendarInitial(value,DatePickerDefaults.YearRange)}
        val state=rememberDatePickerState(initialSelectedDateMillis=initial)
        DatePickerDialog(onDismissRequest={open=false},
            confirmButton={TextButton(enabled=state.selectedDateMillis!=null,onClick={
                state.selectedDateMillis?.let {onChange(calendarDate(it))};open=false
            }){Text("Выбрать")}},
            dismissButton={TextButton(onClick={open=false}){Text("Отмена")}}) {
            DatePicker(state=state,modifier=Modifier.padding(4.dp))
        }
    }
}
