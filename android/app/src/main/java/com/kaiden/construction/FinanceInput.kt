package com.kaiden.construction

/** Exact rubles-to-kopecks conversion. Never round an entered amount. */
fun parseMoneyKopecks(raw:String):Long? = try {
    val normalized=raw.trim().replace(',','.')
    if(!Regex("[0-9]+(\\.[0-9]{1,2})?").matches(normalized))null
    else {
        val amount=normalized.toBigDecimal()
        if(amount<=java.math.BigDecimal.ZERO || amount.scale()>2) null
        else amount.movePointRight(2).longValueExact().takeIf { it<=10_000_000_000L }
    }
} catch(_:Exception) {null}
