package com.fintrack.budgeting.notification;

/** Публікується після збереження сповіщення; доставляється на пристрої користувача через WebSocket. */
public record NotificationCreatedEvent(Long userId, NotificationDto notification) {
}
