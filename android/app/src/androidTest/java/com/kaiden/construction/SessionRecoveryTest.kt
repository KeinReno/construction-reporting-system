package com.kaiden.construction
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class SessionRecoveryTest {
    @Test fun delayedUnauthorizedCannotClearNewLoginAndListenerSeesExpiry() {
        val context:Context=ApplicationProvider.getApplicationContext()
        val session=SecureSession(context)
        session.save("old-token","A","https://synthetic.invalid/api/v1")
        val old=session.snapshot()!!
        session.save("new-token","B","https://synthetic.invalid/api/v1")
        assertFalse(session.invalidate(old));assertEquals("B",session.userId())
        val current=session.snapshot()!!;val changed=CountDownLatch(1)
        val stop=session.listen {if(session.snapshot()==null)changed.countDown()}
        try {assertTrue(session.invalidate(current));assertTrue(changed.await(5,TimeUnit.SECONDS));assertNull(session.get())}
        finally {stop();session.clear()}
    }
    @Test fun reauthenticationOnlyRecoversOwnAuthenticationFailures()=runBlocking {
        val context:Context=ApplicationProvider.getApplicationContext()
        val name="recovery-${UUID.randomUUID()}.db";val db=AppDatabase.build(context,name)
        try {
            fun row(id:String,owner:String,error:String)=Draft(id=id,ownerId=owner,siteId="site",siteName="Synthetic",workDate="2026-10-31",kind="work",workEntriesJson="[]",noWorkReason="",comment="kept",photosJson="[]",status="failed",lastError=error)
            db.drafts().save(row("authA","A","Сессия завершилась. Войдите снова"))
            db.drafts().save(row("authB","B","Сессия завершилась. Войдите снова"))
            db.drafts().save(row("invalidA","A","Проверьте данные отчёта"))
            db.drafts().resumeExpiredSession("A")
            assertEquals(listOf("authA"),db.drafts().pending("A").map{it.id})
            assertTrue(db.drafts().pending("B").isEmpty())
            assertEquals("failed",db.drafts().observeAll("A").first().single{it.id=="invalidA"}.status)
            val reasonRow=row("reason","A","").copy(businessStatus="needs_revision",reviewReason="Уточнить материал")
            db.drafts().save(reasonRow)
            assertEquals("Уточнить материал",db.drafts().observeAll("A").first().single{it.id=="reason"}.reviewReason)
        }finally{db.close();context.deleteDatabase(name)}
    }
}
