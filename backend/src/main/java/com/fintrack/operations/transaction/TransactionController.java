package com.fintrack.operations.transaction;

import com.fintrack.common.CurrentUser;
import com.fintrack.operations.transaction.TransactionDtos.TransactionDto;
import com.fintrack.operations.transaction.TransactionDtos.TransactionFilter;
import com.fintrack.operations.transaction.TransactionDtos.TransactionPage;
import com.fintrack.operations.transaction.TransactionDtos.TransactionRequest;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.math.BigDecimal;
import java.time.LocalDate;

@Tag(name = "Операції", description = "REQ-1.1, REQ-1.4")
@RestController
@RequestMapping("/api/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;

    @GetMapping
    public TransactionPage search(@CurrentUser Long userId,
                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                  @RequestParam(required = false) TransactionType type,
                                  @RequestParam(required = false) Long accountId,
                                  @RequestParam(required = false) Long categoryId,
                                  @RequestParam(required = false) BigDecimal minAmount,
                                  @RequestParam(required = false) BigDecimal maxAmount,
                                  @RequestParam(required = false) String q,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "20") int size,
                                  @RequestParam(defaultValue = "date") String sort,
                                  @RequestParam(defaultValue = "desc") String direction) {
        TransactionFilter filter = new TransactionFilter(from, to, type, accountId, categoryId, minAmount, maxAmount, q);
        return transactionService.search(userId, filter, page, size, sort, direction);
    }

    @GetMapping("/{id}")
    public TransactionDto get(@CurrentUser Long userId, @PathVariable Long id) {
        return transactionService.get(userId, id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransactionDto create(@CurrentUser Long userId, @Valid @RequestBody TransactionRequest request) {
        return transactionService.create(userId, request);
    }

    @PutMapping("/{id}")
    public TransactionDto update(@CurrentUser Long userId, @PathVariable Long id,
                                 @Valid @RequestBody TransactionRequest request) {
        return transactionService.update(userId, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser Long userId, @PathVariable Long id) {
        transactionService.delete(userId, id);
    }
}
