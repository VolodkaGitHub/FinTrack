package com.fintrack.user;

import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryRepository;
import com.fintrack.budgeting.category.CategoryType;
import com.fintrack.operations.account.Account;
import com.fintrack.operations.account.AccountRepository;
import com.fintrack.operations.account.AccountType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

/** Стартовий набір рахунків і категорій для нового користувача, щоб облік можна було почати одразу. */
@Service
@RequiredArgsConstructor
public class UserDefaultsService {

    private final CategoryRepository categories;
    private final AccountRepository accounts;
    private final Clock clock;

    private record Def(String name, String icon, String color, List<Def> children) {
        Def(String name, String icon, String color) {
            this(name, icon, color, List.of());
        }
    }

    private static final List<Def> EXPENSES = List.of(
            new Def("Продукти", "shopping-cart", "#2f9e44", List.of(
                    new Def("Супермаркет", "shopping-cart", "#2f9e44"),
                    new Def("Ринок", "basket", "#37b24d"))),
            new Def("Кафе та ресторани", "tools-kitchen-2", "#f08c00"),
            new Def("Транспорт", "bus", "#1971c2", List.of(
                    new Def("Громадський транспорт", "bus", "#1971c2"),
                    new Def("Таксі", "car", "#1c7ed6"),
                    new Def("Пальне", "gas-station", "#1864ab"))),
            new Def("Житло та комунальні", "home", "#5f3dc4", List.of(
                    new Def("Оренда", "home", "#5f3dc4"),
                    new Def("Комунальні послуги", "bolt", "#7048e8"),
                    new Def("Інтернет і зв'язок", "wifi", "#845ef7"))),
            new Def("Здоров'я", "heart", "#e03131", List.of(
                    new Def("Аптека", "pill", "#e03131"),
                    new Def("Лікарі", "stethoscope", "#c92a2a"))),
            new Def("Одяг та взуття", "shirt", "#c2255c"),
            new Def("Розваги", "device-gamepad-2", "#ae3ec9", List.of(
                    new Def("Кіно та події", "movie", "#ae3ec9"),
                    new Def("Підписки", "repeat", "#9c36b5"))),
            new Def("Освіта", "school", "#1098ad"),
            new Def("Подарунки", "gift", "#d6336c"),
            new Def("Інше", "dots", "#868e96"));

    private static final List<Def> INCOMES = List.of(
            new Def("Зарплата", "briefcase", "#2b8a3e"),
            new Def("Фріланс", "device-laptop", "#0b7285"),
            new Def("Подарунки", "gift", "#d6336c"),
            new Def("Кешбек і відсотки", "percentage", "#e67700"),
            new Def("Інше", "dots", "#868e96"));

    @Transactional
    public void createDefaults(Long userId) {
        Instant now = clock.instant();
        EXPENSES.forEach(def -> save(userId, CategoryType.EXPENSE, def, null, now));
        INCOMES.forEach(def -> save(userId, CategoryType.INCOME, def, null, now));
        accounts.save(account(userId, "Готівка", AccountType.CASH, "#2f9e44", now));
        accounts.save(account(userId, "Банківська картка", AccountType.CARD, "#1971c2", now));
    }

    private void save(Long userId, CategoryType type, Def def, Long parentId, Instant now) {
        Category category = new Category();
        category.setUserId(userId);
        category.setType(type);
        category.setName(def.name());
        category.setIcon(def.icon());
        category.setColor(def.color());
        category.setParentId(parentId);
        category.setCreatedAt(now);
        categories.save(category);
        def.children().forEach(child -> save(userId, type, child, category.getId(), now));
    }

    private static Account account(Long userId, String name, AccountType type, String color, Instant now) {
        Account account = new Account();
        account.setUserId(userId);
        account.setName(name);
        account.setType(type);
        account.setColor(color);
        account.setInitialBalance(BigDecimal.ZERO);
        account.setCreatedAt(now);
        return account;
    }
}
