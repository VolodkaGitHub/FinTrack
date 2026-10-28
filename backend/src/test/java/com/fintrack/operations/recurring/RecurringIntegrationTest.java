package com.fintrack.operations.recurring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-1.3: регулярні операції — автоматичне створення, нагадування, швидке додавання, керування розкладом. */
class RecurringIntegrationTest extends ApiTestSupport {

    @Autowired
    private RecurringService recurringService;

    private long card;
    private long rentCategory;
    private long utilitiesCategory;
    private long salaryCategory;

    @BeforeEach
    void setUp() throws Exception {
        user = testUsers.create();
        card = accountId("Банківська картка");
        rentCategory = categoryId("Оренда");
        utilitiesCategory = categoryId("Комунальні послуги");
        salaryCategory = categoryId("Зарплата");
    }

    @Test
    void missedOccurrencesAreCreatedAndTemplateStopsAfterEndDate() throws Exception {
        clock.setDate(LocalDate.of(2025, 6, 15));
        JsonNode rent = postJson("/api/recurring",
                recurring("Оренда квартири", "EXPENSE", "8000", rentCategory, "MONTHLY", 1, "2025-03-15", null, true), 201);
        assertThat(rent.get("nextDate").asText()).isEqualTo("2025-07-15");
        assertThat(countTransactions("квартири")).isEqualTo(4);
        assertThat(notifications("RECURRING_CREATED").get(0).get("message").asText()).contains("4 операції");

        JsonNode gym = postJson("/api/recurring",
                recurring("Спортзал", "EXPENSE", "600", utilitiesCategory, "MONTHLY", 1, "2025-03-01", "2025-04-20", true), 201);
        assertThat(gym.get("active").asBoolean()).isFalse();
        assertThat(countTransactions("Спортзал")).isEqualTo(2);

        // щоденне завдання планувальника наступного місяця створює черговий платіж
        clock.setDate(LocalDate.of(2025, 7, 16));
        assertThat(recurringService.processDue(LocalDate.of(2025, 7, 16))).isGreaterThanOrEqualTo(1);
        assertThat(countTransactions("квартири")).isEqualTo(5);
        JsonNode list = getJson("/api/recurring", 200);
        assertThat(byId(list, rent.get("id").asLong()).get("nextDate").asText()).isEqualTo("2025-08-15");
        assertThat(countTransactions("Спортзал")).isEqualTo(2);
    }

    @Test
    void manualTemplateSendsReminderAndSupportsSkipAndQuickAdd() throws Exception {
        clock.setDate(LocalDate.of(2025, 5, 10));
        JsonNode utilities = postJson("/api/recurring",
                recurring("Комуналка", "EXPENSE", "1800", utilitiesCategory, "MONTHLY", 1, "2025-05-10", null, false), 201);
        long id = utilities.get("id").asLong();
        assertThat(utilities.get("due").asBoolean()).isTrue();
        assertThat(countTransactions("Комуналка")).isZero();

        recurringService.processDue(LocalDate.of(2025, 5, 10));
        recurringService.processDue(LocalDate.of(2025, 5, 10));
        List<JsonNode> reminders = notifications("RECURRING_DUE");
        assertThat(reminders).hasSize(1);
        assertThat(reminders.get(0).get("title").asText()).isEqualTo("Час сплатити: Комуналка");

        clock.setDate(LocalDate.of(2025, 5, 12));
        JsonNode upcoming = getJson("/api/recurring/upcoming?days=45", 200);
        JsonNode overdue = upcoming.get(0);
        assertThat(overdue.get("name").asText()).isEqualTo("Комуналка");
        assertThat(overdue.get("overdue").asBoolean()).isTrue();
        assertThat(upcoming.findValuesAsText("date")).contains("2025-06-10");

        JsonNode skipped = postJson("/api/recurring/" + id + "/skip", "", 200);
        assertThat(skipped.get("nextDate").asText()).isEqualTo("2025-06-10");
        assertThat(countTransactions("Комуналка")).isZero();

        JsonNode paid = postJson("/api/recurring/" + id + "/apply", body("date", "2025-05-12", "amount", "1950.40"), 201);
        assertThat(paid.get("amount").decimalValue()).isEqualByComparingTo("1950.40");
        assertThat(paid.get("recurringId").asLong()).isEqualTo(id);
        assertThat(byId(getJson("/api/recurring", 200), id).get("nextDate").asText()).isEqualTo("2025-07-10");
    }

