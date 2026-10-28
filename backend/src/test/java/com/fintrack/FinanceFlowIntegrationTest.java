package com.fintrack;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** Наскрізні сценарії модулів обліку, бюджетування, аналітики та імпорту/експорту через REST API. */
class FinanceFlowIntegrationTest extends ApiTestSupport {

    private LocalDate today;
    private long cashId;
    private long cardId;
    private long groceriesId;
    private long supermarketId;
    private long salaryId;
    private long cafeId;

    @BeforeEach
    void setUp() throws Exception {
        user = testUsers.create();
        today = LocalDate.now(clock);
        JsonNode accounts = getJson("/api/accounts", 200);
        cashId = idByName(accounts, "Готівка");
        cardId = idByName(accounts, "Банківська картка");
        JsonNode categories = getJson("/api/categories", 200);
        groceriesId = idByName(categories, "Продукти");
        supermarketId = idByName(categories, "Супермаркет");
        salaryId = idByName(categories, "Зарплата");
        cafeId = idByName(categories, "Кафе та ресторани");
    }

    @Test
    void transactionsAccountsAndFilters() throws Exception {
        createTx("INCOME", "20000", cardId, salaryId, null, "Зарплата за жовтень");
        JsonNode expense = createTx("EXPENSE", "350.50", cardId, supermarketId, null, "Кава та хліб");
        createTx("TRANSFER", "5000", cardId, null, cashId, "Зняття готівки");

        // REQ-1.2: окремі баланси рахунків з урахуванням переказів
        JsonNode accounts = getJson("/api/accounts", 200);
        assertThat(balance(accounts, cardId)).isEqualByComparingTo("14649.50");
        assertThat(balance(accounts, cashId)).isEqualByComparingTo("5000.00");

        // REQ-1.4: фільтр за батьківською категорією включає підкатегорії
        JsonNode byCategory = getJson("/api/transactions?categoryId=" + groceriesId, 200);
        assertThat(byCategory.get("totalElements").asInt()).isEqualTo(1);
        assertThat(byCategory.get("totalExpense").decimalValue()).isEqualByComparingTo("350.50");

        assertThat(getJson("/api/transactions?q=кава", 200).get("totalElements").asInt()).isEqualTo(1);
        assertThat(getJson("/api/transactions?q=супермаркет", 200).get("totalElements").asInt()).isEqualTo(1);
        assertThat(getJson("/api/transactions?minAmount=1000", 200).get("totalElements").asInt()).isEqualTo(2);
        assertThat(getJson("/api/transactions?accountId=" + cashId, 200).get("totalElements").asInt()).isEqualTo(1);
        assertThat(getJson("/api/transactions?type=INCOME&from=" + today + "&to=" + today, 200)
                .get("totalIncome").decimalValue()).isEqualByComparingTo("20000");
        assertThat(getJson("/api/transactions?from=" + today.plusDays(1), 200).get("totalElements").asInt()).isZero();

        // валідація бізнес-правил
        JsonNode noCategory = postJson("/api/transactions", tx("EXPENSE", "10", cardId, null, null, null), 400);
        assertThat(noCategory.get("detail").asText()).contains("категорію");
        postJson("/api/transactions", tx("TRANSFER", "10", cardId, null, cardId, null), 400);
        postJson("/api/transactions", tx("INCOME", "10", cardId, supermarketId, null, null), 400);
        postJson("/api/transactions", tx("EXPENSE", "-5", cardId, supermarketId, null, null), 400);

        // REQ-4.2: оптимістичне блокування при одночасному редагуванні з різних пристроїв
        long id = expense.get("id").asLong();
        Map<String, Object> update = tx("EXPENSE", "400", cardId, supermarketId, null, "Кава, хліб і сир");
        update.put("version", expense.get("version").asLong());
        JsonNode updated = putJson("/api/transactions/" + id, update, 200);
        assertThat(updated.get("amount").decimalValue()).isEqualByComparingTo("400");
        JsonNode stale = putJson("/api/transactions/" + id, update, 409);
        assertThat(stale.get("code").asText()).isEqualTo("STALE_DATA");

        deleteOk("/api/transactions/" + id);
        getJson("/api/transactions/" + id, 404);

        // рахунок з операціями видалити не можна — лише архівувати
        send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/accounts/" + cardId), 409);
    }

