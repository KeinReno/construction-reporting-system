package com.kaiden.construction

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class ReceiptFormTest {
    @get:Rule val compose=createEmptyComposeRule()

    @Test fun receiptSelectionSurvivesEntryAndProtectsReferencedPhoto() {
        val context:Context=ApplicationProvider.getApplicationContext()
        val owner="synthetic-receipt-owner"
        val id=UUID.randomUUID().toString()
        val photo=File(context.filesDir,"photo-$id")
        val bitmap=Bitmap.createBitmap(2,2,Bitmap.Config.ARGB_8888)
        photo.outputStream().use {bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
        bitmap.recycle()
        val db=AppDatabase.get(context)
        db.clearAllTables()
        SecureSession(context).save("synthetic-offline-token",owner)
        context.getSharedPreferences("site-cache",Context.MODE_PRIVATE).edit().putString(owner,"""[{"id":"synthetic-site","name":"Synthetic receipt site"}]""").commit()
        runBlocking {
            val repository=FormRepository(db)
            val record=repository.open(owner)
            val photos=JSONArray().put(JSONObject().put("id",id).put("path",photo.absolutePath).put("mime","image/png"))
            assertTrue(repository.save(record.copy(payload=FormSnapshot(siteId="synthetic-site",workDate="2026-10-28",kind="no_work",noWorkReason="Synthetic no work",photosJson=photos.toString()).encode())))
        }
        try {
            ActivityScenario.launch(MainActivity::class.java).use {
                compose.waitUntil(10_000){compose.onAllNodesWithText("Деньги (0)",substring=true).fetchSemanticsNodes().isNotEmpty()}
                compose.onNodeWithText("Деньги (0)",substring=true).performScrollTo().performClick()
                compose.onNodeWithText("Фото 1").performScrollTo().performClick()
                compose.onNodeWithText("Фото 1").assertIsSelected()
                compose.onNodeWithText("Сумма, ₽").performScrollTo().performTextInput("125,50")
                compose.onNodeWithText("Категория (например, топливо)").performScrollTo().performTextInput("Synthetic fuel")
                compose.onNodeWithText("+ Добавить денежную операцию").performScrollTo().performClick()
                compose.onNodeWithText("Деньги (1)",substring=true).assertExists()
                try {compose.onNodeWithText("чек: фото 1",substring=true).assertExists()}
                catch(e:AssertionError){println(compose.onRoot().printToString());throw e}
                compose.onNodeWithText("Удалить фото 1").performScrollTo().performClick()
                compose.onNodeWithText("Сначала удалите денежную операцию",substring=true).assertExists()
                assertTrue(photo.exists())
                compose.onNodeWithText("Удалить").performScrollTo().performClick()
                compose.onNodeWithText("Удалить фото 1").performScrollTo().performClick()
                compose.waitUntil(10_000){!photo.exists()}
            }
        } finally {
            SecureSession(context).clear()
            db.clearAllTables()
            photo.delete()
        }
    }
}
