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
        context.getSharedPreferences("site-cache",Context.MODE_PRIVATE).edit().putString("synthetic-owner","""[{"id":"synthetic-site","name":"Synthetic offline site"}]""").commit()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            compose.waitUntil(10_000) {compose.onAllNodesWithText("Дата работ YYYY-MM-DD *").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("Дата работ YYYY-MM-DD *").performScrollTo().performTextReplacement("2026-1")
            compose.onNodeWithText("Выполненный объём").performScrollTo().performTextInput("1,")
            compose.waitUntil(10_000) {
                runBlocking { db.forms().get("synthetic-owner")?.let {
                    val form=FormSnapshot.decode(it.payload,it.ownerId)
                    form.workDate=="2026-1" && form.quantity=="1,"
                }?:false }
            }
            scenario.recreate()
            compose.waitUntil(10_000) {compose.onAllNodesWithText("Дата работ YYYY-MM-DD *").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("Дата работ YYYY-MM-DD *").assertTextContains("2026-1")
            compose.onNodeWithText("Выполненный объём").assertTextContains("1,")
            compose.onNodeWithText("Исправить локальный отчёт").performScrollTo().performClick()
            compose.onNodeWithText("Открыть другой отчёт?").assertExists()
            compose.onNodeWithText("Продолжить текущую форму").performClick()
            compose.onNodeWithText("Выполненный объём").assertTextContains("1,")
            compose.onNodeWithText("Дата работ YYYY-MM-DD *").assertTextContains("2026-1")
            compose.onNodeWithText("Исправить локальный отчёт").performScrollTo().performClick()
            compose.onNodeWithText("Открыть отчёт").performClick()
            compose.onNodeWithText("Выполненный объём").assert(SemanticsMatcher("Discarded pending quantity is cleared"){it.config[SemanticsProperties.EditableText].text.isEmpty()})
            assertTrue(runBlocking {db.drafts().pending("synthetic-owner").isEmpty()})
        }
        SecureSession(context).clear();db.clearAllTables()
    }
}