    @Test
    void budgetsTrackRemainingAndNotify() throws Exception {
        Map<String, Object> budget = new HashMap<>();
        budget.put("categoryId", groceriesId);
        budget.put("amount", 1000);
        budget.put("rollover", true);
        budget.put("alertThreshold", 80);
        JsonNode created = postJson("/api/budgets", budget, 201);
        assertThat(created.get("state").asText()).isEqualTo("OK");
        postJson("/api/budgets", budget, 409);

        // REQ-2.2: залишок оновлюється одразу після нової витрати (у т.ч. в підкатегорії)
        createTx("EXPENSE", "850", cardId, supermarketId, null, null);
        JsonNode status = getJson("/api/budgets", 200).get(0);
        assertThat(status.get("spent").decimalValue()).isEqualByComparingTo("850");
        assertThat(status.get("remaining").decimalValue()).isEqualByComparingTo("150");
        assertThat(status.get("state").asText()).isEqualTo("WARNING");

        // REQ-2.3: сповіщення про наближення і перевищення бюджету
        createTx("EXPENSE", "200", cardId, groceriesId, null, null);
        assertThat(getJson("/api/budgets", 200).get(0).get("state").asText()).isEqualTo("EXCEEDED");
        JsonNode notifications = getJson("/api/notifications", 200);
        assertThat(notifications.get("unreadCount").asInt()).isEqualTo(2);
        assertThat(notifications.get("items").findValuesAsText("type")).contains("BUDGET_WARNING", "BUDGET_EXCEEDED");

        send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notifications/read-all"), 204);
        assertThat(getJson("/api/notifications", 200).get("unreadCount").asInt()).isZero();

        // бюджет можна задати лише для категорії витрат
        budget.put("categoryId", salaryId);
        postJson("/api/budgets", budget, 400);

        // місяць до створення бюджету не містить його
        String previous = YearMonth.from(today).minusMonths(1).toString();
        assertThat(getJson("/api/budgets?month=" + previous, 200).size()).isZero();
    }

    @Test
    void recurringTransactionsAreCreatedAutomaticallyAndByQuickAdd() throws Exception {
        Map<String, Object> subscription = recurring("Netflix", "299", true);
        JsonNode auto = postJson("/api/recurring", subscription, 201);
        assertThat(LocalDate.parse(auto.get("nextDate").asText())).isAfter(today);
        JsonNode generated = getJson("/api/transactions?q=Netflix", 200);
        assertThat(generated.get("totalElements").asInt()).isEqualTo(1);
        assertThat(generated.get("content").get(0).get("recurringId").asLong()).isEqualTo(auto.get("id").asLong());

        JsonNode manual = postJson("/api/recurring", recurring("Комунальні", "1800", false), 201);
        assertThat(manual.get("due").asBoolean()).isTrue();
        assertThat(getJson("/api/transactions?q=Комунальні", 200).get("totalElements").asInt()).isZero();
        JsonNode upcoming = getJson("/api/recurring/upcoming?days=40", 200);
        assertThat(upcoming.findValuesAsText("name")).contains("Netflix", "Комунальні");

        JsonNode applied = postJson("/api/recurring/" + manual.get("id").asLong() + "/apply", "{}", 201);
        assertThat(applied.get("amount").decimalValue()).isEqualByComparingTo("1800");
        JsonNode afterApply = getJson("/api/recurring", 200);
        for (JsonNode item : afterApply) {
            assertThat(LocalDate.parse(item.get("nextDate").asText())).isAfter(today);
        }
    }

    @Test
    void analyticsForecastAndReports() throws Exception {
        createTx("INCOME", "30000", cardId, salaryId, null, null);
        createTx("EXPENSE", "1200", cardId, supermarketId, null, null);
        createTx("EXPENSE", "800", cashId, cafeId, null, null);

        // REQ-3.1
        JsonNode shares = getJson("/api/analytics/categories?type=EXPENSE", 200);
        assertThat(shares.size()).isEqualTo(2);
        assertThat(shares.get(0).get("name").asText()).isEqualTo("Продукти");
        assertThat(shares.get(0).get("percent").asDouble()).isEqualTo(60.0);
        assertThat(shares.get(0).get("hasChildren").asBoolean()).isTrue();
        JsonNode drill = getJson("/api/analytics/categories?type=EXPENSE&parentId=" + groceriesId, 200);
        assertThat(drill.get(0).get("name").asText()).isEqualTo("Супермаркет");

        // REQ-3.2
        JsonNode monthly = getJson("/api/analytics/monthly", 200);
        assertThat(monthly.get("points").size()).isEqualTo(12);
        JsonNode last = monthly.get("points").get(11);
        assertThat(last.get("month").asText()).isEqualTo(YearMonth.from(today).toString());
        assertThat(last.get("expense").decimalValue()).isEqualByComparingTo("2000");
        assertThat(last.get("expenseTrend").decimalValue()).isEqualByComparingTo("2000");
        // місяці до початку обліку не спотворюють тренд
        assertThat(monthly.get("points").get(0).get("expenseTrend").isNull()).isTrue();
        assertThat(monthly.get("averageExpense").decimalValue()).isEqualByComparingTo("2000");

        // REQ-3.4
        JsonNode forecast = getJson("/api/analytics/forecast", 200);
        assertThat(forecast.get("series").size()).isEqualTo(YearMonth.from(today).lengthOfMonth());
        assertThat(forecast.get("currentBalance").decimalValue()).isEqualByComparingTo("28000");
        assertThat(forecast.get("projectedEndBalance").decimalValue())
                .isLessThanOrEqualTo(forecast.get("currentBalance").decimalValue());

        JsonNode summary = getJson("/api/analytics/summary", 200);
        assertThat(summary.get("net").decimalValue()).isEqualByComparingTo("28000");

        // REQ-3.3
        String range = "from=" + YearMonth.from(today).atDay(1) + "&to=" + today;
        byte[] pdf = raw(get("/api/reports/summary?format=pdf&" + range), 200).getResponse().getContentAsByteArray();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        byte[] xlsx = raw(get("/api/reports/summary?format=xlsx&" + range), 200).getResponse().getContentAsByteArray();
        assertThat(new String(xlsx, 0, 2, StandardCharsets.US_ASCII)).isEqualTo("PK");
        raw(get("/api/reports/summary?format=doc&" + range), 400);
    }

