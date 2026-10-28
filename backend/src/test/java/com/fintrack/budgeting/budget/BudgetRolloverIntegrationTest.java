package com.fintrack.budgeting.budget;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-2.2 / 2.4: місячні періоди бюджету, перенесення невикористаного залишку або скидання на початку місяця. */
class BudgetRolloverIntegrationTest extends ApiTestSupport {

    @Autowired
    private BudgetService budgetService;

    private long card;
    private long groceries;
    private long supermarket;
    private long cafe;

    @BeforeEach
    void setUp() throws Exception {
        user = testUsers.create();
        card = accountId("Банківська картка");
        groceries = categoryId("Продукти");
        supermarket = categoryId("Супермаркет");
        cafe = categoryId("Кафе та ресторани");
    }

    @Test
    void unusedRemainderIsCarriedOverOrResetAtTheStartOfNewMonth() throws Exception {
        clock.setDate(LocalDate.of(2025, 1, 15));
        JsonNode rolloverBudget = postJson("/api/budgets", budget(groceries, "1000", true, null), 201);
        JsonNode resetBudget = postJson("/api/budgets", budget(cafe, "500", false, null), 201);
        createTx("EXPENSE", "600", LocalDate.of(2025, 1, 10), card, supermarket, null, "Січневі покупки");
        createTx("EXPENSE", "100", LocalDate.of(2025, 1, 12), card, cafe, null, "Кава");

        JsonNode january = getJson("/api/budgets?month=2025-01", 200);
        assertThat(status(january, groceries).get("remaining").decimalValue()).isEqualByComparingTo("400");
        assertThat(status(january, cafe).get("remaining").decimalValue()).isEqualByComparingTo("400");

        // новий місяць: залишок «Продуктів» переноситься, у «Кафе» — скидається
        clock.setDate(LocalDate.of(2025, 2, 3));
        JsonNode february = getJson("/api/budgets", 200);
        JsonNode groceriesFeb = status(february, groceries);
        assertThat(groceriesFeb.get("month").asText()).isEqualTo("2025-02");
        assertThat(groceriesFeb.get("carriedOver").decimalValue()).isEqualByComparingTo("400");
        assertThat(groceriesFeb.get("available").decimalValue()).isEqualByComparingTo("1400");
        assertThat(status(february, cafe).get("carriedOver").decimalValue()).isEqualByComparingTo("0");
        assertThat(status(february, cafe).get("available").decimalValue()).isEqualByComparingTo("500");

        // увімкнення перенесення перераховує поточний період від попереднього
        JsonNode switched = putJson("/api/budgets/" + resetBudget.get("id").asLong(),
                budget(cafe, "500", true, status(february, cafe).get("version").asLong()), 200);
        assertThat(switched.get("rollover").asBoolean()).isTrue();
        assertThat(switched.get("carriedOver").decimalValue()).isEqualByComparingTo("400");

        // щомісячне завдання планувальника відкриває березень і повідомляє про перенесені суми
        clock.setDate(LocalDate.of(2025, 3, 1));
        assertThat(budgetService.openPeriods(YearMonth.of(2025, 3))).isGreaterThanOrEqualTo(2);
        JsonNode march = getJson("/api/budgets", 200);
        assertThat(status(march, groceries).get("carriedOver").decimalValue()).isEqualByComparingTo("1400");
        assertThat(status(march, cafe).get("carriedOver").decimalValue()).isEqualByComparingTo("900");
        List<JsonNode> rollover = notifications("BUDGET_ROLLOVER");
        assertThat(rollover).hasSize(1);
        assertThat(rollover.get(0).get("message").asText()).contains("Продукти").contains("Кафе та ресторани");
        budgetService.openPeriods(YearMonth.of(2025, 3));
        assertThat(notifications("BUDGET_ROLLOVER")).hasSize(1);

        // новий ліміт діє з поточного місяця, історія попередніх місяців не змінюється
        JsonNode raised = putJson("/api/budgets/" + rolloverBudget.get("id").asLong(),
                budget(groceries, "2000", true, status(march, groceries).get("version").asLong()), 200);
        assertThat(raised.get("limit").decimalValue()).isEqualByComparingTo("2000");
        assertThat(raised.get("available").decimalValue()).isEqualByComparingTo("3400");
        assertThat(status(getJson("/api/budgets?month=2025-02", 200), groceries).get("limit").decimalValue())
                .isEqualByComparingTo("1000");
        // місяць до створення бюджету його не містить, майбутній — показує ліміт без перенесення
        assertThat(getJson("/api/budgets?month=2024-12", 200).size()).isZero();
        JsonNode future = getJson("/api/budgets?month=2025-05", 200);
        assertThat(status(future, groceries).get("carriedOver").decimalValue()).isEqualByComparingTo("0");
    }

