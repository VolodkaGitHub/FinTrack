package com.fintrack.analytics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-3.4: прогноз залишку коштів до кінця місяця на основі поточної динаміки витрат. */
class ForecastIntegrationTest extends ApiTestSupport {

    private long card;

    @BeforeEach
    void setUp() throws Exception {
        user = testUsers.create();
        card = accountId("Банківська картка");
        long salary = categoryId("Зарплата");
        long groceries = categoryId("Продукти");
        long cafe = categoryId("Кафе та ресторани");

        clock.setDate(LocalDate.of(2025, 4, 10));
        createTx("INCOME", "20000", LocalDate.of(2025, 1, 2), card, salary, null, "Зарплата");
        for (int month = 1; month <= 3; month++) {
            createTx("EXPENSE", "900", LocalDate.of(2025, month, 5), card, groceries, null, "Продукти");
        }
        createTx("EXPENSE", "100", LocalDate.of(2025, 4, 5), card, cafe, null, "Кава");
        // заплановані наперед операції квітня
        createTx("EXPENSE", "300", LocalDate.of(2025, 4, 25), card, cafe, null, "День народження");
        createTx("INCOME", "1000", LocalDate.of(2025, 4, 28), card, salary, null, "Премія");
        // регулярний платіж, що настане до кінця місяця
        postJson("/api/recurring", body("name", "Інтернет", "type", "EXPENSE", "amount", "250", "accountId", card,
                "categoryId", categoryId("Інтернет і зв'язок"), "frequency", "MONTHLY", "intervalCount", 1,
                "startDate", "2025-04-20", "autoCreate", true), 201);
    }

    @Test
    void forecastCombinesBalancePlannedRecurringAndAverageSpending() throws Exception {
        JsonNode forecast = getJson("/api/analytics/forecast", 200);

        assertThat(forecast.get("today").asText()).isEqualTo("2025-04-10");
        assertThat(forecast.get("daysInMonth").asInt()).isEqualTo(30);
        assertThat(forecast.get("daysLeft").asInt()).isEqualTo(20);
        // баланс на сьогодні не враховує операцій, запланованих на майбутні дати
        assertThat(decimal(forecast, "currentBalance")).isEqualByComparingTo("17200");
        assertThat(decimal(forecast, "expenseToDate")).isEqualByComparingTo("100");
        assertThat(decimal(forecast, "plannedExpense")).isEqualByComparingTo("300");
        assertThat(decimal(forecast, "plannedIncome")).isEqualByComparingTo("1000");
        assertThat(decimal(forecast, "recurringExpense")).isEqualByComparingTo("250");
        assertThat(forecast.get("upcoming").get(0).get("name").asText()).isEqualTo("Інтернет");

        // поточний темп 100 / 10 днів = 10 ₴/день, історія 2700 / 89 днів = 30,34 ₴/день, вага поточного місяця 1/3
        assertThat(decimal(forecast, "averageDailyExpense")).isEqualByComparingTo("23.56");
        BigDecimal expected = decimal(forecast, "currentBalance")
                .add(decimal(forecast, "plannedIncome")).subtract(decimal(forecast, "plannedExpense"))
                .add(decimal(forecast, "recurringIncome")).subtract(decimal(forecast, "recurringExpense"))
                .subtract(decimal(forecast, "averageDailyExpense").multiply(BigDecimal.valueOf(20)));
        assertThat(decimal(forecast, "projectedEndBalance")).isEqualByComparingTo(expected).isEqualByComparingTo("17178.80");

        JsonNode series = forecast.get("series");
        assertThat(series.size()).isEqualTo(30);
        assertThat(series.get(0).get("actual").decimalValue()).isEqualByComparingTo("17300");
        assertThat(series.get(9).get("actual").decimalValue()).isEqualByComparingTo("17200");
        assertThat(series.get(10).get("actual").isNull()).isTrue();
        assertThat(series.get(29).get("projected").decimalValue()).isEqualByComparingTo("17178.80");
        assertThat(decimal(forecast, "projectedExpense")).isEqualByComparingTo("1121.20");
        assertThat(decimal(forecast, "projectedIncome")).isEqualByComparingTo("1000");
    }

    @Test
    void lastDayOfMonthHasNoProjection() throws Exception {
        clock.setDate(LocalDate.of(2025, 4, 30));
        JsonNode forecast = getJson("/api/analytics/forecast", 200);
        assertThat(forecast.get("daysLeft").asInt()).isZero();
        assertThat(forecast.get("upcoming").size()).isZero();
        assertThat(decimal(forecast, "projectedEndBalance")).isEqualByComparingTo(decimal(forecast, "currentBalance"));
    }

    @Test
    void monthlyDynamicsStartsTrendFromFirstTrackedMonth() throws Exception {
        JsonNode monthly = getJson("/api/analytics/monthly?from=2024-11&to=2025-04", 200);
        JsonNode points = monthly.get("points");
        assertThat(points.size()).isEqualTo(6);
        assertThat(points.get(0).get("incomeTrend").isNull()).isTrue();
        assertThat(points.get(1).get("expenseTrend").isNull()).isTrue();
        assertThat(points.get(2).get("expense").decimalValue()).isEqualByComparingTo("900");
        assertThat(points.get(2).get("expenseTrend").isNull()).isFalse();
        // 4 місяці обліку: витрати 900, 900, 900, 400 → тренд спадає
        assertThat(monthly.get("expenseSlope").decimalValue()).isNegative();
        assertThat(monthly.get("averageExpense").decimalValue()).isEqualByComparingTo("775");
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        return node.get(field).decimalValue();
    }
}
