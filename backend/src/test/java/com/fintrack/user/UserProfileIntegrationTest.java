package com.fintrack.user;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** REQ-4.1 / 4.2: профіль, пароль і керування сеансами пристроїв. */
class UserProfileIntegrationTest extends ApiTestSupport {

    @BeforeEach
    void setUp() {
        user = testUsers.create();
    }

    @Test
    void updatesProfileAndAccountingCurrency() throws Exception {
        JsonNode updated = putJson("/api/users/me", body("displayName", "  Олена Петрівна ", "currency", "USD"), 200);
        assertThat(updated.get("displayName").asText()).isEqualTo("Олена Петрівна");
        assertThat(getJson("/api/users/me", 200).get("currency").asText()).isEqualTo("USD");
        assertThat(putJson("/api/users/me", body("displayName", "Олена", "currency", "usd"), 400).get("errors").has("currency")).isTrue();

        // валюта обліку використовується в текстах сповіщень
        long groceries = categoryId("Продукти");
        postJson("/api/budgets", body("categoryId", groceries, "amount", 100, "rollover", false, "alertThreshold", 80), 201);
        createTx("EXPENSE", "90", LocalDate.now(clock), accountId("Готівка"), groceries, null, null);
        assertThat(notifications("BUDGET_WARNING").get(0).get("message").asText()).contains("$");
    }

    @Test
    void passwordCanBeSetThenChangedWithCurrentPassword() throws Exception {
        // акаунт без пароля (як після входу через Google) може встановити пароль
        assertThat(getJson("/api/users/me", 200).get("hasPassword").asBoolean()).isFalse();
        putJson("/api/users/me/password", body("newPassword", "newpass123"), 204);
        assertThat(getJson("/api/users/me", 200).get("hasPassword").asBoolean()).isTrue();
        assertThat(login("newpass123")).isEqualTo(200);

        assertThat(putJson("/api/users/me/password", body("currentPassword", "wrong123", "newPassword", "another123"), 400)
                .get("code").asText()).isEqualTo("BAD_CREDENTIALS");
        putJson("/api/users/me/password", body("newPassword", "another123"), 400);
        putJson("/api/users/me/password", body("currentPassword", "newpass123", "newPassword", "short"), 400);
        putJson("/api/users/me/password", body("currentPassword", "newpass123", "newPassword", "another123"), 204);
        assertThat(login("newpass123")).isEqualTo(401);
        assertThat(login("another123")).isEqualTo(200);
    }

    @Test
    void deviceSessionsAreListedAndCanBeRevoked() throws Exception {
        putJson("/api/users/me/password", body("newPassword", "secret123"), 204);
        JsonNode phone = json.readTree(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Linux; Android 15) Chrome/131.0 Mobile")
                        .content(json.writeValueAsString(body("email", user.email(), "password", "secret123"))))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));

        JsonNode sessions = getJson("/api/users/me/sessions", 200);
        assertThat(sessions.size()).isEqualTo(2);
        JsonNode other = null;
        for (JsonNode session : sessions) {
            if (!session.get("current").asBoolean()) {
                other = session;
            }
        }
        assertThat(other).isNotNull();
        assertThat(other.get("deviceName").asText()).isEqualTo("Chrome · Android");

        deleteOk("/api/users/me/sessions/" + other.get("id").asLong());
        assertThat(getJson("/api/users/me/sessions", 200).size()).isEqualTo(1);
        int refresh = mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body("refreshToken", phone.get("refreshToken").asText()))))
                .andReturn().getResponse().getStatus();
        assertThat(refresh).isEqualTo(401);
        deleteJson("/api/users/me/sessions/999999", 404);
    }

    private int login(String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body("email", user.email(), "password", password))))
                .andReturn().getResponse().getStatus();
    }
}
