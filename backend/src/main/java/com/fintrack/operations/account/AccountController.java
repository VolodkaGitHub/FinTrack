package com.fintrack.operations.account;

import com.fintrack.common.CurrentUser;
import com.fintrack.operations.account.AccountDtos.AccountDto;
import com.fintrack.operations.account.AccountDtos.AccountRequest;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Рахунки та гаманці", description = "REQ-1.2")
@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @GetMapping
    public List<AccountDto> list(@CurrentUser Long userId) {
        return accountService.list(userId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccountDto create(@CurrentUser Long userId, @Valid @RequestBody AccountRequest request) {
        return accountService.create(userId, request);
    }

    @PutMapping("/{id}")
    public AccountDto update(@CurrentUser Long userId, @PathVariable Long id, @Valid @RequestBody AccountRequest request) {
        return accountService.update(userId, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser Long userId, @PathVariable Long id) {
        accountService.delete(userId, id);
    }
}
