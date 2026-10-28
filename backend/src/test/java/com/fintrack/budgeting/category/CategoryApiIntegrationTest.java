package com.fintrack.budgeting.category;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintrack.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** REQ-2.1: власні категорії та підкатегорії доходів і витрат з іконками й кольорами. */
class CategoryApiIntegrationTest extends ApiTestSupport {

    @BeforeEach
    void setUp() {
        user = testUsers.create();
    }

    @Test
    void createsCategoriesAndSubcategoriesWithIconsAndColors() throws Exception {
        JsonNode sport = postJson("/api/categories", category("Спорт", "EXPENSE", null, "barbell", "#1098ad"), 201);
        long sportId = sport.get("id").asLong();
        assertThat(sport.get("icon").asText()).isEqualTo("barbell");
        assertThat(sport.get("color").asText()).isEqualTo("#1098ad");
        JsonNode pool = postJson("/api/categories", category("Басейн", "EXPENSE", sportId, "heart", "#1c7ed6"), 201);
        assertThat(pool.get("parentId").asLong()).isEqualTo(sportId);

        List<String> names = texts(getJson("/api/categories", 200), "name");
        assertThat(names.indexOf("Басейн")).isEqualTo(names.indexOf("Спорт") + 1);

        JsonNode tooDeep = postJson("/api/categories", category("Доріжка", "EXPENSE", pool.get("id").asLong(), "dots", "#1c7ed6"), 400);
        assertThat(tooDeep.get("detail").asText()).contains("один рівень");
        JsonNode wrongType = postJson("/api/categories", category("Премія", "INCOME", sportId, "cash", "#2b8a3e"), 400);
        assertThat(wrongType.get("detail").asText()).contains("Тип підкатегорії");
        postJson("/api/categories", category("спорт", "EXPENSE", null, "barbell", "#1098ad"), 409);
        postJson("/api/categories", category("Спорт", "INCOME", null, "barbell", "#1098ad"), 201);

        JsonNode invalid = postJson("/api/categories", category(" ", "EXPENSE", null, "", "red"), 400);
        assertThat(invalid.get("errors").has("name")).isTrue();
        assertThat(invalid.get("errors").has("icon")).isTrue();
        assertThat(invalid.get("errors").has("color")).isTrue();
    }

    @Test
    void updatesCategoryWithOptimisticLocking() throws Exception {
        JsonNode hobby = postJson("/api/categories", category("Хобі", "EXPENSE", null, "music", "#ae3ec9"), 201);
        long id = hobby.get("id").asLong();
        Map<String, Object> update = category("Хобі та творчість", "EXPENSE", null, "book", "#f08c00");
        update.put("version", hobby.get("version").asLong());

        JsonNode updated = putJson("/api/categories/" + id, update, 200);
        assertThat(updated.get("name").asText()).isEqualTo("Хобі та творчість");
        assertThat(updated.get("icon").asText()).isEqualTo("book");
        assertThat(putJson("/api/categories/" + id, update, 409).get("code").asText()).isEqualTo("STALE_DATA");

        putJson("/api/categories/" + id, category("Хобі", "EXPENSE", id, "music", "#ae3ec9"), 400);
        long transport = categoryId("Транспорт");
        long groceries = categoryId("Продукти");
        JsonNode withChildren = putJson("/api/categories/" + transport, category("Транспорт", "EXPENSE", groceries, "bus", "#1971c2"), 400);
        assertThat(withChildren.get("detail").asText()).contains("підкатегоріями");

        // підкатегорію можна перенести до іншої батьківської категорії
        long taxi = categoryId("Таксі");
        JsonNode moved = putJson("/api/categories/" + taxi, category("Таксі", "EXPENSE", id, "car", "#1c7ed6"), 200);
        assertThat(moved.get("parentId").asLong()).isEqualTo(id);
    }

    @Test
    void categoriesInUseCannotBeRetypedOrDeleted() throws Exception {
        long cafe = categoryId("Кафе та ресторани");
        createTx("EXPENSE", "50", LocalDate.now(clock), accountId("Готівка"), cafe, null, "Кава");
        assertThat(putJson("/api/categories/" + cafe, category("Кафе та ресторани", "INCOME", null, "coffee", "#f08c00"), 409)
                .get("detail").asText()).contains("тип");
        deleteJson("/api/categories/" + cafe, 409);

        long clothes = categoryId("Одяг та взуття");
        postJson("/api/budgets", body("categoryId", clothes, "amount", 1000, "rollover", false, "alertThreshold", 80), 201);
        deleteJson("/api/categories/" + clothes, 409);

        long transport = categoryId("Транспорт");
        assertThat(deleteJson("/api/categories/" + transport, 409).get("detail").asText()).contains("підкатегорії");
        for (String child : List.of("Таксі", "Пальне", "Громадський транспорт")) {
            deleteOk("/api/categories/" + categoryId(child));
        }
        deleteOk("/api/categories/" + transport);
        assertThat(texts(getJson("/api/categories", 200), "name")).doesNotContain("Транспорт", "Таксі");
    }

    @Test
    void otherUsersCategoriesAreNotAccessible() throws Exception {
        long foreign = categoryId("Освіта");
        user = testUsers.create();
        putJson("/api/categories/" + foreign, category("Освіта", "EXPENSE", null, "school", "#1098ad"), 404);
        deleteJson("/api/categories/" + foreign, 404);
        postJson("/api/categories", category("Курси", "EXPENSE", foreign, "school", "#1098ad"), 404);
    }

    private static Map<String, Object> category(String name, String type, Long parentId, String icon, String color) {
        return body("name", name, "type", type, "parentId", parentId, "icon", icon, "color", color);
    }
}
