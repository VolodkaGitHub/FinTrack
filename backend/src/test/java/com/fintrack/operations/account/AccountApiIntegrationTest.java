package com.fintrack.operations.account;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-1.2: кілька рахунків/гаманців (готівка, картка, накопичення) з окремими балансами. */
class AccountApiIntegrationTest extends ApiTestSupport {

    private LocalDate today;

    @BeforeEach
    void setUp() {
        user = testUsers.create();
        today = LocalDate.now(clock);
    }

    @Test
    void createsAndUpdatesAccountsWithSeparateBalances() throws Exception {
        JsonNode savings = postJson("/api/accounts", account("Скарбничка", "SAVINGS", "1500.50", "#5f3dc4", false, null), 201);
        long id = savings.get("id").asLong();
        assertThat(savings.get("type").asText()).isEqualTo("SAVINGS");
        assertThat(savings.get("balance").decimalValue()).isEqualByComparingTo("1500.50");

        createTx("INCOME", "500", today, id, categoryId("Кешбек і відсотки"), null, "Відсотки");
        createTx("EXPENSE", "200", today, accountId("Готівка"), categoryId("Кафе та ресторани"), null, null);

        JsonNode updated = putJson("/api/accounts/" + id,
                account("Скарбничка на відпустку", "SAVINGS", "2000", "#ae3ec9", false, savings.get("version").asLong()), 200);
        assertThat(updated.get("name").asText()).isEqualTo("Скарбничка на відпустку");
        assertThat(updated.get("balance").decimalValue()).isEqualByComparingTo("2500.00");
        assertThat(byId(getJson("/api/accounts", 200), accountId("Готівка")).get("balance").decimalValue())
                .isEqualByComparingTo("-200.00");

        JsonNode stale = putJson("/api/accounts/" + id, account("Інша назва", "SAVINGS", "2000", "#ae3ec9", false, savings.get("version").asLong()), 409);
        assertThat(stale.get("code").asText()).isEqualTo("STALE_DATA");

        // майбутня (запланована) операція не змінює поточний баланс
        createTx("EXPENSE", "100", today.plusDays(3), id, categoryId("Освіта"), null, "Курси");
        assertThat(byId(getJson("/api/accounts", 200), id).get("balance").decimalValue()).isEqualByComparingTo("2500.00");
    }

    @Test
    void archivedAccountsKeepHistoryButRejectNewOperations() throws Exception {
        JsonNode card = postJson("/api/accounts", account("Стара картка", "CARD", "1000", "#1971c2", false, null), 201);
        long id = card.get("id").asLong();
        long cash = accountId("Готівка");
        createTx("TRANSFER", "300", today, id, null, cash, "Зняття");

        JsonNode archived = putJson("/api/accounts/" + id, account("Стара картка", "CARD", "1000", "#1971c2", true, card.get("version").asLong()), 200);
        assertThat(archived.get("archived").asBoolean()).isTrue();
        assertThat(archived.get("balance").decimalValue()).isEqualByComparingTo("700.00");

        JsonNode rejected = postJson("/api/transactions", body("type", "EXPENSE", "amount", 10, "date", today.toString(),
                "accountId", id, "categoryId", categoryId("Освіта")), 400);
        assertThat(rejected.get("detail").asText()).contains("архівовано");
        postJson("/api/transactions", body("type", "TRANSFER", "amount", 10, "date", today.toString(),
                "accountId", cash, "toAccountId", id), 400);

        // архівний рахунок не входить у загальний баланс
        assertThat(getJson("/api/analytics/summary", 200).get("totalBalance").decimalValue()).isEqualByComparingTo("300.00");
        // з історією видалити не можна
        assertThat(deleteJson("/api/accounts/" + id, 409).get("detail").asText()).contains("архівуйте");
    }

    @Test
    void unusedAccountCanBeDeletedAndInputIsValidated() throws Exception {
        JsonNode temp = postJson("/api/accounts", account("Тимчасовий", "OTHER", "0", "#868e96", false, null), 201);
        deleteOk("/api/accounts/" + temp.get("id").asLong());
        assertThat(texts(getJson("/api/accounts", 200), "name")).doesNotContain("Тимчасовий");

        JsonNode invalid = postJson("/api/accounts", body("name", "", "type", null, "initialBalance", null, "color", "blue"), 400);
        assertThat(invalid.get("errors").has("name")).isTrue();
        assertThat(invalid.get("errors").has("type")).isTrue();
        assertThat(invalid.get("errors").has("initialBalance")).isTrue();
        assertThat(invalid.get("errors").has("color")).isTrue();

        long foreign = accountId("Готівка");
        user = testUsers.create();
        putJson("/api/accounts/" + foreign, account("Чужий", "CASH", "0", "#868e96", false, null), 404);
        deleteJson("/api/accounts/" + foreign, 404);
    }

    private static Map<String, Object> account(String name, String type, String initialBalance, String color,
                                               boolean archived, Long version) {
        return body("name", name, "type", type, "initialBalance", initialBalance, "color", color,
                "archived", archived, "version", version);
    }
}
