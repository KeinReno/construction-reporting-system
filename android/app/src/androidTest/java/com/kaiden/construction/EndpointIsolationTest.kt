package com.kaiden.construction
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
@RunWith(AndroidJUnit4::class)
class EndpointIsolationTest {
    @Test fun legacyTokenWithoutServerIsNeverReused() {
        val context:Context=ApplicationProvider.getApplicationContext();val session=SecureSession(context)
        session.save("synthetic","A","https://a.invalid")
        try {
            val store=java.security.KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
            val key=store.getKey("construction-report-token",null) as javax.crypto.SecretKey
            val cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.ENCRYPT_MODE,key)
            val payload=org.json.JSONObject().put("token","old-synthetic").put("user_id","A").toString().toByteArray()
            val encoded=android.util.Base64.encodeToString(cipher.iv+cipher.doFinal(payload),android.util.Base64.NO_WRAP)
            context.getSharedPreferences("session",Context.MODE_PRIVATE).edit().putString("encrypted",encoded).commit()
            assertNull(session.snapshot())
        }finally{session.clear()}
    }

    @Test fun allLocalRecordsPreventServerSwitch()=runBlocking {
        val context:Context=ApplicationProvider.getApplicationContext();val name="endpoint-${UUID.randomUUID()}.db";val db=AppDatabase.build(context,name)
        val prefs=context.getSharedPreferences("server",Context.MODE_PRIVATE);prefs.edit().clear().commit();SecureSession(context).clear()
        try {
            val settings=EndpointSettings(context,db);settings.configure("https://a.invalid")
            db.drafts().save(Draft(id="r",ownerId="A",siteId="s",siteName="Synthetic",workDate="2026-10-26",kind="work",workEntriesJson="[]",noWorkReason="",comment="",photosJson="[]",status="delivered"))
            try{settings.configure("https://b.invalid");fail("Delivered record moved to another server")}catch(_:IllegalStateException){}
            db.clearAllTables();FormRepository(db).open("A")
            try{settings.configure("https://b.invalid");fail("Partial form moved to another server")}catch(_:IllegalStateException){}
            db.clearAllTables();settings.configure("https://b.invalid")
            assertEquals("https://b.invalid/api/v1",settings.current())
            settings.bindAfterLogin(settings.current())
            SecureSession(context).save("synthetic","A",settings.current())
            assertEquals(settings.current(),SecureSession(context).snapshot()!!.endpoint)
            try{settings.configure("https://c.invalid");fail("Active session endpoint changed")}catch(_:IllegalStateException){}
            SecureSession(context).clear();db.clearAllTables()
            try{settings.configure("https://c.invalid");fail("Bound installation changed server after logout")}catch(_:IllegalStateException){}
        }finally{SecureSession(context).clear();prefs.edit().clear().commit();db.close();context.deleteDatabase(name)}
    }
}
