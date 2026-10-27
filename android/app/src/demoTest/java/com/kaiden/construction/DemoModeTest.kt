package com.kaiden.construction
import android.content.Context
import android.graphics.Bitmap
import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class DemoModeTest {
    @get:Rule val compose=createEmptyComposeRule()
    private fun screenshot(context:Context,name:String) {
        compose.waitForIdle()
        val bitmap=InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        checkNotNull(bitmap){"Screenshot unavailable"}
        val directory=File(context.getExternalFilesDir(null),"screenshots").apply{mkdirs()}
        val output=File(directory,name)
        output.outputStream().use{check(bitmap.compress(Bitmap.CompressFormat.PNG,100,it))}
        bitmap.recycle()
        // Gradle removes the test app and its external files after instrumentation.
        // Copy while the app is alive into an emulator-only export directory.
        for(command in listOf("mkdir -p /sdcard/Download/crs-screenshots","cp ${output.absolutePath} /sdcard/Download/crs-screenshots/$name")) {
            ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use{it.readText()}
        }
    }
    @Test fun isolatedOfflineExamplesAndNativeSubmissionPersist()=runBlocking {
        assertTrue(BuildConfig.DEMO_MODE)
        val context:Context=ApplicationProvider.getApplicationContext()
        assertEquals("com.kaiden.construction.demo",context.packageName)
        DemoBackend.prepare(context)
        val db=AppDatabase.get(context)
        assertEquals(6,db.drafts().observeAll(DemoBackend.OWNER).first().size)
        val synthetic=db.drafts().observeAll(DemoBackend.OWNER).first().single { it.workDate=="2026-05-22" }
        val sample=JSONObject(synthetic.extrasJson)
        assertEquals("Учебная бригада №1",sample.getString("crew"))
        assertEquals("Учебный материал",sample.getJSONArray("materials").getJSONObject(0).getString("name"))
        assertEquals("received",sample.getJSONArray("materials").getJSONObject(0).getString("direction"))
        assertEquals("Учебное событие: временная задержка доступа.",sample.getJSONArray("incidents").getJSONObject(0).getString("description"))
        assertEquals(12550,sample.getJSONArray("financial_entries").getJSONObject(0).getInt("amount_kopecks"))
        assertEquals("Учебный кран",sample.getJSONArray("equipment").getJSONObject(0).getString("type"))
        db.drafts().save(synthetic.copy(comment="Не перезаписывать"))
        context.getSharedPreferences("demo-seed",Context.MODE_PRIVATE).edit().remove("seeded").commit()
        DemoBackend.prepare(context)
        assertEquals("Не перезаписывать",db.drafts().observeAll(DemoBackend.OWNER).first().single{it.id==synthetic.id}.comment)
        db.drafts().save(synthetic)
        try{ApiClient.forSession(context,"https://example.org/api/v1");fail("Demo accepted external endpoint")}catch(_:IllegalArgumentException){}
        val api=ApiClient.forSession(context,DemoBackend.ENDPOINT)
        assertEquals(2,api.sites(DemoBackend.TOKEN).size)
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.waitUntil(15_000){compose.onAllNodesWithText("Посмотреть примеры (6)").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("2026-05-15 · Работы · Проверен").assertDoesNotExist()
            compose.onNodeWithText("Посмотреть примеры (6)").performClick()
            screenshot(context,"android-01-examples.png")
            compose.onNodeWithText("2026-05-15 · Работы · Проверен").performScrollTo().performClick()
            compose.onNodeWithText("Демо-отчёт 2026-05-15").assertExists()
            compose.onNodeWithContentDescription("Демо-схема, не фото объекта").assertExists()
            screenshot(context,"android-02-report.png")
            compose.onNodeWithText("Закрыть пример").performClick()
            compose.onNodeWithText("Новый отчёт").performScrollTo()
            screenshot(context,"android-03-form.png")
            compose.onNodeWithText("Выполненный объём").performScrollTo()
            screenshot(context,"android-04-work-fields.png")
            compose.onNodeWithText("Выполненный объём").performTextInput("2.75")
            compose.onNodeWithText("+ Добавить вид работ").performScrollTo().performClick()
            compose.onNodeWithText("Бригада (необязательно)").performScrollTo().performTextInput("Демо бригада")
            compose.onNodeWithText("Название материала").performScrollTo().performTextInput("Демо материал")
            compose.onNodeWithText("Количество материала (необязательно)").performScrollTo().performTextInput("2.5")
            compose.onNodeWithText("Единица материала").performScrollTo().performTextInput("м")
            ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent 4")).use{it.readBytes()}
            compose.onNodeWithText("Движение материала").performScrollTo()
            compose.onNodeWithText("Упоминание").performClick()
            compose.waitUntil(5_000){compose.onAllNodesWithText("Поступило").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("Поступило").performClick()
            compose.onNodeWithText("+ Добавить материал").performScrollTo().performClick()
            compose.onNodeWithText("Что произошло (необязательно)").performScrollTo().performTextInput("Демо событие")
            compose.onNodeWithText("+ Добавить событие").performScrollTo().performClick()
            compose.onNodeWithText("Деньги (0)",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("Сумма, ₽").performScrollTo().performTextInput("125,50")
            compose.onNodeWithText("Категория (например, топливо)").performScrollTo().performTextInput("Учебное топливо")
            compose.onNodeWithText("+ Добавить денежную операцию").performScrollTo().performClick()
            ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent 4")).use{it.readBytes()}
            compose.onNodeWithText("Учебное топливо",substring=true).performScrollTo()
            screenshot(context,"android-05-finance.png")
            compose.onNodeWithText("Спецтехника (0)",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("Вид техники").performScrollTo().performTextInput("Учебный кран")
            compose.onNodeWithText("Отработано часов").performScrollTo().performTextInput("7,5")
            compose.onNodeWithText("+ Добавить технику").performScrollTo().performClick()
            compose.onNodeWithText("План следующей смены (0)",substring=true).performScrollTo().performClick()
            compose.onNodeWithText("Что планируется").performScrollTo().performTextInput("Проверить доступ")
            compose.onNodeWithText("+ Добавить пункт плана").performScrollTo().performClick()
            compose.onNodeWithText("Сохранить и отправить").performScrollTo().performClick()
            compose.waitUntil(20_000){runBlocking{db.drafts().observeAll(DemoBackend.OWNER).first().any{r->r.createdAt>10000 && r.status=="delivered"}}}
        }
        val added=db.drafts().observeAll(DemoBackend.OWNER).first().single{it.createdAt>10000}
        assertNotNull(added.receiptId)
        val reopened=DemoBackend(context).request("/reports/by-client/${added.id}","GET",DemoBackend.TOKEN,null)
        assertEquals("submitted",reopened.getString("status"));assertEquals("2.75",reopened.getJSONObject("data").getJSONArray("work_entries").getJSONObject(0).getString("quantity"))
        assertEquals("Демо бригада",reopened.getJSONObject("data").getString("crew"))
        assertEquals("Демо материал",reopened.getJSONObject("data").getJSONArray("materials").getJSONObject(0).getString("name"))
        assertEquals("received",reopened.getJSONObject("data").getJSONArray("materials").getJSONObject(0).getString("direction"))
        assertEquals("Демо событие",reopened.getJSONObject("data").getJSONArray("incidents").getJSONObject(0).getString("description"))
        assertEquals(12550,reopened.getJSONObject("data").getJSONArray("financial_entries").getJSONObject(0).getInt("amount_kopecks"))
        assertEquals("Учебный кран",reopened.getJSONObject("data").getJSONArray("equipment").getJSONObject(0).getString("type"))
        assertEquals("Проверить доступ",reopened.getJSONObject("data").getJSONArray("next_shift_plans").getString(0))
        // Receipt is stable on replay; the simulated server is private local JSON, not HTTPS.
        assertEquals(added.receiptId,api.submit(DemoBackend.TOKEN,added.serverId!!,1).getString("receipt_id"))
    }
}
