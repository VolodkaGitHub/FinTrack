package com.fintrack.budgeting.notification;

import java.time.Instant;
import java.util.List;

public record NotificationDto(Long id, NotificationType type, String title, String message, boolean read,
                              Instant createdAt) {

    public static NotificationDto from(Notification notification) {
        return new NotificationDto(notification.getId(), notification.getType(), notification.getTitle(),
                notification.getMessage(), notification.isRead(), notification.getCreatedAt());
    }

    public record NotificationList(List<NotificationDto> items, long unreadCount) {
    }
}
