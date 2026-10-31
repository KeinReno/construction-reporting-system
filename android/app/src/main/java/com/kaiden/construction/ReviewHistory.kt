package com.kaiden.construction

import org.json.JSONArray

/** API history is ordered; only the current revision's return decision explains a return. */
fun reviewReason(history:JSONArray,revision:Int):String? {
    for(i in history.length()-1 downTo 0) {
        val event=history.getJSONObject(i)
        if(event.optString("event")=="needs_revision" && event.optInt("revision")==revision) {
            return if(event.isNull("reason")) null else event.optString("reason").trim().takeIf {it.isNotEmpty()}
        }
    }
    return null
}