    @Test
    void budgetCanBeMovedToAnotherCategoryAndDeleted() throws Exception {
        JsonNode created = postJson("/api/budgets", budget(groceries, "3000", false, null), 201);
        long id = created.get("id").asLong();
        long transport = categoryId("Транспорт");
        postJson("/api/budgets", budget(cafe, "800", false, null), 201);

        JsonNode moved = putJson("/api/budgets/" + id, budget(transport, "1500", false, created.get("version").asLong()), 200);
        assertThat(moved.get("categoryId").asLong()).isEqualTo(transport);
        assertThat(moved.get("amount").decimalValue()).isEqualByComparingTo("1500");
        putJson("/api/budgets/" + id, budget(cafe, "1500", false, null), 409);
        putJson("/api/budgets/" + id, budget(transport, "1500", false, created.get("version").asLong()), 409);

        deleteOk("/api/budgets/" + id);
        assertThat(texts(getJson("/api/budgets", 200), "categoryId")).doesNotContain(String.valueOf(transport));
        deleteJson("/api/budgets/" + id, 404);
        postJson("/api/budgets", budget(groceries, "0", false, null), 400);
        postJson("/api/budgets", body("categoryId", groceries, "amount", 100, "rollover", false, "alertThreshold", 5), 400);
    }

    @Test
    void lowerLimitTriggersExceededNotificationAndSpendingDecreaseResetsIt() throws Exception {
        JsonNode created = postJson("/api/budgets", budget(groceries, "1000", false, null), 201);
        JsonNode expense = createTx("EXPENSE", "700", LocalDate.now(clock), card, supermarket, null, "Покупки");
        assertThat(notifications("BUDGET_WARNING")).isEmpty();

        // зменшення ліміту одразу перевіряє поріг
        JsonNode lowered = putJson("/api/budgets/" + created.get("id").asLong(),
                budget(groceries, "600", false, created.get("version").asLong()), 200);
        assertThat(lowered.get("state").asText()).isEqualTo("EXCEEDED");
        assertThat(notifications("BUDGET_EXCEEDED")).hasSize(1);

        // після видалення витрати бюджет знову в межах — наступне перевищення знову сповіщає
        deleteOk("/api/transactions/" + expense.get("id").asLong());
        assertThat(getJson("/api/budgets", 200).get(0).get("state").asText()).isEqualTo("OK");
        createTx("EXPENSE", "650", LocalDate.now(clock), card, groceries, null, null);
        assertThat(notifications("BUDGET_EXCEEDED")).hasSize(2);
    }

    private JsonNode status(JsonNode budgets, long categoryId) {
        for (JsonNode budget : budgets) {
            if (budget.get("categoryId").asLong() == categoryId) {
                return budget;
            }
        }
        throw new AssertionError("No budget for category " + categoryId);
    }

    private static Map<String, Object> budget(long categoryId, String amount, boolean rollover, Long version) {
        return body("categoryId", categoryId, "amount", amount, "rollover", rollover, "alertThreshold", 80, "version", version);
    }
}
