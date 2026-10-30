package com.kaiden.construction

import org.junit.Assert.*
import org.junit.Test

class WorkCatalogTest {
    @Test fun unitFollowsKindAndDoesNotCopyPreviousRow() {
        val (cableUnit, cleared) = WorkCatalog.applyType("Сварка металлоконструкций", "Прокладка кабеля", "12")
        assertEquals("м", cableUnit)
        assertEquals("", cleared)
        val (sameUnit, kept) = WorkCatalog.applyType("Сварка металлоконструкций", "Монтаж", "1,")
        assertEquals("шт", sameUnit)
        assertEquals("1,", kept)
        val afterAdd = WorkCatalog.unitFor(WorkCatalog.DEFAULT)
        assertEquals("шт", afterAdd)
        assertNotEquals(cableUnit, afterAdd)
    }

    @Test fun qualitativeWorkRejectsInventedQuantity() {
        assertEquals("Для этой работы объём не указывается", WorkCatalog.addError("Уборка территории", "3", "шт", "", 0))
        assertNull(WorkCatalog.addError("Уборка территории", "", "", "", 0))
        val row = WorkCatalog.entry("Уборка территории", "3", "шт", "двор")
        assertTrue(row.isNull("quantity"))
        assertEquals("Уборка территории · без численного объёма · двор", WorkCatalog.rowLabel(row))
    }

    @Test fun otherRequiresExplanation() {
        assertEquals("Для «Другое» укажите пояснение", WorkCatalog.addError("Другое", "", "", "", 0))
        assertNull(WorkCatalog.addError("Другое", "", "", "подготовка основания", 0))
        assertEquals("Укажите объём", WorkCatalog.addError("Прокладка кабеля", "", "м", "", 0))
    }
}