    @Test
    void editingScheduleRecalculatesNextDateAndPausedTemplateIsNotProcessed() throws Exception {
        clock.setDate(LocalDate.of(2025, 8, 20));
        JsonNode salary = postJson("/api/recurring",
                recurring("Зарплата ТОВ", "INCOME", "30000", salaryCategory, "MONTHLY", 1, "2025-09-05", null, true), 201);
        long id = salary.get("id").asLong();
        assertThat(salary.get("nextDate").asText()).isEqualTo("2025-09-05");
        assertThat(countTransactions("ТОВ")).isZero();

        // кожні два тижні з 1 серпня: найближча дата не раніше «сьогодні», без створення пропущених
        Map<String, Object> biweekly = recurring("Зарплата ТОВ", "INCOME", "15000", salaryCategory, "WEEKLY", 2, "2025-08-01", null, true);
        biweekly.put("version", salary.get("version").asLong());
        JsonNode updated = putJson("/api/recurring/" + id, biweekly, 200);
        assertThat(updated.get("nextDate").asText()).isEqualTo("2025-08-29");
        assertThat(countTransactions("ТОВ")).isZero();
        assertThat(putJson("/api/recurring/" + id, biweekly, 409).get("code").asText()).isEqualTo("STALE_DATA");

        Map<String, Object> paused = recurring("Зарплата ТОВ", "INCOME", "15000", salaryCategory, "WEEKLY", 2, "2025-08-01", null, true);
        paused.put("active", false);
        assertThat(putJson("/api/recurring/" + id, paused, 200).get("active").asBoolean()).isFalse();
        clock.setDate(LocalDate.of(2025, 9, 15));
        recurringService.processDue(LocalDate.of(2025, 9, 15));
        assertThat(countTransactions("ТОВ")).isZero();

        // видалення шаблону зберігає вже створені операції
        JsonNode applied = postJson("/api/recurring/" + id + "/apply", "", 201);
        deleteOk("/api/recurring/" + id);
        JsonNode tx = getJson("/api/transactions/" + applied.get("id").asLong(), 200);
        assertThat(tx.get("recurringId").isNull()).isTrue();
        assertThat(getJson("/api/recurring", 200).size()).isZero();
    }

    @Test
    void invalidTemplatesAreRejected() throws Exception {
        assertThat(postJson("/api/recurring",
                recurring("Переказ", "TRANSFER", "100", rentCategory, "MONTHLY", 1, "2025-01-01", null, true), 400)
                .get("detail").asText()).contains("доходу або витрати");
        postJson("/api/recurring", recurring("Кінець раніше", "EXPENSE", "100", rentCategory, "MONTHLY", 1, "2025-05-01", "2025-04-01", true), 400);
        postJson("/api/recurring", recurring("Не та категорія", "INCOME", "100", rentCategory, "MONTHLY", 1, "2025-05-01", null, true), 400);
        JsonNode invalid = postJson("/api/recurring", body("name", "", "type", "EXPENSE", "amount", "-1", "frequency", null,
                "intervalCount", 0, "accountId", card, "categoryId", rentCategory, "startDate", null), 400);
        assertThat(invalid.get("errors").has("name")).isTrue();
        assertThat(invalid.get("errors").has("frequency")).isTrue();
        assertThat(invalid.get("errors").has("intervalCount")).isTrue();
        postJson("/api/recurring/999999/skip", "", 404);
    }

    private Map<String, Object> recurring(String name, String type, String amount, long categoryId, String frequency,
                                          int interval, String startDate, String endDate, boolean autoCreate) {
        return body("name", name, "type", type, "amount", amount, "accountId", card, "categoryId", categoryId,
                "frequency", frequency, "intervalCount", interval, "startDate", startDate, "endDate", endDate,
                "autoCreate", autoCreate);
    }
}
