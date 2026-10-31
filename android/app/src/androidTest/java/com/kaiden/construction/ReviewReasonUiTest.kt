package com.kaiden.construction
import android.content.Context
import androidx.compose.ui.test.*
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
class ReviewReasonUiTest {
    @get:Rule val compose=createEmptyComposeRule()
    @Test fun returnedReasonAndPartialInputSurviveRecreationAndSessionExpiry() {
        val context:Context=ApplicationProvider.getApplicationContext();val db=AppDatabase.get(context)
        db.clearAllTables();val session=SecureSession(context);val owner="review-ui-owner"
        val draft=Draft(id="synthetic-returned",ownerId=owner,siteId="site",siteName="Synthetic offline site",workDate="2026-10-31",kind="work",workEntriesJson="[]",noWorkReason="",comment="",photosJson="[]",status="delivered",serverRevision=2,businessStatus="needs_revision",reviewReason="Уточнить материал")
        runBlocking {
            val repository=FormRepository(db);val form=repository.open(owner)
            repository.save(form.copy(payload=FormSnapshot(siteId="site",editing=draft,quantity="1,",editReason="Correction").encode()))
        }
        session.save("offline-review-token",owner)
        context.getSharedPreferences("site-cache",Context.MODE_PRIVATE).edit().putString(owner,"""[{"id":"site","name":"Synthetic offline site"}]""").commit()
        try {
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                compose.waitUntil(10_000){compose.onAllNodesWithText("Причина возврата: Уточнить материал").fetchSemanticsNodes().isNotEmpty()}
                compose.onNodeWithText("Причина возврата: Уточнить материал").assertExists()
                scenario.recreate()
                compose.waitUntil(10_000){compose.onAllNodesWithText("Причина возврата: Уточнить материал").fetchSemanticsNodes().isNotEmpty()}
                assertTrue(session.invalidate(session.snapshot()!!))
                compose.waitUntil(10_000){compose.onAllNodesWithText("Войти").fetchSemanticsNodes().isNotEmpty()}
                val saved=runBlocking {FormSnapshot.decode(db.forms().get(owner)!!.payload,owner)}
                assertEquals("1,",saved.quantity);assertEquals("Уточнить материал",saved.editing!!.reviewReason)
                session.save("renewed-offline-token",owner)
                compose.waitUntil(10_000){compose.onAllNodesWithText("Причина возврата: Уточнить материал").fetchSemanticsNodes().isNotEmpty()}
                compose.onNodeWithText("Выполненный объём").assertTextContains("1,")
            }
        }finally{session.clear();db.clearAllTables()}
    }
}
