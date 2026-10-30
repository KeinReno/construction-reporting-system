package com.kaiden.construction
import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FormRecreationTest {
    @get:Rule val compose=createEmptyComposeRule()
    @Test fun rawInputRestoresAfterActivityRecreationWithoutSending() {
        val context:Context=ApplicationProvider.getApplicationContext()
        val db=AppDatabase.get(context);db.clearAllTables()
        runBlocking {db.drafts().save(Draft(id="synthetic-failed",ownerId="synthetic-owner",siteId="synthetic-site",siteName="Synthetic offline site",workDate="2026-10-25",kind="work",workEntriesJson="[]",noWorkReason="",comment="Old report",photosJson="[]",status="failed"))}
        SecureSession(context).save("synthetic-offline-token","synthetic-owner")
        context.getSharedPreferences("site-cache",Context.MODE_PRIVATE).edit().putString("synthetic-owner","""[{"id":"synthetic-site","name":"Synthetic offline site"},{"id":"synthetic-site-two","name":"Synthetic second site"}]""").commit()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            compose.waitUntil(10_000) {compose.onAllNodesWithText("Дата работ дд/мм/гггг *").fetchSemanticsNodes().isNotEmpty()}
            compose.waitUntil(10_000) {compose.onAllNodesWithText("Synthetic offline site").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("Synthetic offline site").performScrollTo().performClick()
            compose.onNodeWithText("Synthetic second site").performClick()
            compose.onNodeWithText("Дата работ дд/мм/гггг *").performScrollTo().performTextReplacement("31/12/1899")
            compose.onNodeWithText("Выбрать дату в календаре").performScrollTo().performClick()
            compose.onNodeWithText("Отмена").performClick()
            compose.onNodeWithText("Дата работ дд/мм/гггг *").assertTextContains("31/12/1899")
            compose.onNodeWithText("Дата работ дд/мм/гггг *").performScrollTo().performTextReplacement("25/10/2")
            compose.onNodeWithText("Выбрать дату в календаре").performScrollTo().performClick()
            compose.onNodeWithText("Отмена").performClick()
            compose.onNodeWithText("Дата работ дд/мм/гггг *").assertTextContains("25/10/2")
            compose.onNodeWithText("Сварка металлоконструкций").performScrollTo().performClick()
            compose.onNodeWithText("Монтаж").performClick()
            compose.onNodeWithText("Выполненный объём").performScrollTo().performTextInput("1,")
            compose.onNodeWithText("Бригада (необязательно)").performScrollTo().performTextInput("Synthetic crew")
            compose.onNodeWithText("Материалы (0)",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("Название материала").performScrollTo().performTextInput("Unfinished material")
            compose.waitUntil(10_000) {
                runBlocking { db.forms().get("synthetic-owner")?.let {
                    val form=FormSnapshot.decode(it.payload,it.ownerId)
                    form.workDate=="25/10/2" && form.quantity=="1," && form.workType=="Монтаж" && form.siteId=="synthetic-site-two" && form.crew=="Synthetic crew" && form.materialName=="Unfinished material"
                }?:false }
            }
            scenario.recreate()
            compose.waitUntil(10_000) {compose.onAllNodesWithText("Дата работ дд/мм/гггг *").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("Дата работ дд/мм/гггг *").assertTextContains("25/10/2")
            compose.onNodeWithText("Монтаж").assertExists()
            compose.onNodeWithText("Synthetic second site").assertExists()
            compose.onNodeWithText("Материалы (0)",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("Название материала").performScrollTo().assertTextContains("Unfinished material")
            compose.onNodeWithText("Выполненный объём").assertTextContains("1,")
            compose.onNodeWithText("История").performClick()
            compose.onNodeWithText("Исправить локальный отчёт").performScrollTo().performClick()
            compose.onNodeWithText("Открыть другой отчёт?").assertExists()
            compose.onNodeWithText("Продолжить текущую форму").performClick()
            compose.onNodeWithText("Отчёт").performClick()
            compose.onNodeWithText("Выполненный объём").assertTextContains("1,")
            compose.onNodeWithText("Дата работ дд/мм/гггг *").assertTextContains("25/10/2")
            compose.onNodeWithText("История").performClick()
            compose.onNodeWithText("Исправить локальный отчёт").performScrollTo().performClick()
            compose.onNodeWithText("Открыть отчёт").performClick()
            compose.onNodeWithText("Выполненный объём").assert(SemanticsMatcher("Discarded pending quantity is cleared"){it.config[SemanticsProperties.EditableText].text.isEmpty()})
            assertTrue(runBlocking {db.drafts().pending("synthetic-owner").isEmpty()})
        }
        SecureSession(context).clear();db.clearAllTables()
    }
}
