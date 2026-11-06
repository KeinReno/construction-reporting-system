package com.kaiden.construction

import org.junit.Assert.*
import org.junit.Test

class FinanceInputTest {
    @Test fun moneyIsExactAndNeverRounded() {
        assertEquals(12550L,parseMoneyKopecks("125,50"))
        assertEquals(1L,parseMoneyKopecks("0.01"))
        assertNull(parseMoneyKopecks("1.001"))
        assertNull(parseMoneyKopecks("-1"))
        assertNull(parseMoneyKopecks("0"))
        assertNull(parseMoneyKopecks("999999999999999999999"))
        assertNull(parseMoneyKopecks("1e2"))
        assertNull(parseMoneyKopecks("1.000"))
    }
}
