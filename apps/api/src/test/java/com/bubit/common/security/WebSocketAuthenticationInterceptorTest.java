package com.bubit.common.security;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.NativeMessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;

import java.security.Principal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class WebSocketAuthenticationInterceptorTest {

    private static final String SECRET = "test-only-websocket-jwt-secret-32-bytes-long";
    private static final String OTHER_SECRET = "other-test-only-websocket-secret-32-bytes";
    private static final String DUMMY_CREDENTIAL = "dummy.jwt.credential";
    private static final MessageChannel CHANNEL = mock(MessageChannel.class);

    @Test
    void validConnectAuthenticatesAndRemovesCredentialFromOriginalMessage() {
        JwtProvider jwtProvider = new JwtProvider(SECRET, 60_000);
        String token = jwtProvider.generateToken("tester", "USER");
        Message<byte[]> message = stomp(StompCommand.CONNECT, List.of("Bearer " + token));

        Message<?> result = new WebSocketAuthenticationInterceptor(jwtProvider).preSend(message, CHANNEL);

        StompHeaderAccessor accessor = originalAccessor(result);
        assertEquals("tester", accessor.getUser().getName());
        assertCredentialRemoved(message, token);
    }

    @Test
    void connectRejectsMalformedAndDuplicateCredentialsAfterRemovingHeader() {
        JwtProvider jwtProvider = new JwtProvider(SECRET, 60_000);
        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(jwtProvider);

        Message<byte[]> malformed = stomp(StompCommand.CONNECT, List.of("Token " + DUMMY_CREDENTIAL));
        assertAuthenticationFailed(() -> interceptor.preSend(malformed, CHANNEL));
        assertCredentialRemoved(malformed, DUMMY_CREDENTIAL);

        Message<byte[]> duplicate = stomp(StompCommand.CONNECT,
                List.of("Bearer " + DUMMY_CREDENTIAL, "Bearer another.dummy.credential"));
        assertAuthenticationFailed(() -> interceptor.preSend(duplicate, CHANNEL));
        assertCredentialRemoved(duplicate, DUMMY_CREDENTIAL);
    }

    @Test
    void anonymousConnectAndStompCanSubscribeOnlyToLiteralPublicMarketDestinations() {
        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(new JwtProvider(SECRET, 60_000));
        for (StompCommand command : List.of(StompCommand.CONNECT, StompCommand.STOMP)) {
            Message<byte[]> connect = stomp(command, null);
            interceptor.preSend(connect, CHANNEL);
            Principal guest = originalAccessor(connect).getUser();
            assertNotNull(guest);

            for (String destination : List.of("/topic/coin/BTCUSDT", "/topic/coin-futures/ETHUSDT",
                    "/topic/binance-spot/1000SHIBUSDT", "/topic/binance-futures/BTCUSDT",
                    "/topic/binance-spot/币安人生USDT", "/topic/coin/TEST_TOKEN-1",
                    "/topic/binance-kline/spot/BTCUSDT/1m", "/topic/binance-kline/futures/BTCUSDT/1M")) {
                assertDoesNotThrow(() -> interceptor.preSend(subscription(guest, destination), CHANNEL), destination);
            }

            for (String destination : List.of("/topic/account/tester", "/user/queue/balance", "/topic/coin/",
                    "/topic/coin/*", "/topic/coin/**", "/topic/coin/BTC?SDT", "/topic/coin/{symbol}",
                    "/topic/coin/../account", "/topic/coin/BTCUSDT/extra", "/topic/coin/BTCUSDT\n",
                    "/topic/binance-kline/spot/BTCUSDT/*", "/topic/binance-kline/other/BTCUSDT/1m",
                    "/topic/binance-kline/spot/BTCUSDT/0m", "/topic/binance-kline/spot/BTCUSDT/1m/")) {
                assertAuthenticationFailed(() -> interceptor.preSend(subscription(guest, destination), CHANNEL));
            }

            Message<byte[]> send = stomp(StompCommand.SEND, null);
            originalAccessor(send).setUser(guest);
            originalAccessor(send).setDestination("/topic/coin/BTCUSDT");
            assertAuthenticationFailed(() -> interceptor.preSend(send, CHANNEL));
            assertAuthenticationFailed(() -> interceptor.preSend(subscription(null, "/topic/coin/BTCUSDT"), CHANNEL));
            assertAuthenticationFailed(() -> interceptor.preSend(subscription(() -> guest.getName(), "/topic/coin/BTCUSDT"), CHANNEL));
        }
    }

    @Test
    void connectRejectsExpiredAndBadSignatureWithoutRetainingCauseOrCredential() {
        JwtProvider validator = new JwtProvider(SECRET, 60_000);
        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(validator);
        String expired = new JwtProvider(SECRET, -1).generateToken("tester", "USER");
        String badSignature = new JwtProvider(OTHER_SECRET, 60_000).generateToken("tester", "USER");

        for (String token : List.of(expired, badSignature)) {
            Message<byte[]> message = stomp(StompCommand.CONNECT, List.of("Bearer " + token));
            AccessDeniedException error = assertAuthenticationFailed(() -> interceptor.preSend(message, CHANNEL));
            assertNull(error.getCause());
            assertFalse(error.toString().contains(token));
            assertCredentialRemoved(message, token);
        }
    }

    @Test
    void stompAliasAuthenticatesAndUnauthenticatedSubscribeAndSendFailClosed() {
        JwtProvider jwtProvider = new JwtProvider(SECRET, 60_000);
        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(jwtProvider);
        String token = jwtProvider.generateToken("tester", "USER");
        Message<byte[]> stomp = stomp(StompCommand.STOMP, List.of("Bearer " + token));

        assertDoesNotThrow(() -> interceptor.preSend(stomp, CHANNEL));
        assertCredentialRemoved(stomp, token);
        assertAuthenticationFailed(() -> interceptor.preSend(stomp(StompCommand.SUBSCRIBE, null), CHANNEL));
        assertAuthenticationFailed(() -> interceptor.preSend(stomp(StompCommand.SEND, null), CHANNEL));
        assertDoesNotThrow(() -> interceptor.preSend(immutableStomp(StompCommand.DISCONNECT), CHANNEL));
        assertDoesNotThrow(() -> interceptor.preSend(immutableStomp(StompCommand.UNSUBSCRIBE), CHANNEL));
    }

    private static Message<byte[]> stomp(StompCommand command, List<String> authorization) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setSessionId("test-session");
        if (authorization != null) {
            accessor.setNativeHeaderValues(WebSocketAuthenticationInterceptor.AUTHORIZATION, authorization);
        }
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private static Message<byte[]> immutableStomp(StompCommand command) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setSessionId("test-session");
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private static Message<byte[]> subscription(Principal user, String destination) {
        Message<byte[]> message = stomp(StompCommand.SUBSCRIBE, null);
        originalAccessor(message).setUser(user);
        originalAccessor(message).setDestination(destination);
        return message;
    }

    private static StompHeaderAccessor originalAccessor(Message<?> message) {
        StompHeaderAccessor accessor = StompHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        assertNotNull(accessor);
        assertTrue(accessor.isMutable());
        return accessor;
    }

    private static AccessDeniedException assertAuthenticationFailed(Runnable action) {
        AccessDeniedException error = assertThrows(AccessDeniedException.class, action::run);
        assertEquals(WebSocketAuthenticationInterceptor.AUTHENTICATION_FAILED, error.getMessage());
        return error;
    }

    private static void assertCredentialRemoved(Message<?> message, String credential) {
        assertNull(NativeMessageHeaderAccessor.getFirstNativeHeader(
                WebSocketAuthenticationInterceptor.AUTHORIZATION, message.getHeaders()));
        assertFalse(message.toString().contains(credential));
        assertFalse(new String((byte[]) message.getPayload()).contains(credential));
    }
}
