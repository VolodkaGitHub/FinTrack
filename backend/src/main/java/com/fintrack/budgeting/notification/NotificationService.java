package com.fintrack.budgeting.notification;

import com.fintrack.budgeting.notification.NotificationDto.NotificationList;
import com.fintrack.common.ApiException;
import com.fintrack.user.sync.SyncEvent;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

@Service
@RequiredArgsConstructor
@Transactional
public class NotificationService {

    private final NotificationRepository notifications;
    private final ApplicationEventPublisher events;
    private final MeterRegistry meterRegistry;
    private final Clock clock;

    public NotificationDto notify(Long userId, NotificationType type, String title, String message) {
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setType(type);
        notification.setTitle(truncate(title, 200));
        notification.setMessage(truncate(message, 1000));
        notification.setCreatedAt(clock.instant());
        notifications.save(notification);
        NotificationDto dto = NotificationDto.from(notification);
        events.publishEvent(new NotificationCreatedEvent(userId, dto));
        meterRegistry.counter("fintrack.notifications.sent", "type", type.name()).increment();
        return dto;
    }

    @Transactional(readOnly = true)
    public NotificationList list(Long userId, int limit) {
        int size = Math.min(Math.max(limit, 1), 100);
        return new NotificationList(
                notifications.findByUserIdOrderByCreatedAtDescIdDesc(userId, PageRequest.of(0, size)).stream()
                        .map(NotificationDto::from)
                        .toList(),
                notifications.countByUserIdAndReadFalse(userId));
    }

    public void markRead(Long userId, Long id) {
        Notification notification = notifications.findByIdAndUserId(id, userId)
                .orElseThrow(() -> ApiException.notFound("Сповіщення не знайдено"));
        notification.setRead(true);
        events.publishEvent(SyncEvent.of(userId, "notifications", "updated", id));
    }

    public void markAllRead(Long userId) {
        notifications.markAllRead(userId);
        events.publishEvent(SyncEvent.of(userId, "notifications", "updated", null));
    }

    public void delete(Long userId, Long id) {
        Notification notification = notifications.findByIdAndUserId(id, userId)
                .orElseThrow(() -> ApiException.notFound("Сповіщення не знайдено"));
        notifications.delete(notification);
        events.publishEvent(SyncEvent.of(userId, "notifications", "deleted", id));
    }

    private static String truncate(String value, int max) {
        return value.length() > max ? value.substring(0, max - 1) + "…" : value;
    }
}
