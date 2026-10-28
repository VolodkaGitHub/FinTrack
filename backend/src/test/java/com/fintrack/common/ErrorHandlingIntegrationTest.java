package com.fintrack.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Єдиний формат помилок API (RFC 7807 ProblemDetail з машинним кодом) для некоректних запитів. */
class ErrorHandlingIntegrationTest extends ApiTestSupport {

    @BeforeEach
    void setUp() {
        user = testUsers.create();
    }

    @Test
    void malformedRequestsReturnBadRequest() throws Exception {
        JsonNode malformed = send(post("/api/accounts").contentType(MediaType.APPLICATION_JSON).content("{\"name\": "), 400);
        assertThat(malformed.get("status").asInt()).isEqualTo(400);
        raw(get("/api/transactions?type=WRONG"), 400);
        raw(get("/api/transactions?minAmount=abc"), 400);
        assertThat(getJson("/api/budgets?month=2025-13", 400).get("detail").asText()).contains("YYYY-MM");
        assertThat(getJson("/api/analytics/monthly?from=2026-05&to=2025-01", 400).get("detail").asText()).contains("60 місяців");
        getJson("/api/analytics/monthly?from=abc", 400);
        getJson("/api/analytics/monthly?from=2015-01&to=2025-12", 400);
        getJson("/api/analytics/categories?type=TRANSFER", 400);
        getJson("/api/analytics/summary?from=2025-02-01&to=2025-01-01", 400);
    }

    @Test
    void unsupportedRoutesMethodsAndMediaTypesAreReported() throws Exception {
        raw(get("/api/unknown-endpoint"), 404);
        raw(patch("/api/accounts"), 405);
        raw(post("/api/accounts").contentType(MediaType.TEXT_PLAIN).content("hello"), 415);
    }

    @Test
    void existingResourcesAreReturnedAndMissingOnesAreNotFound() throws Exception {
        JsonNode created = createTx("EXPENSE", "42", LocalDate.now(clock), accountId("Готівка"),
                categoryId("Кафе та ресторани"), null, "Обід");
        JsonNode loaded = getJson("/api/transactions/" + created.get("id").asLong(), 200);
        assertThat(loaded.get("note").asText()).isEqualTo("Обід");
        assertThat(getJson("/api/transactions/999999", 404).get("code").asText()).isEqualTo("NOT_FOUND");
        deleteJson("/api/budgets/999999", 404);
        putJson("/api/recurring/999999", body("name", "X", "type", "EXPENSE", "amount", 1, "accountId", 1, "categoryId", 1,
                "frequency", "MONTHLY", "intervalCount", 1, "startDate", "2025-01-01", "autoCreate", true), 404);
    }

    @Test
    void searchSupportsSortingAndPaging() throws Exception {
        long cash = accountId("Готівка");
        long cafe = categoryId("Кафе та ресторани");
        LocalDate day = LocalDate.now(clock);
        for (int amount = 1; amount <= 5; amount++) {
            createTx("EXPENSE", String.valueOf(amount * 10), day.minusDays(amount), cash, cafe, null, "Кава " + amount);
        }
        JsonNode page = getJson("/api/transactions?sort=amount&direction=asc&size=2&page=1", 200);
        assertThat(page.get("totalElements").asInt()).isEqualTo(5);
        assertThat(page.get("totalPages").asInt()).isEqualTo(3);
        assertThat(texts(page.get("content"), "amount")).containsExactly("30.0", "40.0");
        JsonNode byDate = getJson("/api/transactions?sort=date&direction=asc&size=1", 200);
        assertThat(byDate.get("content").get(0).get("note").asText()).isEqualTo("Кава 5");
        // символи шаблону LIKE у пошуку трактуються буквально
        assertThat(getJson("/api/transactions?q=%25", 200).get("totalElements").asInt()).isZero();
        assertThat(getJson("/api/transactions?q=_", 200).get("totalElements").asInt()).isZero();
    }
}
