package com.fintrack.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintrack.support.TestUsers.TestUser;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class ApiTestSupport {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected TestUsers testUsers;

    @Autowired
    protected MutableClock clock;

    protected TestUser user;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    protected JsonNode getJson(String url, int expectedStatus) throws Exception {
        return send(get(url), expectedStatus);
    }

    protected JsonNode postJson(String url, Object body, int expectedStatus) throws Exception {
        return send(post(url).contentType(MediaType.APPLICATION_JSON).content(toJson(body)), expectedStatus);
    }

    protected JsonNode putJson(String url, Object body, int expectedStatus) throws Exception {
        return send(put(url).contentType(MediaType.APPLICATION_JSON).content(toJson(body)), expectedStatus);
    }

    protected JsonNode deleteJson(String url, int expectedStatus) throws Exception {
        return send(delete(url), expectedStatus);
    }

    protected void deleteOk(String url) throws Exception {
        send(delete(url), 204);
    }

    protected MvcResult raw(MockHttpServletRequestBuilder request, int expectedStatus) throws Exception {
        MvcResult result = mvc.perform(request.header(HttpHeaders.AUTHORIZATION, user.bearer())).andReturn();
        int status = result.getResponse().getStatus();
        if (status != expectedStatus) {
            throw new AssertionError("Expected HTTP " + expectedStatus + " but got " + status + ": "
                    + result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        }
        return result;
    }

    protected JsonNode send(MockHttpServletRequestBuilder request, int expectedStatus) throws Exception {
        String body = raw(request, expectedStatus).getResponse().getContentAsString(StandardCharsets.UTF_8);
        return body.isEmpty() ? json.nullNode() : json.readTree(body);
    }

    protected long idByName(JsonNode array, String name) {
        return StreamSupport.stream(array.spliterator(), false)
                .filter(node -> name.equals(node.get("name").asText()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No item named " + name))
                .get("id").asLong();
    }

    protected JsonNode byId(JsonNode array, long id) {
        return StreamSupport.stream(array.spliterator(), false)
                .filter(node -> node.get("id").asLong() == id)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No item with id " + id));
    }

    /** Значення поля кожного елемента масиву (field = null — самі елементи-рядки). */
    protected List<String> texts(JsonNode array, String field) {
        List<String> result = new ArrayList<>();
        array.forEach(node -> result.add(field == null ? node.asText() : node.get(field).asText()));
        return result;
    }

    protected long accountId(String name) throws Exception {
        return idByName(getJson("/api/accounts", 200), name);
    }

    protected long categoryId(String name) throws Exception {
        return idByName(getJson("/api/categories", 200), name);
    }

    /** Тіло запиту з пар ключ-значення (на відміну від Map.of допускає null). */
    protected static Map<String, Object> body(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }

    protected JsonNode createTx(String type, String amount, LocalDate date, long accountId, Long categoryId,
                                Long toAccountId, String note) throws Exception {
        return postJson("/api/transactions", body("type", type, "amount", amount, "date", date.toString(),
                "accountId", accountId, "categoryId", categoryId, "toAccountId", toAccountId, "note", note), 201);
    }

    protected int countTransactions(String query) throws Exception {
        return getJson("/api/transactions?size=200&q=" + query, 200).get("totalElements").asInt();
    }

    protected List<JsonNode> notifications(String type) throws Exception {
        List<JsonNode> result = new ArrayList<>();
        getJson("/api/notifications?limit=100", 200).get("items").forEach(item -> {
            if (item.get("type").asText().equals(type)) {
                result.add(item);
            }
        });
        return result;
    }

    private String toJson(Object body) throws Exception {
        return body instanceof String text ? text : json.writeValueAsString(body);
    }
}
