package com.kaiden.construction

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Must only be called from Dispatchers.IO / Worker, never directly on the UI thread. */
class ApiException(val status:Int, message:String): Exception(message)

object ApiClient {
    private val root = BuildConfig.API_BASE_URL.trimEnd('/')
    private fun request(path:String,method:String="GET",token:String?=null,body:ByteArray?=null,mime:String="application/json",sha:String?=null): JSONObject {
        require(root.startsWith("https://")) { "A HTTPS API endpoint must be configured at build time" }
        val connection=URL(root + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod=method
            connection.connectTimeout=15000
            connection.readTimeout=30000
            connection.setRequestProperty("Accept","application/json")
            if(token!=null) connection.setRequestProperty("Authorization","Bearer $token")
            if(sha!=null) connection.setRequestProperty("X-Content-SHA256",sha)
            if(body!=null) {
                connection.doOutput=true
                connection.setRequestProperty("Content-Type",mime)
                connection.outputStream.use { it.write(body) }
            }
            val status=connection.responseCode
            val text=(if(status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use{it.readText()} ?: ""
            if(status !in 200..299) throw ApiException(status,"HTTP $status: ${text.take(250)}")
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
        // Server returns JSON array, whereas request() expects an object.
        require(root.startsWith("https://"))
        val endpoint = URL(root + "/sites")
        val connection=endpoint.openConnection() as HttpURLConnection
        try {
            connection.connectTimeout=15000;connection.readTimeout=15000
            connection.setRequestProperty("Authorization","Bearer $token")
            if(connection.responseCode !in 200..299) throw ApiException(connection.responseCode,"Cannot load objects: HTTP ${connection.responseCode}")
            val array=JSONArray(connection.inputStream.bufferedReader().use{it.readText()})
            return (0 until array.length()).map { i ->
                val item=array.getJSONObject(i)
                item.getString("id") to item.getString("name")
            }
        }finally{connection.disconnect()}
    }
    fun draft(token:String, data:JSONObject):String = request("/reports","POST",token,data.toString().toByteArray()).getString("id")
    fun existingByClient(token:String,id:String):JSONObject = request("/reports/by-client/$id",token=token)
    fun submit(token:String,id:String,revision:Int):JSONObject = request("/reports/$id/submit","POST",token,JSONObject().put("expected_revision",revision).toString().toByteArray())
    fun upload(token:String,reportId:String,photo:JSONObject) {
        val content=File(photo.getString("path")).readBytes()
        val digest=MessageDigest.getInstance("SHA-256").digest(content).joinToString(""){"%02x".format(it)}
        request("/reports/$reportId/attachments/${photo.getString("id")}","PUT",token,content,photo.getString("mime"),digest)
    }
}
