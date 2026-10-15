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

import java.security.Principal;
import java.util.List;
import java.util.regex.Pattern;

@Component
public class WebSocketAuthenticationInterceptor implements ChannelInterceptor {

    static final String AUTHORIZATION = "Authorization";
    static final String AUTHENTICATION_FAILED = "WebSocket authentication failed";
    private static final Principal PUBLIC_MARKET_GUEST = () -> "public-market-guest";
    private static final String SYMBOL = "[\\p{L}\\p{N}_-]+";
    private static final Pattern PUBLIC_MARKET_DESTINATION = Pattern.compile(
            "/topic/(?:(?:coin(?:-futures)?|binance-(?:spot|futures))/" + SYMBOL
                    + "|binance-kline/(?:spot|futures)/" + SYMBOL
                    + "/(?:1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M))");
    private static final Pattern PUBLIC_COMMUNITY_DESTINATION = Pattern.compile(
            "/topic/community/(?:board|feed/(?:bitget|binance|upbit|bithumb|kis)/(?:spot|futures|stock)/[\\p{L}\\p{N}_-]{1,40})");

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
        } else if (StompCommand.SUBSCRIBE.equals(command) && !canSubscribe(accessor)) {
            throw authenticationFailed();
        } else if (StompCommand.SEND.equals(command) && (!isAuthenticated(accessor)
                || (accessor.getDestination() != null && accessor.getDestination().startsWith("/topic/community/")))) {
            throw authenticationFailed();
        }
        return message;
    }

    private void authenticateConnect(StompHeaderAccessor accessor) {
        List<String> values = accessor.getNativeHeader(AUTHORIZATION);
        accessor.setNativeHeader(AUTHORIZATION, null);

        if (values == null) {
            // Only CONNECT can assign this marker; raw subscriptions cannot impersonate a guest.
            accessor.setUser(PUBLIC_MARKET_GUEST);
            return;
        }
        if (values.size() != 1) {
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

    private boolean canSubscribe(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        return isAuthenticated(accessor)
                || (accessor.getUser() == PUBLIC_MARKET_GUEST && destination != null
                    && (PUBLIC_MARKET_DESTINATION.matcher(destination).matches()
                        || PUBLIC_COMMUNITY_DESTINATION.matcher(destination).matches()));
    }

    private AccessDeniedException authenticationFailed() {
        return new AccessDeniedException(AUTHENTICATION_FAILED);
    }
}
