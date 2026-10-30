package com.kaiden.construction
import android.content.Context
import java.net.URI
import androidx.room.withTransaction

object HttpsEndpoint {
    fun normalize(value:String):String {
        val uri=runCatching { URI(value.trim()) }.getOrElse { throw IllegalArgumentException("Некорректный адрес сервера") }
        require(uri.scheme.equals("https",ignoreCase=true) && !uri.host.isNullOrBlank()) {"Нужен HTTPS-адрес сервера"}
        require(uri.rawUserInfo==null && uri.rawQuery==null && uri.rawFragment==null) {"Адрес не должен содержать логин, параметры или #"}
        require(uri.port==-1 || uri.port in 1..65535) {"Неверный порт"}
        val path=(uri.rawPath?:"").trimEnd('/')
        require(!path.contains("%") && !path.split('/').any{it=="."||it==".."}) {"Некорректный путь сервера"}
        val base=if(path.isEmpty())"/api/v1" else path
        require(base.endsWith("/api/v1")) {"Путь API должен заканчиваться /api/v1"}
        return URI("https",null,uri.host.lowercase(),if(uri.port==443)-1 else uri.port,base,null,null).toASCIIString()
    }
}
/** One server per installation with local data. Never silently redirect old drafts to a new server. */
class EndpointSettings(context:Context,private val database:AppDatabase) {
    private val prefs=context.getSharedPreferences("server",Context.MODE_PRIVATE)
    private val session=SecureSession(context)
    private val cache=context.getSharedPreferences("site-cache",Context.MODE_PRIVATE)
    fun current():String=HttpsEndpoint.normalize(prefs.getString("url",null)?:BuildConfig.API_BASE_URL)
    fun isBound():Boolean=prefs.contains("url")
    fun bindAfterLogin(value:String) {
        check(isBound() && HttpsEndpoint.normalize(value)==current()) {"Адрес сервера изменился во время входа"}
        check(prefs.edit().putBoolean("used",true).commit()) {"Не удалось закрепить сервер за профилем"}
    }
    suspend fun configure(value:String):String=database.withTransaction {
        val normalized=HttpsEndpoint.normalize(value)
        if(isBound() && normalized==current())return@withTransaction normalized
        check(!prefs.getBoolean("used",false) && session.snapshot()==null && database.drafts().countAll()==0 && database.forms().countAll()==0) {"Адрес закреплён за локальными данными. Смена требует переноса данных в отдельный профиль."}
        check(prefs.edit().putString("url",normalized).commit()) {"Не удалось сохранить адрес сервера"}
        cache.edit().clear().commit()
        normalized
    }
}
