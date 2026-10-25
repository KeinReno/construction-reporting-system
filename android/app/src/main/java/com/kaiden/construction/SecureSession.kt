package com.kaiden.construction

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class SessionIdentity(val token:String,val userId:String)
/** Token and owner share one encrypted record, so account switching cannot mix identities. */
class SecureSession(context: Context) {
    private val prefs = context.getSharedPreferences("session",Context.MODE_PRIVATE)
    private val alias = "construction-report-token"
    private fun secret(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(alias,null) as? SecretKey)?.let { return it }
        val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        return generator.generateKey()
    }
    fun save(token:String, userId:String) {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE,secret())
        val payload=JSONObject().put("token",token).put("user_id",userId).toString()
        val bytes = cipher.iv + cipher.doFinal(payload.toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("encrypted",Base64.encodeToString(bytes,Base64.NO_WRAP)).remove("user_id").commit()) {"Не удалось сохранить сессию"}
    }
    fun snapshot():SessionIdentity? { return try {
        val encoded=prefs.getString("encrypted",null)?:return null
        val bytes=Base64.decode(encoded,Base64.NO_WRAP)
        val cipher=Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE,secret(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
        val payload=JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8))
        SessionIdentity(payload.getString("token"),payload.getString("user_id"))
    }catch(_:Exception) {null} }
    fun get():String? = snapshot()?.token
    fun userId():String? = snapshot()?.userId
    fun clear() {prefs.edit().remove("encrypted").remove("user_id").commit()}
}
