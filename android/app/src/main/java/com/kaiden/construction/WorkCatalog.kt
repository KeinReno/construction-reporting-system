package com.kaiden.construction

import org.json.JSONObject

/** Local work kinds until SPEC-00 B07 server catalog is approved. Unit follows the kind, not the previous row. */
object WorkCatalog {
    data class Kind(val name: String, val unit: String)
    const val DEFAULT = "Сварка металлоконструкций"
    val items = listOf(
        Kind(DEFAULT, "шт"),
        Kind("Монтаж", "шт"),
        Kind("Монтаж металлоконструкций", "шт"),
        Kind("Кладка перегородок", "м²"),
        Kind("Прокладка кабеля", "м"),
        Kind("Устройство покрытия", "м²"),
        Kind("Установка окон", "шт"),
        Kind("Покраска", "м²"),
        Kind("Разгрузка", ""),
        Kind("Уборка территории", ""),
        Kind("Подготовка участка", ""),
        Kind("Планировка грунта", ""),
        Kind("Другое", ""),
    )
    val names = items.map { it.name }
    fun kind(name: String) = items.find { it.name == name } ?: items.last()
    fun unitFor(name: String) = kind(name).unit
    fun qualitative(name: String) = unitFor(name).isEmpty()
    fun applyType(previous: String, next: String, quantity: String): Pair<String, String> {
        val unit = unitFor(next)
        return unit to if (qualitative(next) || unitFor(previous) != unit) "" else quantity
    }
    fun addError(type: String, quantity: String, unit: String, description: String, already: Int): String? {
        if (already >= 100) return "Укажите корректный объём или описание"
        if (description.length > 2000 || unit.length > 50) return "Укажите корректный объём или описание"
        if (type == "Другое" && description.isBlank()) return "Для «Другое» укажите пояснение"
        if (qualitative(type) && quantity.isNotBlank()) return "Для этой работы объём не указывается"
        if (qualitative(type)) return null
        val n = quantity.replace(',', '.').toBigDecimalOrNull()
        if (quantity.isNotBlank() && n == null) return "Укажите корректный объём или описание"
        if (n == null) return "Укажите объём"
        if (n < java.math.BigDecimal.ZERO || n.stripTrailingZeros().scale() > 6 || n.precision() - n.scale() > 14) return "Укажите корректный объём или описание"
        if (unit.isBlank()) return "Укажите корректный объём или описание"
        return null
    }
    fun entry(type: String, quantity: String, unit: String, description: String): JSONObject {
        val n = if (qualitative(type)) null else quantity.replace(',', '.').toBigDecimalOrNull()
        return JSONObject().apply {
            put("type", type)
            if (n != null) { put("quantity", n.toPlainString()); put("unit", unit) }
            if (description.isNotBlank()) put("description", description)
        }
    }
    fun rowLabel(entry: JSONObject): String {
        val type = entry.getString("type")
        val quantity = if (entry.isNull("quantity")) "" else entry.optString("quantity")
        val unit = entry.optString("unit")
        val description = entry.optString("description")
        return if (quantity.isBlank()) "$type · без численного объёма${if (description.isBlank()) "" else " · $description"}"
        else "$type · $quantity $unit"
    }
}
