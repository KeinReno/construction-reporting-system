package com.kaiden.construction

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Must only be called from Dispatchers.IO / Worker, never directly on the UI thread. */
class ApiException(val status:Int, message:String): Exception(message)
internal fun connectionMessage(error:Exception, fallback:String):String = when(error) {
    is java.io.FileNotFoundException -> "Не найден локальный файл фотографии. Проверьте вложения отчёта"
    is java.io.IOException -> "Нет связи с сервером. Проверьте подключение и повторите"
    is ApiException -> error.message ?: fallback
    else -> error.message?.takeIf { message -> message.any { it in 'А'..'я' || it=='ё' || it=='Ё' } } ?: fallback
}
private fun apiMessage(status:Int,detail:String=""):String = when(detail) {
    "Revision conflict", "Revision/status conflict" -> "Отчёт изменился. Обновите статус перед повтором"
    "Client update required for extended report", "Client update required for material movements", "Client cannot preserve extended report fields" -> "Обновите приложение для работы с этим отчётом"
    "Required photos incomplete" -> "Не все обязательные фотографии загружены"
    else -> when(status) {
        401 -> "Сессия завершилась. Войдите снова"
        403 -> "Недостаточно прав для этого действия"
        404 -> "Запрошенные данные не найдены"
        409 -> "Данные изменились или действие недоступно. Проверьте отчёт"
        413 -> "Размер фотографии превышает допустимый"
        422 -> "Проверьте данные отчёта"
        429 -> "Слишком много запросов. Попробуйте позже"
        in 500..599 -> "Ошибка сервера. Повторите отправку позже"
        else -> "Не удалось выполнить запрос (код $status)"
    }
}

class ApiClient(endpoint:String=BuildConfig.API_BASE_URL,private val demo:DemoBackend?=null) {
    companion object {
        fun forSession(context:android.content.Context,endpoint:String):ApiClient {
            if(BuildConfig.DEMO_MODE){require(endpoint==DemoBackend.ENDPOINT);return ApiClient(endpoint,DemoBackend(context))}
            return ApiClient(endpoint)
        }
    }
    private val root = HttpsEndpoint.normalize(endpoint)
    private fun request(path:String,method:String="GET",token:String?=null,body:ByteArray?=null,mime:String="application/json",sha:String?=null): JSONObject {
        if(demo!=null)return demo.request(path,method,token,body)
        require(root.startsWith("https://")) { "A HTTPS API endpoint must be configured at build time" }
        val connection=URL(root + path).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false
            connection.requestMethod=method
            connection.connectTimeout=15000
            connection.readTimeout=30000
            connection.setRequestProperty("Accept","application/json")
            connection.setRequestProperty("X-Report-Capabilities","report-extras-v2")
            if(token!=null) connection.setRequestProperty("Authorization","Bearer $token")
            if(sha!=null) connection.setRequestProperty("X-Content-SHA256",sha)
            if(body!=null) {
                connection.doOutput=true
                connection.setRequestProperty("Content-Type",mime)
                connection.outputStream.use { it.write(body) }
            }
            val status=connection.responseCode
            val text=(if(status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use{it.readText()} ?: ""
            if(status !in 200..299) throw ApiException(status,apiMessage(status,runCatching { JSONObject(text).optString("detail") }.getOrDefault("")))
            return JSONObject(text)
        } finally { connection.disconnect() }
    }
    fun login(login:String,password:String):String {
        val json=JSONObject().put("login",login).put("password",password)
        return request("/auth/login","POST",body=json.toString().toByteArray()).getString("access_token")
    }
    fun me(token:String):String = request("/me",token=token).getString("id")
    fun logout(token:String) { request("/auth/logout","POST",token) }
    fun sites(token:String):List<Pair<String,String>> {
        if(demo!=null)return demo.sites()
        // Server returns JSON array, whereas request() expects an object.
        require(root.startsWith("https://"))
        val endpoint = URL(root + "/sites")
        val connection=endpoint.openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false
            connection.connectTimeout=15000;connection.readTimeout=15000
            connection.setRequestProperty("Authorization","Bearer $token")
            if(connection.responseCode !in 200..299) throw ApiException(connection.responseCode,apiMessage(connection.responseCode))
            val array=JSONArray(connection.inputStream.bufferedReader().use{it.readText()})
            return (0 until array.length()).map { i ->
                val item=array.getJSONObject(i)
                item.getString("id") to item.getString("name")
            }
        }finally{connection.disconnect()}
    }
    fun draft(token:String, data:JSONObject):String = request("/reports","POST",token,data.toString().toByteArray()).getString("id")
    fun existingByClient(token:String,id:String):JSONObject = request("/reports/by-client/$id",token=token)
    fun edit(token:String,id:String,data:JSONObject,revision:Int,reason:String):JSONObject =
        request("/reports/$id","PATCH",token,JSONObject().put("expected_revision",revision).put("reason",reason).put("data",data).toString().toByteArray())
    fun submit(token:String,id:String,revision:Int):JSONObject = request("/reports/$id/submit","POST",token,JSONObject().put("expected_revision",revision).toString().toByteArray())
    fun upload(token:String,reportId:String,photo:JSONObject) {
        val content=File(photo.getString("path")).readBytes()
        val digest=MessageDigest.getInstance("SHA-256").digest(content).joinToString(""){"%02x".format(it)}
        request("/reports/$reportId/attachments/${photo.getString("id")}","PUT",token,content,photo.getString("mime"),digest)
    }
}
