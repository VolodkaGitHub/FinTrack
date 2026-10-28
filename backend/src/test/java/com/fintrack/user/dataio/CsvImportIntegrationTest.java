package com.fintrack.user.dataio;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/** REQ-4.3: імпорт історії з CSV (перекази, нові рахунки й категорії, дублікати, помилки) та експорт за період. */
class CsvImportIntegrationTest extends ApiTestSupport {

    @BeforeEach
    void setUp() {
        user = testUsers.create();
    }

    @Test
    void importsTransfersAndCreatesMissingAccountsAndCategories() throws Exception {
        String csv = """
                date;type;amount;account;category;subcategory;to_account;note
                2025-02-01;INCOME;"25 000,00";Банківська картка;Зарплата;;;Лютнева зарплата
                2025-02-03;EXPENSE;1450.75;Банківська картка;Подорожі;Готелі;;Готель у Львові
                2025-02-04;TRANSFER;5000;Банківська картка;;;Конверт на відпустку;Відкладаю
                2025-02-05;витрата;300;Готівка;Продукти;Ринок;;Овочі
                2025-02-06;TRANSFER;100;Готівка;;;;Без рахунку зарахування
                """;
        JsonNode preview = importCsv(csv, true, true, true);
        assertThat(preview.get("delimiter").asText()).isEqualTo("крапка з комою");
        assertThat(preview.get("totalRows").asInt()).isEqualTo(5);
        assertThat(preview.get("validRows").asInt()).isEqualTo(4);
        assertThat(preview.get("errors").get(0).get("message").asText()).contains("рахунок зарахування");
        assertThat(preview.get("newAccounts").get(0).asText()).isEqualTo("Конверт на відпустку");
        assertThat(texts(preview.get("newCategories"), null)).containsExactly("Витрата: Подорожі", "Витрата: Подорожі / Готелі");
        assertThat(texts(getJson("/api/accounts", 200), "name")).doesNotContain("Конверт на відпустку");

        JsonNode result = importCsv(csv, false, true, true);
        assertThat(result.get("imported").asInt()).isEqualTo(4);
        JsonNode envelope = byId(getJson("/api/accounts", 200), accountId("Конверт на відпустку"));
        assertThat(envelope.get("type").asText()).isEqualTo("OTHER");
        assertThat(envelope.get("balance").decimalValue()).isEqualByComparingTo("5000");
        JsonNode categories = getJson("/api/categories", 200);
        assertThat(byId(categories, idByName(categories, "Готелі")).get("parentId").asLong())
                .isEqualTo(idByName(categories, "Подорожі"));
        JsonNode vegetables = getJson("/api/transactions?q=Овочі", 200).get("content").get(0);
        assertThat(vegetables.get("categoryId").asLong()).isEqualTo(categoryId("Ринок"));
        assertThat(notifications("IMPORT_COMPLETED").get(0).get("message").asText()).contains("Додано операцій: 4");
    }

    @Test
    void withoutCreatingMissingReferencesRowsAreReportedAsErrors() throws Exception {
        String csv = """
                date,type,amount,account,category,subcategory,note
                2025-02-01,EXPENSE,10,Скарбничка,Продукти,,Невідомий рахунок
                2025-02-01,EXPENSE,10,Готівка,Казино,,Невідома категорія
                2025-02-01,EXPENSE,10,Готівка,Продукти,Делікатеси,Невідома підкатегорія
                2025-02-01,EXPENSE,10,Готівка,Продукти,Ринок,Усе відоме
                """;
        JsonNode result = importCsv(csv, false, false, true);
        assertThat(result.get("imported").asInt()).isEqualTo(1);
        assertThat(texts(result.get("errors"), "message")).containsExactly(
                "Рахунок «Скарбничка» не знайдено",
                "Категорію «Казино» не знайдено",
                "Підкатегорію «Делікатеси» не знайдено");
    }

    @Test
    void duplicatesAreSkippedUnlessImportedDeliberately() throws Exception {
        LocalDate day = LocalDate.of(2025, 2, 10);
        createTx("EXPENSE", "100", day, accountId("Готівка"), categoryId("Кафе та ресторани"), null, "Кава");
        String csv = """
                date,type,amount,account,category,note
                2025-02-10,EXPENSE,100,Готівка,Кафе та ресторани,Кава
                2025-02-10,EXPENSE,100,Готівка,Кафе та ресторани,Кава
                """;
        JsonNode skipping = importCsv(csv, true, true, true);
        assertThat(skipping.get("duplicateRows").asInt()).isEqualTo(1);
        assertThat(skipping.get("validRows").asInt()).isEqualTo(1);
        JsonNode allowing = importCsv(csv, true, true, false);
        assertThat(allowing.get("duplicateRows").asInt()).isZero();
        assertThat(allowing.get("validRows").asInt()).isEqualTo(2);
    }

    @Test
    void invalidFilesAndRowsAreRejectedWithReadableErrors() throws Exception {
        assertThat(send(upload(new byte[0]), 400).get("detail").asText()).isEqualTo("Файл порожній");
        assertThat(send(upload("date,amount\n".getBytes(StandardCharsets.UTF_8)), 400).get("detail").asText()).contains("немає рядків");
        assertThat(send(upload("name,value\nA,1\n".getBytes(StandardCharsets.UTF_8)), 400).get("detail").asText()).contains("датою та сумою");

        String csv = """
                date,type,amount,note
                вчора,EXPENSE,10,Погана дата
                2025-02-01,EXPENSE,abc,Погана сума
                2025-02-01,EXPENSE,0,Нульова сума
                2025-02-01,ПОДАРУНОК,10,Невідомий тип
                ,EXPENSE,10,Без дати
                """;
        JsonNode result = importCsv(csv, true, true, true);
        assertThat(result.get("errorRows").asInt()).isEqualTo(5);
        assertThat(texts(result.get("errors"), "message")).containsExactly(
                "Невідомий формат дати «вчора»",
                "Некоректна сума «abc»",
                "Нульова сума",
                "Невідомий тип операції «ПОДАРУНОК»",
                "Порожня дата");
    }

    @Test
    void exportsSelectedPeriodWithSemicolonDelimiter() throws Exception {
        long cash = accountId("Готівка");
        long cafe = categoryId("Кафе та ресторани");
        createTx("EXPENSE", "70", LocalDate.of(2025, 2, 27), cash, cafe, null, "Лютий");
        createTx("EXPENSE", "80", LocalDate.of(2025, 3, 2), cash, cafe, null, "Березень");

        MockHttpServletResponse response = raw(get("/api/data/export?from=2025-03-01&to=2025-03-31&delimiter=semicolon"), 200).getResponse();
        assertThat(response.getHeader("Content-Disposition")).contains("fintrack-transactions_");
        String csv = response.getContentAsString(StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿date;type;amount;account;category;subcategory;to_account;note");
        assertThat(csv).contains("2025-03-02;EXPENSE;80.00;Готівка;Кафе та ресторани;;;Березень").doesNotContain("Лютий");
    }

    private JsonNode importCsv(String csv, boolean dryRun, boolean createMissing, boolean skipDuplicates) throws Exception {
        return send(upload(csv.getBytes(StandardCharsets.UTF_8))
                .param("dryRun", String.valueOf(dryRun))
                .param("createMissing", String.valueOf(createMissing))
                .param("skipDuplicates", String.valueOf(skipDuplicates)), 200);
    }

    private static MockMultipartHttpServletRequestBuilder upload(byte[] content) {
        return multipart("/api/data/import").file(new MockMultipartFile("file", "history.csv", "text/csv", content));
    }
}
