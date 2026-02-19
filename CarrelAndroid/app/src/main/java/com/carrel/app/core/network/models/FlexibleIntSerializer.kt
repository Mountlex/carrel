@file:OptIn(kotlin.io.encoding.ExperimentalEncodingApi::class)

package com.carrel.app.core.network.models

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.io.encoding.Base64
import kotlin.math.roundToInt
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Convex may return numbers as 60, 60.0, or encoded int64/float objects.
 * This keeps app models resilient to all variants.
 */
object FlexibleIntSerializer : KSerializer<Int> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleInt", PrimitiveKind.INT)

    override fun serialize(encoder: Encoder, value: Int) {
        encoder.encodeInt(value)
    }

    override fun deserialize(decoder: Decoder): Int {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeInt()
        val element = jsonDecoder.decodeJsonElement()
        return parseElement(element)
    }

    private fun parseElement(element: JsonElement): Int {
        return when (element) {
            is JsonPrimitive -> parsePrimitive(element)
            is JsonObject -> parseObject(element)
            else -> throw SerializationException("Unsupported numeric value: $element")
        }
    }

    private fun parsePrimitive(primitive: JsonPrimitive): Int {
        val content = primitive.content
        content.toIntOrNull()?.let { return it }
        content.toLongOrNull()?.let { return it.toInt() }
        content.toDoubleOrNull()?.let { return it.roundToInt() }
        throw SerializationException("Cannot parse Int from primitive: $primitive")
    }

    private fun parseObject(obj: JsonObject): Int {
        val integerToken = obj["\$integer"] as? JsonPrimitive
        if (integerToken != null) {
            return decodeLittleEndianLong(integerToken.content).toInt()
        }

        val floatToken = obj["\$float"] as? JsonPrimitive
        if (floatToken != null) {
            return decodeLittleEndianDouble(floatToken.content).roundToInt()
        }

        throw SerializationException("Cannot parse Int from object: $obj")
    }

    private fun decodeLittleEndianLong(base64: String): Long {
        val bytes = Base64.decode(base64)
        return ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).long
    }

    private fun decodeLittleEndianDouble(base64: String): Double {
        val bytes = Base64.decode(base64)
        return ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).double
    }
}
