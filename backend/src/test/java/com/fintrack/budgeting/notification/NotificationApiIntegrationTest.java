package com.fintrack.budgeting.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-2.3: центр сповіщень — прочитання та видалення окремих сповіщень. */
class NotificationApiIntegrationTest extends ApiTestSupport {

    @BeforeEach
    void setUp() throws Exception {
        user = testUsers.create();
        long groceries = categoryId("Продукти");
        postJson("/api/budgets", body("categoryId", groceries, "amount", 100, "rollover", false, "alertThreshold", 50), 201);
        createTx("EXPENSE", "60", LocalDate.now(clock), accountId("Готівка"), groceries, null, null);
        createTx("EXPENSE", "60", LocalDate.now(clock), accountId("Готівка"), groceries, null, null);
    }

    @Test
    void notificationsCanBeMarkedReadOneByOneAndDeleted() throws Exception {
        JsonNode list = getJson("/api/notifications", 200);
        assertThat(list.get("unreadCount").asInt()).isEqualTo(2);
        JsonNode exceeded = list.get("items").get(0);
        assertThat(exceeded.get("type").asText()).isEqualTo("BUDGET_EXCEEDED");
        assertThat(exceeded.get("read").asBoolean()).isFalse();

        postJson("/api/notifications/" + exceeded.get("id").asLong() + "/read", "", 204);
        JsonNode afterRead = getJson("/api/notifications", 200);
        assertThat(afterRead.get("unreadCount").asInt()).isEqualTo(1);
        assertThat(byId(afterRead.get("items"), exceeded.get("id").asLong()).get("read").asBoolean()).isTrue();

        deleteOk("/api/notifications/" + exceeded.get("id").asLong());
        JsonNode afterDelete = getJson("/api/notifications?limit=1", 200);
        assertThat(afterDelete.get("items").size()).isEqualTo(1);
        assertThat(afterDelete.get("items").get(0).get("type").asText()).isEqualTo("BUDGET_WARNING");
        postJson("/api/notifications/" + exceeded.get("id").asLong() + "/read", "", 404);
        deleteJson("/api/notifications/" + exceeded.get("id").asLong(), 404);
    }

    @Test
    void notificationsOfOtherUsersAreHidden() throws Exception {
        long id = getJson("/api/notifications", 200).get("items").get(0).get("id").asLong();
        user = testUsers.create();
        assertThat(getJson("/api/notifications", 200).get("items").size()).isZero();
        postJson("/api/notifications/" + id + "/read", "", 404);
    }
}
