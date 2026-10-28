package com.fintrack.operations.transaction;

public enum TransactionType {
    INCOME,
    EXPENSE,
    /** Переказ між власними рахунками: не впливає на доходи/витрати, лише на баланси рахунків. */
    TRANSFER
}
