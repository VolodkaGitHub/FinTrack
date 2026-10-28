package com.fintrack.operations.account;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

public final class AccountDtos {

    private AccountDtos() {
    }

    public record AccountRequest(
            @NotBlank(message = "Вкажіть назву рахунку") @Size(max = 100, message = "Назва задовга") String name,
            @NotNull(message = "Оберіть тип рахунку") AccountType type,
            @NotNull(message = "Вкажіть початковий баланс") @Digits(integer = 15, fraction = 2, message = "Некоректна сума") BigDecimal initialBalance,
            @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Колір у форматі #RRGGBB") String color,
            boolean archived,
            Long version) {
    }

    public record AccountDto(Long id, String name, AccountType type, BigDecimal initialBalance, BigDecimal balance,
                             String color, boolean archived, Instant createdAt, Long version) {
        public static AccountDto from(Account account, BigDecimal balance) {
            return new AccountDto(account.getId(), account.getName(), account.getType(), account.getInitialBalance(),
                    balance, account.getColor(), account.isArchived(), account.getCreatedAt(), account.getVersion());
        }
    }
}
