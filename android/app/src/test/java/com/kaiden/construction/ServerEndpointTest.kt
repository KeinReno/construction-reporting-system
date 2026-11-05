package com.kaiden.construction
import org.junit.Assert.*
import org.junit.Test
class ServerEndpointTest {
    @Test fun canonicalHttpsAndApiPath() {
        assertEquals("https://example.org/api/v1",HttpsEndpoint.normalize(" https://EXAMPLE.org:443/ "))
        assertEquals("https://example.org:8443/construction/api/v1",HttpsEndpoint.normalize("https://example.org:8443/construction/api/v1/"))
    }
    @Test fun rejectsCredentialsRedirectParametersAndNonHttps() {
        for(value in listOf("http://example.org","file:///tmp/data","https://u:p@example.org","https://example.org?token=x","https://example.org#x","https://example.org/../../api/v1","https://example.org/%2e/api/v1","https://example.org:99999")) {
            try{HttpsEndpoint.normalize(value);fail(value)}catch(_:IllegalArgumentException){}
        }
    }
}
