package com.fintrack.user.sync;

import com.fintrack.budgeting.notification.NotificationCreatedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;

/** Розсилає події синхронізації та сповіщення на всі підключені пристрої користувача після коміту. */
@Slf4j
@Component
@RequiredArgsConstructor
public class SyncNotifier {

    private final SimpMessagingTemplate messaging;

    @TransactionalEventListener(fallbackExecution = true)
    public void onSync(SyncEvent event) {
        SyncMessage payload = new SyncMessage(event.entity(), event.action(), event.entityId(),
                event.originClientId(), Instant.now());
        send(event.userId(), "/queue/sync", payload);
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onNotification(NotificationCreatedEvent event) {
        send(event.userId(), "/queue/notifications", event.notification());
    }

    private void send(Long userId, String destination, Object payload) {
        try {
            messaging.convertAndSendToUser(String.valueOf(userId), destination, payload);
        } catch (Exception e) {
            log.warn("Failed to push {} to user {}: {}", destination, userId, e.getMessage());
        }
    }

    public record SyncMessage(String entity, String action, Long id, String originClientId, Instant timestamp) {
    }
}
