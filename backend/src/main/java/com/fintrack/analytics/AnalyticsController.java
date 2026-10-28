package com.fintrack.analytics;

import com.fintrack.analytics.AnalyticsDtos.CategoryShareDto;
import com.fintrack.analytics.AnalyticsDtos.ForecastDto;
import com.fintrack.analytics.AnalyticsDtos.MonthlyDynamicsDto;
import com.fintrack.analytics.AnalyticsDtos.SummaryDto;
import com.fintrack.common.ApiException;
import com.fintrack.common.CurrentUser;
import com.fintrack.operations.transaction.TransactionType;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@Tag(name = "Аналітика", description = "REQ-3.1, REQ-3.2, REQ-3.4")
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final ForecastService forecastService;
    private final Clock clock;

    @GetMapping("/summary")
    public SummaryDto summary(@CurrentUser Long userId,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Period period = period(from, to);
        return analyticsService.summary(userId, period.from(), period.to());
    }

    @GetMapping("/categories")
    public List<CategoryShareDto> categories(@CurrentUser Long userId,
                                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                             @RequestParam(defaultValue = "EXPENSE") TransactionType type,
                                             @RequestParam(required = false) Long parentId) {
        if (type == TransactionType.TRANSFER) {
            throw ApiException.badRequest("Розподіл можливий лише для доходів або витрат");
        }
        Period period = period(from, to);
        return analyticsService.categoryShares(userId, period.from(), period.to(), type, parentId);
    }

    /** @param from місяць початку (YYYY-MM), за замовчуванням — 11 місяців тому; @param to — поточний місяць */
    @GetMapping("/monthly")
    public MonthlyDynamicsDto monthly(@CurrentUser Long userId,
                                      @RequestParam(required = false) String from,
                                      @RequestParam(required = false) String to) {
        YearMonth end = to == null ? YearMonth.now(clock) : parseMonth(to);
        YearMonth start = from == null ? end.minusMonths(11) : parseMonth(from);
        if (start.isAfter(end) || start.plusMonths(60).isBefore(end)) {
            throw ApiException.badRequest("Період має бути від 1 до 60 місяців");
        }
        return analyticsService.monthly(userId, start, end);
    }

    @GetMapping("/forecast")
    public ForecastDto forecast(@CurrentUser Long userId) {
        return forecastService.forecast(userId);
    }

    private Period period(LocalDate from, LocalDate to) {
        YearMonth current = YearMonth.now(clock);
        LocalDate start = from != null ? from : current.atDay(1);
        LocalDate end = to != null ? to : current.atEndOfMonth();
        if (start.isAfter(end)) {
            throw ApiException.badRequest("Дата початку періоду пізніша за дату завершення");
        }
        return new Period(start, end);
    }

    private static YearMonth parseMonth(String value) {
        try {
            return YearMonth.parse(value);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("Місяць має бути у форматі YYYY-MM");
        }
    }

    private record Period(LocalDate from, LocalDate to) {
    }
}
