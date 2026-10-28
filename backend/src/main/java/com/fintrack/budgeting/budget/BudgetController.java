package com.fintrack.budgeting.budget;

import com.fintrack.budgeting.budget.BudgetDtos.BudgetRequest;
import com.fintrack.budgeting.budget.BudgetDtos.BudgetStatusDto;
import com.fintrack.common.ApiException;
import com.fintrack.common.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@Tag(name = "Бюджети", description = "REQ-2.2, REQ-2.3, REQ-2.4")
@RestController
@RequestMapping("/api/budgets")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService budgetService;
    private final Clock clock;

    /** @param month місяць у форматі YYYY-MM (за замовчуванням — поточний) */
    @GetMapping
    public List<BudgetStatusDto> list(@CurrentUser Long userId, @RequestParam(required = false) String month) {
        return budgetService.list(userId, parseMonth(month));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BudgetStatusDto create(@CurrentUser Long userId, @Valid @RequestBody BudgetRequest request) {
        return budgetService.create(userId, request);
    }

    @PutMapping("/{id}")
    public BudgetStatusDto update(@CurrentUser Long userId, @PathVariable Long id, @Valid @RequestBody BudgetRequest request) {
        return budgetService.update(userId, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser Long userId, @PathVariable Long id) {
        budgetService.delete(userId, id);
    }

    private YearMonth parseMonth(String month) {
        if (month == null || month.isBlank()) {
            return YearMonth.now(clock);
        }
        try {
            return YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("Місяць має бути у форматі YYYY-MM");
        }
    }
}
