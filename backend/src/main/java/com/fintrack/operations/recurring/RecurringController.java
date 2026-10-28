package com.fintrack.operations.recurring;

import com.fintrack.common.CurrentUser;
import com.fintrack.operations.recurring.RecurringDtos.ApplyRequest;
import com.fintrack.operations.recurring.RecurringDtos.RecurringDto;
import com.fintrack.operations.recurring.RecurringDtos.RecurringRequest;
import com.fintrack.operations.recurring.RecurringDtos.UpcomingPayment;
import com.fintrack.operations.transaction.TransactionDtos.TransactionDto;
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
import java.time.LocalDate;
import java.util.List;

@Tag(name = "Регулярні операції", description = "REQ-1.3")
@RestController
@RequestMapping("/api/recurring")
@RequiredArgsConstructor
public class RecurringController {

    private final RecurringService recurringService;
    private final Clock clock;

    @GetMapping
    public List<RecurringDto> list(@CurrentUser Long userId) {
        return recurringService.list(userId);
    }

    @GetMapping("/upcoming")
    public List<UpcomingPayment> upcoming(@CurrentUser Long userId, @RequestParam(defaultValue = "14") int days) {
        LocalDate today = LocalDate.now(clock);
        return recurringService.upcoming(userId, today, today.plusDays(Math.min(Math.max(days, 1), 366)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RecurringDto create(@CurrentUser Long userId, @Valid @RequestBody RecurringRequest request) {
        return recurringService.create(userId, request);
    }

    @PutMapping("/{id}")
    public RecurringDto update(@CurrentUser Long userId, @PathVariable Long id, @Valid @RequestBody RecurringRequest request) {
        return recurringService.update(userId, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser Long userId, @PathVariable Long id) {
        recurringService.delete(userId, id);
    }

    @PostMapping("/{id}/apply")
    @ResponseStatus(HttpStatus.CREATED)
    public TransactionDto apply(@CurrentUser Long userId, @PathVariable Long id,
                                @Valid @RequestBody(required = false) ApplyRequest request) {
        return recurringService.applyNow(userId, id, request);
    }

    @PostMapping("/{id}/skip")
    public RecurringDto skip(@CurrentUser Long userId, @PathVariable Long id) {
        return recurringService.skip(userId, id);
    }
}