    @Test
    void csvExportImportAndDuplicateDetection() throws Exception {
        createTx("EXPENSE", "120", cashId, cafeId, null, "Кава");
        createTx("INCOME", "1500", cardId, salaryId, null, "Аванс");

        // REQ-4.3: експорт → повторний імпорт того самого файлу розпізнає дублікати
        byte[] exported = raw(get("/api/data/export"), 200).getResponse().getContentAsByteArray();
        String csv = new String(exported, StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿date,type,amount,account,category,subcategory,to_account,note");
        JsonNode reimport = send(multipart("/api/data/import").file(new MockMultipartFile("file", "export.csv", "text/csv", exported))
                .param("dryRun", "true"), 200);
        assertThat(reimport.get("totalRows").asInt()).isEqualTo(2);
        assertThat(reimport.get("duplicateRows").asInt()).isEqualTo(2);

        // виписка банку у Windows-1251 з «;» і від'ємними сумами, без колонки рахунку
        String statement = """
                Дата i час операції;Деталі операції;Сума в валюті картки (UAH)
                05.10.2026 09:15:00;Сільпо;-1 250,40
                06.10.2026 18:02:11;Переказ від друга;500,00
                07.10.2026 12:00:00;Кіно;-320,00
                xx.10.2026;Зламаний рядок;-1
                """;
        MockMultipartFile file = new MockMultipartFile("file", "statement.csv", "text/csv",
                statement.getBytes(Charset.forName("windows-1251")));
        JsonNode preview = send(multipart("/api/data/import").file(file).param("dryRun", "true"), 200);
        assertThat(preview.get("encoding").asText()).isEqualTo("Windows-1251");
        assertThat(preview.get("needsDefaultAccount").asBoolean()).isTrue();
        assertThat(preview.get("errorRows").asInt()).isEqualTo(4);

        JsonNode imported = send(multipart("/api/data/import").file(file)
                .param("dryRun", "false")
                .param("defaultAccountId", String.valueOf(cardId)), 200);
        assertThat(imported.get("imported").asInt()).isEqualTo(3);
        assertThat(imported.get("errorRows").asInt()).isEqualTo(1);
        JsonNode silpo = getJson("/api/transactions?q=Сільпо", 200);
        assertThat(silpo.get("content").get(0).get("type").asText()).isEqualTo("EXPENSE");
        assertThat(silpo.get("content").get(0).get("amount").decimalValue()).isEqualByComparingTo("1250.40");

        JsonNode again = send(multipart("/api/data/import").file(file)
                .param("dryRun", "false")
                .param("defaultAccountId", String.valueOf(cardId)), 200);
        assertThat(again.get("imported").asInt()).isZero();
        assertThat(again.get("duplicateRows").asInt()).isEqualTo(3);
    }

    @Test
    void usersCannotAccessEachOthersData() throws Exception {
        JsonNode mine = createTx("EXPENSE", "99", cashId, cafeId, null, "Моя кава");
        user = testUsers.create();
        getJson("/api/transactions/" + mine.get("id").asLong(), 404);
        assertThat(getJson("/api/transactions?q=Моя", 200).get("totalElements").asInt()).isZero();
        postJson("/api/transactions", tx("EXPENSE", "10", cashId, cafeId, null, null), 404);
    }

    private JsonNode createTx(String type, String amount, long accountId, Long categoryId, Long toAccountId, String note) throws Exception {
        return postJson("/api/transactions", tx(type, amount, accountId, categoryId, toAccountId, note), 201);
    }

    private Map<String, Object> tx(String type, String amount, long accountId, Long categoryId, Long toAccountId, String note) {
        Map<String, Object> body = new HashMap<>();
        body.put("type", type);
        body.put("amount", amount);
        body.put("date", today.toString());
        body.put("accountId", accountId);
        body.put("categoryId", categoryId);
        body.put("toAccountId", toAccountId);
        body.put("note", note);
        return body;
    }

    private Map<String, Object> recurring(String name, String amount, boolean autoCreate) throws Exception {
        long subscriptionsId = idByName(getJson("/api/categories", 200), "Підписки");
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("type", "EXPENSE");
        body.put("amount", amount);
        body.put("accountId", cardId);
        body.put("categoryId", subscriptionsId);
        body.put("frequency", "MONTHLY");
        body.put("intervalCount", 1);
        body.put("startDate", today.toString());
        body.put("autoCreate", autoCreate);
        return body;
    }

    private static java.math.BigDecimal balance(JsonNode accounts, long id) {
        for (JsonNode account : accounts) {
            if (account.get("id").asLong() == id) {
                return account.get("balance").decimalValue();
            }
        }
        throw new AssertionError("Account " + id + " not found");
    }
}
