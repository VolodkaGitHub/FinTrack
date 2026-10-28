package com.fintrack.user.sync;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Автентифікує STOMP-з'єднання за JWT і не дозволяє підписуватися на чужі черги:
 * клієнт може слухати лише власні user-destination (/user/queue/...).
 */
@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtDecoder jwtDecoder;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                throw new MessageDeliveryException("Missing bearer token");
            }
            try {
                Jwt jwt = jwtDecoder.decode(header.substring(7));
                accessor.setUser(new JwtAuthenticationToken(jwt, List.of(), jwt.getSubject()));
            } catch (JwtException e) {
                throw new MessageDeliveryException("Invalid token");
            }
        } else if (command == StompCommand.SUBSCRIBE) {
            String destination = accessor.getDestination();
            if (accessor.getUser() == null || destination == null || !destination.startsWith("/user/queue/")) {
                throw new MessageDeliveryException("Subscription is not allowed");
            }
        } else if (command == StompCommand.SEND) {
            throw new MessageDeliveryException("Client messages are not supported");
        }
        return message;
    }
}
