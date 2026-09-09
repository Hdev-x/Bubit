package com.bubit.common.security;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.NativeMessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;

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
    void connectRejectsMissingMalformedAndDuplicateCredentialsAfterRemovingHeader() {
        JwtProvider jwtProvider = new JwtProvider(SECRET, 60_000);
        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(jwtProvider);

        Message<byte[]> missing = stomp(StompCommand.CONNECT, null);
        assertAuthenticationFailed(() -> interceptor.preSend(missing, CHANNEL));

        Message<byte[]> malformed = stomp(StompCommand.CONNECT, List.of("Token " + DUMMY_CREDENTIAL));
        assertAuthenticationFailed(() -> interceptor.preSend(malformed, CHANNEL));
        assertCredentialRemoved(malformed, DUMMY_CREDENTIAL);

        Message<byte[]> duplicate = stomp(StompCommand.CONNECT,
                List.of("Bearer " + DUMMY_CREDENTIAL, "Bearer another.dummy.credential"));
        assertAuthenticationFailed(() -> interceptor.preSend(duplicate, CHANNEL));
        assertCredentialRemoved(duplicate, DUMMY_CREDENTIAL);
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
