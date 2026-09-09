package com.bubit.common.security;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class WebSocketAuthenticationInterceptor implements ChannelInterceptor {

    static final String AUTHORIZATION = "Authorization";
    static final String AUTHENTICATION_FAILED = "WebSocket authentication failed";

    private final JwtProvider jwtProvider;

    public WebSocketAuthenticationInterceptor(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            throw authenticationFailed();
        }

        StompCommand command = accessor.getCommand();
        if (StompCommand.CONNECT.equals(command) || StompCommand.STOMP.equals(command)) {
            if (!accessor.isMutable()) {
                throw authenticationFailed();
            }
            authenticateConnect(accessor);
        } else if ((StompCommand.SUBSCRIBE.equals(command) || StompCommand.SEND.equals(command))
                && !isAuthenticated(accessor)) {
            throw authenticationFailed();
        }
        return message;
    }

    private void authenticateConnect(StompHeaderAccessor accessor) {
        List<String> values = accessor.getNativeHeader(AUTHORIZATION);
        accessor.setNativeHeader(AUTHORIZATION, null);

        if (values == null || values.size() != 1) {
            throw authenticationFailed();
        }

        String header = values.getFirst();
        if (header == null || !header.startsWith("Bearer ")) {
            throw authenticationFailed();
        }

        String token = header.substring(7);
        if (token.isBlank()) {
            throw authenticationFailed();
        }

        try {
            String subject = jwtProvider.validateAndGetSubject(token);
            if (subject == null || subject.isBlank()) {
                throw authenticationFailed();
            }
            accessor.setUser(UsernamePasswordAuthenticationToken.authenticated(subject, null, List.of()));
        } catch (AccessDeniedException e) {
            throw e;
        } catch (Exception e) {
            throw authenticationFailed();
        }
    }

    private boolean isAuthenticated(StompHeaderAccessor accessor) {
        return accessor.getUser() instanceof Authentication authentication && authentication.isAuthenticated();
    }

    private AccessDeniedException authenticationFailed() {
        return new AccessDeniedException(AUTHENTICATION_FAILED);
    }
}
