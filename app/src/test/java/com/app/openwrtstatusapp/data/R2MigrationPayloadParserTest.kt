package com.app.openwrtstatusapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.json.JSONArray
import org.json.JSONObject

class R2MigrationPayloadParserTest {
    @Test
    fun `schema v1 preserves router profiles credentials settings and auxiliary data`() {
        val profiles = """[
          {"id":"home","name":"家中","baseUrl":"https://192.168.1.1","username":"root","sshUsername":"admin","sshPort":2222,"createdAt":12,"lastConnectedAt":34},
          {"id":"lab","name":"实验室","url":"http://10.0.0.1"}
        ]""".trimIndent().replace("\n", "")
        val settings = JSONObject().put("darkMode", "dark").put("selectedRouterId", "home").toString()
        val payload = JSONObject()
            .put("schemaVersion", 1)
            .put("profilesJson", profiles)
            .put("settingsJson", settings)
            .put("routers", JSONArray()
                .put(JSONObject().put("routerId", "home").put("luciPassword", "luci-secret").put("sshPassword", "ssh-secret").put("firmwareReleaseUrl", "https://example.com/release").put("trafficHistory", "[1,2]"))
                .put(JSONObject().put("routerId", "lab").put("luciPassword", "").put("sshPassword", JSONObject.NULL)))
            .toString()

        val actual = requireNotNull(R2MigrationPayloadParser.parse(payload))
        assertEquals(2, actual.profiles.size)
        assertEquals("https://192.168.1.1", actual.profiles[0].baseUrl)
        assertEquals("admin", actual.profiles[0].sshUsername)
        assertEquals(2222, actual.profiles[0].sshPort)
        assertEquals("http://10.0.0.1", actual.profiles[1].baseUrl)
        assertEquals("dark", JSONObject(actual.settingsJson).getString("darkMode"))
        assertEquals("luci-secret", actual.routers[0].luciPassword)
        assertEquals("ssh-secret", actual.routers[0].sshPassword)
        assertEquals("https://example.com/release", actual.routers[0].firmwareReleaseUrl)
        assertEquals("[1,2]", actual.routers[0].trafficHistory)
        assertNull(actual.routers[1].luciPassword)
        assertNull(actual.routers[1].sshPassword)
    }

    @Test
    fun `unsupported schemas and incomplete profile entries are safely rejected or skipped`() {
        assertNull(R2MigrationPayloadParser.parse("{\"schemaVersion\":2}"))
        val profiles = JSONArray()
            .put(JSONObject().put("id", "ok").put("name", "可用").put("baseUrl", "http://x"))
            .put(JSONObject().put("id", "bad"))
        val payload = JSONObject().put("schemaVersion", 1).put("profilesJson", profiles.toString()).put("routers", JSONArray().put(JSONObject())).toString()
        val actual = requireNotNull(R2MigrationPayloadParser.parse(payload))
        assertEquals(listOf("ok"), actual.profiles.map { it.id })
        assertFalse(actual.routers.isNotEmpty())
    }
}
