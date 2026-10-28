package com.fintrack.budgeting.category;

import com.fintrack.budgeting.budget.BudgetRepository;
import com.fintrack.budgeting.category.CategoryDtos.CategoryDto;
import com.fintrack.budgeting.category.CategoryDtos.CategoryRequest;
import com.fintrack.common.ApiException;
import com.fintrack.operations.recurring.RecurringTransactionRepository;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.user.sync.SyncEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** REQ-2.1: власні категорії та підкатегорії доходів і витрат. */
@Service
@RequiredArgsConstructor
@Transactional
public class CategoryService {

    private final CategoryRepository categories;
    private final TransactionRepository transactions;
    private final RecurringTransactionRepository recurring;
    private final BudgetRepository budgets;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<CategoryDto> list(Long userId) {
        Map<Long, Category> byId = mapForUser(userId);
        Function<Category, String> groupName = c -> c.getParentId() == null ? c.getName()
                : byId.getOrDefault(c.getParentId(), c).getName();
        return byId.values().stream()
                .sorted(Comparator.comparing(Category::getType)
                        .thenComparing(groupName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(c -> c.getParentId() != null)
                        .thenComparing(Category::getName, String.CASE_INSENSITIVE_ORDER))
                .map(CategoryDto::from)
                .toList();
    }

    public CategoryDto create(Long userId, CategoryRequest request) {
        validate(userId, null, request);
        Category category = new Category();
        category.setUserId(userId);
        category.setCreatedAt(clock.instant());
        apply(category, request);
        categories.save(category);
        events.publishEvent(SyncEvent.of(userId, "categories", "created", category.getId()));
        return CategoryDto.from(category);
    }

    public CategoryDto update(Long userId, Long id, CategoryRequest request) {
        Category category = requireOwned(userId, id);
        ApiException.checkVersion(request.version(), category.getVersion());
        if (category.getType() != request.type() && (isUsed(id) || categories.existsByParentId(id))) {
            throw ApiException.conflict("Не можна змінити тип категорії, яка вже використовується");
        }
        if (request.parentId() != null && categories.existsByParentId(id)) {
            throw ApiException.badRequest("Категорія з підкатегоріями не може стати підкатегорією");
        }
        validate(userId, id, request);
        apply(category, request);
        categories.saveAndFlush(category);
        events.publishEvent(SyncEvent.of(userId, "categories", "updated", id));
        return CategoryDto.from(category);
    }

    public void delete(Long userId, Long id) {
        Category category = requireOwned(userId, id);
        if (categories.existsByParentId(id)) {
            throw ApiException.conflict("Спочатку видаліть або перенесіть підкатегорії");
        }
        if (isUsed(id)) {
            throw ApiException.conflict("Категорія використовується в операціях, регулярних платежах або бюджетах");
        }
        categories.delete(category);
        events.publishEvent(SyncEvent.of(userId, "categories", "deleted", id));
    }

    @Transactional(readOnly = true)
    public Category requireOwned(Long userId, Long categoryId) {
        return categories.findByIdAndUserId(categoryId, userId)
                .orElseThrow(() -> ApiException.notFound("Категорію не знайдено"));
    }

    @Transactional(readOnly = true)
    public Map<Long, Category> mapForUser(Long userId) {
        return categories.findByUserId(userId).stream().collect(Collectors.toMap(Category::getId, Function.identity()));
    }

    /** Категорія разом з її підкатегоріями (для фільтрів і бюджетів). */
    @Transactional(readOnly = true)
    public Set<Long> withChildren(Long userId, Long categoryId) {
        Set<Long> ids = new HashSet<>();
        ids.add(categoryId);
        categories.findByUserId(userId).stream()
                .filter(c -> categoryId.equals(c.getParentId()))
                .forEach(c -> ids.add(c.getId()));
        return ids;
    }

    /** Створення категорії без перевірок дублікатів — використовується імпортом CSV після власного пошуку. */
    public Category createRaw(Long userId, CategoryType type, String name, Long parentId) {
        Category category = new Category();
        category.setUserId(userId);
        category.setType(type);
        category.setName(name);
        category.setParentId(parentId);
        category.setIcon(type == CategoryType.INCOME ? "cash" : "receipt");
        category.setColor(type == CategoryType.INCOME ? "#2b8a3e" : "#868e96");
        category.setCreatedAt(clock.instant());
        return categories.save(category);
    }

    private boolean isUsed(Long categoryId) {
        return transactions.existsByCategoryId(categoryId)
                || recurring.existsByCategoryId(categoryId)
                || budgets.existsByCategoryId(categoryId);
    }

    private void validate(Long userId, Long selfId, CategoryRequest request) {
        if (request.parentId() != null) {
            if (request.parentId().equals(selfId)) {
                throw ApiException.badRequest("Категорія не може бути власною підкатегорією");
            }
            Category parent = requireOwned(userId, request.parentId());
            if (parent.getParentId() != null) {
                throw ApiException.badRequest("Підтримується лише один рівень підкатегорій");
            }
            if (parent.getType() != request.type()) {
                throw ApiException.badRequest("Тип підкатегорії має збігатися з типом батьківської категорії");
            }
        }
        String name = request.name().trim();
        boolean duplicate = categories.findByUserId(userId).stream()
                .anyMatch(c -> !c.getId().equals(selfId)
                        && c.getType() == request.type()
                        && Objects.equals(c.getParentId(), request.parentId())
                        && c.getName().equalsIgnoreCase(name));
        if (duplicate) {
            throw ApiException.conflict("Категорія з такою назвою вже існує");
        }
    }

    private static void apply(Category category, CategoryRequest request) {
        category.setName(request.name().trim());
        category.setType(request.type());
        category.setParentId(request.parentId());
        category.setIcon(request.icon());
        category.setColor(request.color());
    }
}
