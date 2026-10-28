package com.fintrack.budgeting.notification;

public enum NotificationType {
    /** REQ-2.3: витрачено поріг (за замовчуванням 80%) бюджету категорії. */
    BUDGET_WARNING,
    /** REQ-2.3: бюджет категорії перевищено. */
    BUDGET_EXCEEDED,
    /** REQ-2.4: на початку місяця залишок бюджету перенесено. */
    BUDGET_ROLLOVER,
    /** REQ-1.3: автоматично створено регулярну операцію. */
    RECURRING_CREATED,
    /** REQ-1.3: настав час ручного регулярного платежу. */
    RECURRING_DUE,
    /** REQ-4.3: імпорт CSV завершено. */
    IMPORT_COMPLETED
}
