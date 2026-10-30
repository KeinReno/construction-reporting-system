package com.kaiden.construction

import java.time.LocalDate
import java.time.ZoneOffset
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WorkDateFieldTest {
    @Test fun displayDateKeepsIsoForValidInputAndRawIncompleteInput() {
        assertEquals("25/10/2026",displayDate("2026-10-25"))
        assertEquals("2026-10-25",storedDate("25/10/2026"))
        assertEquals("31/02/2026",storedDate("31/02/2026"))
        assertEquals("25/10/2",storedDate("25/10/2"))
    }
    @Test fun pickerDateDoesNotShiftWithDeviceTimezone() {
        val previous=TimeZone.getDefault()
        try {
            val instant=LocalDate.of(2026,5,15).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            for(zone in listOf("Pacific/Honolulu","Asia/Vladivostok")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                assertEquals("2026-05-15",calendarDate(instant))
            }
        }finally{TimeZone.setDefault(previous)}
    }
    @Test fun outOfRangeAndPartialDatesRemainUnselected() {
        assertNull(calendarInitial("1899-12-31",1900..2100))
        assertNull(calendarInitial("2101-01-01",1900..2100))
        assertNull(calendarInitial("2026-1",1900..2100))
    }
}
